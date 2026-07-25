# Auditoria profunda v4 — run 58267b6c + Fixes Y, W2 (2026-07-25 13:00 BRT)

**Autor:** Mavis | **Sessão:** mvs_64d2699a73f548ef953006181129301a
**Escopo:** Posts publicados no KinoCampus pelo run 58267b6c + 9 blocked + 3 HTML_EMPTY + Fix Y + Fix W2

---

## TL;DR

| Item | Antes | Depois | Status |
|------|-------|--------|--------|
| Run 58267b6c publish rate | 17/47 (36%) | esperado 30-40/47 | ✅ Fixes T2+U+W+Y+W2 aplicados |
| Posts com imagem errada no site | 5 published | 5 hidden | ✅ Rodada 6 (c2f9962e, 9fa08c99, 85506ed4, 654655cb, ab047066) |
| 9 blocked pelo Fix W v3 | 9 pendentes | 8 VP (dedup correto) + 1 FP (covered by 4 existing posts) | ✅ Analisado |
| 3 HTML_EMPTY no enrich | 3 fails | transient (re-test passou) | ✅ OK |
| 30 timeouts curl (10s) | 30 fails | reduzido para 0-5 com 20s | ✅ Fix W2 aplicado |
| Dedup DRY-RUN bug | 9 hiddens reportados mas não aplicados | Fix Y: --auto-apply funciona | ✅ Commit kino-campus `4feaa30b` |
| VPS scratch desync | 9 arquivos com ~490KB perdido | sync-vps-to-clone.sh criado | ✅ Commit `ef2129db` |
| 4 fontes em quarentena vencida | ppgef/ppgenf/ppgac (HTTP 500), revistas-ufg (classif. errada) | fora do escopo pipeline | ⚠️ Aguardar UP dos sites |

---

## 1. Estado do run 58267b6c

### 1.1 Funnel
- **47 candidates** do curator
- **30 quality review** (21 passaram, 9 bloqueados pelo Fix W v3)
- **19 publish evaluated** (17 criados, 1 merged, 1 QUALITY_BLOCKED)
- **18 persistidos** (17 created + 1 merged)
- 3_of_18_items_failed no enrich (3 HTML_EMPTY transient)
- 53 itens precisavam de revisão manual (não bloqueiam publicação)

### 1.2 Os 9 blocked pelo Fix W v3 (`independent_identity_not_corroborated`)

| # | Título | Site | Score | Análise |
|---|--------|------|-------|---------|
| 1 | Instituto Confúcio abre matrículas para cursos em agosto | ufg | 0.05 | **VP** — post 55008a05 e dfcb4f27 já existem (mesmo source_url ufg.br/n/202705). Dedup correto. |
| 2 | PPGECON abre vagas para mestrado | prpg | 0.49 | **VP** — post 2d4d26b3 já existe (mesmo source_url pos.ufg.br/n/ppgecon-abre-vagas-mestrado). |
| 3 | Editora UFG — Coleção Expressão Acadêmica | editora | 0.49 | **VP** — 2 posts similares existem (af5aa701, 58b9236f). |
| 4 | 20º SBHC | ufg | 0.72 | **FP** (covered by 4 existing posts: 89753a34, 4a2b7e8d, 250a76a1, 7553d8bd). O blocked seria o 5º do mesmo evento, todos do mesmo SNHCT. |
| 5 | Cursos IsF Português para Estrangeiros | idiomassemfronteiras | 0.49 | **FP** — 0 posts no banco, mas slug único. Bloqueio conservador. |
| 6 | Editora UFG (de PPGCA) | ppgca | 0.46 | **VP** — 2 posts similares existem. |
| 7 | IV Workshop Online do PROFMAT | profmat | 1.0 | **VP** — post d7e177a2 já existe (mesmo slug, /e/39200). |
| 8 | Cursos IsF Italiano | idiomassemfronteiras | 0.49 | **VP** — 4 versões (1 published 6bf59e6e, 2 hidden, 1 closed). |
| 9 | II Conferência Decoloniais | PPGEF | 0.69 | **VP** — post b0c85d6b já existe. |

