# V76.48 — CI executando Playwright de fato (gate de regressão real)

**Data:** 2026-06-21
**Branch:** `codex/v76-ci-playwright`
**Escopo:** fechar a lacuna real de CI apontada na auditoria (Playwright só
executava em modo inventário `--list`, não como gate)

## Resultado

O workflow `.github/workflows/essential-validation.yml` agora **executa as 83 specs
Playwright (chromium)** em todo pull request e push para `kinocampus-V75.0-foundations`,
em vez de apenas listá-las. O `webServer` do `playwright.config.js` sobe `http-server`
na porta 4000 automaticamente, inclusive em CI (`reuseExistingServer: !process.env.CI`),
portanto a execução não depende de ambiente externo nem de secrets.

Até a V76.48, o step era `npx playwright test --list` (inventário) — enumerava as
specs sem rodá-las, então regressões E2E podiam passar despercebidas. A auditoria
interna V3 (PR #551) havia marcado a lacuna "CI sem Jest/validators" como resolvida,
mas o Playwright permanecia em modo `--list`. Esta entrega fecha essa lacuna.

## Mudanças no workflow

- **step "Install Playwright chromium":** `npx playwright install --with-deps chromium`
  instala o runtime do browser antes da execução;
- **step "Playwright E2E (chromium)":** `npx playwright test` substitui o inventário;
- **step "Upload Playwright report":** `actions/upload-artifact@v4` sobe o relatório
  HTML em `output/playwright-report` (retenção 7 dias), mesmo em falha (`if: !cancelled()`);
- **timeout-minutes:** 15 → 30 (Playwright real + instalação de browser);
- **nome do job:** "Validators, Jest and Playwright list" → "Validators, Jest and Playwright".

## Configuração de execução

O `playwright.config.js` já estava preparado para CI:
- `retries: process.env.CI ? 2 : 0` (2 retries em CI);
- `workers: process.env.CI ? 1 : undefined` (1 worker determinístico em CI);
- `forbidOnly: !!process.env.CI` (impede `.only` acidental);
- `baseURL: 'http://localhost:4000'` (local, não produção);
- `webServer` gerencia o `http-server` sozinho.

## Validação

- **Execução local:** `npx playwright test` → **83 passed (21.2s)**;
- **Jest completo:** 195 suites / 3.806 testes / 3 snapshots (inalterado);
- `check:all`: aprovado;
- CI esperado: agora executa as 83 specs em cada PR; a primeira execução em produção
  confirma o gate (registrada no merge deste PR).

## Documentação atualizada

- `docs/architecture/test-strategy.md`: descreve a execução real em vez de `--list`;
- `docs/architecture/repository-structure.md`: separa `--list` (inventário) de
  execução real e atualiza contagem (13 specs / 83 testes);
- `docs/architecture/ai-development-guide.md`: distingue inventário de execução.

## Rollback

Reverter o commit restaura `npx playwright test --list`. Não há alteração de
runtime, schema, banco, storage ou deploy — apenas do workflow de CI.
