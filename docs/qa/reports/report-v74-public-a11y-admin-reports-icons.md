# QA Report — V74 PUBLIC-A11Y admin-reports Decorative Icons

**Data:** 2026-05-05
**Versao:** 74.0.0
**Branch:** kinocampus-V74.0-foundations
**Tipo:** Patch de acessibilidade estatica (aria-hidden em icones decorativos)

---

## Escopo do patch

Arquivo: `assets/js/controllers/admin/admin-reports.controller.js`
Icones cobertos: 18 (todos decorativos com texto adjacente)

---

## Verificacao estatica — grep

```
node -e "
const fs=require('fs');
const src=fs.readFileSync('assets/js/controllers/admin/admin-reports.controller.js','utf8');
const total=(src.match(/<i class=\"fas /g)||[]).length;
const hidden=(src.match(/aria-hidden=\"true\"/g)||[]).length;
console.log('total fas:', total, 'aria-hidden:', hidden);
"
```

Resultado esperado: `total fas: 18  aria-hidden: 18`

---

## Resultado dos testes

```
npm test -- tests/a11y/a11y.test.js

PASS tests/a11y/a11y.test.js
  v74.0.0 - icones decorativos em admin-reports.controller.js
    ✓ 18 icones decorativos de acoes e estados do modulo de denuncias admin ocultam-se para tecnologias assistivas

Test Suites: 1 passed, 1 total
Tests:       50 passed, 50 total
```

---

## Resultado check:all

```
npm run check:all

[validate-version-map] OK — VERSION.json valido (appVersion=74.0.0, frontendRuntimeVersion=8.6.0)
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
Tests:       3075 passed, 3075 total
```

---

## Icones verificados individualmente

| Icone | aria-hidden | Acessibilidade alternativa |
|---|---|---|
| fa-plus (btn Carregar mais) | sim | texto "Carregar mais" adjacente |
| fa-exclamation-triangle style (erro) | sim | `<p>Nao foi possivel carregar...` adjacente |
| fa-check-circle style (vazio) x2 | sim | `<p>Nenhuma denuncia ...` adjacente |
| fa-file-alt style (titulo grupo) x2 | sim | `postTitle` adjacente |
| fa-eye (Ver post) x2 | sim | texto "Ver post" adjacente |
| fa-check (Fechar denuncias) x2 | sim | texto "Fechar denuncias/Fechar denuncias" adjacente |
| fa-eye-slash (Ocultar) x2 | sim | texto "Ocultar" adjacente |
| fa-eye (Restaurar) x2 | sim | texto "Restaurar" adjacente |
| fa-trash (Deletar) x2 | sim | texto "Deletar" adjacente |
| fa-check color style (fechadas) x2 | sim | texto "Todas as denuncias deste post foram fechadas." adjacente |

---

## Invariantes preservados

- frontendRuntimeVersion: 8.6.0 (imutavel)
- CSS de producao: nao alterado
- HTMLs estaticos: nao alterados
- SQL/migrations: nao alterados
- Comportamento visual: preservado
- package-lock.json: nao modificado
