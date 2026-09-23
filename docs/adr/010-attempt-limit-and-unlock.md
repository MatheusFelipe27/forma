# ADR 010 — Limite de tentativas e desbloqueio da avaliação

**Status:** aceita
**Data:** 2026-09-22

## Contexto

Uma avaliação tem `minScore` e `maxAttempts`. Esgotadas as tentativas sem
aprovação, a matrícula fica bloqueada, e desbloquear exige ação de Manager ou
Admin.

Três perguntas técnicas surgem daí, e esta ADR responde as três porque todas
tratam do mesmo objeto: o histórico de tentativas de uma matrícula — onde ele
mora, como é protegido sob concorrência, e quando pode ser destruído.

---

## Parte 1 — Onde mora o desbloqueio

### Problema

O modelo de dados definido no início do projeto não tem campo para representar
"esta matrícula recebeu tentativas extras". O estado precisa morar em algum lugar.

### Alternativas

**A. Apagar as tentativas ao desbloquear.** Zera a contagem sem mexer no schema.

**B. `unblockedAt DateTime?` em `Enrollment`.** Contar apenas tentativas com
`createdAt > unblockedAt`.

**C. `extraAttempts Int @default(0)` em `Enrollment`.** Limite efetivo =
`assessment.maxAttempts + enrollment.extraAttempts`.

### Critérios

1. **Preservação do histórico** — as reprovações são o dado que justifica o
   desbloqueio; critério eliminatório.
2. **Granularidade da concessão** — conseguir liberar uma única tentativa, não só
   devolver o lote inteiro.
3. **Legibilidade do limite efetivo** — quanto de código é preciso ler para saber
   quantas tentativas a matrícula tem.
4. **Tamanho da mudança no schema**, que o modelo original não previa.

### Decisão

**Alternativa C**, com migration `20260922232943_enrollment_extra_attempts`.

A alternativa A foi descartada de imediato: o histórico de reprovações é dado de
auditoria. Um gestor que desbloqueia precisa poder ver **por que** desbloqueou, e
apagar as tentativas destrói exatamente a informação que justifica a ação. Além
disso, `AssessmentAttempt` guarda as respostas enviadas — apagar levaria embora o
registro do que a pessoa respondeu.

Contra a alternativa B: contagem por janela temporal é mais frágil. Ela devolve o
lote inteiro de `maxAttempts` a cada desbloqueio, sem permitir conceder uma única
tentativa, e a comparação de timestamps confunde a leitura do código sem ganho.

`extraAttempts` é aditivo e explícito: conceder 1 é somar 1. O limite efetivo é
uma soma visível, e a coluna conta quantas tentativas foram concedidas ao longo do
tempo.

### Trade-offs

- **Desvio do schema documentado.** Um campo a mais que a seção 3 não previa. É a
  menor mudança que atende à regra, e está registrada aqui em vez de aparecer
  como surpresa no diff.
- **Sem registro de quem desbloqueou nem por quê.** A coluna guarda o total
  concedido, não o histórico das concessões. O AuditLog em MongoDB (Fase 6,
  ADR 006) é o lugar certo para isso, e é para lá que essa informação vai.
- **Desbloqueio não é idempotente.** Duas chamadas concedem duas vezes. É o
  comportamento esperado de "conceder mais uma tentativa", e difere
  deliberadamente da idempotência da [ADR 004](./004-progress-idempotency.md) —
  ali a segunda requisição pede o mesmo estado, aqui ela pede mais uma coisa.

---

## Parte 2 — Aplicar o limite sob concorrência

### Problema

Duas submissões simultâneas da mesma matrícula podem ambas ler
`attemptsUsed = maxAttempts - 1`, ambas concluir que há vaga, e ambas gravar —
estourando o teto.

É a mesma classe de problema da ADR 004, **mas a solução daquela ADR não se
aplica**: lá a garantia veio de `UNIQUE(enrollmentId, moduleId)`, porque um módulo
concluído duas vezes é a mesma linha. Aqui, tentativas repetidas são
**legítimas** — é justamente o que `maxAttempts` conta. Não há valor a tornar
único, então não há constraint que sustente o limite.

### Alternativas

**A. Aceitar a corrida.** Documentar que, sob concorrência, uma tentativa extra
pode passar.

**B. Contar e inserir dentro de uma transação.** Sem mais nada.

**C. Lock de linha da matrícula** (`SELECT ... FOR UPDATE`) dentro da transação.

**D. Isolamento serializável** na transação.

### Critérios

1. **Correção sob concorrência** — o teto não pode ser estourado; critério
   eliminatório.
2. **Infraestrutura adicional** — o MVP não admite Redis nem lock distribuído.
3. **Escopo do bloqueio** — submissões de matrículas diferentes não podem se
   penalizar entre si.
