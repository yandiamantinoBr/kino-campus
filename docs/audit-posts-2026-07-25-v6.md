# Auditoria profunda v6 — 3 Rodadas analíticas (2026-07-25 23:09 BRT)

**Autor:** Mavis | **Sessão:** mvs_64d2699a73f548ef953006181129301a
**Escopo:** 3 rodadas analíticas detalhadas: dados passados + duplicatas + refatorações estruturais

---

## TL;DR

| Item | Antes | Depois | Status |
|------|-------|--------|--------|
| Posts com data_evento/deadline passada (published) | 14 | 0 (escondidos) | ✅ Rodada 1 |
| Duplicatas remanescentes (mesmo evento) | 2 grupos | 0 (escondidos) | ✅ Rodada 1 |
| Post reativado por dedup merge (d163e99c) | published | hidden | ✅ Rodada 1 |
| **Auto-hide para posts com data passada** | só `eventos` | `eventos + oportunidades` | ✅ **Fix S3** |
| **Guard contra reativação indevida** (audit-*) | não tinha | adicionado | ✅ **Fix S4** |
| Total Fixes | 26 | **28** (+S3, +S4) | ✅ |

---

## Rodada 1: Dados passadas + duplicatas remanescentes

### Posts com data_evento/deadline passada (escondidos 14)

| post_id | data_evento | deadline | motivo |
|---------|-------------|----------|--------|
| a8a3f0e5 | 2026-05-31 (55d atrás) | - | VI Seminário EaD IF Goiano |
| 07fe003d | 2026-06-26 (29d) | 2026-06-26 (29d) | Submissões PIP/UFG |
| b72f0f4c | 2026-07-20 (5d) | - | Fastcamp Dados IA |
| fdd48cde | 2026-07-22 (3d) | - | Oficina fundos europeus |
| e28d4c4c | 2026-07-24 (1d) | 2026-07-24 (1d) | CASLE exames suficiência |
| 89975db6 | 2026-07-24 (1d) | 2026-07-24 (1d) | PPGENFS aluno especial |
| 3d42fd3b | 2026-07-24 (1d) | 2026-07-24 (1d) | PPGCA aluno especial |
| a7f9b307 | 2026-07-24 (1d) | 2026-07-24 (1d) | PPGLL mestrado/doutorado |
| 89753a34 | 2026-07-24 (1d) | 2026-07-24 (1d) | 20º SNHCT |
| edaadaa3 | - | 2026-07-13 (12d) | II Jornada Música |
| 44d898b1 | - | 2026-07-17 (8d) | PPGP Aluno Especial |
| 19a3f0d1 | - | 2026-07-20 (5d) | CICSIC 2026 |
| 27f73c4e | - | 2026-07-22 (3d) | FUNAPE 01/2026 |
| 6bf59e6e | - | 2026-07-23 (2d) | Cursos IsF Italiano |

### Duplicatas remanescentes (escondidos 2)

**Grupo 1: Concurso São Miguel do Araguaia**
- 2569361d (19/07, site oficial institutoverbena.ufg.br) - **MANTIDO** (mais antigo)
- 5a98dacf (24/07, IG) - **HIDDEN** (duplicata)

**Grupo 2: PPGS vs PPGAC** (FALSO POSITIVO)
- 3a52017a PPGS - pos-sociologia.fcs.ufg.br (sociologia)
- 928a9c20 PPGAC - artesdacenappg.iac.ufg.br (artes cênicas)
- **NÃO é duplicata** (PPGs diferentes). Mantidos.

### Post reativado por dedup merge (d163e99c)
- Era **hidden** com `moderation_reason='audit-2026-07-25-run-58267b6c: ...imagem capa placeholder EDITAL...'`
- Run e57ac3fe reativou para `published` (mergeIntoExisting) - **BUG**
- **HIDDEN novamente** (roda 1)

---

## Rodada 2: Fix S3 - auto-hide para posts antigos

**Problema:** `closePastEvents()` em `dedup-kino.js` SÓ processava `module='eventos'`. Posts de `oportunidades` com `deadline_date` passada permaneciam published por SEMANAS.

**Solução:** Expandir query para incluir oportunidades, e adicionar `deadline_date` ao filtro de datas passadas.

**Antes:**
```js
// PATCH em posts com module='eventos'
// Filtro: data_evento, data_fim_evento
```

**Depois:**
```js
// PATCH em posts com module='eventos' OU 'oportunidades'
// Filtro: data_evento, data_fim_evento, E deadline_date (dd/mm/yyyy → ISO)
// Posts reativados <48h: skip (preserva guard)
```

**Commits:**
- openclaw-cadu: `1f0e9cc` (20 ins, 4 del)
- kino-campus: `aad21472` (sync)

**Resultado esperado:** Próxima execução de `dedup-kino` auto-esconde 14+ posts antigos.

---

## Rodada 3: Fix S4 - guard contra reativação indevida