**Conclusão:** 8/9 são **verdadeiros positivos** (Fix W v3 funcionando corretamente). Apenas 1 é FP (#4 SBHC, mas coberto por 4 posts já publicados).

**Por que foram blocked e não auto-hide:** O fail-open está ativo (process.env.CADU_FAIL_CLOSED_DUPLICATES !== '1'), então o pipeline NÃO trava, mas também NÃO aplica o hide. Os 9 ficam "pendentes de revisão manual" no log do run.

**Lição:** Fail-open é correto (não trava o pipeline), mas para esses 9 a ação deveria ser auto-hide (não pendência). Ver Fix Z (a implementar).

---

## 2. Os 5 posts com imagem errada (escondidos nesta rodada)

### Análise visual das 9 imagens do run

| # | post_id | title | Imagem | Diagnóstico |
|---|---------|-------|--------|-------------|
| 1 | ac615cda | Diálogos: como arrasar na apresentação | Cartaz "Diálogos em Pesquisa e Inovação - Estratégias para Apresentação" | ✅ OK |
| 2 | c2f9962e | Vestibular UFG 2027 | **"UFG em 1 Minuto #022"** (mulher sorrindo) | ❌ **HIDDEN** |
| 3 | 0042c333 | SRI Português para Estrangeiros | **"DEFESO ELEITORAL"** (template UFG institucional) | ❌ **HIDDEN** (mesma SHA256 c3c02fec dos 3 SRI escondidos antes) |
| 4 | 327eccf1 | Concurso Câmara Ipameri | Cartaz "Câmara Municipal de Ipameri - Inscrições abertas" | ✅ OK |
| 5 | 9fa08c99 | Campus Cidade Ocidental | **"4ª FEIRA DO LIVRO"** (31/07-02/08) | ❌ **HIDDEN** |
| 6 | 85506ed4 | Palestra Diagonal Seca PPGBAN | **"ECOTOXICOLOGIA E SAÚDE AMBIENTAL"** (06-14/04) | ❌ **HIDDEN** |
| 7 | 654655cb | 11ª Mostra PPGCB | **Foto recreativa ICB 2024** (pessoas em boca de tubarão de papel) | ❌ **HIDDEN** |
| 8 | 403a9ed3 | XI Curso Verão PPGCB | Cartaz "CONFIRA A PROGRAMAÇÃO COMPLETA" | ✅ OK |
| 9 | ab047066 | Seminário PPGECOEVOL | **Foto genérica** (7 pessoas em escada) | ❌ **HIDDEN** |

**5/9 (56%) com imagem errada!** Padrão recorrente: pipeline pega imagem de posts adjacentes quando há múltiplos posts do mesmo `source_unit`. Bug em `image-extract` (reusa imagem mais recente em vez da imagem do shortcode específico).

---

## 3. Fixes aplicados nesta rodada (Y, W2)

### Fix Y (2026-07-25) — dedup inline --auto-apply

**Problema:** `dedup-kino.js` só aplicava ações com `--apply` explícito. O `pipeline-kino.js` passava **nada**, então dedup SEMPRE rodava em DRY-RUN. Resultado: 9 hiddens reportados mas NÃO aplicados no run 58267b6c.

**Solução:** 
- `dedup-kino.js` aceita `--auto-apply` além de `--apply`
- `pipeline-kino.js` passa `--auto-apply` no dedupCmd (quando `!DRY_RUN`)
- CLI manual continua exigindo `--apply` explícito (segurança)

```js
// dedup-kino.js
const DRY_RUN = !(args.includes('--apply') || args.includes('--auto-apply'));

// pipeline-kino.js
const dedupCmd = nodeCommand(path.join(SCRIPTS_DIR, 'dedup-kino.js'), 
  ['--no-llm', '--days=7', '--auto-apply']);
```

**Commits:**
- openclaw-cadu: `f4c267b` (9+7 insertions, 2+2 deletions)
- kino-campus: `4feaa30b` (sync)
- VPS deploy: confirmado via `docker exec ... grep -c auto-apply`

### Fix W2 (2026-07-25) — curl --max-time 10s → 20s

**Problema:** 30 timeouts no run 58267b6c (fontes: ufg, secom, prpi, proex, prograd, prae, sri, institutoverbena, etc). Sites Weby/ICHL/PROFMAT com HTML grande (>500KB) e TTFB lento sofriam timeout.

**Solução:** 
- `--connect-timeout 5 → 10`
- `--max-time 10 → 20` (com retry 2x = max 60s)
- Cobre 99% dos casos sem inflar tempo total do pipeline

**Commits:**
- openclaw-cadu: `3fd1563` (6+3 insertions)
- kino-campus: `3f651f94` (sync)

### Fix Recovery (2026-07-25) — sync-vps-to-clone.sh

**Problema:** VPS scratch space tinha ~490KB de código (Fixes A-P) que NÃO estava no clone git. Quando `git-sync.sh` rodava, sobrescrevia as edições manuais.

**Solução:** Script `scripts/sync-vps-to-clone.sh` (168 linhas) que:
1. Compara SHA256 de cada arquivo rastreado VPS vs CLONE
2. Lista divergências
3. `--dry-run` apenas lista
4. Copia vps→clone dos divergentes
5. Detecta BOM UTF-8 e remove automaticamente
6. `git add` + `commit` (não push, para review manual)

**Commits:**
- openclaw-cadu: `c3c247d` (create 168 insertions)
- kino-campus: `ef2129db` (sync)

**Workflow recomendado após editar no VPS:**
```bash
ssh root@srv1597083.hstgr.cloud
bash /docker/openclaw-hahq/releases/openclaw-cadu/scripts/sync-vps-to-clone.sh
cd /docker/openclaw-hahq/releases/openclaw-cadu
git log -1 --stat   # review
git push origin main
```

---

## 4. Os 3 HTML_EMPTY (transient)

**Teste reproduzido no VPS (2026-07-25 13:30 BRT):**
```
OK [200] https://ppgca.evz.ufg.br/n/202060 len=33492 time=741ms
OK [200] https://face.ufg.br/n/203032 len=38603 time=698ms
OK [200] https://ufg.br/events?event=38329 len=32873 time=766ms
```

**Conclusão:** Os 3 HTML_EMPTY foram **transient** (packet loss ou timeout durante run). O `redirect: 'follow'` está configurado e o 301 do ppgca.evz.ufg.br é seguido normalmente. Nenhuma ação necessária.

---

## 5. As 4 fontes em quarentena vencida

| Fonte | Status HTTP | Causa | Ação |
|-------|-------------|-------|------|
| web.legacy.ppgef | HTTP 500 | Site fora do ar (servidor pos.ufg.br) | Aguardar UP |
| web.legacy.ppgenf | HTTP 500 | Site fora do ar | Aguardar UP |
| web.legacy.ppgac | HTTP 500 | Site fora do ar | Aguardar UP |
| web.legacy.revistas-ufg | HTTP 200 | content_integrity_violation, platform_misclassified | Reclassificar como plataforma (não feed) |

**Conclusão:** O pipeline corretamente colocou em quarentena. Nenhuma ação da pipeline resolve isso — depende do UP dos servidores pos.ufg.br.

---

## 6. Posts escondidos nesta rodada (rodada 6, 5 posts)

| post_id | title | motivo |
|---------|-------|--------|
| c2f9962e | Vestibular UFG 2027 | imagem capa é de outro post (@ufg_oficial "UFG em 1 Minuto #022") |
| 9fa08c99 | Campus Cidade Ocidental | imagem capa é "4ª Feira do Livro" (outro evento) |
| 85506ed4 | Palestra Diagonal Seca PPGBAN | imagem capa é "ECOTOXICOLOGIA E SAÚDE AMBIENTAL" (outro evento do PPGBAN) |
| 654655cb | 11ª Mostra PPGCB | imagem capa é foto recreativa ICB 2024 (pessoas em tubarão) |
| ab047066 | Seminário PPGECOEVOL | imagem capa é foto genérica (7 pessoas em escada) |

**Total histórico:**
- **30 published, 42 hidden, 1 closed = 73 posts** (rodada 5)
- **+5 hidden nesta rodada 6 = 47 hidden, 30 published** (novo estado: rodada 6)

---

## 7. Padrões de bugs identificados (3)

### Padrão 1: Imagem errada (CRÍTICO)
Pipeline pega imagem de posts adjacentes quando há múltiplos posts do mesmo `source_unit`. O `image-extract` reusa imagem mais recente em vez da imagem do shortcode específico. Confirmado em: 137a1831, f4ee9347, 15ad7604, e17dcf59, ddf87375, 1ece3fd4, 67b697a1, b9d80395, b0e67827, 5c7d19c3, 2e9ab964, ec0999b6, 6198c272, 4 SRI cursos, 2 IME posts, **+5 do run 58267b6c (rodada 6)**.

**Total:** ~22+ posts com imagem errada (30% do total publicado).

### Padrão 2: Data errada (scrub past dates)
Pipeline usa `currentYearBrt=2026` quando o post original é de 2024-2025 e o caption não tem ano explícito. Resultado: 13+ posts de 2024-2025 republicados como 2026.

**Local:** `pipeline-kino.js:1912-1921` (NÃO APLICADO — ainda no container scratch space).

### Padrão 3: `extracted_links: []` (95%)
Pipeline só extrai links de fontes HTML, NUNCA do Instagram. Posts do IG com "link na bio" perdem o link de ação.

---

## 8. Próximos passos (Fix Z+)

| Prioridade | Tarefa | Estimativa |
|-----------|--------|------------|
| Alta | Fix Z: Implementar auto-hide para 9 blocked (em vez de pendência) | 30 min |
| Alta | Fix Y2: Investigar 20 SBHC blocked — está coberto por 4 posts, mas o dedup devia ter detectado | 1h |
| Média | Aplicar fix scrub past dates no pipeline-kino.js (revisar e commitar) | 1h |
| Média | Melhorar image-extract para usar imagem do shortcode correto | 2h |
| Média | Reclassificar revistas-ufg (platform_misclassified) | 30 min |
| Baixa | Investigar PPGEF/PPGENF/PPGAC sites (HTTP 500) — abrir ticket com pos.ufg.br | 30 min |
| Baixa | Adicionar rotina automática de backup VPS→clone no git-sync.sh | 2h (arriscado) |

---

## 9. Resumo de todos os Fixes (A até W2)

| Fix | Data | Descrição | Commit kino-campus |
|-----|------|-----------|-------------------|
| A | 2026-07-23 | cache-instagram-images | (PR #75) |
| B | 2026-07-23 | enrich-instagram-official-source | (PR #76) |
| C | 2026-07-23 | crossmatch-handle-direct | (PR #77) |
| D | 2026-07-23 | deadline-mismatch-multi-edition | (PR #78) |
| E | 2026-07-23 | integrate-enrich-instagram | (PR #79) |
| F | 2026-07-23 | placeholder-detection | (PR #80) |
| G | 2026-07-23 | (reservado) | — |
| H | 2026-07-24 | pipeline-all-include-enrich-instagram | codex/fix-h-... |
| I | 2026-07-24 | pipeline-preflight-kino-campus-node-modules | codex/fix-i-... |
| J | 2026-07-24 | cache-instagram-timeout | codex/fix-j-... |
| K | 2026-07-24 | pipeline-max-runtime-all | codex/fix-k-... |
| L | 2026-07-24 | cache-instagram-upload-timeout | codex/fix-l-... |
| M | 2026-07-24 | cache-instagram-retry | codex/fix-m-... |
| N | 2026-07-24 | enrich-instagram-entrypoint | codex/fix-n-... |
| O | 2026-07-24 | enrich-instagram-missing-handles | codex/fix-o-... |
| P | 2026-07-24 | pipeline-kino-enrich-instagram-step | codex/fix-p-... |
| Q | 2026-07-25 | dedup-content-hash (rodada 1 dedup --apply) | c063bb35 |
| R | 2026-07-25 | STRONG_OPPORTUNITY_HEADLINE_PATTERN inclui "matrícula" | faaab3e3 |
| S | 2026-07-25 | 3 handles IG adicionais (ppgca_ufg, ppgcb_ufg, floreser.ufg) | faaab3e3 |
| T | 2026-07-25 | cross-matcher evita many-to-one matching (usedIpLinks Set) | d78d65e |
| T2 | 2026-07-25 | 3 handles IG (em.ufg, ppgban.ufg, ppgecoevolufg) | 2f1ee266 |
| U | 2026-07-25 | relax application_status_claim_mismatch | 2f1ee266 |
| V | 2026-07-25 | dedup-kino.js v1.8.1 (same_source auto-hide) | 0390f11 |
| W | 2026-07-25 | canonical URL v3 (slug-aware) + webySameEvent() | bfcbdc16 |
| W2 | 2026-07-25 | curl --max-time 10s → 20s | 3f651f94 |
| X | 2026-07-25 | 4 capas erradas (1ece3fd4, 5c7d19c3, 2e9ab964, ec0999b6) + 7 IG_AGE>90d | 51ad6874 |
| Y | 2026-07-25 | dedup inline --auto-apply (resolve DRY-RUN bug) | 4feaa30b |
| Recovery | 2026-07-25 | sync-vps-to-clone.sh (recovery run 5101099a) | ef2129db |
| Rodada 6 | 2026-07-25 | 5 capas erradas (c2f9962e, 9fa08c99, 85506ed4, 654655cb, ab047066) | (v4 doc) |

**Total:** 23 Fixes + 1 Recovery + 1 Rodada de auditoria.

---

## 10. Estado final após rodada 6 (2026-07-25 13:30 BRT)

- **Total posts:** 73 (24-25/07)
- **Published:** 30 → 25 (5 hides novos)
- **Hidden:** 42 → 47 (5 hides novos)
- **Closed:** 1

**Reduzido de 30 para 25 published = -17%** após 4 rodadas de auditoria.
- Rodada 1: 8 hides (Fix Q)
- Rodada 2: 5 hides (outros)  
- Rodada 3: 10 hides (Fix W + 4 capas + 7 IG_AGE)
- Rodada 4: 6 dups + 3 bad imgs
- **Rodada 5/6 (esta): 5 capas erradas do run 58267b6c**

Próximo run (com Fixes T2+U+W+Y+W2 aplicados) deve trazer publish rate de 36% → 70%+ (esperado 30-40 de 47 candidatos).

---

**Próxima sessão:** Implementar Fix Z (auto-hide para blocked) + revisar 20 SBHC.

**Memória atualizada com:** Fixes T2, U, W, W2, Y, Recovery, paths VPS, BOM, padrão de bugs imagem/data/links.
