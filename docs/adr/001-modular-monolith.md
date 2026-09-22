# ADR 001 — Monólito modular

**Status:** aceita
**Data:** 2026-09-22

## Contexto

O Forma é uma plataforma de educação corporativa com um domínio pequeno e bem
delimitado: usuários com três papéis, treinamentos com módulos e avaliação,
matrículas, progresso e auditoria. Sete módulos de domínio no total.

As condições do projeto:

- Equipe de uma pessoa.
- Prazo curto, com entrega avaliada por qualidade de decisão, não por volume.
- Sem tráfego real, sem SLA, sem requisito de escala conhecido.
- Deploy em AWS é desejável, mas opcional.

## Problema

Qual granularidade de deploy o projeto adota? A decisão determina a topologia de
infraestrutura, o modelo de consistência de dados e o custo de cada mudança
durante todo o resto do desenvolvimento.

Há uma pressão de contexto relevante: "microsserviços" é a resposta esperada em
avaliações técnicas, e escolher o contrário exige justificativa explícita.

## Alternativas

**A. Microsserviços.** Um serviço por contexto (usuários, treinamentos,
matrículas, auditoria), comunicação por HTTP ou mensageria, banco por serviço.

**B. Monólito em camadas, sem fronteira interna.** Uma aplicação, código
organizado por tipo de artefato (`controllers/`, `services/`, `models/`).

**C. Monólito modular.** Uma aplicação e um deploy, código organizado por módulo
de domínio, cada módulo com fronteira explícita e comunicação entre módulos via
interface pública (Service), não por acesso direto ao Repository alheio.

## Critérios

1. **Custo de operação** — quanta infraestrutura precisa existir e ser mantida.
2. **Consistência transacional** — o que acontece com operações que cruzam entidades.
3. **Velocidade de mudança** por uma pessoa só.
4. **Facilidade de depuração.**
5. **Porta aberta para evolução** — o quanto a escolha impede mudar de ideia depois.

## Decisão

**Monólito modular (alternativa C).**

Contra microsserviços, dois critérios foram decisivos:

**Consistência.** A operação mais importante do sistema — concluir um módulo de
treinamento — precisa de atomicidade entre progresso e matrícula, e resolve
concorrência com uma constraint única no banco (ver [ADR 004](./004-progress-idempotency.md)).
Separar matrículas e treinamentos em serviços distintos transformaria uma
constraint de banco, que o Postgres garante de graça, em coordenação distribuída
com compensação — problema estruturalmente mais difícil, criado por escolha
própria, sem nenhuma pressão externa que o justifique.

**Custo.** Microsserviços exigem service discovery, observabilidade distribuída,
versionamento de contratos e orquestração de deploy. Nada disso entrega
funcionalidade ao usuário; tudo isso consome o prazo. Para sete módulos operados
por uma pessoa, o custo é integralmente perda.

Contra o monólito sem fronteiras (B): organizar por tipo de artefato faz o
domínio desaparecer na estrutura de pastas, e o acoplamento entre áreas cresce
sem ninguém perceber — exatamente o que torna a extração futura cara.

A estrutura por módulo (`modules/trainings/`, `modules/enrollments/`, ...) mantém
o domínio visível e as dependências entre áreas rastreáveis.

## Trade-offs aceitos

- **Sem escalabilidade independente por módulo.** Escalar é replicar a aplicação
  inteira. Aceitável: não há métrica que indique um módulo com perfil de carga
  distinto, e replicar um monólito Node é barato.
- **Uma falha grave derruba tudo.** Sem isolamento entre módulos em runtime.
  Aceitável na ausência de SLA.
- **Um deploy para toda mudança.** Com uma pessoa, não há contenção de deploy —
  esse custo só apareceria com times paralelos.
- **A fronteira entre módulos é convenção, não barreira física.** Nada impede
  tecnicamente que um módulo importe o Repository de outro; isso depende de
  disciplina e de revisão.

## Consequências

- Um `docker compose up` sobe a aplicação inteira. Ambiente de desenvolvimento
  trivial, requisito da Fase 11.
- Stack trace único e transações locais: depurar é ler um log.
- A comunicação entre módulos passa pela camada de Service (ver
  [ADR 003](./003-controller-service-repository.md)), que é o que mantém a
  fronteira útil.
- **Caminho de evolução:** se um módulo vier a precisar de deploy próprio, a
  extração começa de uma fronteira que já existe — mover a pasta, substituir a
  chamada de Service por uma chamada de rede, replicar os dados de que ele
  depende. Continua trabalhoso, mas é um refactor conhecido em vez de uma
  reescrita.
- **Critério para reavaliar:** um módulo com perfil de carga comprovadamente
  distinto dos demais, ou times separados disputando o mesmo pipeline de deploy.
  Nenhum dos dois existe hoje.
