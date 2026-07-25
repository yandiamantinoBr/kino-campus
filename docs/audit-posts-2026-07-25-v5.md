# Auditoria profunda v5 — run e57ac3fe + Fixes T3, Z (2026-07-25 18:55 BRT)

**Autor:** Mavis | **Sessão:** mvs_64d2699a73f548ef953006181129301a
**Escopo:** Run e57ac3fe (sucesso com Fixes T2+U+W+Y+W2 aplicados) + 1 QUALITY_BLOCKED + Fix T3 + Fix Z

---

## TL;DR

| Item | Antes | Depois | Status |
|------|-------|--------|--------|
| Run e57ac3fe publish rate | 12/13 (92%) | success sem erros | ✅ Fixes T2+U+W+Y+W2 funcionaram |
| Dedup inline auto-aplicado | 6 hides + 1 flag | aplicado automaticamente | ✅ Fix Y funcionando |
| 4 posts com imagem errada (e57ac3fe) | 4 published | 4 hidden | ✅ Rodada 7 |
| 1 QUALITY_BLOCKED (PPGEO) | pendente | Fix T3 adicionado | ✅ Próximo run publica |
| 9 blocked pelo Fix W v3 | pendência sem ação | Fix Z: flag + skip_publish | ✅ Próximo run resolve |
| Run 58267b6c vs e57ac3fe | 17/47 (36%) | 12/13 (92%) | ✅ Melhoria de 56pp |

---

## 1. Run e57ac3fe — sucesso do Fix Y

### 1.1 Funnel
- **28 trulyNew** (vs 39 do run 58267b6c - redução por causa do dedup que pegou 5 dups antes)
- **16 qualityReview** (vs 30)
- **13 publishEvaluated** (vs 19)
- **8 created + 4 merged = 12 persistidos** (vs 17+1=18, -33% mas só publicaram 12, não 18)
- **0 errors** (vs 1 error) ✅

### 1.2 Dedup inline (Fix Y funcionando)
```
[2175.4s] 🔁 Dedup inline pós-publish (--no-llm --days=7 --auto-apply) — fecha janela de duplicação visível
[2175.4s] ⏳ Dedup inline
   🔴 flag_review: FUNAPE: Processo Seletivo Nº 41/2026 (jaccard 37%) — provável compilação vs item específico; revisão manual
     Hide (auto): 6
     Flag (revisão): 1
[2223.1s] ✅ Dedup inline — OK
```

**ESTATÍSTICAS:**
- Posts analisados: 97
- Duplicatas exatas (URL): 1
- Candidatos textuais: 24
- Pares com imagem similar: 5
- Logos inadequadas: 0
- Pares enviados ao IA: 0 (cache + fix anteriores resolveram tudo)
- **Ações PLANEJADAS:** 6 hides + 1 flag

**6 hides aplicados automaticamente** (todos os 6 itens blocked pelo safety gate):
1. Curso de Verão PPGCB (4551cd35) - duplicate do 403a9ed3
2. Vestibular UFG 2027 (06f48a4a) - duplicate do 5f5991c4
3. FAQ Vestibular UFG 2027 (a4370421) - duplicate
4. Concurso Câmara Ipameri - duplicate
5. Matrículas Centro de Línguas - duplicate
6. Curso online PAD - duplicate

**1 flag para revisão manual:**
- FUNAPE Processo Seletivo Nº 41/2026 (jaccard 37% entre 41 e 38)

**Comparação run 58267b6c vs e57ac3fe:**
| Métrica | 58267b6c | e57ac3fe | Δ |
|---------|----------|----------|---|
| candidates | 39 | 28 | -28% (dedup pegou antes) |
| created | 17 | 8 | -53% (mas 5 dups do curator viraram merged) |
| merged | 1 | 4 | +300% (dedup-kino inline mesclou) |
| total persistidos | 18 | 12 | -33% |
| errors | 1 | 0 | ✅ -100% |
| status | partial | success | ✅ |
| dedup actions | 9 (n/a por DRY-RUN) | 6 + 1 (auto-applied) | ✅ |

---

## 2. 4 posts com imagem errada do run e57ac3fe (escondidos)

### Análise visual dos 5 publicados (1 já era hidden antes)

