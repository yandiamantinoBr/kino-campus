# docs/releases/v11/

Documentação histórica do ciclo V11 (v11.23.0 – v11.33.0).

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `roadmap-v11.25-v11.30.md` | Planejamento formal do backlog v11.25–v11.30 (16 iterações) |
| `test-coverage-plan-v11.26.md` | Plano de cobertura de testes — 7 controllers sem cobertura direta |
| `ios-safari-audit-v11.27.md` | Auditoria iOS/Safari — 6 issues, 3 alta prioridade |
| `controller-parity-audit-v11.28.md` | Auditoria de paridade entre 6 module controllers |
| `swr-audit-v11.29.md` | Auditoria SWR — completude em 6/6 feed controllers + residuais |
| `monolith-audit-v11.30.md` | Auditoria dos dois monolitos: supabase.adapter.js e product.controller.js |
| `handoff-claude-code-v11.30.18.md` | Handoff externo v11.30.18 |
| `kc-create-post-audit-v11.31.md` | Auditoria de kc-create-post.js (2610L, ~114KB) |
| `handoff-claude-code-v11.31.0.md` | Handoff externo v11.31.0 |
| `handoff-claude-code-v11.31.2.md` | Handoff externo v11.31.2 |
| `kc-api-client-audit-v11.32.md` | Auditoria de kc-api.client.js (2520L, 100 membros) |
| `kc-api-client-audit-v11.33.md` | Auditoria V11.33 — 6 domínios residuais do facade KCAPI |

## Contexto

V11 foi o ciclo de estabilização pós-backend:
- Cobertura de testes: 59 → 93 suites / 706 → 1754 testes
- iOS/Safari hardening (backdrop-filter, scroll lock, dvh)
- SWR em todos os feed controllers
- Auditoria dos monolitos (supabase.adapter.js, product.controller.js, kc-api.client.js)
- Encerrado em v11.33.0 (2026-03)

Para o relatório completo de V11, consulte `RELATORIO-KINOCAMPUS-V12.md` (arquivo raiz do projeto) que cobre o estado de partida para V12.
