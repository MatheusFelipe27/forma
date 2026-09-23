# ADR 006 — AuditLog em MongoDB

**Status:** aceita
**Data:** 2026-09-23

> Esta é a decisão com a **menor margem** de todo o projeto. A seção "Sobre a
> honestidade desta decisão" existe porque um argumento forçado aqui valeria
> menos que a admissão.

## Contexto

Ações administrativas precisam deixar rastro: quem publicou um treinamento, quem
atribuiu a quem, quem liberou tentativas de avaliação para um funcionário
reprovado. Hoje são quatro ações auditadas — `ASSIGN_TRAINING`,
`PUBLISH_TRAINING`, `ARCHIVE_TRAINING` e `UNLOCK_ATTEMPTS`.

Cada registro guarda autor, ação, recurso afetado, descrição legível e um
`metadata` cujo formato **muda conforme a ação**:

```json
{ "requested": 20, "created": 17, "skipped": 3, "userIds": ["..."] }   // ASSIGN_TRAINING
{ "from": "DRAFT", "to": "PUBLISHED" }                                  // PUBLISH_TRAINING
{ "granted": 1, "attemptsUsed": 2, "attemptsAllowed": 3 }               // UNLOCK_ATTEMPTS
```

O acesso de leitura é raro e restrito ao Admin, com filtros simples por ação,
autor ou recurso. Nunca há junção com o domínio transacional.

## Problema

Onde guardar o registro de auditoria?

E, embutida nessa pergunta, uma segunda: a auditoria pode falhar sem derrubar a
operação de negócio que ela registra?

## Alternativas

**A. Tabela no PostgreSQL, com `metadata jsonb`.** Nenhuma infraestrutura nova.

**B. Coleção no MongoDB.** Um serviço a mais.

**C. Log estruturado em stdout**, coletado por ferramenta externa (CloudWatch,
Loki). Zero persistência própria.

**D. Sem auditoria.** Fora de questão: rastrear quem liberou tentativas de
avaliação para alguém reprovado é requisito de negócio, não enfeite.

## Critérios

1. **Isolamento de falha** — a auditoria não pode comprometer a operação auditada.
2. **Aderência ao padrão de acesso** — escrita frequente, leitura rara, sem junção,
   sem transação com dados de negócio.
3. **Formato variável do `metadata`.**
4. **Infraestrutura adicional.**
5. **Consultabilidade pelo Admin** dentro da própria aplicação.

## Decisão

**Coleção no MongoDB**, com escrita *best-effort*.

A alternativa C cai pelo critério 5: um log em stdout serve a quem tem acesso ao
servidor, não ao Admin dentro do produto. O endpoint `GET /audit-logs` precisa
responder com filtros, e reimplementar isso sobre um coletor externo seria mais
trabalho do que persistir.

Entre A e B, o que decidiu foi o **critério 1**, e ele merece detalhe.

Guardar a auditoria no mesmo PostgreSQL significa que a escrita do log disputa o
mesmo pool de conexões e o mesmo servidor que as operações de negócio. Um pico de
escrita na auditoria consome conexões que faltam para uma matrícula; uma
indisponibilidade do banco derruba os dois ao mesmo tempo, e a operação que eu
mais gostaria de registrar — a que falhou — é justamente a que não consigo
registrar. Separar fisicamente os dois destinos torna a falha de um independente
da falha do outro.

O critério 2 reforça: este dado não se parece com o resto. É *append-only*, nunca
participa de junção, nunca entra em transação com dados de negócio, e é lido raras
vezes. É o perfil para o qual um armazenamento de documentos foi feito.

O critério 3 é o mais visível, ainda que não o mais forte: `metadata` tem forma
diferente por ação, e um documento modela isso nativamente.

### Sobre a honestidade desta decisão

**Uma tabela no PostgreSQL com `metadata jsonb` resolveria — e com estritamente
menos infraestrutura.**

Isso não é uma concessão retórica. Significa, concretamente: um serviço a menos no
`docker-compose`, um healthcheck a menos, um cliente a menos no código, uma
biblioteca a menos nas dependências, um backup a menos em produção, uma linguagem
de consulta a menos para quem mantiver isto depois. O `jsonb` do Postgres indexa,
consulta e valida tão bem quanto o documento do Mongo para este volume. O
critério 3, sozinho, **não** justifica a decisão.

Se o único critério de avaliação fosse "menor infraestrutura para o mesmo
resultado", a alternativa A venceria, e essa é uma crítica legítima a esta ADR.

O que sustenta a escolha é o critério 1 — isolamento de falha — somado ao 2. E
vale nomear a tentação que existe aqui: MongoDB é a tecnologia da vitrine, e seria
fácil apresentar o critério 3 como se fosse decisivo. Não é. A decisão tem margem
estreita e está registrada como tal.

## Trade-offs aceitos

- **Um segundo banco para operar.** Subir, monitorar, fazer backup e conhecer. É o
  custo direto, e o mais caro.
- **Registros podem se perder.** A escrita é best-effort: se o Mongo estiver fora,
  o erro vai para o `stderr` e a operação de negócio segue. **Perder um registro
  de auditoria é preferível a falhar uma atribuição de treinamento por causa
  dele.** Se a auditoria fosse requisito legal com garantia de completude, esta
  decisão estaria errada — e aí a resposta seria a alternativa A, escrevendo o log
  na mesma transação do negócio.
- **Sem integridade referencial com `users`.** O `userId` é apenas uma string, e o
  `userName` é desnormalizado. Para auditoria isso é correto, não defeito: o
  registro deve preservar o nome como era no momento da ação, mesmo que a pessoa
  mude de nome ou seja removida.
- **Duas linguagens de consulta no mesmo projeto.** Prisma para o domínio,
  Mongoose para a auditoria.

## Consequências

- `record()` **nunca lança**. É o único ponto do projeto onde engolir exceção é a
  decisão correta, e o comentário no código diz isso explicitamente.
- **A leitura, ao contrário, propaga.** `GET /audit-logs` responde **503
  `AUDIT_UNAVAILABLE`** quando o Mongo não responde — nunca uma lista vazia. Uma
  lista vazia faria o Admin concluir que nenhuma ação aconteceu, que é pior que
  admitir indisponibilidade. O frontend tem um estado de tela próprio para isso,
  distinto do "nenhum registro".
- **A aplicação sobe sem o Mongo.** Uma falha de conexão no boot vira aviso no
  `stderr`, não erro fatal — derrubar a API porque o registro secundário está fora
  inverteria a prioridade. O `bufferCommands` do Mongoose é desligado para a
  escrita falhar de imediato em vez de ficar pendurada até o timeout.
- **Ações recusadas não geram registro.** Uma transição de status inválida devolve
  409 e não escreve nada — auditoria registra o que aconteceu, não o que foi
  tentado.
- **A troca é contida.** Todo o acesso passa por `AuditRepository`, com
  `isAvailable`, `create` e `findMany`. Migrar para uma tabela `jsonb` significa
  reescrever uma implementação desse contrato; nenhum Service muda.
- **Critérios para reavaliar:**
  - a auditoria passar a exigir completude garantida (obrigação legal, certificação)
    — nesse caso a escrita precisa ser transacional com o negócio, e a alternativa A
    passa a ser a certa;
  - o custo operacional do segundo banco não se justificar na prática — o mesmo
    caminho, e a abstração do repository é o que torna a volta barata;
  - a auditoria precisar ser cruzada com dados de negócio em consulta — junção
    entre dois bancos é exatamente o que esta decisão evitou, e ela cairia.
