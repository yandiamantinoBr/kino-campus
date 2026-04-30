# Planejamento Ativo - KinoCampus

Este diretorio concentra planos e inventarios ativos que ainda nao devem ser arquivados. Historico encerrado permanece em `docs/archive/`.

| Arquivo | Conteudo |
|---|---|
| `v18-pending-inventory.md` | Inventario V18 de pendencias, incompletudes, drift e riscos para triagem V19 |
| `v18-v19-roadmap.md` | Roadmap priorizado para detalhamento e execucao segura na V19 |
| `v19-execution-plan.md` | Plano V19 de execucao controlada, gates e bloqueios deliberados |
| `v24-post-v23-backlog-ledger.md` | Ledger atual pos-V23: itens resolvidos por V19-V23 e pendencias ainda dependentes de ambiente real |
| `v26-qa-evidence-readiness.md` | Readiness V26 para evidencias de QA real sem secrets ou mudancas funcionais |
| `v35-css-readiness-ledger.md` | Ledger V35 de pre-requisitos para split CSS, ajustes visuais e rollback |
| `v36-implementation-readiness-roadmap.md` | Roadmap V36 de sequencia segura para futuras implementacoes |
| `v37-functional-entry-gate.md` | Gate V37 de entrada para qualquer implementacao funcional futura |
| `v38-rollback-evidence-gate.md` | Gate V38 de evidencia de rollback antes de mudancas funcionais |
| `v39-functional-candidate-matrix.md` | Matriz V39 de candidatos funcionais para primeira implementacao futura |
| `v40-auth-callback-preimplementation-dossier.md` | Dossie V40 pre-implementacao para o candidato P0 AUTH-CB-01 |
| `v41-profile-avatar-preimplementation-dossier.md` | Dossie V41 pre-implementacao para o candidato P0 PROFILE-AV-01 |
| `v42-admin-moderation-preimplementation-dossier.md` | Dossie V42 pre-implementacao para o candidato P1 ADMIN-MOD-01 |
| `v43-notification-provider-preimplementation-dossier.md` | Dossie V43 pre-implementacao para o candidato P1 NOTIF-SB-01 |
| `v44-search-fts-preimplementation-dossier.md` | Dossie V44 pre-implementacao para o candidato P1 SEARCH-FTS-01 |
| `v45-css-small-change-preimplementation-dossier.md` | Dossie V45 pre-implementacao para o candidato P2 CSS-SM-01 |

## Regras

- Planejamento ativo nao deve alterar runtime, CSS, HTML ou banco por si so.
- Cada item listado aqui precisa apontar uma acao segura, verificavel e reversivel para uma versao futura.
- Quando um plano for executado e encerrado, mover ou resumir o historico em `docs/archive/` antes de remover contexto ativo.
