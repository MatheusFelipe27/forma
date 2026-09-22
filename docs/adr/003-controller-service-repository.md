# ADR 003 — Camadas Controller → Service → Repository

**Status:** aceita
**Data:** 2026-09-22

## Contexto

Dentro do monólito modular ([ADR 001](./001-modular-monolith.md)), cada módulo de
domínio precisa de uma organização interna consistente. As regras de negócio do
Forma não são triviais:

- progresso é calculado, nunca armazenado ([ADR 007](./007-calculated-progress.md));
- conclusão de treinamento depende de todos os módulos concluídos **e** da
  avaliação aprovada, quando ela existe;
- avaliação respeita `minScore` e `maxAttempts`, e o score é calculado no backend;
- conclusão de módulo é idempotente sobre uma constraint de banco
  ([ADR 004](./004-progress-idempotency.md)).

São justamente essas regras que precisam de teste confiável — e é sobre elas que
o vídeo de apresentação se sustenta.

## Problema

Onde a regra de negócio vive, e como ela é testada sem subir servidor HTTP e
banco de dados a cada asserção?

## Alternativas

**A. Tudo no controller.** Handler do Express faz validação, consulta ao banco,
decisão e resposta.

**B. Controller + Service**, com o Service acessando o Prisma diretamente.

**C. Controller + Service + Repository.** Três camadas, cada uma com uma
responsabilidade.

**D. Clean Architecture / Ports & Adapters completa.** Entidades de domínio,
casos de uso, portas, adaptadores, mapeadores entre camadas.

## Critérios

1. **Testabilidade da regra de negócio** — quanto custa testar `canCompleteTraining()`.
2. **Localização previsível** — dado um comportamento, quantos lugares é preciso olhar.
3. **Boilerplate por endpoint** — o que se paga por essa organização.
4. **Proporcionalidade ao tamanho do domínio.**

## Decisão

**Três camadas (alternativa C), com responsabilidades estritas:**

| Camada | Responsabilidade | Proibido |
|---|---|---|
| **Controller** | HTTP: parse do request, execução do schema Zod, chamada ao Service, status code e formato da resposta | Qualquer decisão de negócio |
| **Service** | Regra de negócio, decisão de domínio, orquestração de transação | Conhecer Express (`req`, `res`) |
| **Repository** | Persistência: queries Prisma | Qualquer decisão; é tradutor, não juiz |

O critério decisivo foi o primeiro. Testar `canCompleteTraining()` na alternativa
A ou B exige um banco de verdade e uma request HTTP — o teste fica lento, precisa
de fixtures e falha por motivos que nada têm a ver com a regra sendo testada.
Com o Repository como costura, o Service é testado com um dublê em memória: a
regra é verificada em milissegundos, e o teste falha se e somente se a regra
mudou.

A alternativa D entrega a mesma testabilidade, mas cobra entidades de domínio,
portas e mapeadores entre camadas. Para sete módulos CRUD-com-regras, o ganho
marginal sobre C não paga o custo — e cada camada extra precisaria ser justificada
em um minuto de vídeo, que é o teste de complexidade adotado neste projeto.

A alternativa B foi descartada por um motivo específico: sem Repository, o mock
do teste vira o Prisma Client inteiro, e o teste passa a depender do formato da
API do ORM em vez do comportamento da regra.

## Trade-offs aceitos

- **Mais arquivos por módulo** — seis, contra um ou dois. É o custo direto da
  decisão e vale a pena apenas porque as regras deste domínio merecem teste
  isolado; em um CRUD sem regra, não valeria.
- **Repository que só repassa.** Vários métodos serão um `findUnique` de uma
  linha. Indireção aparentemente inútil, que existe pela costura de teste.
- **A separação é convenção.** Nada impede tecnicamente um controller de importar
  o Prisma. Depende de disciplina e revisão.
- **Transações atravessam a fronteira.** Operações que precisam de atomicidade
  (atribuição em massa, ver [ADR 005](./005-synchronous-assignment.md)) exigem que
  o Service orquestre o `$transaction`, o que dá a ele algum conhecimento sobre a
  persistência. A alternativa — Unit of Work explícito — foi considerada
  desproporcional.

## Consequências

- Testes unitários de Service sem banco: `calculateProgress()`,
  `calculateScore()`, `canCompleteTraining()` e a validação de tentativas
  (Fase 8).
- Testes de integração ficam reservados ao que só o banco pode provar — o teste
  de concorrência da constraint de `module_progress` (ADR 004).
- O tratamento de erro atravessa as camadas por `AppError`: o Service comunica
  decisão de domínio ("matrícula bloqueada", 403) sem conhecer HTTP, e o handler
  centralizado converte para resposta.
- A comunicação entre módulos acontece **de Service para Service**. Um módulo
  nunca chama o Repository de outro — essa é a regra que mantém a fronteira da
  ADR 001 com algum significado.
- **Critério para reavaliar:** se os Repositories virarem majoritariamente
  repasse de uma linha e nenhum Service tiver regra digna de teste isolado, a
  camada perdeu a justificativa e deve ser removida, não mantida por hábito.
