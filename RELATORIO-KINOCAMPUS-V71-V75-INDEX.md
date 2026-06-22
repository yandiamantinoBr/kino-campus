# Índice de Releases — KinoCampus V71 a V75

> **Janela de releases consolidadas:** V71 a V75 (2026-05-05 a 2026-05-21).
> Cada release abaixo pertence a série **PUBLIC-A11Y-01** (adição de `aria-hidden="true"` em ícones FontAwesome decorativos residuais que já possuem texto adjacente ou `aria-label` no elemento pai).
>
> **Estado operacional atual:** `VERSION.json` (`appVersion=75.1.0`, `frontendRuntimeVersion=8.6.1`, status=`v75.1 performance phase 1`).
> O conteúdo abaixo é histórico — consultar `CHANGELOG.md` e `docs/qa/reports/` para evidências.

---

## Releases

| Release | Data | Foco | Patch | Testes | Relatório | QA Report |
|---|---|---|---|---|---|---|
| **V71** | 2026-05-05 | PUBLIC-A11Y-01 — `admin-dashboard.charts.js` (11 ícones FontAwesome decorativos em tabela de pontuação, ranking e avatares) | `assets/js/controllers/admin/admin-dashboard.charts.js` (11 ocorrências) | `tests/a11y/a11y.test.js` bloco v71.0.0 (11 asserções) | [RELATORIO-KINOCAMPUS-V71.md](../../RELATORIO-KINOCAMPUS-V71.md) | [report-v71-public-a11y-admin-dashboard-charts-icons.md](../qa/reports/report-v71-public-a11y-admin-dashboard-charts-icons.md) |
| **V72** | 2026-05-05 | PUBLIC-A11Y-01 — `admin-dashboard.controller.js` (14 ícones em seções de Moderacao, Atividade, Comunidade, Tendencias, Audit log, Pulso diario, Top modulos) | `assets/js/controllers/admin/admin-dashboard.controller.js` (14 ocorrências) | `tests/a11y/a11y.test.js` bloco v72.0.0 (9 asserções) | [RELATORIO-KINOCAMPUS-V72.md](../../RELATORIO-KINOCAMPUS-V72.md) | [report-v72-public-a11y-admin-dashboard-controller-icons.md](../qa/reports/report-v72-public-a11y-admin-dashboard-controller-icons.md) |
| **V73** | 2026-05-05 | PUBLIC-A11Y-01 — `kc-comments.js` (9 ícones residuais em reply, modal de denúncia, salvar/cancelar edição) | `assets/js/features/kc-comments.js` (9 ocorrências) | `tests/a11y/a11y.test.js` bloco v73.0.0 (8 asserções) | [RELATORIO-KINOCAMPUS-V73.md](../../RELATORIO-KINOCAMPUS-V73.md) | [report-v73-public-a11y-kc-comments-icons.md](../qa/reports/report-v73-public-a11y-kc-comments-icons.md) |
| **V74** | 2026-05-05 | PUBLIC-A11Y-01 — `admin-reports.controller.js` (18 ícones em ações Ver, Fechar, Ocultar, Deletar, Restaurar, "carregar mais") | `assets/js/controllers/admin/admin-reports.controller.js` (18 ocorrências) | `tests/a11y/a11y.test.js` bloco v74.0.0 (10 asserções) | [RELATORIO-KINOCAMPUS-V74.md](../../RELATORIO-KINOCAMPUS-V74.md) | [report-v74-public-a11y-admin-reports-icons.md](../qa/reports/report-v74-public-a11y-admin-reports-icons.md) |
| **V75** | 2026-05-05 | PUBLIC-A11Y-01 — `kc-ranking.js` (18 ícones em placeholders, modal de explicação, tabela de pontuação, estados de carregamento) | `assets/js/features/kc-ranking.js` (18 ocorrências) | `tests/a11y/a11y.test.js` bloco v75.0.0 (12 asserções) | [RELATORIO-KINOCAMPUS-V75.md](../../RELATORIO-KINOCAMPUS-V75.md) | [report-v75-public-a11y-kc-ranking-icons.md](../qa/reports/report-v75-public-a11y-kc-ranking-icons.md) |

---

## Estatísticas agregadas (V71-V75)

| Métrica | Valor |
|---|---|
| Total de ícones decorativos cobertos | **70** |
| Total de asserções Jest adicionadas | **50** (+43 → +51 ao longo da janela) |
| Suites de teste a11y | 1 (`tests/a11y/a11y.test.js`) |
| Suites Jest totais (até V75) | 135/135 ✅ |
| Testes Jest totais (até V75) | 3076/3076 ✅ |
| Patches em arquivos de produção | 5 (`admin-dashboard.charts.js`, `admin-dashboard.controller.js`, `kc-comments.js`, `admin-reports.controller.js`, `kc-ranking.js`) |
| Migrations SQL | 0 (apenas metadados em `VERSION.json` + scripts de validator) |
| Alterações em CSS/HTML estático/SQL/secrets/providers | **0** (escopo estritamente JS + metadados) |

---

## Convenção de nomenclatura (esta janela)

- Cada release incrementa `appVersion` em V+1 (V71 → 72.0.0, V72 → 73.0.0, ..., V75 → 75.0.0)
- Cada release move a `CANONICAL_BRANCH` para `kinocampus-V<N>-foundations`
- A cada release, o relatório da release anterior (V+1) é arquivado via `git mv` para `docs/archive/relatorios/RELATORIO-KINOCAMPUS-V<N>.md`
- A janela de relatórios na raiz segue `V(N-4) a V(N)` (ex.: V75 está na raiz com V71-V74)
- `README.md`, `CHANGELOG.md`, `docs/index.md`, `docs/architecture/ai-development-guide.md`, `docs/architecture/repository-structure.md` e `scripts/hygiene-check.js` são sincronizados a cada release
- Workflows GitHub Actions: `.github/workflows/lighthouse-ci.yml` referencia a branch canônica

---

## Próxima janela (referência)

V76+ segue o padrão de [docs/planning/](../planning/_INDEX.md), com decomposição de monolitos
(`kc-api.client.js`, `styles.css`), busca personalizada e personalização.
Os arquivos `v76-*.md` em `docs/planning/` documentam o estado-planejamento; releases V76+ só
entram na raiz quando há `git tag` publicado.