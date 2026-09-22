# ADR 004 — Idempotência na conclusão de módulo

**Status:** aceita
**Data:** 2026-09-22

> Esta é a decisão central do projeto.

## Contexto

`POST /enrollments/:id/modules/:moduleId/complete` registra que um funcionário
concluiu um módulo. A escrita é uma linha em `module_progress`, e o percentual de
progresso é derivado dessas linhas ([ADR 007](./007-calculated-progress.md)).

Duas condições tornam a operação delicada:

1. **A requisição repete na prática.** Duplo clique, retry de rede, reenvio de
   formulário, botão travado. Não é cenário hipotético de laboratório.
2. **A aplicação pode rodar em mais de uma instância.** É o cenário de produção
   pretendido ([ADR 001](./001-modular-monolith.md)), e qualquer solução que
   dependa do processo local está errada por construção.

## Problema

Duas requisições simultâneas para o mesmo módulo não podem gerar dois registros
de progresso — isso duplicaria o numerador do progresso e permitiria que um
treinamento de 4 módulos marcasse 150%.

A implementação intuitiva tem condição de corrida:

```
Request A → SELECT → não existe
Request B → SELECT → não existe
Request A → INSERT → ok
Request B → INSERT → ❌ duplicado
```

A janela entre o `SELECT` e o `INSERT` é pequena, o que torna o bug pior: passa
em teste manual e aparece em produção.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| **A. Verificação só na aplicação** (`if (!exists) create()`) | Não resolve. Tem a race condition acima mesmo com uma única instância — basta concorrência dentro do event loop. |
| **B. Mutex em memória** | Funciona com **uma** instância. Com duas, cada processo tem seu próprio mutex e a garantia desaparece. Dá a sensação de estar resolvido, que é pior que o problema visível. |
| **C. Lock distribuído** (Redis, Redlock) | Resolve de verdade. Custa um serviço novo, um ponto de falha novo, monitoramento novo e a complexidade de expiração e renovação de lock — para um problema que o banco de dados já resolve. |
| **D. Constraint única no banco** ✅ | O Postgres garante unicidade independentemente de quantas instâncias existem. Zero infraestrutura adicional. |

## Critérios

1. **Correção com múltiplas instâncias** — o critério eliminatório.
2. **Infraestrutura adicional** — o MVP não admite Redis ou fila.
3. **Complexidade** — quanto código é preciso entender para confiar na garantia.
4. **Custo operacional.**

## Decisão

**Constraint única no banco (alternativa D)**, com a violação tratada como
sucesso idempotente.

```prisma
model ModuleProgress {
  enrollmentId String
  moduleId     String
  @@unique([enrollmentId, moduleId])
}
```

O critério eliminatório foi o primeiro. A alternativa B é a armadilha que esta
ADR existe para recusar: um mutex em memória **parece** resolver, passa em todos
os testes locais, e falha silenciosamente no dia em que a aplicação sobe com duas
réplicas. A garantia precisa morar onde o estado mora.

### O ponto que diferencia "usei constraint" de "entendi idempotência"

Não há verificação prévia de existência. A escrita é tentada de imediato, e o
erro é o mecanismo de controle:

```ts
try {
  return { progress: await repository.create(enrollmentId, moduleId), alreadyCompleted: false };
} catch (error) {
  if (!isUniqueViolation(error)) throw error;

  const existing = await repository.find(enrollmentId, moduleId);
  if (!existing) throw error;

  return { progress: existing, alreadyCompleted: true };
}
```

**A segunda requisição recebe 200 com o progresso existente.** Não 409, não 500.

Concluir um módulo já concluído **atingiu o estado desejado** — é sucesso. Um 409
obrigaria o frontend a tratar "conflito" como caso especial de algo que, do ponto
de vista do usuário, simplesmente funcionou. Um 500 seria mentira: nada quebrou.

A resposta carrega `alreadyCompleted` para quem quiser distinguir os dois
caminhos, mas o status HTTP é o mesmo porque o resultado é o mesmo.

### Por que não inspecionamos `meta.target`

O `P2002` do Prisma traz o nome do índice violado em `meta.target`, que no
Postgres é o nome da constraint e muda se ela for renomeada. Em vez de depender
disso, o código confirma a identidade da constraint **buscando o registro
conflitante**: se a linha existe, era a nossa constraint; se não existe, a
violação foi de outra e o erro sobe. A verificação é semântica, não textual.

## Trade-offs aceitos

- **Uma consulta extra no caminho de conflito.** Só no caminho repetido, que é o
  minoritário. O caminho normal é um único `INSERT`.
- **O erro do banco virou fluxo de controle.** Incomoda esteticamente, e é
  deliberado: o banco é a única autoridade capaz de decidir a corrida, então a
  resposta dele é a informação mais confiável disponível.
- **Acoplamento ao código de erro do Prisma.** Isolado em
  `shared/database/prisma-errors.ts` — um arquivo, uma função.
- **⚠️ A coluna `enrollments.status` tem uma janela de lost update.** Duas
  conclusões simultâneas de módulos *diferentes* podem contar o progresso antes
  de a outra commitar, e ambas gravarem `IN_PROGRESS` quando o correto seria
  `COMPLETED`. A consequência é limitada porque o status devolvido nas leituras é
  derivado dos dados reais, não lido da coluna (ADR 007): o usuário nunca vê
  progresso errado, apenas a coluna de filtro pode ficar defasada até a próxima
  escrita. Fechar essa janela exigiria isolamento serializável ou um `UPDATE`
  condicional com recontagem no banco — custo que não se justifica para uma
  coluna que existe só para filtrar listagem.

## Consequências

- A garantia vale para qualquer topologia de deploy, hoje e depois de escalar.
- A mesma filosofia foi aplicada nas outras duas escritas duplicáveis do sistema:
  `skipDuplicates` na atribuição em massa ([ADR 005](./005-synchronous-assignment.md))
  e matrícula individual repetida devolvendo a existente com 200. Reatribuir não
  é erro em nenhum dos três caminhos.
- **Teste de integração obrigatório**, em `enrollments.routes.test.ts`: N
  requisições simultâneas via `Promise.all` para o mesmo módulo, assertando
  exatamente 1 linha em `module_progress`, todas as respostas 200, e exatamente
  uma resposta com `alreadyCompleted: false`.

  O teste roda com N = 2, 5 e 10, e isso não é redundância: verificamos que, com
  a implementação substituída por `check-then-insert` puro, **N = 2 continua
  passando** enquanto N = 5 e N = 10 falham com 500. Duas requisições não
  disputam de forma confiável o suficiente para provar nada.
- **Critério para reavaliar:** a decisão não depende de escala e não tem gatilho
  de revisão previsto. O que mudaria o desenho é a operação deixar de ser
  idempotente por natureza — por exemplo, se concluir um módulo passasse a
  registrar tempo acumulado por tentativa, aí haveria informação nova em cada
  requisição e a segunda não seria mais um no-op.
