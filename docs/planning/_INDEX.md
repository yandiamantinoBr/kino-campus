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
| `v46-public-a11y-preimplementation-dossier.md` | Dossie V46 pre-implementacao para o candidato P2 PUBLIC-A11Y-01 |
| `v47-functional-readiness-consolidation.md` | Consolidacao V47 dos dossies V40-V46 e gate de selecao funcional |
| `v49-functional-scope-freeze.md` | Freeze V49 de escopo antes da primeira implementacao funcional |
| `v50-functional-implementation-intake.md` | Intake V50 para abrir a primeira branch funcional futura |
| `v51-functional-no-go-register.md` | Registro V51 de No-Go para bloquear implementacao funcional sem gates/evidencias completos |
| `v52-functional-gate-traceability.md` | Matriz V52 de rastreabilidade entre gates, evidencias e decisao Go/No-Go |
| `v53-functional-patch-manifest.md` | Manifesto V53 de filescope, risco, teste e rollback antes do primeiro patch funcional |
| `v76-hotspot-decomposition-plan.md` | Plano V76 para decomposição segura de `kc-api.client.js` e `styles.css`, atualizado após CSS-C.3 |
| `v76-kcapi-residual-inventory.md` | Inventário JS-I dos buckets residuais da fachada `KCAPI`, atualizado após JS-I.3 e sem novo candidato JS pequeno equivalente |
| `v76-css-ownership-inventory.md` | Inventário CSS-A/C de ownership de `styles.css`, atualizado após os micro-splits admin e chat shortcut |
| `v76-css-visual-baseline.md` | Baseline CSS-B/C visual/cascade para rotas públicas, usuário/chat e admin estático antes/depois de micro-splits CSS-C/C.2/C.3 |
| `v76-search-personalization-architecture-plan.md` | Plano V76.32 para busca orientada aos campos dos seis módulos, preferências, privacidade, rollout, testes e rollback |

## Regras

- Planejamento ativo nao deve alterar runtime, CSS, HTML ou banco por si so.
- Cada item listado aqui precisa apontar uma acao segura, verificavel e reversivel para uma versao futura.
- Quando um plano for executado e encerrado, mover ou resumir o historico em `docs/archive/` antes de remover contexto ativo.
