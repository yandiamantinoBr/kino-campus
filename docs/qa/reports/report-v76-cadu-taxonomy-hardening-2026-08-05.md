# Report — Cadu taxonomy hardening (2026-08-05)

**Escopo:** pipeline `services/cadu-ufg-publisher`  
**Motivo:** após a reclassificação dos 131 posts ativos em produção (`remaining_issues = 0`), o classificador ainda podia **reintroduzir** chaves legadas / fora do schema de create-post.

## Taxonomia canônica (fonte)

`assets/js/features/create-post/kc-create-post.schema.js`

| Módulo | Keys |
|--------|------|
| eventos | `academicos`, `palestras`, `congressos`, `cursos`, `culturais`, `esportivos`, `workshops`, `festas`, `sustentabilidade` |
| oportunidades | `editais`, `concursos`, `bolsas`, `estagios`, `empregos`, `monitoria`, `pesquisa`, `cursos-capacitacoes`, `voluntariado`, `freelancer` |

## Problema residual

| Sintoma | Causa no pipeline |
|---------|-------------------|
| Palestras / simpósios caíam em `academicos` ou em key de oportunidade | `detectEventCategory` sem `palestras`/`congressos`/`cursos` |
| Oportunidades genéricas → `monitoria` | default de `detectOpportunityCategory` |
| Falta de `editais` / `concursos` / `bolsas` / `cursos-capacitacoes` | detector incompleto vs schema |
| Labels ausentes no markdown/metadata | `CATEGORY_LABELS` parcial no mapper |
| Keys legadas podiam passar qualidade | `evaluatePayloadQuality` só checava presença, não allowlist |

## Correções

1. **`classifier.js`**
   - Allowlists `EVENT_CATEGORIES` / `OPPORTUNITY_CATEGORIES`
   - `isValidCategoryForModule` + `normalizeCategoryForModule` (fail-closed)
   - Detecção de eventos: palestras, congressos, workshops, cursos, culturais, esportivos, festas, sustentabilidade → default `academicos`
   - Detecção de oportunidades: monitoria, estágios, concursos, bolsas/pesquisa, cursos-capacitacoes, empregos, editais → default **`editais`** (não mais monitoria)
   - `detectModule` com formatos fortes (palestra/congresso vs edital) para não misturar módulos

2. **`mapper.js`**
   - `CATEGORY_LABELS` completo para todas as keys do schema
   - Normalização da categoria no payload antes de gravar

3. **`quality.js`**
   - Warning bloqueante `invalid_category_key` se a key não pertencer ao schema do módulo

4. **Testes unitários** cobrindo palestras/congressos, editais/concursos/bolsas/cursos-capacitacoes, anti-regressão palestra≠pesquisa e quality fail-closed

## Validação

```text
npx jest tests/unit/cadu-ufg-publisher.test.js --no-coverage
# 57 passed
```

Produção (dados já limpos em 2026-08-05): reclassificação anterior manteve `remaining_issues = 0`. Este PR **não altera posts existentes**; endurece apenas publicações futuras do Cadu.

## Risco / o que não mudou

- Dec/score de publish-review-discard (thresholds 0.78 / 0.55) inalterado  
- Home counts (`kc_home_category_post_counts`) continuam em buckets paralelos de personalização  
- Posts já publicados não são reescritos por este commit  
- Sem mudanças de RLS, secrets ou infraestrutura  
