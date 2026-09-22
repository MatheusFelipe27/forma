# ADR 009 — JWT stateless e logout sem sessão no servidor

**Status:** aceita
**Data:** 2026-09-22

> Numerada 009 porque 002 e 004–008 estão reservadas na seção 8 do guia de
> implementação para temas já definidos.

## Contexto

A Fase 5 exige login, logout e identificação do usuário autenticado, com
autorização sempre no backend. A stack define JWT como mecanismo de autenticação,
e o projeto proíbe Redis, filas e workers no MVP.

O backend é um monólito modular ([ADR 001](./001-modular-monolith.md)) que pode
rodar em mais de uma instância — o mesmo cenário que motiva a constraint de banco
da [ADR 004](./004-progress-idempotency.md).

## Problema

Um token JWT é verificável por assinatura, sem consulta a estado. Isso é o que o
torna barato — e é exatamente o que torna `POST /auth/logout` uma operação sem
efeito: não existe sessão no servidor para destruir. O token emitido continua
válido até expirar, esteja o usuário "deslogado" ou não.

A pergunta é se o projeto aceita essa janela ou paga para eliminá-la.

## Alternativas

**A. Sessão no servidor.** Cookie de sessão com store compartilhado (Redis ou
tabela de sessões). Logout apaga o registro; a revogação é imediata.

**B. JWT stateless puro.** Logout é um endpoint sem efeito no servidor: o cliente
descarta o token.

**C. JWT + denylist de tokens revogados.** Logout grava o `jti` em um store com
TTL igual ao tempo restante do token; `requireAuth` consulta a denylist.

**D. Access token curto + refresh token rotativo.** Access de minutos, refresh
persistido e revogável. Logout invalida o refresh.

## Critérios

1. **Infraestrutura adicional** — o MVP proíbe Redis e filas.
2. **Necessidade real de revogação imediata** — qual o dano concreto na janela.
3. **Custo por request** — quantas consultas a autenticação adiciona.
4. **Proporcionalidade ao prazo.**

## Decisão

**JWT stateless (alternativa B), com expiração de 1 dia (`JWT_EXPIRES_IN`).**

O critério decisivo foi o segundo. O Forma é uma plataforma interna de
treinamentos: o dado mais sensível que um token dá acesso é o progresso do
próprio usuário em cursos corporativos. Não há operação financeira, não há dado
de terceiros, não há ação destrutiva irreversível. A janela entre o logout e a
expiração do token é um risco real, mas de impacto baixo — e o atacante que a
explorasse já precisaria ter o token em mãos, cenário em que o logout do usuário
legítimo nunca foi a defesa relevante.

Contra A: um store de sessão é exatamente a infraestrutura que o projeto decidiu
não adicionar, e faria cada request pagar uma consulta para resolver um problema
que este domínio não tem.

Contra C: a denylist é o meio-termo honesto, mas precisa de um store consultado a
cada request autenticada. Em uma instância só, um `Map` em memória resolveria —
e seria a mesma falha de raciocínio recusada na ADR 004: estado em memória mente
quando existe mais de uma instância. Fazer certo exige o store compartilhado que
a alternativa A traz, com o mesmo custo.

Contra D: refresh rotativo é a resposta adequada quando a janela de exposição
precisa ser de minutos. Aqui ela não precisa, e o custo é um segundo fluxo de
autenticação inteiro, com rotação, detecção de reuso e armazenamento no cliente.

`POST /auth/logout` permanece na API mesmo sem efeito no servidor, por duas
razões: dá ao cliente um ponto de saída explícito (e um lugar para registrar o
evento em auditoria na Fase 6), e mantém a rota pronta caso a alternativa C venha
a ser implementada — o contrato do cliente não mudaria.

## Trade-offs aceitos

- **Logout não revoga.** O token continua válido até expirar. É o custo central
  desta decisão e não há mitigação parcial: ou existe estado no servidor, ou não.
- **Troca de senha não derruba sessões ativas.** Tokens emitidos antes seguem
  válidos.
- **⚠️ Mudança de papel só vale no próximo login.** O `role` viaja dentro do
  token e o `requireRole` decide a partir dele. Rebaixar um MANAGER para EMPLOYEE
  não tem efeito enquanto o token anterior não expirar — até 24 horas. É a
  consequência mais afiada desta ADR, porque atinge autorização e não apenas
  sessão.

  A mitigação existe e é barata: `requireAuth` carregar o usuário do banco a cada
  request e usar o `role` persistido, em vez do que está no token. O custo é uma
  consulta por request autenticada. **Não foi adotada** para manter a
  autenticação sem I/O, mas é a primeira coisa a mudar se a gestão de papéis
  passar a ser operada com frequência.
- **Janela de 24 horas para token vazado.** Reduzir `JWT_EXPIRES_IN` encurta a
  janela ao custo de relogins mais frequentes, já que não há refresh.

## Consequências

- `requireAuth` não toca o banco: valida assinatura, valida o shape do payload
  com Zod e preenche `req.user`. Autenticação com custo de CPU apenas.
- A expiração configurada em `JWT_EXPIRES_IN` **é** a janela de revogação do
  sistema. Mudar essa variável é uma decisão de segurança, não de conveniência.
- `GET /auth/me` consulta o banco e devolve 401 se o usuário não existe mais —
  cobre a remoção de conta, ainda que não a mudança de papel.
- **Critério para reavaliar:** qualquer um destes derruba a decisão —
  o sistema passar a expor dado pessoal sensível ou operação financeira;
  a gestão de papéis virar operação rotineira, tornando a janela de autorização
  desatualizada um problema prático; ou surgir requisito de compliance exigindo
  encerramento imediato de sessão. O caminho nesse caso é a alternativa C, com
  store compartilhado — nunca com estado em memória.
