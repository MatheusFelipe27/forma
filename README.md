# Forma

Plataforma web de educação corporativa e gestão de treinamentos.

Empresas precisam comprovar que seus funcionários fizeram os treinamentos obrigatórios — compliance, LGPD, segurança da informação. Na prática isso costuma virar planilha: alguém anota quem concluiu o quê, o dado envelhece e ninguém confia no número. O Forma resolve o essencial disso: atribuir treinamentos, acompanhar progresso real e avaliar conhecimento, com o progresso sempre derivado do que de fato aconteceu.

O projeto é um MVP deliberadamente pequeno. O objetivo não foi cobrir o máximo de funcionalidades, e sim tomar poucas decisões técnicas e conseguir defendê-las — cada uma está registrada em uma ADR com as alternativas consideradas e o trade-off aceito.

## Perfis

| Perfil | O que faz |
|---|---|
| **Employee** | Vê os treinamentos atribuídos a ele, estuda os módulos, conclui cada um e responde à avaliação. |
| **Manager** | Enxerga a situação da equipe, atribui treinamentos (individual ou em massa), cria e publica treinamentos, libera tentativas de quem esgotou a avaliação. |
| **Admin** | Tudo que o Manager faz, mais a consulta ao registro de auditoria. |

A matrícula é sempre feita por Manager ou Admin — não existe autoatendimento. Um funcionário só acessa o que foi atribuído a ele.

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Frontend | React + TypeScript (Vite) | SPA simples; o Vite dá build rápido sem configuração. |
| Backend | Node + Express + TypeScript | Domínio pequeno, time de uma pessoa, ferramental conhecido. |
| Banco principal | PostgreSQL + Prisma | O domínio é relacional e exige integridade: as constraints únicas são parte da solução, não detalhe. |
| Auditoria | MongoDB + Mongoose | Escrita frequente, sem JOIN, sem transação crítica e com `metadata` de formato variável. |
| Autenticação | JWT stateless | Sem estado de sessão no servidor. |
| Validação | Zod | Mesma biblioteca no backend e no frontend. |
| Testes | Vitest + Supertest | 242 testes, priorizando comportamento crítico. |
| Container | Docker + Docker Compose | `docker compose up` sobe o sistema inteiro. |
| CI | GitHub Actions | Lint, typecheck, testes e build nos dois projetos. |

TypeScript roda em modo `strict` nos dois lados, com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.

## Arquitetura

**Monólito modular**, com as camadas `Controller → Service → Repository`.

```
HTTP → Route → Controller → Service → Repository → PostgreSQL
```

- **Controller** só cuida de HTTP: valida o corpo com Zod, chama o Service, define status e formato da resposta. Zero regra de negócio.
- **Service** concentra as decisões de domínio — `calculateProgress()`, `canCompleteTraining()`, `calculateScore()`, a idempotência da conclusão de módulo.
- **Repository** só persiste. Nenhuma decisão.

A separação existe por um motivo prático: ela torna os Services testáveis com um dublê no lugar do Repository. É o que permite testar as regras críticas em milissegundos, sem banco. Esse é o critério que justifica o boilerplate a mais — ver [ADR 003](docs/adr/003-controller-service-repository.md).

Cada módulo de domínio vive em `backend/src/modules/<nome>/` com seus próprios controller, service, repository, schemas e rotas. A comunicação entre módulos acontece de Service para Service; um módulo nunca acessa o Repository de outro — é isso que mantém a fronteira útil e a extração futura viável ([ADR 001](docs/adr/001-modular-monolith.md)).

### Os dois bancos

**PostgreSQL** guarda o domínio transacional: usuários, treinamentos, módulos, matrículas, progresso, avaliações e tentativas. Três constraints únicas fazem trabalho de verdade:

```
UNIQUE(enrollment_id, module_id)   impede progresso duplicado  → ADR 004
UNIQUE(user_id, training_id)       impede matrícula duplicada  → ADR 005
UNIQUE(training_id, position)      mantém a ordem dos módulos íntegra no banco
```

**MongoDB** guarda apenas o `AuditLog`. A escrita é *best-effort*: se o Mongo estiver fora, o erro vai para o `stderr` e a operação de negócio continua. Auditoria é registro secundário e não pode derrubar uma atribuição de treinamento. A leitura, ao contrário, propaga o erro — `GET /audit-logs` responde **503**, nunca uma lista vazia, porque uma lista vazia faria o Admin concluir que nada aconteceu.

