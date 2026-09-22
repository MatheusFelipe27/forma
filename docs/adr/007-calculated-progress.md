# ADR 007 — Progresso calculado, não armazenado

**Status:** aceita
**Data:** 2026-09-22

## Contexto

O progresso de um funcionário em um treinamento é `módulos concluídos / total de
módulos`. Cada conclusão vira uma linha em `module_progress`
([ADR 004](./004-progress-idempotency.md)); o total de módulos vem de `modules`.

O mesmo raciocínio se aplica ao status `OVERDUE` da matrícula, que depende de
`dueDate < agora`.

## Problema

O percentual é **armazenado** em `enrollments` e atualizado a cada escrita, ou
**calculado** a cada leitura?

A pergunta parece pequena e determina quantas fontes de verdade o sistema tem.

## Alternativas

**A. Armazenar o percentual.** Coluna `progress Float` em `enrollments`, atualizada
por todo caminho que altera progresso.

**B. Calcular na leitura.** Nenhuma coluna; `COUNT` das linhas de progresso contra
o total de módulos.

**C. Calcular, mas materializar em cache.** Calculado como fonte de verdade, com
cache invalidado por escrita.

## Critérios

1. **Número de fontes de verdade** — quantos lugares podem discordar.
2. **Custo de manter correto** — quantos caminhos de código precisam acertar.
3. **Custo de leitura** no volume real.
4. **Reversibilidade** — qual escolha é mais fácil de desfazer.

## Decisão

**Calcular na leitura (alternativa B).** Não existe coluna de percentual em
`enrollments`.

O critério decisivo é o segundo. Armazenar exige que **todo** caminho que altere o
progresso atualize o campo corretamente: concluir módulo, remover módulo do
treinamento, adicionar módulo (que muda o denominador de todas as matrículas
existentes), corrigir dado manualmente, executar migração. Cada caminho é uma
chance de divergência, e divergência em progresso é o tipo de bug que ninguém
percebe até um funcionário reclamar que concluiu tudo e o sistema marca 80%.

Calcular tem uma propriedade que armazenar não tem: **é impossível divergir**. O
número mostrado é derivado dos fatos, e os fatos são as linhas de progresso.

Contra a alternativa C: cache é a resposta certa para um problema de leitura que
ainda não existe. Adotá-lo agora traria invalidação — a parte difícil — sem
nenhuma métrica que a justifique.

### O status também é derivado, e isso vai além do OVERDUE

`EnrollmentStatus` no banco guarda apenas `NOT_STARTED | IN_PROGRESS | COMPLETED`.
`OVERDUE` **nunca é persistido**, porque depende do instante da leitura: um job
noturno marcando matrículas atrasadas estaria errado durante todo o dia seguinte,
e existiria só para manter sincronizado o que uma comparação de datas resolve de
graça.

Mas a decisão foi além. O status devolvido em toda leitura é derivado do estado
real — contagem de progresso, existência de avaliação, tentativa aprovada, prazo —
e **não é lido da coluna**:

```ts
deriveEnrollmentStatus({ completedModules, totalModules, hasAssessment, assessmentPassed, dueDate })
```

A coluna continua existindo e sendo atualizada nas escritas, com um propósito
único: **filtrar listagem no banco** (`GET /enrollments?status=COMPLETED`). Um
`WHERE` sobre coluna indexada é o que uma derivação em memória não consegue fazer
sem carregar todas as matrículas.

**Isto é, admitidamente, uma segunda fonte de verdade** — exatamente o que esta ADR
recusa no parágrafo anterior. A diferença que a torna aceitável: ela nunca é a
fonte consultada para exibir nada. Se a coluna divergir, o filtro pode incluir ou
omitir uma linha da listagem, e o status exibido em cada item continua correto. O
erro possível é de completude de filtro, não de informação errada ao usuário.

A janela real de divergência está documentada na ADR 004: duas conclusões
simultâneas de módulos diferentes podem deixar a coluna em `IN_PROGRESS` quando o
correto seria `COMPLETED`. A resposta ao usuário diz `COMPLETED` de qualquer forma.

A resposta expõe os dois valores — `status` (derivado, autoritativo) e
`storedStatus` (a coluna) — o que torna a divergência observável em vez de oculta.

## Trade-offs aceitos

- **Consultas adicionais por leitura.** Listagem usa `_count` agregado do Prisma,
  e o detalhe carrega as linhas de progresso junto com os módulos. Irrelevante
  nesta escala.
- **O percentual não é filtrável nem ordenável no banco.** Ordenar matrículas por
  progresso exigiria carregar o conjunto. Não há tela que peça isso hoje.
- **A coluna `status` é uma segunda fonte de verdade**, com o escopo e o limite
  descritos acima.
- **Arredondamento é decisão de apresentação.** `calculateProgress` devolve uma
  casa decimal (5/8 = 62.5%), e as contagens brutas vão na resposta para o
  frontend não depender do arredondamento.

## Consequências

- `calculateProgress`, `canCompleteTraining`, `deriveEnrollmentStatus` e
  `storableStatus` são funções puras em `modules/enrollments/progress.ts`, sem
  banco e sem Express. São testadas unitariamente com tabela de casos, incluindo
  os que produzem bug real: treinamento com zero módulos (divisão por zero),
  mais concluídos que o total, e concluído com prazo vencido.
- **Concluído vence atrasado.** Terminar depois do prazo ainda é terminar — uma
  matrícula `COMPLETED` nunca é reportada como `OVERDUE`.
- Remover uma linha de `module_progress` reduz o percentual na leitura seguinte,
  sem nenhuma etapa de reconciliação. Existe teste de integração que apaga a linha
  direto no banco e confere que a resposta cai para 0%.
- Adicionar um módulo a um treinamento muda o denominador de todas as matrículas
  existentes — motivo pelo qual módulos só podem ser alterados enquanto o
  treinamento está em `DRAFT`.
- **Critério para reavaliar:** métricas reais de produção mostrando a leitura de
  progresso como gargalo. O caminho seria a alternativa C (materializar com
  invalidação), não a A — manter o cálculo como fonte de verdade e tratar o valor
  materializado como cache descartável preserva a garantia de não divergir.
