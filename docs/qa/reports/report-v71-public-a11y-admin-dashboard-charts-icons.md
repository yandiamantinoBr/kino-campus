# QA Report — V71 PUBLIC-A11Y Admin Dashboard Charts Decorative Icons

**Data:** 2026-05-05
**Versao:** 71.0.0
**Branch:** kinocampus-V71.0-foundations
**Tipo:** Patch de acessibilidade estatica (aria-hidden em icones decorativos)

---

## Escopo do patch

Arquivo: `assets/js/controllers/admin/admin-dashboard.charts.js`
Icones cobertos: 11 (todos decorativos com texto ou title adjacente)

---

## Verificacao estatica — grep

```
node -e "
const fs=require('fs');
const src=fs.readFileSync('assets/js/controllers/admin/admin-dashboard.charts.js','utf8');
const total=(src.match(/<i class=\"fas /g)||[]).length;
const hidden=(src.match(/aria-hidden=\"true\"/g)||[]).length;
console.log('total fas:', total, 'aria-hidden:', hidden);
"
```

Resultado esperado: `total fas: 11  aria-hidden: 11`

---

## Resultado dos testes

```
npm test -- tests/a11y/a11y.test.js

PASS tests/a11y/a11y.test.js
  v71.0.0 - icones decorativos em admin-dashboard.charts.js
    ✓ 11 icones decorativos do ranking e modulos do dashboard admin ocultam-se para tecnologias assistivas

Test Suites: 1 passed, 1 total
Tests:       43 passed, 43 total
```

---

## Resultado check:all

```
npm run check:all

[validate-version-map] OK — VERSION.json valido (appVersion=71.0.0, frontendRuntimeVersion=8.6.0)
[validate-repository-structure] OK — 156 itens verificados + raiz assets/js/ limpa
[validate-script-chains] OK — cadeia validada em 22 HTMLs
[validate-public-routes] OK — 22 rotas
Hygiene check passed for version 8.6.0
```

---

## Resultado suite completa

```
npm test

Test Suites: 135 passed, 135 total
Tests:       3072 passed, 3072 total
```

---

## Icones verificados individualmente

| Icone | aria-hidden | Acessibilidade alternativa |
|---|---|---|
| fa-table-cells (titulo modulo) | sim | texto "Por modulo (...)" adjacente |
| fa-spinner fa-spin (loading) | sim | texto "Carregando ranking..." adjacente |
| fa-file-alt (th Publicacoes) | sim | title="Publicacoes" |
| fa-thumbs-up (th Votos) | sim | title="Votos" |
| fa-comment (th Comentarios) | sim | title="Comentarios" |
| fa-ticket (th Cupons) | sim | title="Cupons" |
| fa-share-nodes (th Shares) | sim | title="Shares" |
| fa-flag (th Penalidades) | sim | title="Penalidades" |
| fa-user style (avatar fallback) | sim | nome do usuario adjacente em span |
| fa-chevron-down (mostrar todos) | sim | texto "Mostrar todos" adjacente |
| fa-chevron-up (mostrar top 10) | sim | texto "Mostrar top 10" adjacente |

---

## Invariantes preservados

- frontendRuntimeVersion: 8.6.0 (imutavel)
- CSS de producao: nao alterado
- HTMLs estaticos: nao alterados
- SQL/migrations: nao alterados
- Comportamento visual: preservado
- package-lock.json: nao modificado
