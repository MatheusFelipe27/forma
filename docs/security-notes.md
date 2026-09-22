# Notas de segurança

Registro de vulnerabilidades conhecidas que permanecem no projeto e a
justificativa de cada exceção. Uma vulnerabilidade só fica aqui se a decisão de
não corrigir for deliberada e tiver critério de reavaliação.

Última revisão: 2026-09-22.

---

## deepmerge-ts < 8.0.0 — CVE-2026-40345

**Status:** aceita, sem correção. Reavaliar conforme os critérios no fim desta seção.

### Identificação

| Campo | Valor |
|---|---|
| CVE | CVE-2026-40345 |
| Advisory | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) |
| Severidade | High — CVSS 8.2 |
| Classe | CWE-674, recursão não controlada |
| Versões afetadas | `< 8.0.0` |
| Corrigida em | `8.0.0` |
| Versão no projeto | `7.1.5` |

### A vulnerabilidade

`deepmerge-ts` não detecta ciclos ao mesclar objetos. Quando dois objetos de
entrada têm auto-referências no mesmo caminho de propriedade, a recursão não
termina e o processo estoura a pilha. O impacto é de disponibilidade: um atacante
que consiga entregar um grafo de objetos recursivo a uma chamada de `deepmerge()`
derruba o processo Node.

A exploração exige, portanto, que **entrada controlada pelo atacante chegue a uma
chamada da biblioteca**.

### Como ela entra no projeto

```
@prisma/client@6.19.3
└── prisma@6.19.3                (peer dependency opcional)
    └── @prisma/config@6.19.3
        └── deepmerge-ts@7.1.5
```

Nenhuma dependência direta. `@prisma/config` é o pacote que a CLI do Prisma usa
para ler arquivos de configuração (`prisma.config.ts`) — ou seja, é acionado em
`prisma migrate`, `prisma generate` e afins, com um arquivo do próprio repositório
como entrada, não com dados de request.

### Análise de exposição

Duas verificações foram feitas em 2026-09-22, e elas **não** chegam à mesma
conclusão. A distinção importa e por isso está registrada.

**1. O pacote nunca é carregado em runtime. ✅ Verificado.**

Carregando o módulo que instancia o Prisma Client (`dist/shared/database/prisma.js`)
e inspecionando o `require.cache`:

```
deepmerge-ts / @prisma/config carregados: 0
pacotes @prisma carregados: client
```

O código vulnerável não entra no grafo de módulos da aplicação em execução. Não
há caminho pelo qual uma request HTTP alcance uma chamada de `deepmerge()`.

**2. O pacote *está presente em disco* numa instalação de produção. ⚠️**

Isto contraria a suposição inicial de que o caminho seria "dev-only". Um
`npm ci --omit=dev` limpo instala `prisma`, `@prisma/config` e `deepmerge-ts`:

```
deepmerge-ts presente: SIM
@prisma/config presente: SIM
prisma (CLI) presente: SIM
```

A causa é que `prisma` é peer dependency **opcional** de `@prisma/client`, que é
dependência de produção. O npm resolve a peer e a marca como não-dev no lockfile:

```
node_modules/prisma          | dev: false
node_modules/@prisma/config  | dev: false
node_modules/deepmerge-ts    | dev: false
```

Consequência prática: `npm audit` continuará acusando a vulnerabilidade mesmo em
auditoria restrita a produção, e a imagem Docker conterá os arquivos. O que a
verificação 1 garante é que esses arquivos ficam inertes — presentes, nunca
carregados.

**Conclusão:** o risco real é baixo porque não existe caminho de execução, não
porque o pacote esteja ausente.

### Por que não corrigimos

**A correção que o npm oferece é um downgrade.** `npm audit --json` aponta
`fixAvailable: { name: "prisma", version: "6.12.0", isSemVerMajor: true }` — ou
seja, voltar a CLI do Prisma para antes de `@prisma/config` passar a depender de
`deepmerge-ts`. Trocar uma versão estável e testada por uma anterior, para
neutralizar código que não é executado, piora o projeto em vez de melhorá-lo.

**Subir de major não está em discussão.** O Prisma 6 é uma decisão explícita do
projeto. Prisma 7 exige driver adapters e mudanças no generator; essa migração
não se justifica por um problema de disponibilidade em código inalcançável.

**A vulnerabilidade não é alcançável.** A entrada de `@prisma/config` é o arquivo
de configuração do repositório, não dados de usuário. Não há superfície.

### Mitigação alternativa, se for necessário zerar o `npm audit`

Um `overrides` no `package.json` força a versão corrigida sem mexer no Prisma:

```json
"overrides": {
  "deepmerge-ts": "^8.0.0"
}
```

**Não aplicado, e não testado.** `@prisma/config` declara `deepmerge-ts: 7.1.5`;
forçar a major 8 pode quebrar a CLI do Prisma se houver mudança de API entre as
versões. Só vale a pena se uma exigência externa (política de CI, auditoria de
cliente) tornar obrigatório um `npm audit` limpo — e aí com teste das migrations
antes de entrar.

### Critérios de reavaliação

Revisitar esta exceção se qualquer um ocorrer:

- O Prisma 6 publicar um patch com `@prisma/config` em `deepmerge-ts >= 8.0.0`.
- O projeto passar a usar `deepmerge-ts` direto, ou a executar a CLI do Prisma
  com configuração de origem não confiável.
- A migração para Prisma 7+ acontecer por outro motivo — resolve isso de brinde.
- Uma exigência de compliance passar a requerer `npm audit` sem findings.

### Como reproduzir a análise

```bash
npm audit --json                       # advisory, range e fixAvailable
npm ls deepmerge-ts --omit=dev         # cadeia de dependência
node -e "require('./dist/shared/database/prisma.js'); \
  console.log(Object.keys(require.cache).filter(k => k.includes('deepmerge-ts')).length)"
```

O último comando deve imprimir `0`. Se imprimir outra coisa, a premissa central
desta exceção caiu e ela precisa ser reavaliada.
