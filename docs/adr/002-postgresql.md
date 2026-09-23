# ADR 002 — PostgreSQL como banco principal

**Status:** aceita
**Data:** 2026-09-23

## Contexto

O domínio transacional do Forma são dez entidades fortemente ligadas entre si:

```
User ──< Enrollment >── Training ──< Module
 │                         │
 │ (self-relation)         └── Assessment ──< Question ──< Answer
 │
Enrollment ──< ModuleProgress >── Module
Enrollment ──< AssessmentAttempt >── Assessment ──< AttemptAnswer
```

Quase toda leitura atravessa duas ou três dessas relações: o detalhe de uma matrícula precisa do treinamento, dos módulos, do progresso e das tentativas; o painel da equipe precisa de usuários, matrículas e contagem de módulos.

Mais importante: **os dois problemas técnicos centrais do projeto dependem de garantias do banco**. A conclusão idempotente de módulo ([ADR 004](./004-progress-idempotency.md)) é resolvida por uma constraint única, e a atribuição em massa ([ADR 005](./005-synchronous-assignment.md)) depende de `skipDuplicates` sobre outra constraint e de atomicidade.

## Problema

Qual banco guarda o domínio transacional?

A pergunta parece resolvida por hábito — "é relacional, use Postgres" — mas ela merece resposta explícita justamente porque a escolha **é** o mecanismo de consistência do projeto, não a camada de armazenamento por baixo dele. Se o banco não garantir unicidade de forma confiável sob concorrência, a ADR 004 deixa de existir e o controle volta para a aplicação, que é o que ela recusa.

## Alternativas

**A. PostgreSQL.**

**B. MySQL / MariaDB.**

**C. MongoDB para todo o domínio** — o mesmo banco usado na auditoria ([ADR 006](./006-audit-log-mongodb.md)), evitando um segundo serviço.

**D. SQLite** — zero infraestrutura, arquivo local.

## Critérios

1. **Unicidade garantida pelo servidor, sob concorrência** — critério eliminatório, porque é o mecanismo da ADR 004.
2. **Transações ACID** sobre múltiplas tabelas.
3. **Aderência do modelo ao domínio**, que é relacional e cheio de junções.
4. **Integridade referencial** — chaves estrangeiras com cascata declarada no schema.
5. **Custo operacional** e maturidade do ferramental (Prisma).

## Decisão

**PostgreSQL**, com Prisma como ORM e ferramenta de migrations.

O critério 1 elimina a alternativa D de imediato: o SQLite serializa escritas em um arquivo e não pode ser compartilhado por múltiplas instâncias da aplicação — exatamente o cenário que a ADR 004 usa para recusar mutex em memória. Testar concorrência contra SQLite provaria pouco, e o teste de concorrência é o centro do projeto.

Contra a alternativa C, vale ser justo: **o MongoDB tem índices únicos compostos** e conseguiria impedir o progresso duplicado. O argumento decisivo não é esse. É o critério 3 combinado com o 4: este domínio é relacional de verdade. Praticamente toda consulta junta entidades, a integridade entre elas importa (apagar um treinamento precisa levar seus módulos, e **não** pode levar o histórico de matrículas — ver a Parte 3 da [ADR 010](./010-attempt-limit-and-unlock.md)), e transações multi-documento no Mongo exigem replica set e custam mais. Modelar isso em documentos significaria ou duplicar dados ou reimplementar junções na aplicação.

Contra a alternativa B, sou honesto: **MySQL atenderia**. Tem constraints únicas, transações ACID e suporte igualmente bom no Prisma. Os desempates foram menores e somados: o tipo `jsonb`, que é o que torna a alternativa considerada na ADR 006 uma opção real; o `SELECT ... FOR UPDATE` com semântica previsível, usado na ADR 010; e familiaridade maior, que em um projeto de uma pessoa com prazo curto conta. Não é uma decisão com margem grande, e não pretendo apresentá-la como se fosse.

## Trade-offs aceitos

- **Um serviço para operar.** Contra SQLite, há um processo a subir, monitorar e fazer backup. Resolvido no desenvolvimento pelo `docker compose`, mas é custo real em produção.
- **Schema rígido.** Toda mudança de modelo exige migration. Aceitável: o domínio foi definido antes de codificar e está estável. É o oposto do que vale para o `metadata` do AuditLog, e é por isso que aquela decisão é diferente.
- **`id` é `text`, não `uuid` nativo.** O Prisma mapeia `String @id @default(uuid())` para `text` no Postgres. Isso custa alguns bytes por linha e, mais relevante, **quebra qualquer SQL cru que faça cast para `uuid`** — o erro `operator does not exist: text = uuid` custou um ciclo de depuração na ADR 010. Fica registrado aqui porque vai reaparecer.
- **Acoplamento ao Prisma nos códigos de erro.** O tratamento de `P2002` da ADR 004 é específico do cliente. Isolado em `shared/database/prisma-errors.ts`.

## Consequências

- As três constraints que fazem trabalho de verdade no domínio:

  ```
  UNIQUE(enrollment_id, module_id)   progresso não duplica        → ADR 004
  UNIQUE(user_id, training_id)       matrícula não duplica        → ADR 005
  UNIQUE(training_id, position)      ordem dos módulos íntegra no banco
  ```

- `SELECT ... FOR UPDATE` disponível, usado para serializar submissões de avaliação da mesma matrícula (ADR 010) — a mesma filosofia da ADR 004 com o instrumento que aquele problema exige.
- Cascatas declaradas no schema, com a assimetria deliberada entre conteúdo (cascateia) e histórico (não cascateia).
- `jsonb` disponível, o que mantém viva a alternativa de trazer o AuditLog para o Postgres se a ADR 006 for revista.
- Migrations versionadas em `prisma/migrations/`, aplicadas com `migrate deploy` no boot do container.
- **Critério para reavaliar:** nenhum previsto. A decisão não depende de escala nem de volume; o que a mudaria é o domínio deixar de ser relacional, o que não é um cenário plausível para uma plataforma de treinamentos.
