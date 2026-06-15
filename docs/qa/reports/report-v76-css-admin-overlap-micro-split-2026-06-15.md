# Report V76 CSS-C.2 - Micro-split do overlap admin

**Data:** 2026-06-15
**Escopo:** CSS-only; realocação dos seletores administrativos remanescentes de `assets/css/styles.css` para `assets/css/admin-shell.css`
**Sem alteração:** HTML, JS, ordem de `<link>`, `future-split/`, provider, banco, secrets ou deploy

---

## Decisão

O recorte CSS-C.2 removeu o restante do bucket `Admin overlap` de `styles.css` porque:

- os seletores `.kc-admin-tab*`, `.kc-admin-tab-refresh*` e `.kc-admin-invite-feedback.is-*` são usados no fluxo admin de moderação;
- as seis páginas `admin/*.html` carregam `assets/css/admin-shell.css` e usam `body.kc-admin-page`;
- a regra mobile de `.kc-admin-wrapper` já pertence ao shell administrativo;
- o baseline CSS-B/C cobre as seis rotas admin em desktop e mobile no estado sem sessão;
- o rollback é simples: devolver os blocos para `styles.css`.

O candidato de produto foi analisado e **não foi movido** nesta etapa: `.kc-save-popover*` também atende `my-posts.html`, que não carrega `product.css`. Mover esse bloco para CSS de produto quebraria o contrato de carregamento atual.

---

## Filescope

| Arquivo | Alteração |
|---|---|
| `assets/css/styles.css` | remove `.kc-admin-page .kc-admin-wrapper`, `.kc-admin-tab*`, `.kc-admin-tab-refresh*` e `.kc-admin-invite-feedback.is-*` |
| `assets/css/admin-shell.css` | passa a conter esses seletores com escopo `body.kc-admin-page` |
| `docs/planning/v76-css-ownership-inventory.md` | registra `Admin overlap` zerado e bloqueio do candidato de produto |
| `docs/planning/v76-css-visual-baseline.md` | registra as rodadas antes/depois/repetida do CSS-C.2 |
| `docs/planning/v76-hotspot-decomposition-plan.md` | atualiza status v76.15.0 |
| `docs/architecture.md` e `docs/architecture/css-architecture.md` | atualizam métricas e regra operacional CSS |
| `docs/qa/reports/*` e índices | registram esta evidência |

---

## Métricas

Fonte: `npm run audit:css`.

| Métrica | Antes CSS-C.2 | Depois CSS-C.2 |
|---|---:|---:|
| `assets/css/styles.css` | 12.161 linhas / 284.046 bytes | 12.089 linhas / 281.919 bytes |
| `assets/css/admin-shell.css` | 1.399 linhas / 36.592 bytes | 1.471 linhas / 38.565 bytes |
| Regras parseadas em `styles.css` | 1.753 | 1.741 |
| Seletores parseados em `styles.css` | 1.974 | 1.962 |
| Bucket `Admin overlap` | 12 regras / 12 seletores / 63 linhas | 0 regras / 0 seletores / 0 linhas |

O ganho líquido é a saída de 72 linhas do monólito global e o encerramento do bucket admin no inventário CSS-A/C.

---

## Baseline visual

Comandos executados:

```bash
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c2-admin-overlap-before-2026-06-15
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c2-admin-overlap-after-2026-06-15
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c2-admin-overlap-repeat-2026-06-15
```

Resultado dos três manifests:

| Rodada | Capturas | Respostas falhas | Overflow horizontal | `future-split/` carregado |
|---|---:|---:|---:|---:|
| antes | 24 | 0 | 0 | 0 |
| depois | 24 | 0 | 0 | 0 |
| repetição | 24 | 0 | 0 | 0 |

Nesta etapa, os hashes dos screenshots ficaram iguais entre antes, depois e repetição: 0 diferenças em 24 capturas.

---

## Validação

```bash
npm run audit:css
git diff --check
npm run check:all
```

Resultado:

- `npm run audit:css`: OK; `Admin overlap` zerado, `styles.css` com 1.741 regras / 1.962 seletores.
- `git diff --check`: OK; apenas aviso normal de normalização CRLF/LF no Windows para `admin-shell.css`.
- `npm run check:all`: OK.
- Jest: 175 suítes, 3.577 testes, 3 snapshots.

---

## Rollback

Rollback R1:

1. recolocar os seletores administrativos removidos em `assets/css/styles.css`;
2. remover os mesmos seletores de `assets/css/admin-shell.css`;
3. rodar `npm run audit:css`, `npm run audit:css-baseline` e `npm run check:all`.

Como não houve mudança de HTML, JS, provider ou ordem de links, o rollback é CSS-only.

---

## Próxima etapa recomendada

Não iniciar split amplo de `styles.css`. A próxima entrega deve escolher uma frente única:

1. CSS-C.3 em `Chat overlap`, somente se for confirmado que o atalho de chat global permanece carregado nas páginas não-chat;
2. CSS-B autenticado para dashboard admin real, antes de mover seletores que só aparecem com sessão;
3. investigação documental de `bootstrap-driver-core`, sem extração JS imediata.
