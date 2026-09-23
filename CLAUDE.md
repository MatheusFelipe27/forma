# Forma — instruções do projeto

Consulte a documentação do projeto antes de qualquer tarefa: o `README.md` e as ADRs em `docs/adr/`. As ADRs são a fonte de verdade das decisões técnicas.

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

## Comentarios
- Comentar o PORQUE (decisoes, trade-offs, regras de negocio nao-obvias), nunca o QUE o codigo ja diz.
- Decisoes grandes vivem nas ADRs; no codigo, so uma referencia curta (ex: 'ver ADR 004').
- Sem comentarios obvios tipo '// importa o express' ou '// cria variavel'.
