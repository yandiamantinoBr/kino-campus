# Report V76 CSS-C.3 - Micro-split do atalho global de mensagens

**Data:** 2026-06-15
**Escopo:** CSS + links HTML + pre-cache do service worker; sem alterar JS runtime, SQL, provider, secrets, deploy Supabase ou `future-split/`
**Branch:** `codex/css-chat-shortcut-micro-split-v76-17`

## Decisão

O candidato `Chat overlap` não era CSS local da tela `mensagens.html`. A inspeção confirmou que os seletores `.kc-chat-shortcut*` e `.kc-chat-mobile-fab*` são usados pelo atalho global criado por `assets/js/core/kc-notifications.js` em páginas públicas e admin.

Por isso, a decisão segura foi não mover esse bloco para `kc-chat.css`, que é carregado apenas por `mensagens.html`. O bloco foi extraído para `assets/css/kc-chat-shortcut.css`, carregado nas 27 páginas que já carregavam `kc-notifications.js`.

## Alterações

| Arquivo | Alteração |
|---|---|
| `assets/css/styles.css` | remove o bloco do atalho global de mensagens |
| `assets/css/kc-chat-shortcut.css` | novo CSS dedicado ao atalho do header e FAB mobile |
| HTMLs raiz e `admin/*.html` com `kc-notifications.js` | adicionam o link para `kc-chat-shortcut.css?v=8.6.1` |
| `sw.js` | inclui o novo CSS em `SHELL_ASSETS` |
| `scripts/validate-public-routes.js` | trata o novo CSS como asset estático obrigatório |
| `scripts/audit-css-ownership.js` | marca `Chat overlap` como encerrado em CSS-C.3 |
| Docs V76/arquitetura | registram métricas, evidência e próxima etapa |

## Métricas

| Métrica | Antes CSS-C.3 | Depois CSS-C.3 |
|---|---:|---:|
| `assets/css/styles.css` | 12.089 linhas / 281.919 bytes | 12.028 linhas / 280.599 bytes |
| `assets/css/kc-chat-shortcut.css` | não existia | 60 linhas / 1.327 bytes |
| Regras parseadas em `styles.css` | 1.741 | 1.734 |
| Seletores parseados em `styles.css` | 1.962 | 1.954 |
| Bucket `Chat overlap` | 7 regras / 7 seletores / 51 linhas | 0 regras / 0 seletores / 0 linhas |
| Links para `kc-chat-shortcut.css` | 0 | 27 |

## Validação visual

Rodadas executadas:

```bash
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c3-chat-shortcut-before-2026-06-15
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c3-chat-shortcut-after-2026-06-15
node scripts/capture-css-visual-baseline.js --out output/playwright/css-baseline/v76-css-c3-chat-shortcut-repeat-2026-06-15
```

Resultado das três rodadas:

- 24 screenshots por rodada.
- 0 respostas falhas.
- 0 overflow horizontal.
- 0 carregamentos de `future-split/`.
- 0 diferenças de hash entre antes/depois.
- 0 diferenças de hash entre depois/repetição.

## Validação no navegador interno

Rotas verificadas em `http://127.0.0.1:4177`:

| Rota | Evidência |
|---|---|
| `/index.html` | carrega `kc-chat-shortcut.css`, mantém `.kc-chat-shortcut`, `.kc-chat-mobile-fab` e badge; `position: relative` aplicado ao atalho |
| `/mensagens.html` | carrega `kc-chat-shortcut.css` e `kc-chat.css`; mantém atalho global e CSS dedicado da página de conversa |

## Validação técnica

Comandos executados durante a etapa:

```bash
git diff --check
npm run audit:css
npm run check:all
```

Resultados relevantes:

- `git diff --check`: sem erro bloqueante; apenas avisos esperados de conversão LF/CRLF em arquivos HTML/CSS/JS/MD.
- `Chat overlap`: 0 regras / 0 seletores / 0 linhas.
- `styles.css`: 12.028 linhas / 280.599 bytes.
- `kc-chat-shortcut.css`: 60 linhas / 1.327 bytes.
- `kc-chat-shortcut.css`: `8.6.1 x27` no mapa de links.
- `npm run check:all`: 175 suites Jest, 3.578 testes e 3 snapshots aprovados, além dos validadores estruturais/de rotas/higiene.

## Rollback

1. Remover os links `assets/css/kc-chat-shortcut.css?v=8.6.1` dos 27 HTMLs.
2. Remover `assets/css/kc-chat-shortcut.css`.
3. Recolocar o bloco `.kc-chat-shortcut*` / `.kc-chat-mobile-fab*` em `assets/css/styles.css`.
4. Remover o asset de `sw.js`, `validate-public-routes.js` e atualizar `audit-css-ownership.js`.

## Próxima etapa

Não iniciar split amplo de `styles.css`. Próxima frente recomendada: CSS-B autenticado para dashboard admin real, ou micro-split pequeno de `Public shell/profile/legal overlap` somente com carregamento por rota fechado.
