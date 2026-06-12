# V76 - CSS Ownership Inventory

**Data:** 2026-06-12
**Escopo:** inventario de ownership de `assets/css/styles.css`
**Branch:** `codex/css-ownership-inventory-v76-8`

## Resumo

A entrega CSS-A criou um inventario assistido por script para classificar o monolito
`assets/css/styles.css` antes de qualquer split ou extracao de seletores.

Nao houve alteracao de CSS runtime:

- nenhum seletor foi movido;
- nenhum HTML foi alterado;
- `assets/css/future-split/` continua nao carregado;
- nenhum baseline visual foi exigido nesta etapa porque nao houve mudanca visual.

## Artefatos

- `scripts/audit-css-ownership.js`
- `package.json` (`npm run audit:css`)
- `docs/planning/v76-css-ownership-inventory.md`
- `docs/architecture/css-architecture.md`
- `docs/planning/v76-hotspot-decomposition-plan.md`

## Baseline medido

| Item | Valor |
|---|---:|
| `assets/css/styles.css` | 12.282 linhas / 287.760 bytes |
| Regras parseadas em `styles.css` | 1.774 |
| Seletores parseados em `styles.css` | 1.995 |
| CSS de producao total | 17.508 linhas / 418.018 bytes |
| `styles.css` carregado | 27 HTMLs descobertos |
| `future-split/` | 5 stubs nao carregados |

## Ownership principal

| Bucket | Regras | Seletores | Decisao |
|---|---:|---:|---|
| Layout e navegacao globais | 336 | 229 | permanece global |
| Feed, cards e ranking | 282 | 189 | permanece global |
| Componentes compartilhados | 260 | 242 | futuro split somente com prova |
| Public shell/profile/legal overlap | 137 | 134 | candidato a `kc-public-shell.css` apos baseline |
| Modulos publicos de pagina | 146 | 141 | bloqueado para split futuro |
| Admin overlap | 24 | 20 | candidato a `admin-shell.css` apos baseline |
| Produto overlap | 7 | 4 | candidato a `product.css`/`product-lightbox.css` apos baseline |
| Chat overlap | 7 | 7 | candidato condicional a `kc-chat.css` |
| Revisao manual | 523 | 389 | revisao manual obrigatoria |

## Validacoes

```bash
node --check scripts/audit-css-ownership.js
npm run audit:css
git diff --check
npm run check:structure
npm run check:scripts
npm run check:hygiene
npm run check:all
npx playwright test --list
```

Resultados finais da branch:

- `node --check scripts/audit-css-ownership.js`: OK.
- `npm run audit:css`: OK; 1.774 regras / 1.995 seletores parseados.
- `git diff --check`: sem erros.
- `npm run check:structure`: OK.
- `npm run check:scripts`: OK.
- `npm run check:hygiene`: OK.
- `npm run check:all`: OK.
- `npx playwright test --list`: OK, 59 testes em 9 arquivos.

## Rollback

Rollback simples por PR: remover o script de auditoria, remover o comando `audit:css` do
`package.json` e reverter os documentos criados/atualizados nesta entrega. Como CSS, HTML,
JS runtime, Supabase, Vercel e migrations nao foram alterados, o rollback nao exige dashboard,
secret, migration ou deploy manual especial.

## Proxima etapa recomendada

CSS-B baseline visual foi executado em `report-v76-css-visual-baseline-2026-06-12.md`.
O inventario residual JS-I foi executado em
`report-v76-kcapi-residual-inventory-2026-06-12.md`.

Proxima entrega deve escolher uma trilha unica: CSS-C micro-split com before/after, CSS-B admin
autenticado ou JS-I.1 external access admin sem tocar CSS.