4. **Complexidade de implementação** — tratamento de erro e reexecução que a
   solução obriga a escrever.

### Decisão

**Alternativa C.**

A alternativa B não resolve: no isolamento padrão do Postgres (READ COMMITTED),
duas transações contam em paralelo e nenhuma vê a inserção da outra. Transação sem
lock, aqui, é decoração.

A alternativa D funcionaria, com o custo de tratar erros de serialização e
reexecutar a submissão — complexidade maior para a mesma garantia.

O `FOR UPDATE` na linha da matrícula serializa apenas as submissões **daquela
matrícula**. Duas pessoas diferentes respondendo ao mesmo tempo não se bloqueiam.
E o ponto que mantém a coerência com o resto do projeto: **a garantia continua
morando no banco**, sem Redis, sem lock distribuído, sem mutex em memória. É a
mesma filosofia da ADR 004 com o instrumento diferente que este problema exige.

```ts
prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollmentId} FOR UPDATE`;

  const attemptsUsed = await tx.assessmentAttempt.count({ where: { enrollmentId } });
  if (attemptsUsed >= limit) return { attempt: null, attemptsUsed };

  // ... cria a tentativa
});
```

### Duas camadas, e por quê

O Service também checa o limite **antes** de pontuar. Isso não é redundância
acidental:

- a checagem antecipada evita trabalho inútil e produz a mensagem clara com
  `attemptsUsed/attemptsAllowed`;
- o repository é a autoridade, aplicada atomicamente.

Quando a checagem do Service passa mas o repository recusa (uma submissão
concorrente consumiu a última vaga), o resultado é o **mesmo 403** — o cliente não
distingue os dois caminhos. É o mesmo desenho da ADR 004: caminho otimista na
aplicação, autoridade no banco.

### Sobre a fronteira da ADR 003

O `limit` chega ao repository já decidido pelo Service; o repository aplica uma
precondição numérica de forma atômica e devolve `attempt: null` quando ela falha.
Quem traduz esse `null` em 403 com mensagem é o Service.

A leitura é a mesma de `skipDuplicates` na [ADR 005](./005-synchronous-assignment.md):
escrita condicional é persistência, não decisão. A política — qual é o limite, qual
erro levantar, o que a mensagem diz — permanece inteiramente no Service.

### Trade-offs

- **SQL cru no repository.** Uma linha, e o Prisma não expõe `FOR UPDATE` na API
  tipada. Fica isolada em um método.
- **`enrollments.id` é `text`, não `uuid`.** O Prisma mapeia
  `String @id @default(uuid())` para `text` no Postgres, então a query **não**
  leva cast `::uuid` — com o cast, o Postgres recusa com
  `operator does not exist: text = uuid`. Anotado porque custou um ciclo de
  depuração e vai custar de novo em qualquer query crua futura.
- **Submissões da mesma matrícula serializam.** O lock dura o tempo da transação
  (uma contagem e dois inserts). Irrelevante, e é exatamente o comportamento
  desejado.

---

## Parte 3 — Quando o histórico pode ser destruído

### Problema

Apagar um treinamento propaga por cascata até onde as foreign keys permitirem. O
que é apagado junto é uma decisão de negócio disfarçada de detalhe de schema: o
banco não sabe a diferença entre "conteúdo que só existe dentro do treinamento" e
"registro do que uma pessoa real fez".

O problema apareceu na prática, durante a Fase 6: apagar um treinamento que tinha
avaliação falhava com
`Foreign key constraint violated on the constraint: assessments_trainingId_fkey`,
porque `Module` tinha `onDelete: Cascade` e `Assessment` não.

### Critérios

1. **Natureza do dado** — conteúdo que só existe dentro do treinamento, ou registro
   do que uma pessoa real fez; é o critério que decide cada relação.
2. **Consequência de um erro do operador** — o que se perde, e se dá para desfazer,
   quando alguém apaga o treinamento errado.
3. **Existência de alternativa que atenda sem destruir** — se tirar do catálogo
   resolve, apagar não precisa ser possível.

### Decisão

**Cascade a partir de `Training` para `Assessment`. Sem cascade para
`Enrollment`.** A assimetria é intencional e é o conteúdo desta parte.

**Corrigido** — migration `20260922234914_assessment_cascade_on_training_delete`:

```prisma
training Training @relation(fields: [trainingId], references: [id], onDelete: Cascade)
```

A avaliação é conteúdo do treinamento, no mesmo sentido que os módulos: não tem
existência nem significado fora dele. `Question` e `Answer` já cascateavam a
partir de `Assessment` e `Question`, então a cadeia completa —
treinamento → avaliação → perguntas → alternativas, mais os módulos — desaparece
sem deixar órfãos. Verificado no banco: apagar um treinamento com avaliação,
1 pergunta, 2 alternativas e 1 módulo deixa zero registros restantes em cada
tabela.

A falta dessa cascade era lacuna, não proteção: uma avaliação sem treinamento é
lixo, e a única forma de apagar o treinamento era apagar a avaliação primeiro à
mão.

### Por que `Enrollment` fica sem cascade

`Enrollment` **não** é conteúdo do treinamento. É o registro de que uma pessoa
real foi matriculada, estudou módulos, fez tentativas e talvez tenha concluído.
Estender a cascade até lá significaria que apagar um treinamento apagaria em
silêncio:

- as matrículas de todos os funcionários;
- as linhas de `module_progress` — que são a fonte de verdade do progresso
  ([ADR 007](./007-calculated-progress.md));
- as tentativas de avaliação e as respostas enviadas em cada uma;
- o registro de quem concluiu o treinamento, que é exatamente o dado que uma
  plataforma de treinamento corporativo existe para produzir.

Uma operação de manutenção de catálogo destruiria histórico de conformidade. A
ausência da cascade é o que transforma esse erro em um `FOREIGN KEY constraint
violated` — o banco recusa, e é isso que se espera dele.

Hoje a ordem de bloqueio ao tentar apagar um treinamento é:

1. ~~`assessments_trainingId_fkey`~~ — resolvido pela cascade acima;
2. `enrollments_trainingId_fkey` — bloqueia se existir **qualquer** matrícula.

### O caminho correto é arquivar, não apagar

`ARCHIVED` já existe e tem exatamente a semântica necessária: o treinamento sai do
catálogo, não aceita novas matrículas, e **as matrículas existentes continuam
válidas** — quem estava no meio termina, quem concluiu mantém o registro.

```
PATCH /trainings/:id/status  { "status": "ARCHIVED" }
```

Apagar fica reservado ao que nunca teve vida: um rascunho criado por engano, um
treinamento publicado e nunca atribuído. Nesses casos não há histórico a perder, e
a cascade da avaliação faz o trabalho.

### Trade-offs

- **Não existe forma de remover um treinamento com matrículas.** É deliberado. Se
  um dia houver necessidade real (LGPD, direito ao esquecimento), o caminho é uma
  operação explícita de expurgo com escopo e registro em auditoria — não uma
  cascade silenciosa acionada por um `DELETE` de catálogo.
- **Assimetria no schema.** `Module` e `Assessment` cascateiam, `Enrollment` não.
  Parece inconsistente à primeira leitura; é a fronteira entre conteúdo e
  histórico, e existe este parágrafo para que ninguém "conserte" a assimetria por
  simetria.
- **`AssessmentAttempt` também não cascateia** a partir de `Enrollment` nem de
  `Assessment`. Consistente com o acima: tentativa é histórico. Consequência
  prática — apagar uma matrícula com tentativas também é recusado pelo banco.

---

## Consequências

- Esgotar as tentativas devolve **403 `ATTEMPTS_EXHAUSTED`**, com a contagem na
  mensagem e em `details`, e a instrução de procurar um gestor. Nunca 500.
- `POST /enrollments/:id/attempts/unlock` é MANAGER/ADMIN via `requireRole`,
  reaproveitando o RBAC existente. Concede de 1 a 5 tentativas.
- `GET /enrollments/:id/attempts` expõe `blocked`, `attemptsUsed`,
  `attemptsAllowed` e `attemptsRemaining`, para o frontend esconder o botão sem
  ser ele a decidir a permissão.
- Aprovação já obtida recusa nova submissão com 409 `ASSESSMENT_ALREADY_PASSED`:
  não há o que melhorar num resultado aprovado, e a tentativa seria desperdiçada.
- **Teste de concorrência** com 6 submissões simultâneas num limite de 2: exatamente
  2 respostas 201 e 4 respostas 403. Verificado que, removendo o `FOR UPDATE`, o
  teste falha com **4 tentativas criadas** — o lock está fazendo trabalho real.
- Apagar um treinamento leva embora módulos, avaliação, perguntas e alternativas.
  Não leva matrículas, progresso nem tentativas — nesses casos o banco recusa a
  operação, e a resposta é arquivar.
- **Critérios para reavaliar:**
  - se as tentativas passarem a ter estado intermediário (avaliação salva em
    rascunho, tempo limite por tentativa), a submissão deixa de ser uma escrita
    única e o desenho da Parte 2 precisa de revisão;
  - se surgir exigência legal de remoção de dados pessoais, a Parte 3 muda — mas
    por uma operação de expurgo explícita e auditada, nunca por cascade.
