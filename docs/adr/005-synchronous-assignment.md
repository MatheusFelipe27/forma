# ADR 005 — Atribuição em massa síncrona

**Status:** aceita
**Data:** 2026-09-22

## Contexto

Um Manager precisa atribuir um treinamento a vários funcionários de uma vez.
`POST /assignments` recebe `{ trainingId, userIds[], dueDate }` e cria uma
matrícula por funcionário. Na prática, um time inteiro — dezenas a centenas de
registros em uma requisição.

## Problema

Duas perguntas independentes:

1. O processamento é **síncrono** (a requisição espera) ou **assíncrono** (fila e
   worker)?
2. O que acontece quando parte dos funcionários **já tem** a matrícula?

## Alternativas para o processamento

**A. Síncrono, N inserts sequenciais.** Um `INSERT` por funcionário no loop.

**B. Síncrono, um `createMany` em transação.** Uma operação de banco para o lote.

**C. Assíncrono com fila** (BullMQ + Redis, RabbitMQ). A API responde 202 e um
worker processa.

## Critérios

1. **Infraestrutura adicional** — o MVP proíbe Redis, filas e workers.
2. **Atomicidade** — o que o Manager vê se falhar no meio.
3. **Latência percebida** no volume real esperado.
4. **Complexidade operacional** — o que passa a precisar de monitoramento.

## Decisão

**Síncrono, com `createMany` em uma única transação (alternativa B).**

```ts
prisma.$transaction(async (tx) => {
  const { count } = await tx.enrollment.createMany({ data, skipDuplicates: true });
  const enrollments = await tx.enrollment.findMany({ where: { trainingId, userId: { in: userIds } } });
  return { created: count, enrollments };
});
```

Contra a alternativa C, o critério decisivo é o primeiro combinado com o terceiro.
Uma fila resolve um problema de latência e resiliência que **este volume não
tem**: 100 inserts em um `createMany` levam milissegundos. Adotá-la traria Redis,
um worker, monitoramento de fila, tratamento de retry, visibilidade de job
falhado e a pergunta "a atribuição foi feita?" passando a ter resposta
assíncrona — tudo para acelerar uma operação que já é rápida.

Contra a alternativa A, o critério é atomicidade. N inserts sequenciais podem
falhar no funcionário 70 de 100, deixando o Manager sem saber o que foi feito e
sem forma limpa de reexecutar. Com `createMany` em transação, ou todos entram ou
nenhum entra.

### A transação tem dois statements, e é por isso que existe

Um `createMany` isolado já é atômico — envolvê-lo em `$transaction` sozinho não
adicionaria garantia nenhuma, e vale dizer isso em vez de fingir o contrário. A
transação existe porque são **duas** operações: a inserção e a leitura do estado
resultante, que precisam refletir o mesmo instante. Sem ela, a leitura poderia
enxergar uma atribuição concorrente e o relatório devolvido ao Manager não
fecharia com o que aquela requisição fez.

### Reatribuir não é erro: `skipDuplicates`

`UNIQUE(userId, trainingId)` impede matrícula duplicada. Sem tratamento, atribuir
a um time em que 3 de 20 já têm o treinamento abortaria o lote inteiro.

`skipDuplicates: true` faz o banco ignorar quem já tem, e a resposta relata o que
aconteceu:

```json
{ "requested": 20, "created": 17, "skipped": 3 }
```

Esta é **a mesma filosofia da [ADR 004](./004-progress-idempotency.md)**: uma
escrita que já atingiu o estado desejado é sucesso, não conflito. Os três caminhos
duplicáveis do sistema se comportam de forma coerente — conclusão de módulo
repetida devolve 200, matrícula individual repetida devolve 200 com a existente, e
a atribuição em massa ignora e relata.

Ids repetidos no próprio payload são deduplicados antes da escrita, senão
contariam como "ignorados" e o relatório confundiria o Manager.

## Trade-offs aceitos

- **A requisição fica mais longa conforme o lote cresce.** Aceito até o limite
  abaixo; o schema Zod rejeita lotes acima de 1000 funcionários, o que torna o
  limite explícito em vez de virar timeout.
- **Sem retry automático.** Se a transação falhar, o Manager reenvia — e o
  `skipDuplicates` torna o reenvio seguro por construção.
- **⚠️ A checagem de status do treinamento não é atômica com a inserção.** O
  serviço valida que o treinamento está `PUBLISHED` antes de chamar o repository;
  um arquivamento concorrente poderia acontecer nesse intervalo. Aceito porque a
  consequência é benigna: matrículas de treinamento arquivado continuam válidas
  por regra de negócio, então uma atribuição que chega microssegundos antes do
  arquivamento produz estado legítimo, não corrompido. Fechar a janela exigiria
  a leitura dentro da transação, o que colocaria decisão de negócio no repository
  e violaria a [ADR 003](./003-controller-service-repository.md).
- **Validação de existência dos funcionários custa uma consulta extra.** Sem ela,
  um id inválido produziria violação de foreign key e um 500 opaco; com ela, o
  lote é recusado com 400 e a lista de ids inexistentes.

## Consequências

- Nenhuma infraestrutura nova. O `docker compose` continua com quatro serviços.
- O Manager tem resposta imediata e determinística: sabe quantos entraram e
  quantos já tinham.
- A operação inteira mora em um método de Service, o que a torna extraível para
  um worker sem redesenho — o corpo da função viraria o handler do job.
- **Critérios para migrar para fila** (documentados para não virar decisão por
  intuição): p95 da requisição acima de ~2s, ou volume por atribuição passando de
  ~1000 funcionários, ou necessidade de retry automático com visibilidade de
  progresso. Nenhum se aplica hoje, e nenhum é hipótese de curto prazo.
  Tecnologias candidatas: Redis + BullMQ, RabbitMQ.
- Fila **não** será implementada por valor demonstrativo. Saber recusá-la com
  critério é o conteúdo técnico aqui.
