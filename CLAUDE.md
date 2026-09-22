# Forma — instruções do projeto

Leia `docs/FORMA_IMPLEMENTACAO.md` antes de qualquer tarefa. Ele é a fonte de verdade.

## Regras não-negociáveis
- Arquitetura: monólito modular, camadas Controller -> Service -> Repository.
- Controller não contém regra de negócio. Repository não contém decisão.
- Progresso é SEMPRE calculado, nunca armazenado.
- Idempotência via constraint do banco. Nunca mutex em memória, nunca lock distribuído.
- Nada de microsserviços, Redis, filas ou workers.
- TypeScript strict. Validação com Zod no backend, sempre.
- Autorização sempre no backend. O frontend só esconde botões.

## Fluxo de trabalho
- Implemente UMA fase por vez e pare para revisão.
- Não antecipe fases futuras.
- Ao tomar decisão técnica relevante, escreva/atualize a ADR em `docs/adr/`.
