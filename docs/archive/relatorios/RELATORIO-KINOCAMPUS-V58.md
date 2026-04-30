# Relatorio KinoCampus V58 - PUBLIC-A11Y Mobile Search Modal Controls

**Versao:** v58.0.0
**Status:** Encerrada
**Periodo:** 2026-04-30 -> 2026-04-30
**Branch:** `kinocampus-V58.0-foundations`
**Tipo:** funcional pequeno / PUBLIC-A11Y-01

---

## 1. Objetivo

Normalizar a semantica dos controles gerados pelo modal de busca mobile (`KCSearchModal`),
garantindo que os botoes de fechar e limpar sejam explicitamente `type="button"` e que seus
icones internos sejam decorativos para tecnologias assistivas.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Runtime pontual | botoes `kc-search-modal-card__close` e `kc-search-modal-card__clear` recebem `type="button"` |
| Acessibilidade | icones `fa-arrow-left` e `fa-times` do modal recebem `aria-hidden="true"` |
| Teste unitario | `tests/unit/kc-search-modal.test.js` instancia o modal em JSDOM e valida tipo, labels e icones |
| Evidencia QA | `docs/qa/reports/report-v58-public-a11y-mobile-search-modal-controls.md` criado |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V53.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, guia de IA, workflow Lighthouse e validators reancorados para V58 |

---

## 3. Nao Escopo

- Nenhuma alteracao em CSS de producao.
- Nenhuma alteracao em HTMLs estaticos.
- Nenhuma alteracao em SQL ou migrations Supabase.
- Nenhum secret/provider configurado.
- Nenhuma alteracao em auth, admin, profile/avatar, comentarios, avaliacoes ou notificacoes.
- Nenhuma mudanca visual intencional.

---

## 4. Metricas

| Metrica | Antes (V57) | Depois (V58) | Delta |
|---|---|---|---|
| appVersion | 57.0.0 | 58.0.0 | +1 versao funcional pequena |
| Branch principal | `kinocampus-V57.0-foundations` | `kinocampus-V58.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 42 | 43 | +V53 |
| Itens `check:structure` | 156 | 156 | preservado |
| Arquivos JS funcionais alterados | 0 | 1 | patch pontual em componente de busca mobile |
| Suites Jest | 134 | 135 | +1 suite unit direcionada |
| Testes Jest | 3054 | 3056 | +2 testes unit |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `58.0.0`, branch `kinocampus-V58.0-foundations`, status `v58 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V53.md` arquivado via `git mv`
- [x] `assets/js/features/kc-search-modal.js` usa `type="button"` nos controles internos
- [x] `assets/js/features/kc-search-modal.js` marca icones internos como decorativos
- [x] `tests/unit/kc-search-modal.test.js` cobre DOM gerado pelo modal
- [x] `docs/qa/reports/report-v58-public-a11y-mobile-search-modal-controls.md` criado
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V58
- [x] `npm test -- tests/unit/kc-search-modal.test.js` verde
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 135/135 suites, 3056/3056 testes
- [x] Zero alteracoes em CSS de producao, HTMLs estaticos, SQL, migrations, secrets e providers
