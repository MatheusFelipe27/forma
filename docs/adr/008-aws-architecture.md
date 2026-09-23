# ADR 008 — Arquitetura AWS pretendida

**Status:** proposta — documental, sem implantação
**Data:** 2026-09-23

> Diferente das outras ADRs deste diretório, esta descreve uma arquitetura
> **pretendida e não executada**. O que está implementado é o que a torna
> viável — Dockerfiles e CI —, não a infraestrutura em si.

## Contexto

O Forma roda hoje em `docker compose`: frontend servido por nginx, API em Node,
PostgreSQL e MongoDB, todos em containers.
Os Dockerfiles são multi-stage e a imagem da API já é a de produção, com
`NODE_ENV=production`, usuário não-root e migrations aplicadas na inicialização.

O contexto do projeto é uma avaliação técnica com prazo curto, na qual AWS é
valorizada. O deploy real foi classificado desde o início como desejável, mas
opcional; documentar a arquitetura pretendida, não.

## Problema

Duas perguntas, que esta ADR responde em sequência:

1. Qual seria a topologia em produção na AWS?
2. Executar esse deploy agora, ou documentá-lo e priorizar o MVP?

---

## Parte 1 — A topologia

### Alternativas

**A. EC2 única com `docker compose`.** Levantar uma instância, clonar o repositório,
subir o mesmo compose que roda localmente.

**B. ECS Fargate + RDS + S3/CloudFront.** Containers gerenciados, banco gerenciado,
estáticos em CDN.

**C. EKS (Kubernetes).**

**D. Serverless — Lambda + API Gateway.**

**E. PaaS — App Runner ou Elastic Beanstalk.**

### Critérios

1. **Aproveitamento do que já existe** — os Dockerfiles estão prontos.
2. **Coerência com a [ADR 001](./001-modular-monolith.md)** — é um monólito modular,
   e a infraestrutura não deveria ser mais complexa que a aplicação.
3. **Custo operacional e de aprendizado.**
4. **Caminho de evolução** sem reescrita.

### Decisão

**Alternativa B**, com esta topologia:

```
                    ┌──────────────┐
   navegador ──────►│  CloudFront  │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼─────────┐     ┌─────────▼─────────┐
    │   S3 (estáticos)  │     │  ALB  (/api/*)    │
    │  build do Vite    │     └─────────┬─────────┘
    └───────────────────┘               │
                                ┌───────▼────────┐
                                │  ECS Fargate   │
                                │  API (Node)    │  2+ tasks
                                └───┬────────┬───┘
                                    │        │
                      ┌─────────────▼──┐  ┌──▼───────────────┐
                      │ RDS PostgreSQL │  │ DocumentDB ou    │
                      │  (Multi-AZ)    │  │ MongoDB Atlas    │
                      └────────────────┘  └──────────────────┘

    Secrets Manager  ──► JWT_SECRET, DATABASE_URL, MONGO_URL
    CloudWatch Logs  ◄── stdout/stderr das tasks
```

O CloudFront distribui pela origem: `/api/*` vai para o ALB, todo o resto vem do
S3. É a mesma separação que o nginx faz hoje no compose, o que mantém a aplicação
de mesma origem e sem CORS — e significa que o build do frontend continua usando
`VITE_API_URL=/api`, sem mudança.

A alternativa C cai pelo critério 2: Kubernetes para um monólito com dois bancos é
mais infraestrutura que aplicação, e contradiz frontalmente o raciocínio da
ADR 001. A alternativa D cai pelo critério 1 — Lambda exigiria reestruturar o
Express e conviver com cold start e limites de conexão ao Postgres, jogando fora o
container pronto. A alternativa A é a mais barata e a que eu escolheria para um
protótipo interno, mas não tem redundância, não tem deploy sem downtime e mantém o
banco no mesmo host da aplicação.

A alternativa E é a concorrente honesta: **App Runner entregaria quase o mesmo com
menos peças**. Fargate foi preferido pelo critério 4 — controle sobre rede, tasks e
escalonamento sem migração posterior —, mas a diferença não é grande, e para um
MVP o App Runner seria uma escolha defensável.

### O MongoDB na AWS é o ponto fraco desta topologia

Vale nomear: o DocumentDB **não é** totalmente compatível com o MongoDB, e o
Mongoose pode esbarrar em recursos não suportados. As saídas seriam MongoDB Atlas
(fora da AWS, com peering) ou — mais coerente com a [ADR 006](./006-audit-log-mongodb.md)
— reconsiderar a auditoria em `jsonb` no próprio RDS, que é exatamente o critério
de reavaliação registrado lá. **Se esta arquitetura fosse executada, esse seria o
primeiro item a revisitar**, porque o custo de um segundo banco gerenciado pesa
mais em produção do que pesa no `docker compose`.

---

## Parte 2 — Por que o deploy não foi executado

### Decisão

**Não executar.** Entregar a arquitetura documentada, os Dockerfiles prontos para
ECS e a CI confiável.

O raciocínio é o mesmo que orienta o resto do projeto: o critério é qualidade de
decisão, não quantidade de entregáveis. Um deploy real consumiria tempo em VPC,
subnets, security groups, IAM, task definitions, certificado e DNS — trabalho de
infraestrutura que não melhora nenhuma das decisões que sustentam este projeto, e
que competiria diretamente com o que não pode ser cortado: os dois problemas
técnicos, o teste de concorrência e as ADRs.

Há também uma razão de honestidade: um deploy feito às pressas, sem custo
monitorado, sem backup testado e sem rollback, seria uma demonstração pior do que
a ausência dele. "Está no ar" não é a mesma coisa que "está operável".

### Trade-offs aceitos

- **A arquitetura não foi validada na prática.** Estimativas de custo, limites de
  conexão do RDS, tempo de cold start das tasks e detalhes de IAM permanecem não
  verificados. Uma proposta não executada tem lacunas que só a execução revela, e
  esta certamente tem.
- **Sem CD.** A CI valida, mas nada publica. Foi escolha deliberada: uma CI
  confiável vale mais que um CD incompleto.
- **⚠️ Migrations no boot não sobrevivem a múltiplas tasks.** O
  `docker-entrypoint.sh` roda `prisma migrate deploy` toda vez que o container
  sobe. Com uma instância isso é conveniente; com N tasks do Fargate subindo em
  paralelo, N processos tentam migrar ao mesmo tempo. O padrão correto na AWS é
  uma **task de migração dedicada**, executada uma vez antes do rollout das tasks
  da API. **Esta é a única mudança que o código precisaria** para a topologia
  acima, e está registrada aqui para não ser descoberta em produção.

## Consequências

- O `backend/Dockerfile` já produz a imagem que iria para o ECR: multi-stage,
  `NODE_ENV=production`, usuário `node`, porta 3333, `GET /health` para o
  health check do target group do ALB.
- O `frontend/Dockerfile` produz estáticos que podem ir tanto para o nginx do
  compose quanto para o S3 — é o mesmo `dist`.
- A CI já executa lint, typecheck, testes e build dos dois projetos; adicionar
  publicação de imagem e `aws ecs update-service` é um job a mais, não uma
  reestruturação.
- `GET /health` é liveness puro e não consulta o banco, de propósito: um health
  check que cai junto com o RDS faria o ALB derrubar tasks saudáveis durante uma
  indisponibilidade do banco, transformando um incidente em dois.
- **Critério para executar:** existir prazo que não concorra com o MVP, ou um
  requisito explícito de ambiente acessível. Nessa ordem: task de migração
  dedicada, secrets no Secrets Manager, depois o rollout.
