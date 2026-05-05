# QA Report — V75 PUBLIC-A11Y kc-ranking Decorative Icons

**Data:** 2026-05-05
**Versao:** 75.0.0
**Branch:** kinocampus-V75.0-foundations
**Tipo:** Patch de acessibilidade estatica (aria-hidden em icones decorativos)

---

## Escopo do patch

Arquivo: `assets/js/features/kc-ranking.js`
Icones cobertos: 18 (todos decorativos com texto adjacente ou aria-label no pai)

---

## Verificacao estatica — grep

```
node -e "
const fs=require('fs');
const src=fs.readFileSync('assets/js/features/kc-ranking.js','utf8');
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
  v75.0.0 - icones decorativos em kc-ranking.js
    ✓ 18 icones decorativos de avatares, acoes e estados do modulo de ranking ocultam-se para tecnologias assistivas

Test Suites: 1 passed, 1 total
Tests:       51 passed, 51 total
```

---

## Resultado check:all

```
npm run check:all

[validate-version-map] OK — VERSION.json valido (appVersion=75.0.0, frontendRuntimeVersion=8.6.0)
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
Tests:       3076 passed, 3076 total
```

---

## Icones verificados individualmente

| Icone | aria-hidden | Acessibilidade alternativa |
|---|---|---|
| fa-user (placeholder avatar) x2 | sim | imagem de usuario |
| fa-user style inline (avatar alt) | sim | imagem de usuario |
| fa-trophy style (cabecalho modal) | sim | texto "Como funciona o ranking?" adjacente |
| fa-times (fechar modal) | sim | `aria-label="Fechar"` no elemento pai |
| fa-file-alt (tabela: Publicacao criada) | sim | texto "Publicacao criada" adjacente |
| fa-thumbs-up (tabela: Voto positivo) | sim | texto "Voto positivo recebido" adjacente |
| fa-comment (tabela: Comentario) | sim | texto "Comentario escrito" adjacente |
| fa-hand-pointer (tabela: Anuncio) | sim | texto "Anuncio acessado por alguem" adjacente |
| fa-share-alt (tabela: Compartilhamento) | sim | texto "Publicacao compartilhada" adjacente |
| fa-flag (tabela: Denuncia penalidade) | sim | texto "Denuncia confirmada (penalidade)" adjacente |
| fa-check (btn Entendido) | sim | texto "Entendido" adjacente |
| fa-spinner fa-spin x6 | sim | texto de carregamento adjacente |

---

## Invariantes preservados

- frontendRuntimeVersion: 8.6.0 (imutavel)
- CSS de producao: nao alterado
- HTMLs estaticos: nao alterados
- SQL/migrations: nao alterados
- Comportamento visual: preservado
- package-lock.json: nao modificado
