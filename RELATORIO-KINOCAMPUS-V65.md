# Relatorio KinoCampus V65 - PUBLIC-A11Y Admin Help Request Decorative Icons

**Versao:** v65.0.0
**Status:** Encerrada
**Periodo:** 2026-05-01 -> 2026-05-01
**Branch:** `kinocampus-V65.0-foundations`
**Tipo:** funcional pequeno / PUBLIC-A11Y-01

---

## 1. Objetivo

Marcar como decorativos os icones dinamicos em pedidos de ajuda admin (chips de modulo,
impacto, pagina, status, prioridade e tipo, alem do botao `Salvar triagem` e do estado
`Salvando...`), evitando redundancia com os textos visiveis adjacentes.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Admin help requests | icones `fa-layer-group`, `fa-signal`, `fa-file-code`, `fa-circle`, `fa-bolt`, `fa-floppy-disk` e `fa-spinner` recebem `aria-hidden="true"` |
| Teste a11y | `tests/a11y/a11y.test.js` cobre o template admin de pedidos de ajuda |
| Evidencia QA | `docs/qa/reports/report-v65-public-a11y-admin-help-request-icons.md` criado |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V60.md` movido via `git mv` para `docs/archive/relatorios/` |
| Estrutura | `tests/fixtures/.gitkeep` criado para destravar `check:structure` |
| Metadados | `VERSION.json`, README, validators e teste de contrato reancorados para V65 |

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

| Metrica | Antes (V64) | Depois (V65) | Delta |
|---|---|---|---|
| appVersion | 64.0.0 | 65.0.0 | +1 versao funcional pequena |
| Branch principal | `kinocampus-V64.0-foundations` | `kinocampus-V65.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 49 | 50 | +V60 |
| Itens `check:structure` | 156 | 156 | preservado (V60 substituido por V65 na lista) |
| Arquivos JS funcionais alterados | 1 | 1 | patch pontual em pedidos de ajuda admin |
| Suites Jest | 135 | 135 | preservado |
| Testes Jest | 3065 | 3066 | +1 teste a11y |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `65.0.0`, branch `kinocampus-V65.0-foundations`, status `v65 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V60.md` arquivado via `git mv`
- [x] `assets/js/controllers/admin/admin-help-requests.controller.js` marca icones de chips e feedback como decorativos
- [x] `tests/a11y/a11y.test.js` cobre os icones dinamicos do template admin de pedidos de ajuda
- [x] `docs/qa/reports/report-v65-public-a11y-admin-help-request-icons.md` criado
- [x] README, validators e teste de contrato alinhados a V65
- [x] `npm test -- tests/a11y/a11y.test.js` verde (41/41)
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 135/135 suites, 3066/3066 testes
- [x] Zero alteracoes em CSS de producao, HTMLs estaticos, SQL, migrations, secrets e providers
