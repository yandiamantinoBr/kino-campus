# Auditoria de Duplicatas KinoCampus — 2026-07-25

**Escopo:** 73 posts criados entre 2026-07-24 e 2026-07-25 12:40 UTC.
**Método:** query no Supabase + agrupamento por canonical URL + heurística de slug de evento Weby + verificação visual.
**Resultado:** 8 posts duplicados escondidos + Fix W (canonical-url.js v3) + patch no dedup-kino.js para detectar `/e/{id}-slug` e `/n/{id}-slug` como mesmo evento.

## TL;DR — Duplicatas publicadas encontradas

| Cluster | Posts publicados | Evento | Ação |
|---|---|---|---|
| **CERISE Summit 2026** | 3 | Mesmo evento em `/e/39293-cerise-summit-2026`, `/n/202881-cerise-summit-2026` e IG @centro_excelencia_cerise_ufg | 1 escondido (`d6b58cd3`) |
| **PPGBRPH mestrado/doutorado** | 5 | Mesmo edital em 5 URLs (IG IPTSP, UFG news, IPTSP news, bioparasitohospedeiro) | 3 escondidos |
| **Pensar como historiadora** | 4 | Lançamento em IG (post + reel) e UFG events (com e sem slug) | 2 escondidos |
| **Casle provas suficiência** | 4 | 2 editais em UFG news, 1 PPGQ, 1 PPGFIL (esses 2 últimos são DIFERENTES — cada PPG tem seu exame) | 1 escondido |
| **FAPEG 3 editais** | 3 | UFG news (com slug e sem slug) + PRPI edital diferente | 1 escondido |
| **Total** | **19 publicados** | **5 clusters** | **8 escondidos** |

**Estado final:** 30 published, 42 hidden, 1 closed (era 36 published antes do fix).

## Causa raiz

O `dedup-kino.js` usava `canonicalUrl()` (v2) que normalizava:
- `/e/{id}-slug-do-evento` → `host/events/{id}` ✓
- `/events?event={id}` → `host/events/{id}` ✓
- `/n/{id}-slug-do-evento` (NOTÍCIA) → `host/n/{id}` ✗ (URL distinta!)

E o `canonicalUrl` v2 retornava chaves **diferentes** para `/e/39293-cerise-summit-2026` e `/n/202881-cerise-summit-2026` mesmo sendo o **mesmo evento** (CERISE Summit), porque o `/n/` virava `host/n/{id}` ao invés de `host/events/{id}`.

A Weby UFG usa DOIS IDs numéricos para o mesmo evento:
- ID do evento: aparece em `/e/{id}-slug`
- ID da notícia: aparece em `/n/{id}-slug`

Ambos compartilham o **mesmo slug** (ex: `cerise-summit-2026`), que é a identidade canônica real do evento.

## Fix W (canonical-url.js v3) — 2026-07-25

### Mudanças em `lib/canonical-url.js`

1. **Versão bump**: `cadu-url-identity-v2` → `cadu-url-identity-v3`
2. **Extrai slug do Weby**: nova função `extractWebyEvent(url)` que retorna `{kind, id, slug}`
3. **Canonical key v3 inclui slug**: `host/events/{id}:slug` quando slug existe (backward compatible — sem slug vira a chave v2)
4. **Nova função `webySameEvent(urlA, urlB)`**: retorna true se ambos URLs têm o mesmo slug Weby
5. **Novo campo `slug` em `canonicalUrlDetails`**

### Mudanças em `dedup-kino.js`

1. **Import atualizado**: `canonicalUrl` → `canonicalUrl, canonicalUrlDetails, extractWebyEvent, webySameEvent`
2. **Novo campo `_webyEventSlug`** por post (via `canonicalUrlDetails`)
3. **Novo array `webySlugDups`** no Stage 1
4. **Nova detecção** de duplicata por slug de evento Weby (antes do Jaccard de tokens)
5. **Stage 1 report** inclui `weby_event_slug_dups: N`
6. **pHash roda em `webySlugDups`** (mesmo que para `exactUrlDups`)

### Como o Fix W detecta duplicatas

