# Relatorio KinoCampus V56 - PUBLIC-A11Y Post Card Decorative Icons

**Versao:** v56.0.0
**Status:** Encerrada
**Periodo:** 2026-04-30 -> 2026-04-30
**Branch:** `kinocampus-V56.0-foundations`
**Tipo:** funcional pequeno / PUBLIC-A11Y-01

---

## 1. Objetivo

Marcar como decorativos os icones de badges, preco, verificacao e exemplo legado gerados por
`KCUtils.renderPostCard`, mantendo texto visivel/label contextual como fonte acessivel principal.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Runtime pontual | icones de badges de modulo, status, condicao e tempo recebem `aria-hidden="true"` |
| Runtime pontual | icones de preco e badge promocional recebem `aria-hidden="true"` |
| A11y | icones de verificacao e exemplo legado ficaram decorativos |
| Teste | `tests/a11y/a11y.test.js` cobre badges, preco, verificacao e exemplo legado |
| Evidencia QA | `docs/qa/reports/report-v56-public-a11y-post-card-decorative-icons.md` criado |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V51.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, guia de IA, workflow Lighthouse e validators reancorados para V56 |

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

| Metrica | Antes (V55) | Depois (V56) | Delta |
|---|---|---|---|
| appVersion | 55.0.0 | 56.0.0 | +1 versao funcional pequena |
| Branch principal | `kinocampus-V55.0-foundations` | `kinocampus-V56.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 40 | 41 | +V51 |
| Itens `check:structure` | 156 | 156 | preservado |
| Arquivos JS funcionais alterados | 1 | 1 | patch pontual no mesmo componente |
| Suites Jest | 134 | 134 | preservado |
| Testes Jest | 3050 | 3053 | +3 testes a11y |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `56.0.0`, branch `kinocampus-V56.0-foundations`, status `v56 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V51.md` arquivado via `git mv`
- [x] `assets/js/utils/kc-utils.presentation.js` marca icones decorativos com `aria-hidden="true"`
- [x] `tests/a11y/a11y.test.js` cobre badges, preco, verificacao e exemplo legado
- [x] `docs/qa/reports/report-v56-public-a11y-post-card-decorative-icons.md` criado
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V56
- [x] `npm test -- tests/a11y/a11y.test.js` verde
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 134/134 suites, 3053/3053 testes
- [x] Zero alteracoes em CSS de producao, HTMLs estaticos, SQL, migrations, secrets e providers
