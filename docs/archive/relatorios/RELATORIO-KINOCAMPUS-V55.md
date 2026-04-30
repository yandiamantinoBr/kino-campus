# Relatorio KinoCampus V55 - PUBLIC-A11Y Post Card Rating

**Versao:** v55.0.0
**Status:** Encerrada
**Periodo:** 2026-04-30 -> 2026-04-30
**Branch:** `kinocampus-V55.0-foundations`
**Tipo:** funcional pequeno / PUBLIC-A11Y-01

---

## 1. Objetivo

Corrigir a semantica acessivel do badge de avaliacao renderizado por `KCUtils.renderPostCard`,
mantendo filescope pequeno, rollback simples e cobertura Jest direcionada.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Runtime pontual | `.kc-card__rating` agora recebe `aria-label` com media e total de avaliacoes |
| A11y | icone `fa-star` do badge de avaliacao ficou decorativo com `aria-hidden="true"` |
| Robustez textual | `title` do badge foi normalizado para texto ASCII consistente com o nome acessivel |
| Teste | `tests/a11y/a11y.test.js` cobre nome acessivel e icone decorativo da avaliacao |
| Evidencia QA | `docs/qa/reports/report-v55-public-a11y-post-card-rating.md` criado |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V50.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, guia de IA, workflow Lighthouse e validators reancorados para V55 |

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

| Metrica | Antes (V54) | Depois (V55) | Delta |
|---|---|---|---|
| appVersion | 54.0.0 | 55.0.0 | +1 versao funcional pequena |
| Branch principal | `kinocampus-V54.0-foundations` | `kinocampus-V55.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 39 | 40 | +V50 |
| Itens `check:structure` | 156 | 156 | preservado |
| Arquivos JS funcionais alterados | 1 | 1 | patch pontual no mesmo componente |
| Suites Jest | 134 | 134 | preservado |
| Testes Jest | 3048 | 3050 | +2 testes a11y |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `55.0.0`, branch `kinocampus-V55.0-foundations`, status `v55 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V50.md` arquivado via `git mv`
- [x] `assets/js/utils/kc-utils.presentation.js` corrigido para aria-label de avaliacao
- [x] `tests/a11y/a11y.test.js` cobre nome acessivel e icone decorativo
- [x] `docs/qa/reports/report-v55-public-a11y-post-card-rating.md` criado
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V55
- [x] `npm test -- tests/a11y/a11y.test.js` verde
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 134/134 suites, 3050/3050 testes
- [x] Zero alteracoes em CSS de producao, HTMLs estaticos, SQL, migrations, secrets e providers
