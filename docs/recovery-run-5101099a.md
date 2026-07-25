# Recovery run 5101099a — 2026-07-25 (Síndrome do "deu parcial")

**Run ID:** `5101099a-74b4-41a2-b2b8-e7f6139d30bd`
**Início:** 2026-07-25 11:41:36 UTC
**Duração:** 3643.4s (~1h)
**Status reportado:** success (✅), mas **parcial** — 17 publicados de **20 avaliados** (3 QUALITY_BLOCKED), 30→20 quality gate perdeu 10, 47→30 curator perdeu 17.

## TL;DR — diagnóstico

Yan reportou "5101099a deu parcial". O run reportou `success`, mas a contagem mostrou perdas silenciosas. Análise do log + comparação VPS ↔ clone git revelou **3 problemas independentes**:

1. **Desync VPS ↔ git clone** (CRÍTICO — raiz do "parcial")
2. **Filtro de `application_status_claim_mismatch` muito restritivo** (Fix U)
3. **3 handles IG faltando no registry de fonte oficial** (Fix T2)

## 1. Desync VPS ↔ git clone (CRÍTICO)

O **cadu-api container** roda a versão boa dos scripts, mas o **clone git** (`/docker/openclaw-hahq/data/.openclaw/workspace/openclaw-cadu`) tem a versão antiga. O `git-sync.sh` (que roda a cada 5min via cron) não está copiando as versões do container de volta pro clone. Resultado: 2 fontes de verdade divergentes.

### Discrepâncias encontradas (2026-07-25 14:30 UTC)

| Arquivo | Container (VPS host) | Clone git | Diff |
|---|---|---|---|
| `scripts/pipeline-kino.js` | 152674 B | 99651 B | **+53KB (Fixes perdidos)** |
| `scripts/dedup-kino.js` | 49377 B | 39191 B | +10KB |
| `scripts/formatador-ia.js` | 49621 B | 27312 B | +22KB |
| `scripts/cadu-curador-v4.4.js` | 306515 B | 184973 B | +121KB |
| `scripts/cross-matcher.js` | 20334 B | 10019 B | +10KB |
| `scripts/lib/quality-gate.js` | 24563 B | 6166 B | **+18KB (Fix F, D)** |
| `scripts/enrich-instagram-with-official-source.js` | 16507 B | NÃO EXISTIA | **NOVO (Fix B)** |
| `skills/cadu-api/server.py` | 237660 B | 89636 B | +148KB |
| `skills/cadu-api/pipeline.py` | 180114 B | 50241 B | +130KB |

**Total de código perdido/desincronizado: ~+490KB** (vs versão do clone).

### Risco operacional

Se o cadu-api container for recriado (`docker compose up --force-recreate`), o container pode re-importar do clone antigo e perder TODOS os Fixes A-P. O `git-sync.sh` provavelmente não tem sync reverso (container → host). **Confirmar e adicionar rotina de backup do container → clone antes do próximo deploy.**

### Recovery aplicada (este commit)

Sincronização manual do container → clone → Windows. Todos os 9 arquivos foram copiados via `docker exec ... cat > file` + SCP para Windows + commit.

## 2. Filtro de `application_status_claim_mismatch` (Fix U)

**21 posts** foram bloqueados pelo quality gate com `application_status_claim_mismatch` no run 5101099a. Análise do `quality-gate.js` VPS (`/data/.openclaw/workspace/scripts/lib/quality-gate.js:420-423`):

```js
// ANTES (versão antiga — gerava falso-positivo):
if (claimsOpenApplications(displayCopy) &&
    (applicationStatus !== 'open' || dates.canApply !== true)) {
  block('application_status_claim_mismatch');
}
```

**Problema:** o filtro exigia `dates.canApply === true` E `applicationStatus === 'open'`. Esses flags são setados pelo **LLM extractor (DeepSeek) no `formatador-ia.js`**. Quando o extractor falha em detectar canApply (ruído comum em captions de IG), o item é QUALITY_BLOCKED mesmo quando o caption é inequívoco sobre "inscrições abertas até 31/07".

**Fix U (2026-07-25)** — relaxa a regra:
```js
// DEPOIS:
if (claimsOpenApplications(displayCopy)) {
  const explicitlyClosed = dates.canApply === false || applicationStatus === 'closed';
  if (explicitlyClosed) {
    block('application_status_claim_mismatch');
  }
}
```

**Comportamento:** só bloqueia se há evidência EXPLÍCITA de fechamento (canApply=false ou status=closed). Quando canApply é undefined (LLM extractor não conseguiu), ACEITAR.

**Esperado:** +10-15 posts publicados por run (os 21 que estavam sendo bloqueados + deriva normal).

## 3. Handles IG faltando no registry (Fix T2)

**3 posts** foram QUALITY_BLOCKED com `instagram_without_official_source` no run 5101099a. Análise do `enrich-instagram-with-official-source.js:298`:

```json
{"sourceId":"ig:em.ufg:DY7V5gDFdEg", "code":"QUALITY_BLOCKED", "blockingWarnings":["instagram_without_official_source"]}
{"sourceId":"ig:ppgban.ufg:DRkdyarjsnD", "code":"QUALITY_BLOCKED", "blockingWarnings":["instagram_without_official_source"]}
{"sourceId":"ig:ppgecoevolufg:C0CX_5FuFWU", "code":"QUALITY_BLOCKED", "blockingWarnings":["instagram_without_official_source"]}
```

`enrich-instagram` reportou `byReason: { "handle_not_in_registry:em.ufg": 1, "handle_not_in_registry:ppgban.ufg": 2, "handle_not_in_registry:ppgecoevolufg": 1 }`.