## Como executar

### Docker (caminho principal)

Sobe backend, frontend, PostgreSQL e Mongo do zero:

```bash
docker compose up --build
```

- Frontend: **http://localhost:8080**
- API: **http://localhost:3333**

As migrations são aplicadas automaticamente no boot do backend. Para popular o banco com dados de exemplo:

```bash
docker compose exec backend npm run prisma:seed
```

Para recomeçar do zero, apagando os volumes:

```bash
docker compose down -v && docker compose up --build
```

### Credenciais de teste

Todos os usuários do seed usam a senha **`Forma@123`**.

| E-mail | Perfil | Situação no seed |
|---|---|---|
| `admin@forma.dev` | Admin | acesso à auditoria |
| `ana.rocha@forma.dev` | Manager | 5 subordinados diretos |
| `bruno.carvalho@forma.dev` | Manager | equipe comercial |
| `camila.duarte@forma.dev` | Employee | tudo concluído |
| `diego.prado@forma.dev` | Employee | dois treinamentos em andamento |
| `felipe.antunes@forma.dev` | Employee | matrícula atrasada |
| `gabriela.reis@forma.dev` | Employee | módulos completos, reprovada na avaliação |
| `karina.vasques@forma.dev` | Employee | **tentativas esgotadas** — precisa de liberação do gestor |

O seed cria 13 usuários, 4 treinamentos publicados (2 com avaliação), 19 matrículas em estados variados e é idempotente: pode rodar quantas vezes quiser.

### Desenvolvimento local

Só os bancos no Docker, aplicações rodando na máquina:

```bash
docker compose up postgres mongo

# backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev          # http://localhost:3333

# frontend, em outro terminal
cd frontend
cp .env.example .env
npm install
npm run dev          # http://localhost:5173
```

**Sobre o `.env`:** não é versionado. Cada projeto tem um `.env.example` com as variáveis necessárias. O backend valida todas com Zod no boot e **falha imediatamente** se faltar ou estiver malformada — um ambiente incompleto derruba a inicialização em vez de virar um 500 obscuro na primeira requisição.

Uma diferença que vale saber: em desenvolvimento o frontend chama a API por `VITE_API_URL=http://localhost:3333`; no Docker, o valor é `/api` e o nginx da própria imagem encaminha para o backend. Como o Vite congela essa variável no bundle em tempo de build, a URL relativa evita amarrar a imagem à porta publicada no host e elimina CORS.

## Testes

```bash
cd backend
npm test
```

**242 testes em 17 arquivos.** Os unitários rodam sem infraestrutura; os de integração precisam de PostgreSQL e MongoDB no ar (`docker compose up postgres mongo`). Cada teste de integração cria e remove os próprios dados, então não dependem do seed.

O frontend valida com:

```bash
cd frontend
npm run lint && npm run typecheck && npm run build
```

### O teste que mais importa

Em `backend/src/modules/enrollments/enrollments.routes.test.ts`, o teste de concorrência dispara N requisições simultâneas de conclusão do mesmo módulo e verifica que:

- existe **exatamente 1** registro em `module_progress`;
- **todas** as respostas retornaram 200;
- exatamente uma delas criou o registro, as demais recuperaram o existente.

Ele roda com N = 2, 5 e 10, e isso não é redundância. Ao substituir a implementação por `check-then-insert` puro para conferir se o teste tinha dentes, **N = 2 continuou passando** enquanto N = 5 e N = 10 falharam com HTTP 500. Duas requisições não disputam de forma confiável o suficiente para provar nada.

O mesmo exercício foi feito com o limite de tentativas da avaliação: removendo o `SELECT ... FOR UPDATE`, seis submissões simultâneas criaram 4 tentativas num limite de 2.

## Decisões técnicas

Cada decisão segue o formato Contexto → Problema → Alternativas → Critérios → Decisão → Trade-offs → Consequências, com critério explícito de reavaliação.

### [ADR 004 — Idempotência na conclusão de módulo](docs/adr/004-progress-idempotency.md)

A decisão central. Quatro alternativas foram avaliadas: verificação só na aplicação, mutex em memória, lock distribuído e constraint única no banco.

