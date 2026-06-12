# V76 - KCAPI NormalizePost Snapshot

**Data:** 2026-06-12
**Escopo:** snapshot comportamental de `window.KCAPI.normalizePost` antes da extracao
**Branch:** `codex/snapshot-normalize-post-v76-5`

## Resumo

O recorte JS-F nao altera runtime. Ele adiciona uma suite dedicada para congelar o comportamento atual
de `KCAPI.normalizePost` antes de mover a normalizacao de posts para um sub-modulo proprio.

O snapshot cobre:

- aliases snake/camel (`created_at`/`createdAt`, `bumped_at`/`bumpedAt`, `image_url`/`imageUrl`);
- calculo de `effectiveAt`/`effective_at` e `timestamp`;
- rating e `authorProfile` normalizados;
- autor legado resolvido por `kc-api.authors.js`;
- imagens diretas e fallback por `metadata.image_url`;
- status fechado, visibility e default de avatar;
- regra de `compra-venda` que converte acoes como `vendo` para subcategoria de produto.

## Antes / Depois

| Item | Antes JS-F | Depois JS-F | Delta |
|---|---:|---:|---:|
| `assets/js/api/kc-api.client.js` | 1.698 linhas / 67.863 bytes | 1.698 linhas / 67.863 bytes | sem runtime change |
| `tests/integration/` | 122 suites | 123 suites | +1 |
| Jest | 172 suites / 3555 testes | 173 suites / 3559 testes | +1 suite / +4 testes |
| Snapshots Jest | 0 dedicados a `normalizePost` | 3 inline snapshots | +3 |

## Arquivos principais

- `tests/integration/kc-api-normalize-post-snapshot.test.js`
- `docs/planning/v76-hotspot-decomposition-plan.md`
- `docs/architecture/test-strategy.md`
- `docs/qa/reports/README.md`

## Validacoes

```bash
node --check tests/integration/kc-api-normalize-post-snapshot.test.js
npm test -- --runInBand tests/integration/kc-api-normalize-post-snapshot.test.js
npm test -- --runInBand
npm run check:all
npx playwright test --list
```

Resultados:

- Suite focada: 1 suite / 4 testes / 3 snapshots passaram.
- Jest completo: 173 suites / 3559 testes / 3 snapshots passaram.
- `npm run check:structure` passou com 166 itens verificados.
- `npm run check:all` passou, incluindo versionamento, estrutura, scripts, rotas, higiene e Jest.
- Playwright listou 59 testes em 9 arquivos.

## Proximo recorte recomendado

Extrair `normalizePost` para sub-modulo proprio, mantendo `window.KCAPI.normalizePost` como delegacao
publica e usando estes snapshots como gate de equivalencia.