| # | post_id | title | Imagem | Diagnóstico |
|---|---------|-------|--------|-------------|
| 1 | baa51e5e | XXXI Maratona Programação | **"NOTÍCIA" genérica** (logos INF/UFG) | ❌ **HIDDEN** |
| 2 | 5f5991c4 | Vestibular UFG 2027 (IG) | "UFG em 1 Minuto #022" (mulher sorrindo) | ❌ **HIDDEN** (MESMO bug do c2f9962e) |
| 3 | e048b4af | Aluno Especial PPGNUT 2026.2 | "SET AND FORGET" (evento passado do petNUT) | ❌ **HIDDEN** |
| 4 | d541d355 | Mestrado Filosofia 2026.2 | **"20° SNHCT"** (outro evento) | ❌ **HIDDEN** |
| 5 | a0e39686 | PPGBAN mestrado doutorado | Cartaz correto "Venha estudar na UFG!" | ✅ OK |

**4/5 (80%) com imagem errada!** Padrão recorrente gravíssimo.

**Achado adicional:** 5f5991c4 e c2f9962e têm o **MESMO SHA256 de imagem** (dfc27ccfe5492c21) mas source_url diferente (Da24i_gRJfd vs DaS2owjxuK5). O dedup NÃO detectou porque a URL canônica é diferente, mas a imagem é a mesma. Bug do `image-extract` reusando imagem do source_unit.

---

## 3. Fix T3 — 1 handle IG (ppgeo.ufg)

**Problema:** Run e57ac3fe teve 1 QUALITY_BLOCKED:
- IV Simpósio Integrado de Estudos Territoriais (PPGEO/LABOTER)
- Handle `@ppgeo.ufg` não estava no `INSTAGRAM_ONLY_HANDLES`
- Erro: `instagram_without_official_source`

**URL verificada via curl (2026-07-25 18:55):**
```
https://ppgeo.iesa.ufg.br: HTTP 200 size=41728 ct=text/html; charset=utf-8
```

**Fix:** Adicionar `ppgeo.ufg: 'https://ppgeo.iesa.ufg.br'` em `enrich-instagram-with-official-source.js`.

**Commits:**
- openclaw-cadu: `ef5633a` (4 insertions)
- kino-campus: `e3d09941` (sync)

**Próximo run:** Post do PPGEO deve ser publicado.

---

## 4. Fix Z — flag + skip_publish para blocked

**Problema:** 9 blocked do run 58267b6c ficaram "pendentes de revisão manual" sem ação concreta. O post existente não era flagado, o item blocked ficava no limbo.

**Solução:** Em `enrich-duplicates.js`, quando `corroborateMutationIdentity` retorna `ok: false`:
1. Atualizar `metadata.flags` do post existente com `{type: 'duplicate_blocked', reason, blockedItemTitle, blockedItemUrl, blockedItemSite, flaggedAt}`
2. Retornar `action: 'skip_publish'` no report
3. Autor revisa via Supabase Dashboard

**Antes:**
```js
if (!identity.ok) {
  console.log(`   🛑 Candidato bloqueado: identidade não corroborada (${identity.reason})`);
  return { blocked: true, reason: 'IDENTITY_NOT_CORROBORATED' };
}
```

**Depois:**
```js
if (!identity.ok) {
  console.log(`   🛑 Candidato bloqueado: identidade não corroborada (${identity.reason})`);
  if (!dryRun) {
    // Flag post existente + skip_publish do item
    const newFlags = [
      ...(currentMeta.flags || []),
      { type: 'duplicate_blocked', reason: identity.reason, ... }
    ];
    await supabase.from('posts').update({ metadata: { ...currentMeta, flags: newFlags } }).eq('id', existingPost.id);
  }
  return { blocked: true, action: 'skip_publish', reason: 'IDENTITY_NOT_CORROBORATED' };
}
```

**Commits:**
- openclaw-cadu: `4a77f4a` (36 insertions)
- kino-campus: `579c8be9` (1104 insertions - novo arquivo no kino-campus)

**Próximo run:** 9 blocked anteriores devem virar 9 posts existentes com `flags.duplicate_blocked` em metadata.

---

## 5. Estado final após rodada 7 (2026-07-25 18:55 BRT)

- **Total posts:** 700 (todos os tempos)
- **Published:** 173 → 169 (-4 hides do run e57ac3fe)
- **Hidden:** 256 → 260 (+4 hides)
- **Closed:** 257
- **Deleted:** 14

---

## 6. Resumo de todos os Fixes (A até Z)

