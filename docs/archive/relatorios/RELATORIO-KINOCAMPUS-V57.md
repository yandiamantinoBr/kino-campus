# Relatorio KinoCampus V57 - PUBLIC-A11Y Post Card Author Avatar Alt

**Versao:** v57.0.0
**Status:** Encerrada
**Periodo:** 2026-04-30 -> 2026-04-30
**Branch:** `kinocampus-V57.0-foundations`
**Tipo:** funcional pequeno / PUBLIC-A11Y-01

---

## 1. Objetivo

Normalizar o texto alternativo do avatar de autor renderizado por `KCUtils.renderPostCard`,
evitando `alt` truncado com apenas o primeiro nome e preservando comportamento visual.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Runtime pontual | avatar de autor usa `alt="Avatar de <nome completo>"` |
| Fallback | quando nao houver nome, o texto alternativo fica `Avatar do autor` |
| Teste a11y | `tests/a11y/a11y.test.js` cobre autor vindo do payload do post |
| Teste unitario | `tests/unit/kc-utils-presentation.test.js` protege autor vindo de `KCAPI` |
| Evidencia QA | `docs/qa/reports/report-v57-public-a11y-post-card-author-avatar-alt.md` criado |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V52.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, guia de IA, workflow Lighthouse e validators reancorados para V57 |

---

## 3. Nao Escopo

- Nenhuma alteracao em CSS de producao.
- Nenhuma alteracao em HTMLs estaticos.
- Nenhuma alteracao em SQL ou migrations Supabase.
- Nenhum secret/provider configurado.
- Nenhuma alteracao em auth, admin, profile/avatar, busca ou notificacoes.
- Nenhuma mudanca visual intencional.

---

## 4. Metricas

| Metrica | Antes (V56) | Depois (V57) | Delta |
|---|---|---|---|
| appVersion | 56.0.0 | 57.0.0 | +1 versao funcional pequena |
| Branch principal | `kinocampus-V56.0-foundations` | `kinocampus-V57.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 41 | 42 | +V52 |
| Itens `check:structure` | 156 | 156 | preservado |
| Arquivos JS funcionais alterados | 1 | 1 | patch pontual no mesmo componente |
| Suites Jest | 134 | 134 | preservado |
| Testes Jest | 3053 | 3054 | +1 teste a11y |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `57.0.0`, branch `kinocampus-V57.0-foundations`, status `v57 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V52.md` arquivado via `git mv`
- [x] `assets/js/utils/kc-utils.presentation.js` normaliza alt de avatar do autor
- [x] `tests/a11y/a11y.test.js` cobre alt com nome completo
- [x] `tests/unit/kc-utils-presentation.test.js` cobre autor vindo de `KCAPI`
- [x] `docs/qa/reports/report-v57-public-a11y-post-card-author-avatar-alt.md` criado
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V57
- [x] `npm test -- tests/a11y/a11y.test.js` verde
- [x] `npm test -- tests/unit/kc-utils-presentation.test.js` verde
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 134/134 suites, 3054/3054 testes
- [x] Zero alteracoes em CSS de producao, HTMLs estaticos, SQL, migrations, secrets e providers