O critério eliminatório foi funcionar com **múltiplas instâncias**. O mutex em memória é a armadilha que esta ADR existe para recusar: ele parece resolver, passa em todos os testes locais e falha silenciosamente no dia em que a aplicação sobe com duas réplicas. A garantia precisa morar onde o estado mora.

Não há verificação prévia — a escrita é tentada de imediato e o erro `P2002` é o mecanismo de controle. **A segunda requisição recebe 200 com o progresso existente**, não 409 nem 500: concluir um módulo já concluído atingiu o estado desejado, e isso é sucesso. Esse detalhe é o que separa "usei constraint" de "entendi idempotência".

### [ADR 007 — Progresso calculado, não armazenado](docs/adr/007-calculated-progress.md)

Não existe coluna de percentual. `progresso = módulos concluídos / total de módulos`, derivado a cada leitura.

Armazenar exigiria que todo caminho que altera progresso atualizasse o campo corretamente — concluir módulo, remover módulo, adicionar módulo (que muda o denominador de todas as matrículas existentes), corrigir dado à mão, migrar. Calcular tem uma propriedade que armazenar não tem: **é impossível divergir**.

O mesmo vale para `OVERDUE`, que nunca é persistido — depende do instante da leitura. A ADR é honesta sobre a exceção: a coluna `status` existe e é atualizada, mas só para filtrar listagem no banco; o status exibido é sempre o derivado, e a resposta expõe os dois valores lado a lado para tornar qualquer divergência observável.

### [ADR 005 — Atribuição em massa síncrona](docs/adr/005-synchronous-assignment.md)

`createMany` com `skipDuplicates` em uma transação, processamento síncrono. Uma fila resolveria um problema de latência que este volume não tem: 100 inserts levam milissegundos, e adotá-la traria Redis, worker, monitoramento e retry para acelerar algo que já é rápido.

A ADR é explícita sobre um ponto que seria fácil maquiar: um `createMany` isolado já é atômico, então a transação não adiciona garantia por si só — ela existe porque são dois statements, a inserção e a leitura do estado resultante, que precisam refletir o mesmo instante.

Critérios para migrar para fila estão documentados: p95 acima de ~2s ou lotes acima de ~1000 funcionários.

### [ADR 009 — JWT stateless e logout sem sessão](docs/adr/009-stateless-jwt-logout.md)

Logout não invalida nada: não há sessão no servidor. A ADR registra o trade-off mais afiado disso — o `role` viaja dentro do token, então **rebaixar um Manager só tem efeito no próximo login**, até 24 horas depois. A mitigação (ler o papel do banco a cada requisição) está documentada como a primeira coisa a mudar se a gestão de papéis virar operação rotineira.

### [ADR 010 — Limite de tentativas e desbloqueio](docs/adr/010-attempt-limit-and-unlock.md)

Tentativas repetidas são legítimas, então não há constraint única para apoiar o limite como na ADR 004. A solução foi um lock de linha (`SELECT ... FOR UPDATE`) na matrícula: a garantia continua no banco, sem Redis e sem mutex, com o instrumento diferente que este problema exige.

O desbloqueio concede tentativas extras em vez de apagar as existentes — o histórico de reprovações é dado de auditoria e justifica a ação do gestor.

### [ADR 001 — Monólito modular](docs/adr/001-modular-monolith.md) e [ADR 003 — Camadas](docs/adr/003-controller-service-repository.md)

Contra microsserviços, o argumento decisivo foi consistência, não custo: separar matrículas de treinamentos transformaria uma constraint que o Postgres garante de graça em coordenação distribuída com compensação — um problema mais difícil, criado por escolha própria, sem nenhuma pressão externa que o justifique.

## Limitações e trabalho futuro

Esta seção é deliberadamente honesta. O que está fora do MVP e por quê:

**Reordenação de módulos** — não implementada. Trocar posições esbarra na constraint `UNIQUE(training_id, position)`: dentro de uma transação, `1,2,3 → 2,1,3` viola no meio do caminho, porque o Postgres verifica por statement e a constraint não é `DEFERRABLE`. A solução exige reescrita em duas fases ou mudança no schema — decisão que não quis tomar sozinho. Módulos recebem posição na criação (`max + 1`), e remover deixa lacuna na sequência, o que não afeta a ordenação.

