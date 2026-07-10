# Auditorias Técnicas do KinoCampus

Este diretório concentra **auditorias pontuais** de cima para baixo (read-only + validação contra
produção) para reduzir drift entre código, documentação e estado remoto. Diferem dos relatórios de
QA em `../qa/reports/` (que cobrem um patch especifico) e dos relatorios de release na raiz
(`RELATORIO-KINOCAMPUS-V*.md`, que documentam uma versao especifica).

## Indice

| Auditoria | Data | Foco | Status |
|---|---|---|---|
| [technical-audit-phase10-schema-ci-reconciliation-2026-07-10.md](./technical-audit-phase10-schema-ci-reconciliation-2026-07-10.md) | 2026-07-10 | Reconciliação local de schema, ACL, CI e Edge Functions | Validado localmente; rollout remoto bloqueado até branch Supabase |
| [technical-audit-phase10-controlled-hardening-2026-07-09.md](./technical-audit-phase10-controlled-hardening-2026-07-09.md) | 2026-07-09 | Hardening controlado de grants de chat e prova local | Pendente de validação/rollout remoto controlado |
| [technical-audit-phase1-3-2026-07-09.md](./technical-audit-phase1-3-2026-07-09.md) | 2026-07-09 | Inventário, confronto documentação-código e dívida técnica | Atual, complemento em fases 4-9 |
| [technical-audit-phase4-6-2026-07-09.md](./technical-audit-phase4-6-2026-07-09.md) | 2026-07-09 | Performance, segurança e operação GitHub-Vercel-Supabase | Atual, complemento em fases 7-9 |
| [technical-audit-phase7-9-2026-07-09.md](./technical-audit-phase7-9-2026-07-09.md) | 2026-07-09 | Testes, roadmap e manutenção documental | Atual |
| [audit-v4-publicacoes-2026-06-22.md](./audit-v4-publicacoes-2026-06-22.md) | 2026-06-22 | Auditoria de 112 publicacoes ativas: categorias erradas, eventos passados, padronizacao, links | Atual |
| [report-aplicacao-audit-v4-2026-06-22.md](./report-aplicacao-audit-v4-2026-06-22.md) | 2026-06-22 | Relatorio de aplicacao da auditoria V4 (8 encerramentos, 4 correcoes de categoria, 38 subcategorias com acento corrigidas, 8 links externos) | Atual |
| [audit-v3-actual-state-2026-06-11.md](./audit-v3-actual-state-2026-06-11.md) | 2026-06-11 | Comparacao entre V1/V2 e o estado real apos 9 PRs mergeados em 72h | Historico (ainda util como referencia de metodologia) |

## Auditorias externas (workspace do agent, fora do repo)

Por convencao, auditorias geradas em modo somente-leitura no workspace do agent ficam em
`~/.minimax-agent/projects/kino-campus-audit/`:

- `RELATORIO-AUDITORIA-KINOCAMPUS.md` (V1, 2026-06-08) - inventario inicial
- `ADENDO-AUDITORIA-APROFUNDADA-V2.md` (V2, 2026-06-09) - investigacao critica

Estas auditorias **nao sao commitadas ao repo** porque foram produzidas como insumos de
trabalho, nao como documentacao canonica. Quando uma auditoria do agent gera um patch
documental que entra no repo, esse patch vira um PR proprio (ex: PR #558
`docs(ops): record notify-admin-reports-threshold remote state`).

## Convenção

- Toda auditoria aqui documentada tem **data, escopo, modo (read-only ou nao) e limite
  metodologico** declarados no cabecalho
- Toda afirmacao relevante deve ser validada contra `git log`, GitHub, Vercel, Supabase
  ou `VERSION.json` antes de virar achado
- Falsos positivos sao declarados explicitamente em vez de removidos em silencio
- O `fora de escopo` lista tudo que **nao** foi feito (commits, deploys, PATCH em Management API)
