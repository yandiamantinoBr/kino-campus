# QA Preview Report - Kino Campus V8.2.6.2 - Run 1

## 1) Metadados
- Data: 2026-03-19
- Ambiente: Preview Vercel protegido por Vercel Authentication
- URL do preview: [kino-campus-iwq4vybz1-yannakamurabrs-projects.vercel.app](https://kino-campus-iwq4vybz1-yannakamurabrs-projects.vercel.app)
- Projeto Vercel: `prj_PTFmR4f3A1aAHV5mgXa24svL8umB`
- Projeto Supabase: `wacyrkwhkvzwkqpolrbg`
- Branch validada: `codex/phase4-preview-contract-invariants`
- Base canônica: `kinocampus-V8.2-SANEAMENTO-QA`
- Build preview observado: `node scripts/inject-env.js` com `SUPABASE_URL` injetada e `driver = supabase`
- Navegador: Playwright MCP em Chromium compatível

## 2) Resultado geral
- Status do preview run: (X) APROVADO PARA PREVIEW  ( ) BLOQUEADO  ( ) PRONTO PARA PROMOTE FUTURO
- Resumo curto:
  - O patch técnico `8.2.6.2` foi publicado com sucesso em preview real.
  - Os assets alterados na Fase 3 foram confirmados no deploy publicado.
  - O smoke público passou em home, `auth-callback.html`, `create-post.html` e `search-results.html`.
  - O gate autenticado não foi executado nesta rodada por ausência de credenciais reais no contexto do agente.

---

## 3) Evidências centrais
| Item | Status | Evidência | Observações |
|---|---|---|---|
| Build preview com env injection | PASSOU | Saída do `npx vercel deploy -y` | `kc-env.js` recebeu `SUPABASE_URL`, chave pública e `driver = supabase`. |
| Home pública no preview | PASSOU | [home-preview.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.6.2-preview-run1/home-preview.png) | Home abriu com título `KinoCampus - Comunidade UFG`. |
| Auth callback no preview | PASSOU | [auth-callback-preview.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.6.2-preview-run1/auth-callback-preview.png) | Shell carregou sem regressão de boot/theme; sem token de confirmação válido, a tela caiu corretamente no estado de link inválido. |
| Create post shell/modal público | PASSOU | [create-post-preview.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.6.2-preview-run1/create-post-preview.png) | `kc-theme-boot.css` e `kc-theme-boot.js` publicados e modal abriu sem regressão visual óbvia. |
| Search results público | PASSOU | [search-results-preview.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.6.2-preview-run1/search-results-preview.png) | Página abriu com o boot correto e retornou resultado de busca. |
| Asset `kc-env.js` publicado | PASSOU | Validação via `vercel curl` | Versão `8.2.6.2` e `SUPABASE_URL` injetada confirmadas no deploy publicado. |
| Gate autenticado | BLOQUEADO | Não executado | Sem credenciais reais, a rodada não tentou signup nem bootstrap. |

---

## 4) Execução detalhada
### Pré-flight local
- `node scripts/hygiene-check.js` passou para `8.2.6.2`.
- `git diff --check` passou sem erro estrutural.
- O worktree estava limpo antes do deploy.

### Deploy preview
- Deploy executado com:
  - `npx vercel deploy -y`
- Preview resultante:
  - [kino-campus-iwq4vybz1-yannakamurabrs-projects.vercel.app](https://kino-campus-iwq4vybz1-yannakamurabrs-projects.vercel.app)
- O preview ficou protegido por Vercel Authentication.

### Validação do preview protegido
- O MCP do Vercel continuou indisponível para listagem por `Auth required`, então a validação operacional usou o Vercel CLI autenticado.
- O comando `vercel curl` gerou automaticamente um protection bypass token para o projeto.
- Em Windows, foi necessário acrescentar `-- --ssl-no-revoke` ao `vercel curl` para contornar o erro `CRYPT_E_NO_REVOCATION_CHECK` do `curl`/Schannel.
- Com isso, foi possível confirmar:
  - `assets/js/kc-env.js` publicado com `8.2.6.2`
  - `auth-callback.html` com `kc-theme-boot.css` e `kc-theme-boot.js`
  - `create-post.html` com `kc-theme-boot.css` e `kc-theme-boot.js`
  - `search-results.html` com `kc-theme-boot.css` e `kc-theme-boot.js`

### Smoke público em browser real
- Home pública abriu normalmente no preview.
- `auth-callback.html` abriu normalmente e, sem token de confirmação válido, mostrou o estado esperado de link inválido sem quebrar boot/theme.
- `create-post.html` abriu com o shell público e o modal de nova publicação.
- `search-results.html?q=teste` abriu normalmente e retornou resultado renderizado.

### Console e ruído observado
- Ruído conhecido e não bloqueador:
  - script externo da Kaspersky bloqueado pela CSP
  - `favicon.ico` `404`
- Ruído novo, restrito ao preview:
  - `https://vercel.live/_next-live/feedback/feedback.js` bloqueado pela CSP de `script-src-elem`
- Esse bloqueio do `vercel.live` não impediu boot, navegação pública nem carregamento dos assets validados nesta rodada.

---

## 5) Conclusão do run
- Decisão operacional desta rodada: aprovado para preview.
- O patch `8.2.6.2` está comprovado em preview para o escopo público e de deploy invariants.
- O patch ainda não está pronto para promote futuro porque falta a rodada autenticada com credenciais reais.
- Nenhum fix anterior foi reaberto nesta fase.