**Listagem de usuários** — não existe endpoint `GET /users`. O módulo `users` tem repository e service, mas nenhum controller. A tela de atribuição contorna usando `GET /dashboard/team`, o que tem um efeito colateral: **a interface é mais restritiva que a API**. Um Manager só consegue atribuir aos subordinados diretos pela tela, embora o backend permita atribuir a qualquer usuário (a validação é por papel, sem checagem de propriedade). Alinhar os dois exigiria ou o endpoint novo, ou uma regra de ownership no service.

**Edição de treinamento publicado** — bloqueada por regra, não por falta de tempo. Depois da publicação existem matrículas, e alterar módulos mudaria o denominador do progresso de quem já está estudando. O caminho é arquivar e criar nova versão.

**Deploy AWS** — documentado como intenção, não executado. A arquitetura pretendida é `S3/CloudFront → ECS/Fargate → RDS PostgreSQL`, e o Dockerfile já está pronto para ECS. Deploy real foi conscientemente sacrificado para não canibalizar o MVP.

**Exceção de segurança conhecida** — `deepmerge-ts < 8.0.0` (CVE-2026-40345, CVSS 8.2), transitiva via `@prisma/client → prisma → @prisma/config`. A análise completa está em [docs/security-notes.md](docs/security-notes.md), incluindo a verificação de que o pacote **nunca é carregado em runtime** e a constatação — contrária à suposição inicial — de que ele *está presente em disco* numa instalação de produção, porque `prisma` é peer dependency opcional de um pacote de produção.

**Cascade de exclusão assimétrica** — apagar um treinamento leva módulos, avaliação, perguntas e alternativas, mas **não** matrículas, progresso nem tentativas: o banco recusa. É proteção, não lacuna. Conteúdo pode ser apagado; histórico de pessoas reais, não. O caminho para remover um treinamento com matrículas é arquivar. Ver a Parte 3 da ADR 010.

**Cobertura de testes** — não houve busca por percentual. Os testes cobrem o que quebra: idempotência sob concorrência, cálculo de progresso e score, regras de conclusão, limites de tentativa, RBAC e vazamento de gabarito.

**E2E** — não implementado. Os fluxos críticos estão cobertos por testes de integração via Supertest.

## Estrutura de pastas

```
forma/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          modelo do domínio
│   │   ├── migrations/
│   │   └── seed.ts                dados de exemplo
│   └── src/
│       ├── modules/
│       │   ├── auth/              login, JWT
│       │   ├── users/             hash de senha, usuário público
│       │   ├── trainings/         treinamentos e módulos
│       │   ├── enrollments/       matrículas, progresso, cálculo
│       │   ├── assessments/       avaliações e tentativas
│       │   ├── dashboard/         agregações (compõe, não recalcula)
│       │   └── audit/             AuditLog (MongoDB)
│       ├── shared/
│       │   ├── config/            env validado com Zod no boot
│       │   ├── database/          Prisma singleton, Mongoose, erros do Prisma
│       │   ├── errors/            AppError
│       │   ├── middleware/        auth, RBAC, rate limit, error handler
│       │   └── utils/             JWT
│       ├── app.ts
│       └── server.ts
│
├── frontend/
│   ├── nginx.conf                 proxy /api e fallback SPA
│   └── src/
│       ├── auth/                  contexto de sessão
│       ├── components/            Button, Input, Card, Badge, toasts, estados
│       ├── features/              chamadas de API e componentes por domínio
│       ├── layout/                AppShell, Sidebar, Header
│       ├── pages/                 uma por rota
│       └── routes/                navegação por papel, rota protegida
│
├── docs/
│   ├── security-notes.md          exceções de segurança aceitas
│   └── adr/                       decisões arquiteturais
│
├── .github/workflows/ci.yml
└── docker-compose.yml
```

## CI

O workflow em `.github/workflows/ci.yml` roda em pull requests e pushes para `main`, com dois jobs paralelos:

- **Backend** — `npm ci` → `prisma generate` → lint → typecheck → `migrate deploy` → testes → build, com PostgreSQL 16 e MongoDB 7 como service containers.
- **Frontend** — `npm ci` → lint → typecheck → build.

A prioridade foi **CI confiável antes de CD**: melhor um pipeline que realmente reprova código quebrado do que um deploy automatizado e incompleto.
