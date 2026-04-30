# Relatorio KinoCampus V54 - PUBLIC-A11Y Post Card Comments

**Versao:** v54.0.0
**Status:** Encerrada
**Periodo:** 2026-04-30 -> 2026-04-30
**Branch:** `kinocampus-V54.0-foundations`
**Tipo:** funcional pequeno / PUBLIC-A11Y-01

---

## 1. Objetivo

Corrigir a contagem e o nome acessivel do link de comentarios renderizado por `KCUtils.renderPostCard`,
mantendo filescope pequeno, rollback simples e cobertura Jest direcionada.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Runtime pontual | `assets/js/utils/kc-utils.presentation.js` agora usa `comments_count`/`commentsCount` como fallback de `comentarios` |
| A11y | `.kc-comment-link` ganhou aria-label acionavel com contagem e titulo; icone `fa-comment` ficou decorativo com `aria-hidden="true"` |
| Teste | `tests/a11y/a11y.test.js` cobre contagem `comments_count`, nome acessivel e icone decorativo |
| Evidencia QA | `docs/qa/reports/report-v54-public-a11y-post-card-comments.md` criado |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V49.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, guia de IA, workflow Lighthouse e validators reancorados para V54 |

---

## 3. Nao Escopo

- Nenhuma alteracao em CSS de producao.
- Nenhuma alteracao em HTMLs.
- Nenhuma alteracao em SQL ou migrations Supabase.
- Nenhum secret/provider configurado.
- Nenhuma alteracao em auth, admin, profile/avatar, busca ou notificacoes.
- Nenhuma mudanca visual intencional.

---

## 4. Metricas

| Metrica | Antes (V53) | Depois (V54) | Delta |
|---|---|---|---|
| appVersion | 53.0.0 | 54.0.0 | +1 versao funcional pequena |
| Branch principal | `kinocampus-V53.0-foundations` | `kinocampus-V54.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 38 | 39 | +V49 |
| Itens `check:structure` | 156 | 156 | preservado |
| Arquivos JS funcionais alterados | 0 | 1 | patch pontual |
| Suites Jest | 134 | 134 | preservado |
| Testes Jest | 3046 | 3048 | +2 testes a11y |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `54.0.0`, branch `kinocampus-V54.0-foundations`, status `v54 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V49.md` arquivado via `git mv`
- [x] `assets/js/utils/kc-utils.presentation.js` corrigido para `comments_count`
- [x] `tests/a11y/a11y.test.js` cobre nome acessivel e icone decorativo
- [x] `docs/qa/reports/report-v54-public-a11y-post-card-comments.md` criado
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V54
- [x] `npm test -- tests/a11y/a11y.test.js` verde
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 134/134 suites, 3048/3048 testes
- [x] Zero alteracoes em CSS de producao, HTMLs, SQL, migrations, secrets e providers
