# Auditoria V3 - Estado Real Verificado do Kino Campus

**Data:** 2026-06-11 America/Sao_Paulo
**Escopo:** comparacao entre `RELATORIO-AUDITORIA-KINOCAMPUS.md` (V1, 2026-06-08),
`ADENDO-AUDITORIA-APROFUNDADA-V2.md` (V2, 2026-06-09) e o estado real do repositorio,
Supabase, Vercel e GitHub em 2026-06-11.
**Modo:** read-only em producao; apenas patches documentais commitados (PR #558, merge em
`4b5f170`).
**Convencoes:** tudo que diz "verificado" foi checado por comando explicito nesta sessao.
Tudo que diz "nao verificado" precisa de probe real antes de virar achado.

---

## 1. Resumo executivo

A V1 (2026-06-08) e a V2 (2026-06-09) produziram um retrato coerente do projeto no momento da
auditoria original. Em **72 horas**, **9 PRs (#549 a #557)** foram mergeados em
`kinocampus-V75.0-foundations` e resolveram a maior parte do que a V1/V2 listavam como
critico ou alto.

| Categoria V1/V2 | Status em 2026-06-11 |
|---|---|
| Drift de versao `75.0.0` vs `75.1.0` em docs | Resolvido em PR #550 (`3ddea64 docs: sync v75.1 canonical documentation`) |
| PR #549 do Vercel Bot aberto | Mergeado em PR #551 (`dc7468d Install Vercel Speed Insights`) |
| CI sem Jest/validators | Resolvido em PR #551 (`0f42a62 ci: add essential validation gate`) - novo workflow `.github/workflows/essential-validation.yml` |
| CSP frouxa | Endurecida em PR #552 (`fafc2ea security: harden baseline csp directives`) - inclui `va.vercel-scripts.com` e `vitals.vercel-insights.com` |
| Drift de testes 135/3076 vs 168/3512 (real) | Resolvido em #550; realidade confirmada em 168/3513 |
| Tokens em env vars Windows | Runbook pronto em PR #554 (`93c75d5 docs: add token rotation runbook`) - execucao manual pendente |
| `notify-admin-reports-threshold` nao deployada | Confirmado; estado remoto documentado em `docs/ops/vercel-supabase-invariants.md:73-75` (PR #558) |
| `auth_leaked_password_protection` desabilitado | Confirmado em `docs/qa/reports/report-v75-supabase-auth-password-protection-2026-06-11.md` (PR #555) |
| `extension_in_public` para `unaccent` | Encerrado em 2026-06-12: `unaccent` esta em `extensions`; Advisor sem lint ativo |
| Cache dinamico de sitemap/OG sem probe | Probe empirica em `docs/qa/reports/report-v75-vercel-cache-control-2026-06-11.md` (PR #557) |
| Artefatos gerados no git | Limpos em PR #556 (`e5fdc5d chore: stop tracking generated output artifacts`) |

**Conclusao V3:** a V1 e a V2 estao **substancialmente desatualizadas** mas mantem valor
historico. A fotografia atual e a deste documento, combinado com os reports V75 linkados
abaixo.

---

## 2. Estado operacional verificado (2026-06-11 23:39 UTC)

### 2.1 Git/GitHub

| Item | Valor | Como foi verificado |
|---|---|---|
| Branch local | `kinocampus-V75.0-foundations` (clean) | `git status` |
| HEAD | `4b5f170 docs(ops): record notify-admin-reports-threshold remote state (#558)` | `git log -1` |
| Branches remotas | `origin/kinocampus-V75.0-foundations` + `origin/codex/docs-vercel-cache-evidence-v75-1` (mergeado) | `git branch -a` |
| PRs abertos | 0 | `gh pr list --state open` |
| PRs mergeados (2026-06-08 a 2026-06-11) | #549, #550, #551, #552, #553, #554, #555, #556, #557, #558 | `gh pr list --state merged` |
| Issues abertas | 0 | `gh issue list --state open` |

### 2.2 Repositorio

| Item | Valor | Fonte |
|---|---|---|
| `appVersion` | `75.1.0` | `VERSION.json:3` |
| `frontendRuntimeVersion` | `8.6.1` | `VERSION.json:4` |
| Status | `v75.1 performance phase 1` | `VERSION.json:6` |
| Validators | 5/5 verdes (version, structure, scripts, routes, hygiene) | `npm run check:all` |
| Jest | 168 suites / 3513 testes passed | `npm test` |
| Playwright | 9 specs / 59 testes | `npx playwright test --list` |
| Migrations | 132 arquivos em `supabase/migrations/` | `Get-ChildItem` |
| HTMLs | 27 (21 publicos + 6 admin) | `check:routes` |
| Controllers | 48 (33 public + 15 admin) | `controllers-catalog.md` |

### 2.3 Supabase remoto

Projeto: `Kino Campus` (`project_ref` redigido; West US/Oregon, criado 2025-12-14).

| Edge Function | Versao deployada | Status |
|---|---|---|
| `kc-invite-user` | 6 | ACTIVE (2026-04-06) |
| `kc-dispatch-notification-outbox` | 6 | ACTIVE (2026-04-11) |
| `kc-help-request-notify` | 5 | ACTIVE (2026-05-11) |
| `kc-external-access-decide` | 6 | ACTIVE (2026-05-11) |
| `kc-account-erasure` | 6 | ACTIVE (2026-05-26) |
| `cadu-publish` | 5 | ACTIVE (2026-06-03) |
| `notify-admin-reports-threshold` | - | **NAO DEPLOYADA** |

Auth dashboard: `password_hibp_enabled = false` (confirmado via Management API em
2026-06-11 23:38 UTC).

### 2.4 Vercel

Projeto: `kino-campus` (team `yannakamurabrs-projects`, regiao `gru1`).

| Item | Valor |
|---|---|
| URL de producao | `https://www.kinocampus.com.br` |
| Ultima atualizacao | 45min (no momento da verificacao) |
| Node version | 24.x |
| Cache dinamico (`/sitemap.xml`) | `X-Vercel-Cache: HIT` apos warm-up, `Age: 5-14s` crescente, `s-maxage=900, stale-while-revalidate=3600` sendo consumido pelo CDN mesmo com `Cache-Control: public, max-age=0, must-revalidate` no header visivel ao browser (probe em 2026-06-11 23:39 UTC, reproduzido em 3 chamadas) |

---

## 3. Mapeamento dos achados da V1/V2 para o estado atual

### 3.1 Achados criticos (C) da V1/V2

| # | Achado V1/V2 | Status atual | Evidencia | Severidade residual |
|---|---|---|---|---|
| C1 | Tokens em env vars Windows | **Ativo** - runbook pronto, execucao manual pendente | `[Environment]::GetEnvironmentVariable('GH_TOKEN', 'User')` retorna token real; `docs/ops/v75-token-rotation-runbook.md` | Critico (operacional) |
| C2 | Drift de versao em 8 docs | **Resolvido** | PR #550 (`3ddea64`); `ai-development-guide.md:3` agora `v75.1.0`; `architecture.md:9` agora `v75.1.0` (2026-06-11) | Nenhum |
| C3 | PR #549 aberto | **Resolvido** | Mergeado em `dc7468d`; `package.json:43` tem `@vercel/speed-insights: ^2.0.0`; CSP inclui `va.vercel-scripts.com` | Nenhum |

### 3.2 Achados altos (A) da V1/V2

| # | Achado V1/V2 | Status atual | Evidencia | Severidade residual |
|---|---|---|---|---|
| A1 | `kc-api.client.js` 120KB / 2.846 linhas | **Nao tocado em runtime**; plano V76 criado para decomposicao segura | `docs/planning/v76-hotspot-decomposition-plan.md` | Alto (evolucao) |
| A2 | `styles.css` 287KB | **Nao tocado em runtime**; stubs `future-split/` seguem nao carregados e plano V76 define gates | `docs/planning/v76-hotspot-decomposition-plan.md` | Alto (evolucao) |
| A3 | Migrations > 20KB com seed embutido (17 celulas) | **Nao tocado** - `v8.2.6.0_fix_module_loading.sql` (341 linhas) segue com 44 posts seed | Confirmado por `Get-ChildItem` em migrations | Alto (cosmetic/documental) |
| A4 | CI nao roda validators/Jest | **Resolvido** | `.github/workflows/essential-validation.yml` (PR #551) roda 5 validators + Jest + Playwright list em todo PR | Nenhum |
| A5 | Drift de testes 135 vs 168 | **Resolvido** | README:23, ai-development-guide:52, architecture.md:22 ja dizem 168/3512; filesystem 168/3513; Playwright 9/59 | Nenhum |
| A6 | Cross-region Supabase Oregon x Vercel gru1 | **Aceitavel** | Latencia ~150-200ms documentada em V1; nao justifica migracao | Medio |

### 3.3 Falsos positivos da V1/V2

| # | Achado V1/V2 | Status atual |
|---|---|---|
| V2 §0 | "Bug `controladores/` vs `controllers/` em producao" | **Refutado em V2 §0 V3** - prod serve `assets/js/controllers/...` (EN), identico ao repo |

### 3.4 Pendentes de confirmacao e encerramentos posteriores

| # | Item | O que falta verificar | Como verificar | Risco |
|---|---|---|---|---|
| P1 | `extension_in_public` para `unaccent` | **Encerrado em 2026-06-12**: `unaccent` esta no schema `extensions` | `docs/qa/reports/report-v75-supabase-unaccent-extension-schema-2026-06-12.md` | Sem warning ativo; manter watchlist se Advisor voltar |
| P2 | Cadu publisher rodando em cron real | Host onde roda + logs | Confirmar via logs Supabase ou host externo | Baixo |
| P3 | 248 docs `.md` com `75.0.0` ou `8.6.0` | **Ja verificado nesta V3** - todos sao historicos legitimos (CHANGELOG, archive, planning, reports v71-v75) | `grep -r` em 2026-06-11 23:42 | Nenhum |

---

## 4. Pendencias reais ativas em 2026-06-11

### 4.1 Operacionais (decisao humana)

| Item | Estado | Onde esta documentado | Acao |
|---|---|---|---|
| Tokens em env vars Windows | Pendente | `docs/ops/v75-token-rotation-runbook.md` | Yan executar: revogar nos providers + reemitir + mover para `.env` local com `.gitignore` + limpar env vars User |
| `auth_leaked_password_protection` | Pendente (desabilitado) | `docs/qa/reports/report-v75-supabase-auth-password-protection-2026-06-11.md` + `docs/ops/v19-operational-runbook.md:19-39` | Decidir se ativa; se sim, PATCH em Auth Dashboard + registrar evidencia antes/depois |
| `notify-admin-reports-threshold` deploy | Pendente (nao deployada) | `docs/ops/vercel-supabase-invariants.md:73-75` | Decidir destino do webhook + gerar `KC_NOTIFY_HMAC_SECRET` forte; so entao `supabase functions deploy` + setar 3 `app.settings.kc_notify_*` no banco |

### 4.2 Evolucao tecnica (P3, sem urgencia)

| Item | Razao | Acao |
|---|---|---|
| `kc-api.client.js` 120KB / 2.846 linhas | Ja tem sub-modulos `_KCAPI.*` extraidos; fachada principal segue grande | Usar `docs/planning/v76-hotspot-decomposition-plan.md`; proximo passo recomendado: report de superficie publica `window.KCAPI` |
| `styles.css` 287KB | Stubs em `assets/css/future-split/` estao documentados mas nao carregados | Usar `docs/planning/v76-hotspot-decomposition-plan.md`; split real requer baseline visual + gate V27 + ledger V35 + dossie V45 |
| `unaccent` em `public` schema | **Nao ativo em 2026-06-12**: extensao instalada em `extensions`; wrapper/FTS seguem intocados | Nenhuma migration nesta etapa; manter V28 como referencia se Advisor voltar |
| CHANGELOG encoding V9-V9.3.1 | UTF-8 salvo como latin1 em ~10 entradas historicas | Cosmético, conviver ou corrigir com script de re-encoding |

### 4.3 Sem pendencia (resolvidas em 2026-06-08/11)

- 9 PRs mergeados (ver §1)
- Documentacao sincronizada em v75.1.0
- CI rodando validators + Jest + Playwright list
- Cache dinamico de sitemap/OG documentado e confirmado
- Estado remoto de funcoes nao-deployadas documentado
- Status de `password_hibp_enabled` documentado

---

## 5. Metodologia e limites desta V3

### O que foi possivel verificar

- Codigo-fonte (HTML, JS, TS, SQL) - total
- Estrutura de pastas - total
- Estado git local - total
- Estado GitHub remoto (PRs, commits, branches) - total via `gh api` com `$env:GH_TOKEN`
- Vercel projects - total via `vercel projects ls` com `$env:VERCEL_TOKEN`
- Vercel producao (cache dinamico) - probe real em `https://www.kinocampus.com.br/sitemap.xml`
- Supabase remoto (Edge Functions, Auth config) - total via `supabase functions list` e Management API com `$env:SUPABASE_ACCESS_TOKEN`
- Supabase remoto (`unaccent` extension schema) - total via MCP Supabase read-only em 2026-06-12; `unaccent` esta em `extensions`
- Drift documental - grep global em 248 .md
- Validators + Jest + Playwright list - execucao local

### O que nao foi possivel verificar

- Performance real em prod (LCP, FCP, TBT) - requer browser real
- Console de erros JS em prod - requer browser real
- LHCI run em CI - requer GitHub Actions (ultimo run em 2026-06-12 02:49 UTC, link em PR #558)
- Cadu cron em host externo - sem acesso ao host
- Chat em uso real em prod - requer login autenticado

### Limitacoes metodologicas

- A V3 foi feita **sem rodar `supabase db query`** para manter read-only estrito
- Probes em prod foram 2-3x por endpoint (suficiente para `X-Vercel-Cache`, insuficiente para SLO)
- A documentacao desta V3 reflete o estado em 2026-06-11 23:39 UTC; deployment novo ou merge novo pode invalidar

---

## 6. Referencias canonicas para a proxima sessao

| Documento | Funcao |
|---|---|
| `docs/architecture/ai-development-guide.md` | Guia de comportamento para IA (leia antes de qualquer modificacao) |
| `docs/architecture.md` | Arquitetura atual do frontend |
| `docs/db-schema.md` | Estado do banco, RLS, storage, cron |
| `docs/env-vars.md` | Build-time, runtime, Supabase, observacoes de drift |
| `docs/ops/vercel-supabase-invariants.md` | Invariantes Vercel/Supabase (atualizado em PR #558) |
| `docs/ops/v19-operational-runbook.md` | Runbook operacional com checklist de Advisor, storage, providers |
| `docs/ops/v75-token-rotation-runbook.md` | Runbook de rotacao de tokens locais |
| `docs/qa/reports/README.md` | Indice de reports QA v71-v75 |
| `VERSION.json` | Fonte de verdade de versao |
| `CHANGELOG.md` | Historico consolidado de releases |
| `RELATORIO-KINOCAMPUS-V75.md` | Relatorio historico da v75.0.0 (estado da release, nao atual) |
| `RELATORIO-AUDITORIA-KINOCAMPUS.md` (em `~/.minimax-agent/projects/`) | Auditoria V1 (2026-06-08) - manter como historico |
| `ADENDO-AUDITORIA-APROFUNDADA-V2.md` (em `~/.minimax-agent/projects/`) | Adendo V2 (2026-06-09) - manter como historico |

---

## 7. Recomendacoes para a proxima IA/sessao

1. **Antes de propor correcao**: comparar contra esta V3. Muitos "achados" da V1/V2 ja foram
   fechados em PRs recentes.
2. **Antes de propor deploy de `notify-admin-reports-threshold`**: ler
   `docs/ops/vercel-supabase-invariants.md:73-75` e exigir definicao de webhook destino +
   `KC_NOTIFY_HMAC_SECRET` forte antes de `supabase functions deploy`.
3. **Antes de propor ativacao de `password_hibp_enabled`**: ler
   `docs/ops/v19-operational-runbook.md:19-39` e `docs/qa/reports/report-v75-supabase-auth-password-protection-2026-06-11.md`
   antes de PATCH em Auth Dashboard.
4. **Antes de mexer em tokens**: seguir `docs/ops/v75-token-rotation-runbook.md` integralmente.
   Nunca registrar valores reais em git ou chat.
5. **Antes de propor split de monolito (`kc-api.client.js` ou `styles.css`)**: gates V27 + V35
   + dossiê V45 precisam estar verdes. Sao pre-requisitos, nao opcionais.
6. **Sempre** rodar `npm run check:all` antes de commit. O CI local em
   `.github/workflows/essential-validation.yml` faz o mesmo em todo PR.

---

## 8. Fora de escopo desta V3

- Nenhuma alteracao em `supabase/`, `api/`, `vercel.json` ou configuracoes remotas
- Nenhum deploy, migration ou PATCH em Management API
- Nenhum purge de cache Vercel
- Nenhum token, valor sensivel, `project_ref` bruto ou secret registrado
- Nenhuma alteracao em runtime canonico `8.6.1` ou appVersion `75.1.0`
- Apenas 1 commit: PR #558 (merge em `4b5f170`) - 1 linha adicionada em
  `docs/ops/vercel-supabase-invariants.md` §6
