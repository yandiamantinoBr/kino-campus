# Relatorio KinoCampus V66 - PUBLIC-A11Y Admin Banners Decorative Icons

**Versao:** v66.0.0
**Status:** Encerrada
**Periodo:** 2026-05-02 -> 2026-05-02
**Branch:** `kinocampus-V66.0-foundations`
**Tipo:** funcional pequeno / PUBLIC-A11Y-01

---

## 1. Objetivo

Marcar como decorativos os icones dinamicos em banners admin (drag handle, botoes de
editar, ativar/desativar, excluir, titulo do historico de alteracoes, spinner do estado
`Salvando...` e icone do botao `Salvar`), evitando redundancia com `title` e textos
visiveis adjacentes ja providos para tecnologias assistivas.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Admin banners | icones `fa-grip-vertical`, `fa-pen`, `fa-eye`/`fa-eye-slash`, `fa-trash`, `fa-clock-rotate-left`, `fa-spinner` e `fa-floppy-disk` recebem `aria-hidden="true"` |
| Teste a11y | `tests/a11y/a11y.test.js` cobre o template admin de banners |
| Evidencia QA | `docs/qa/reports/report-v66-public-a11y-admin-banner-icons.md` criado |
| Branches git | `kinocampus-V65.0-foundations` criada a partir de `c43978f`, definida como default no GitHub; `kinocampus-V66.0-foundations` derivada |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V61.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, validators, teste de contrato e workflow Lighthouse reancorados para V66 |

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

| Metrica | Antes (V65) | Depois (V66) | Delta |
|---|---|---|---|
| appVersion | 65.0.0 | 66.0.0 | +1 versao funcional pequena |
| Branch principal | `kinocampus-V65.0-foundations` | `kinocampus-V66.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 50 | 51 | +V61 |
| Itens `check:structure` | 156 | 156 | preservado (V61 substituido por V66 na lista) |
| Arquivos JS funcionais alterados | 1 | 1 | patch pontual em banners admin |
| Suites Jest | 135 | 135 | preservado |
| Testes Jest | 3066 | 3067 | +1 teste a11y |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `66.0.0`, branch `kinocampus-V66.0-foundations`, status `v66 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V61.md` arquivado via `git mv`
- [x] `assets/js/controllers/admin/admin-banners.controller.js` marca os 7 icones decorativos
- [x] `tests/a11y/a11y.test.js` cobre os icones dinamicos do template admin de banners
- [x] `docs/qa/reports/report-v66-public-a11y-admin-banner-icons.md` criado
- [x] README, validators, teste de contrato e workflow Lighthouse alinhados a V66
- [x] `npm test -- tests/a11y/a11y.test.js` verde (42/42)
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 135/135 suites, 3067/3067 testes
- [x] Zero alteracoes em CSS de producao, HTMLs estaticos, SQL, migrations, secrets e providers