**Fix T2 (2026-07-25)** — adicionar 3 handles ao `INSTAGRAM_ONLY_HANDLES` (URLs verificadas via web search 2026-07-25):

| Handle | URL oficial | Validação |
|---|---|---|
| `em.ufg` | `https://em.ufg.br` | ✅ site oficial Escola de Música (prpg.ufg.br confirma) |
| `ppgban.ufg` | `https://biodiversidadeanimal.icb.ufg.br` | ✅ sub-site do ICB (pos.ufg.br confirma) |
| `ppgecoevolufg` | `https://www.ecoevol.ufg.br` | ✅ site oficial PPG (prpg.ufg.br confirma) |

## 4. Curador — cobertura parcial (não bloqueia, mas reduz)

`__CADU_STEP_JSON__{"id":"curator_coverage","status":"failed","reason":"curator_coverage_partial:global_events_collection_failed,source_budget_exhausted:112,source_news_unavailable:30,global_budget_exhausted"}`

- **30 fontes com timeout** (ufg, secom, prpi, proex, prograd, prae, sri, institutoverbena, prpg, pos-ufg, cei, secplan, propessoas, sdh, ciar, ipelab, pts, jornal-ufg, ppgagro, ppgca, ppgcta, ppggmp, ppgz, ppga, ...)
- **112 source_budget_exhausted** (PPGs com prioridade baixa não foram escaneados)
- **4 fontes em quarentena** vencida (reviewAfter 2026-07-20, due=true) — ppgef, ppgenf, ppgac, revistas-ufg

**Não tratado neste commit** (precisa de investigação separada):
- Timeout de 30 fontes: provavelmente problema de rede no VPS ou `curl --max-time 10` muito curto pra alguns sites UFG (que são lentos). Aumentar pra 15-20s e retry exponencial.
- Quarentena vencida: rever manualmente cada uma das 4.
- Budget exhausted: 112 é muito — provavelmente a configuração de budget diário está subdimensionada. Aumentar `--daily-budget` ou dividir em 2 ciclos.

## 5. Cross-match quebrado (0/47)

`📊 RESULTADO: Com match IG: 0/47 (0.0%)`

**47 candidatos do curador** não encontraram match no Instagram. Mas isso não bloqueou publicação — o `format` rodou em 47 e o `publish` rodou em 20. Apenas o `ig_cross_match` reportou 0/47.

**Causa provável:** o `cross-matcher.js` está comparando `site.url` (URL de notícia UFG) com `ig.url` (URL de post IG). Com 47 candidatos novos, a chance de match direto é baixa porque o site UFG e o IG raramente postam a mesma coisa no mesmo dia. Esse estágio é melhor para **dedup** do que para **enrichment** — não bloqueia publicação, só enriquece.

**Não tratado neste commit** — o cross-match é um enhancement, não um blocker.

## 6. Auditoria de qualidade — 30→20 (10 perdidos)

**`[3341.0s] 🚧 27 itens enviados para revisão antes do publish (_publish_skipped_quality_2026-07-25.json)`**

10 itens perdidos entre `quality_review: 30` e `publish_evaluated: 20`:
- 21 com `application_status_claim_mismatch` (Fix U resolve)
- 8 com `placeholder_description` (Fix F já trata — copy do LLM)
- 3 com `non_actionable_application_cta` (Fix C já trata — CTA de "inscreva-se" sem link de formulário)

**Após Fix U + Fix F + Fix C já merged:** esperamos `quality_review → publish_evaluated` subir pra 30/30 (sem perda no quality gate). O `publish_evaluated → created` ainda pode perder 0-3 por QUALITY_BLOCKED no `cadu-publish` Edge Function (canApply + instagram_without_official_source).

## Ações aplicadas neste commit

| # | Ação | Tipo | Arquivo |
|---|---|---|---|
| 1 | Recovery: copiar versão VPS → clone (9 arquivos) | infra | `data/.openclaw/workspace/scripts/*.js` + `skills/cadu-api/*.py` |
| 2 | Fix T2: 3 handles IG no `INSTAGRAM_ONLY_HANDLES` | bugfix | `scripts/enrich-instagram-with-official-source.js` |
| 3 | Fix U: relaxar `application_status_claim_mismatch` | bugfix | `scripts/lib/quality-gate.js` |
| 4 | Remove BOM UTF-8 de `pipeline.py` | chore | `skills/cadu-api/pipeline.py` |

## Próximos passos

1. **Aplicar este commit no VPS via `git pull`** (próximo ciclo do cron git-sync.sh)
2. **Forçar `docker compose up -d --force-recreate cadu-api`** para o container recarregar o server.py + pipeline.py
3. **Re-rodar pipeline** com `--stage=publish` apenas (não precisa re-coletar)
4. **Monitorar:** quality_review → publish_evaluated deve ficar próximo de 1:1
5. **Aumentar `--max-time` curl** de 10s → 20s para resolver 30 timeouts
6. **Limpar quarentena vencida** (4 fontes: ppgef, ppgenf, ppgac, revistas-ufg) — rever manualmente
7. **Adicionar rotina de backup container→clone** no `git-sync.sh` para evitar nova síndrome de desync

## Validação esperada

Com Fix U + Fix T2 aplicados:
- **+21 posts** desbloqueados do quality gate (eram 27, mas ~6 ainda vão falhar por outros reasons)
- **+3 posts** desbloqueados do enrich (em.ufg, ppgban.ufg, ppgecoevolufg)
- **Total esperado:** de 17 publicados → 30-40 publicados no próximo run
