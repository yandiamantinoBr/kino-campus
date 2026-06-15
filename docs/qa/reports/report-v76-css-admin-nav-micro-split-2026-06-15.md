# Report V76 CSS-C - Micro-split da navegação admin

**Data:** 2026-06-15  
**Escopo:** CSS-only; realocação do bloco `.kc-admin-nav*` de `assets/css/styles.css` para `assets/css/admin-shell.css`  
**Sem alteração:** HTML, JS, ordem de `<link>`, `future-split/`, provider, banco, secrets ou deploy

---

## Decisão

O recorte CSS-C aprovado foi o bloco da navegação admin, porque:

- os seletores têm prefixo claro: `.kc-admin-nav`, `.kc-admin-nav__link` e variantes;
- as seis páginas `admin/*.html` já carregam `assets/css/admin-shell.css` depois de `styles.css`;
- o baseline CSS-B/C cobre as seis rotas admin em desktop e mobile no estado sem sessão;
- o rollback é simples: devolver o bloco para `styles.css`.

O PR não ativou `assets/css/future-split/` e não criou novo arquivo CSS.

---

## Filescope

| Arquivo | Alteração |
|---|---|
| `assets/css/styles.css` | remove o bloco de navegação admin do monólito global |
| `assets/css/admin-shell.css` | passa a conter a base e os ajustes responsivos de `.kc-admin-nav*` |
| `docs/planning/v76-css-ownership-inventory.md` | registra o estado pós-CSS-C do ownership |
| `docs/planning/v76-css-visual-baseline.md` | registra a rodada antes/depois usada no CSS-C |
| `docs/planning/v76-hotspot-decomposition-plan.md` | atualiza status v76.14.0 |
| `docs/architecture.md` e `docs/architecture/css-architecture.md` | atualizam métricas e regra operacional CSS |
| `docs/qa/reports/*` e índices | registram esta evidência |

---

## Métricas

Fonte: `npm run audit:css`.

| Métrica | Antes CSS-C | Depois CSS-C |
|---|---:|---:|
| `assets/css/styles.css` | 12.282 linhas / 287.760 bytes | 12.161 linhas / 284.046 bytes |
| `assets/css/admin-shell.css` | 1.277 linhas / 34.043 bytes | 1.399 linhas / 36.459 bytes |
| Regras parseadas em `styles.css` | 1.774 | 1.753 |
| Seletores parseados em `styles.css` | 1.995 | 1.974 |
| Bucket `Admin overlap` | 24 regras / 20 seletores / 123 linhas | 12 regras / 12 seletores / 63 linhas |

O ganho líquido é a saída de 121 linhas do monólito global e a consolidação da responsabilidade visual no CSS já dedicado ao admin.

---

## Baseline visual

Comandos executados:

```bash
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c-admin-nav-before-2026-06-15
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c-admin-nav-after-2026-06-15
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c-admin-nav-after-repeat-2026-06-15
```

Resultado dos três manifests:

| Rodada | Capturas | Respostas falhas | Overflow horizontal | `future-split/` carregado |
|---|---:|---:|---:|---:|
| antes | 24 | 0 | 0 | 0 |
| depois | 24 | 0 | 0 | 0 |
| depois repetido | 24 | 0 | 0 | 0 |

Limitação observada: os hashes dos screenshots não ficaram pixel-estáveis entre rodadas por oscilações de recursos externos registradas como `ERR_CONNECTION_RESET`. A repetição pós-mudança também variou hashes em rotas públicas que não foram tocadas, confirmando ruído de captura. A decisão usa como evidência principal: ausência de resposta falha, ausência de overflow, ausência de `future-split/`, carregamento CSS preservado e métricas estruturais do manifesto.

---

## Validação

```bash
npm run audit:css
git diff --check
npm run check:all
```

Resultado:

- `npm run audit:css`: OK; `styles.css` com 1.753 regras / 1.974 seletores.
- `git diff --check`: OK; apenas aviso normal de normalização CRLF/LF no Windows para `admin-shell.css`.
- `npm run check:all`: OK.
- Jest: 175 suítes, 3.577 testes, 3 snapshots.

---

## Rollback

Rollback R1:

1. recolocar o bloco `.kc-admin-nav*` em `assets/css/styles.css`;
2. remover o mesmo bloco de `assets/css/admin-shell.css`;
3. rodar `npm run audit:css`, `npm run audit:css-baseline` e `npm run check:all`.

Como não houve mudança de HTML, JS, provider ou ordem de links, o rollback é CSS-only.

---

## Próxima etapa recomendada

Não iniciar split amplo de `styles.css`. A próxima entrega deve escolher uma frente única:

1. CSS-C.2 em candidato pequeno e visível no baseline, preferencialmente produto se o diff ficar restrito a `_product.html` e `my-posts.html`;
2. CSS-B autenticado para dashboard admin real antes de mover seletores que só aparecem com sessão;
3. investigação documental de `bootstrap-driver-core`, sem extração JS imediata.