| Fix | Data | Descrição | Commit kino-campus |
|-----|------|-----------|-------------------|
| A-P | 2026-07-23/24 | 16 fixes via PR/codex (cache, enrich-instagram, pipeline-all, etc) | various |
| Q | 2026-07-25 | dedup-content-hash (rodada 1 dedup --apply) | c063bb35 |
| R | 2026-07-25 | STRONG_OPPORTUNITY_HEADLINE_PATTERN inclui "matrícula" | faaab3e3 |
| S | 2026-07-25 | 3 handles IG adicionais (ppgca_ufg, ppgcb_ufg, floreser.ufg) | faaab3e3 |
| T | 2026-07-25 | cross-matcher evita many-to-one matching (usedIpLinks Set) | d78d65e |
| T2 | 2026-07-25 | 3 handles IG (em.ufg, ppgban.ufg, ppgecoevolufg) | 2f1ee266 |
| T3 | 2026-07-25 | 1 handle IG (ppgeo.ufg → ppgeo.iesa.ufg.br) | e3d09941 |
| U | 2026-07-25 | relax application_status_claim_mismatch | 2f1ee266 |
| V | 2026-07-25 | dedup-kino.js v1.8.1 (same_source auto-hide) | 0390f11 |
| W | 2026-07-25 | canonical URL v3 (slug-aware) + webySameEvent() | bfcbdc16 |
| W2 | 2026-07-25 | curl --max-time 10s → 20s | 3f651f94 |
| X | 2026-07-25 | 4 capas erradas (1ece3fd4, 5c7d19c3, 2e9ab964, ec0999b6) + 7 IG_AGE>90d | 51ad6874 |
| Y | 2026-07-25 | dedup inline --auto-apply (resolve DRY-RUN bug) | 4feaa30b |
| Z | 2026-07-25 | flag post existente + skip_publish para blocked | 579c8be9 |
| Recovery | 2026-07-25 | sync-vps-to-clone.sh (recovery run 5101099a) | ef2129db |

**Total:** 25 Fixes (A até Z) + 1 Recovery.

---

## 7. Bugs estruturais conhecidos (não fixados ainda)

### Bug 1: image-extract reusa imagem de posts adjacentes
- Pipeline pega imagem de posts adjacentes quando há múltiplos posts do mesmo `source_unit`
- 30+ posts afetados (incluindo 4 do run e57ac3fe)
- **Não tem fix trivial** - requer refator do `image-extract` para usar shortcode específico
- **Workaround:** auditoria visual manual + hide (Yan)

### Bug 2: scrub past dates (pipeline-kino.js:1912-1921)
- Pipeline usa `currentYearBrt=2026` quando post original é de 2024-2025 sem ano explícito
- 13+ posts de 2024-2025 republicados como 2026
- **Fix proposto no scratch space** mas não comitado (arriscado, requer testes)

### Bug 3: extracted_links vazio para posts do IG
- Pipeline só extrai links de fontes HTML, NUNCA do Instagram
- 95% dos posts IG perdem "link na bio"

### Bug 4: 4 fontes em quarentena vencida
- ppgef/ppgenf/ppgac: HTTP 500 (pos.ufg.br down) - fora do escopo pipeline
- revistas-ufg: classificada errada (platform_misclassified) - Fix futuro

---

## 8. Próximas tarefas

| Prioridade | Tarefa | Estimativa |
|-----------|--------|------------|
| Alta | Re-rodar pipeline e verificar Fixes Y+Z+T3+W2 | 30 min (automático) |
| Alta | Auditar próximos runs | ongoing |
| Média | Reclassificar revistas-ufg (platform_misclassified) | 30 min |
| Média | Verificar SBHC blocked (FP coberto por 4 posts) | 15 min |
| Média | Aplicar fix scrub past dates (depois de testar) | 1h |
| Baixa | Refator image-extract (curto prazo: usar hash de shortcode) | 4h |

---

**Próxima run deve:**
- Publicar 13+ posts do run e57ac3fe sem erros
- Aplicar dedup inline automaticamente (Fix Y)
- Flagar posts existentes quando blocked (Fix Z)
- Publicar PPGEO (Fix T3)
- 0 QUALITY_BLOCKED esperados

**Memória atualizada com:** Fixes T3, Z, run e57ac3fe, padrão de bugs imagem/data/links.