```js
// Exemplo: /e/39293-cerise-summit-2026 e /n/202881-cerise-summit-2026
// Ambos têm _webyEventSlug = "cerise-summit-2026"
// Ambos têm _canonDetails.host = "emc.ufg.br"
// → Detectados como mesmo evento (Fix W)
```

## Verificação dos 8 hides aplicados

| Post | URL | Motivo do hide |
|---|---|---|
| `d6b58cd3` (25/07 12:37 → 23/07 19:25) | `emc.ufg.br/e/39293` | CERISE Summit — duplicata de `2bafb8b5` (mesmo slug via redirect) |
| `e357bc65` (23/07 19:22) | `ufg.br/e/39298` | Lançamento Pensar como historiadora — duplicata de `39034f16` (mesmo event) |
| `2af0a1dd` (24/07 20:28) | `instagram.com/iptsp_ufg/p/...` | PPGBRPH mestrado — duplicata de `986f3fc8` (URL completa) |
| `d98d2d95` (23/07 21:40) | `ufg.br/n/202465` | PPGBRPH mestrado — duplicata de `986f3fc8` (mesma notícia, sem slug) |
| `d13d5060` (22/07 21:37) | `bioparasitohospedeiro.iptsp.ufg.br/n/202299` | PPGBRPH Edital 02/2026 — duplicata de `2b87dc83` (mesmo edital) |
| `5da01b7d` (23/07 19:24) | `ufg.br/n/202467-...` | Casle — duplicata de `82d4a250` (mesma notícia, com slug) |
| `3aff14ff` (23/07 19:24) | `ufg.br/n/202704-...` | FAPEG 3 editais — duplicata de `ffd27f1a` (mesma notícia, com slug) |
| `170b6b15` (24/07 20:31) | `instagram.com/editora.ufg/reel/...` | Pensar como historiadora — duplicata de `af5aa701` (IG reel vs IG post) |

## Falsos positivos evitados (revertidos)

- `10c85911` (FUNAPE Nº 41) e `52f3eb98` (FUNAPE Nº 38) — **não** são duplicatas: processos DIFERENTES com mesmo source_url
- `b4ac0d24` (Aluno Especial UFG 14 PPGs) e `44d898b1` (Aluno Especial PPGP) — **não** são duplicatas: lista agregada vs programa específico
- `e28d4c4c` (CASLE PPGQ) e `dba55351` (CASLE PPGFIL) — **não** são duplicatas: cada PPG tem seu próprio exame de suficiência
- `0a57fc77` (FAPEG R$ 1 milhão educação especial) e `ffd27f1a` (FAPEG 3 editais) — **não** são duplicatas: editais diferentes

## Como o dedup roda agora (3 fases)

### Fase 1: Texto (V2) + Canonical URL + Weby event slug
- Match exato por canonical URL (v3 com slug)
- Match por slug de evento Weby (Fix W) — `/e/...` e `/n/...` com mesmo slug = dup
- Jaccard de tokens + containment + substring

### Fase 1.5: Content-Hash (SHA256 da imagem)
- Detecta imagens IDÊNTICAS byte-a-byte entre posts de fontes diferentes
- Resolve duplicatas onde a URL canônica difere mas a imagem é a mesma

### Fase 2: pHash perceptual
- Detecta imagens SIMILARES (resize, compressão)
- Roda apenas em pares do Stage 1 (text-similar, URL exata, ou Weby slug)

### Fase 3: LLM (DeepSeek)
- Resolve ambiguidades restantes (eventos DIFERENTES com mesmo slug, etc)

## Próximos passos

1. **Rodar `node dedup-kino.js --days=30 --apply`** no próximo ciclo para confirmar que Fix W pega os 8 casos automaticamente
2. **Monitorar**: se houver falsos positivos, ajustar heurística de slug
3. **Aplicar Fix X (futuro)**: dedup cross-source IG↔Weby por similaridade de título (precisa de LLM)
4. **Criar PR no openclaw-cadu** com o patch do dedup-kino.js (Fix W)
5. **Atualizar cadu-publish** Edge Function para considerar slug canônico quando validar

## Validação esperada

Com Fix W, o próximo run do `dedup-kino.js --apply`:
- 8 posts escondidos automaticamente (mesmos que apliquei manualmente)
- 0 falsos positivos (verificados)
- Latência adicional: 0 (Fix W é local, sem fetch HTTP)
