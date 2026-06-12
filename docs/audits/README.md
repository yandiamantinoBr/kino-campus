# Auditorias Tecnicas do Kino Campus

Este diretorio concentra **auditorias pontuais** de cima pra baixo (read-only + validacao contra
producao) para reduzir drift entre codigo, documentacao e estado remoto. Diferem dos reports de
QA em `../qa/reports/` (que cobrem um patch especifico) e dos relatorios de release na raiz
(`RELATORIO-KINOCAMPUS-V*.md`, que documentam uma versao especifica).

## Indice

| Auditoria | Data | Foco | Status |
|---|---|---|---|
| [audit-v3-actual-state-2026-06-11.md](./audit-v3-actual-state-2026-06-11.md) | 2026-06-11 | Comparacao entre V1/V2 e o estado real apos 9 PRs mergeados em 72h | Atual |

## Auditorias externas (workspace do agent, fora do repo)

Por convencao, auditorias geradas em modo somente-leitura no workspace do agent ficam em
`~/.minimax-agent/projects/kino-campus-audit/`:

- `RELATORIO-AUDITORIA-KINOCAMPUS.md` (V1, 2026-06-08) - inventario inicial
- `ADENDO-AUDITORIA-APROFUNDADA-V2.md` (V2, 2026-06-09) - investigacao critica

Estas auditorias **nao sao commitadas ao repo** porque foram produzidas como insumos de
trabalho, nao como documentacao canonica. Quando uma auditoria do agent gera um patch
documental que entra no repo, esse patch vira um PR proprio (ex: PR #558
`docs(ops): record notify-admin-reports-threshold remote state`).

## Conveccao

- Toda auditoria aqui documentada tem **data, escopo, modo (read-only ou nao) e limite
  metodologico** declarados no cabecalho
- Toda afirmacao relevante deve ser validada contra `git log`, GitHub, Vercel, Supabase
  ou `VERSION.json` antes de virar achado
- Falsos positivos sao declarados explicitamente em vez de removidos em silencio
- O `fora de escopo` lista tudo que **nao** foi feito (commits, deploys, PATCH em Management API)
