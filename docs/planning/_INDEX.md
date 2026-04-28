# Planejamento Ativo - KinoCampus

Este diretorio concentra planos e inventarios ativos que ainda nao devem ser arquivados. Historico encerrado permanece em `docs/archive/`.

| Arquivo | Conteudo |
|---|---|
| `v18-pending-inventory.md` | Inventario V18 de pendencias, incompletudes, drift e riscos para triagem V19 |
| `v18-v19-roadmap.md` | Roadmap priorizado para detalhamento e execucao segura na V19 |
| `v19-execution-plan.md` | Plano V19 de execucao controlada, gates e bloqueios deliberados |
| `v24-post-v23-backlog-ledger.md` | Ledger atual pos-V23: itens resolvidos por V19-V23 e pendencias ainda dependentes de ambiente real |
| `v26-qa-evidence-readiness.md` | Readiness V26 para evidencias de QA real sem secrets ou mudancas funcionais |

## Regras

- Planejamento ativo nao deve alterar runtime, CSS, HTML ou banco por si so.
- Cada item listado aqui precisa apontar uma acao segura, verificavel e reversivel para uma versao futura.
- Quando um plano for executado e encerrado, mover ou resumir o historico em `docs/archive/` antes de remover contexto ativo.
