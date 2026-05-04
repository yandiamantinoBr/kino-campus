# Relatorio KinoCampus V61 - PUBLIC-A11Y Dynamic Button Types

**Versao:** v61.0.0
**Status:** Encerrada
**Periodo:** 2026-04-30 -> 2026-04-30
**Branch:** `kinocampus-V61.0-foundations`
**Tipo:** funcional pequeno / PUBLIC-A11Y-01

---

## 1. Objetivo

Normalizar a semantica de botoes dinamicos remanescentes gerados por JavaScript, evitando
`type` implicito de submit em controles de voto, convite e moderacao sem alterar layout,
contratos de dados ou comportamento visual intencional.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Runtime pontual | botoes de voto positivo/negativo em `renderPostCard` recebem `type="button"` |
| Admin convites | botao dinamico de revogar convite recebe `type="button"` |
| Admin moderacao | botoes dinamicos de acao e remocao de limite recebem `type="button"` |
| Teste a11y | `tests/a11y/a11y.test.js` cobre renderizacao publica e templates admin |
| Evidencia QA | `docs/qa/reports/report-v61-public-a11y-dynamic-button-types.md` criado |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V56.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, guia de IA, workflow Lighthouse e validators reancorados para V61 |

---

## 3. Nao Escopo

- Nenhuma alteracao em CSS de producao.
- Nenhuma alteracao em HTMLs estaticos.
- Nenhuma alteracao em SQL ou migrations Supabase.
- Nenhum secret/provider configurado.
- Nenhuma alteracao em auth, profile/avatar, notificacoes, busca, storage ou RLS.
- Nenhuma mudanca visual intencional.

---

## 4. Metricas

| Metrica | Antes (V60) | Depois (V61) | Delta |
|---|---|---|---|
| appVersion | 60.0.0 | 61.0.0 | +1 versao funcional pequena |
| Branch principal | `kinocampus-V60.0-foundations` | `kinocampus-V61.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 45 | 46 | +V56 |
| Itens `check:structure` | 156 | 156 | preservado |
| Arquivos JS funcionais alterados | 1 | 3 | patch pontual em botoes dinamicos |
| Suites Jest | 135 | 135 | preservado |
| Testes Jest | 3060 | 3062 | +2 testes a11y |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `61.0.0`, branch `kinocampus-V61.0-foundations`, status `v61 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V56.md` arquivado via `git mv`
- [x] `assets/js/utils/kc-utils.presentation.js` adiciona `type="button"` aos botoes de voto do card
- [x] `assets/js/controllers/admin/admin-invite.controller.js` adiciona `type="button"` ao botao de revogar convite
- [x] `assets/js/controllers/admin/admin-moderation.controller.js` adiciona `type="button"` aos botoes dinamicos de moderacao cobertos
- [x] `tests/a11y/a11y.test.js` cobre botoes publicos e templates admin
- [x] `docs/qa/reports/report-v61-public-a11y-dynamic-button-types.md` criado
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V61
- [x] `npm test -- tests/a11y/a11y.test.js` verde
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 135/135 suites, 3062/3062 testes
- [x] Zero alteracoes em CSS de producao, HTMLs estaticos, SQL, migrations, secrets e providers