**Problema:** `mergeIntoExisting()` em `publish_auto_v5.js` reativava QUALQUER post `hidden` quando havia item novo, sem checar `moderation_reason`. Posts escondidos manualmente pela auditoria (com motivo) voltavam a `published`.

**Exemplo do bug:**
- d163e99c (PPGCA) foi escondido com `moderation_reason='audit-2026-07-25-run-58267b6c: imagem capa é placeholder EDITAL...'`
- Run e57ac3fe reativou para `published` (merge) - **BUG**
- Loop: post fica published com imagem errada

**Solução:** Adicionar guard - se `moderation_reason.startsWith('audit-')`, NÃO reativar.

**Antes:**
```js
if (reactivateIfHidden && existing.status === 'hidden') {
  patch.status = 'published';
}
```

**Depois:**
```js
const isAuditHide = (existing.moderation_reason || '').startsWith('audit-');
if (isAuditHide) console.log('   ⚠️ [S4] skip reativação: moderation_reason=audit-*');
if (reactivateIfHidden && existing.status === 'hidden' && !isAuditHide) {
  patch.status = 'published';
}
// closed posts ainda são reativados (não tem audit-hide)
```

**Commits:**
- openclaw-cadu: `a5d1baf` (18 ins, 3 del)
- kino-campus: `ee16a084` (sync)

**Resultado esperado:** Próximo run NÃO reativará posts com `moderation_reason='audit-*'`. Posts com imagem errada ficam `hidden` até o autor trocar a imagem.

---

## Estado final (2026-07-25 23:30 BRT)

- **Total posts:** 700
- **Published:** 169 → 146 (-23: 14 antigos + 2 duplicatas + 1 reativado + 3 imgs dedupe + 4 imgs dedupe)
- **Hidden:** 260 → 283 (+23)
- **Closed:** 257 (mesmo)
- **Deleted:** 14 (mesmo)

---

## Resumo de todos os Fixes (A até S4)

| Fix | Data | Descrição | Commit kino-campus |
|-----|------|-----------|-------------------|
| A-P | 2026-07-23/24 | 16 fixes via PR/codex | various |
| Q | 2026-07-25 | dedup-content-hash (rodada 1 dedup --apply) | c063bb35 |
| R | 2026-07-25 | STRONG_OPPORTUNITY_HEADLINE_PATTERN inclui "matrícula" | faaab3e3 |
| S | 2026-07-25 | 3 handles IG adicionais (ppgca_ufg, ppgcb_ufg, floreser.ufg) | faaab3e3 |
| S2 | 2026-07-25 | scrub past dates com janela plausivel (-30/+540 dias) | b876a375 |
| S3 | 2026-07-25 | auto-hide posts com data passada (eventos + oportunidades) | aad21472 |
| S4 | 2026-07-25 | guard contra reativação indevida (audit-*) | ee16a084 |
| S5 | 2026-07-25 | dedup-kino-cron.sh (cron a cada 6h) | a90c942c |
| T | 2026-07-25 | cross-matcher evita many-to-one matching | d78d65e |
| T2 | 2026-07-25 | 3 handles IG (em.ufg, ppgban.ufg, ppgecoevolufg) | 2f1ee266 |
| T3 | 2026-07-25 | 1 handle IG (ppgeo.ufg) | e3d09941 |
| U | 2026-07-25 | relax application_status_claim_mismatch | 2f1ee266 |
| V | 2026-07-25 | dedup-kino v1.8.1 (same_source auto-hide) | 0390f11 |
| W | 2026-07-25 | canonical URL v3 + webySameEvent() | bfcbdc16 |
| W2 | 2026-07-25 | curl --max-time 10s → 20s | 3f651f94 |
| X | 2026-07-25 | 4 capas erradas + 7 IG_AGE>90d | 51ad6874 |
| Y | 2026-07-25 | dedup inline --auto-apply | 4feaa30b |
| Z | 2026-07-25 | flag post existente + skip_publish para blocked | 579c8be9 |
| Recovery | 2026-07-25 | sync-vps-to-clone.sh | ef2129db |

**Total:** 29 Fixes (A até Z + S2, S3, S4, S5) + 1 Recovery.

---

## Próximas ações

1. **Agendar cron job** para `dedup-kino --auto-apply` rodar diariamente (Fix S3 + S4 effective)
2. **Refatorar image-extract** para usar shortcode específico (corrige bug de imagem errada)
3. **Reclassificar revistas-ufg** (site hackeado com gambling SEO - fora do escopo da pipeline)
4. **Aplicar fix scrub past dates em data_evento** (não só descrição) - próximo nível

---

**Próxima run esperada:**
- ✅ Publicar 12+ posts sem erros
- ✅ Auto-hide posts com data passada (Fix S3)
- ✅ NÃO reativar posts com audit-* moderation_reason (Fix S4)
- ✅ Dedup inline aplicado (Fix Y)
- ✅ Posts existentes com flag para blocked (Fix Z)
