# QA Preview Report - Kino Campus V8.2.6.2 - Run 3

## 1) Metadados
- Data: 2026-03-19
- Ambiente: Preview Vercel protegido por Vercel Authentication
- URL do preview: [kino-campus-iwq4vybz1-yannakamurabrs-projects.vercel.app](https://kino-campus-iwq4vybz1-yannakamurabrs-projects.vercel.app)
- Deploy validado: `dpl_7W81HB8jXz179fz94GpfXyUUVnLJ`
- Projeto Vercel: `prj_PTFmR4f3A1aAHV5mgXa24svL8umB`
- Projeto Supabase: `wacyrkwhkvzwkqpolrbg`
- Branch testada: `codex/phase4-auth-preview-final-gate`
- Base canônica: `kinocampus-V8.2-SANEAMENTO-QA`
- Navegador: Playwright MCP em Chromium compatível

## 2) Resultado geral
- Status do Run 3: ( ) PRONTO PARA PROMOTE FUTURO  (X) APROVADO APENAS PARA PREVIEW  ( ) BLOQUEADO
- Resumo curto:
  - O login com conta comum real passou no preview protegido.
  - O shell autenticado e o perfil próprio carregaram corretamente.
  - O fluxo testado não reintroduziu dependência pública de `profile.email`.
  - Surgiu uma incompatibilidade legada em perfil público de autor com `author_id` no formato `USER_18`, então o patch ainda não deve ser tratado como pronto para promote futuro.

---

## 3) Evidências centrais
| Item | Status | Evidência | Observações |
|---|---|---|---|
| Login com conta comum real | PASSOU | Fluxo autenticado em browser real | Sessão autenticada abriu sem precisar de signup, reset ou bootstrap. |
| Shell autenticado | PASSOU | [authenticated-home.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.6.2-preview-run3/authenticated-home.png) | Header autenticado apareceu com usuário logado e CTA `Criar Publicação` habilitado. |
| Perfil próprio autenticado | PASSOU | [profile-own-authenticated.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.6.2-preview-run3/profile-own-authenticated.png) | Perfil abriu com avatar, handle, bio, contadores e ação `Editar perfil`, sem expor email. |
| Prova de contrato sem `profile.email` público | PASSOU | Observação do fluxo autenticado | Home, modal/auth shell e perfil próprio funcionaram sem depender de `profiles.email` como contrato público. |
| Navegação autenticada simples | PASSOU | Perfil próprio -> detalhe de publicação | O fluxo autenticado permaneceu estável ao navegar do perfil para um produto. |
| Perfil público de autor legado (`USER_18`) | FALHOU | [public-profile-legacy-user-not-found.png](/C:/Users/yan1n/Documents/GitHub/kino-campus/output/playwright/evidence/v8.2.6.2-preview-run3/public-profile-legacy-user-not-found.png) | O produto `id=18` abriu, mas `Ver perfil` levou a `profile.html?id=USER_18` e terminou em `Perfil nao encontrado.` |

---

## 4) Execução detalhada
### Pré-flight
- `git status --short` limpo.
- `node scripts/hygiene-check.js` passou para `8.2.6.2`.
- `git diff --check` passou sem erro estrutural antes da rodada.

### Gate autenticado
- O preview protegido foi reutilizado sem redeploy.
- O bypass operacional do preview continuou funcional.
- O login com conta comum real passou no modal de autenticação do preview.
- Após o login:
  - o header autenticado apareceu corretamente;
  - o shell carregou sem regressão visual relevante;
  - o perfil próprio abriu normalmente.

### Prova de contrato
- O perfil autenticado próprio carregou sem expor email na UI.
- Não houve evidência de reintrodução de dependência pública de `profiles.email` no fluxo autenticado validado.
- A sessão autenticada operou pelo contexto normal de usuário logado.

### Incompatibilidade legada encontrada
- Ao navegar do perfil próprio para uma publicação e, dali, para o perfil público do autor de um item legado (`product.html?id=18`), o fluxo gerou:
  - `profile.html?id=USER_18`
  - mensagem final `Perfil nao encontrado.`
- Evidência técnica observada no console:
  - `GET /rest/v1/profiles?...&id=eq.USER_18 => 400`
- Interpretação operacional:
  - o problema observado está ligado a compatibilidade de `author_id` legado no formato `USER_xx`;
  - não há evidência de que isso tenha sido causado pelo patch `8.2.6.2` de higiene/contrato de email;
  - mesmo assim, como o comportamento é visível no preview atual, o patch não deve ser marcado como pronto para promote futuro sem triagem explícita desse gap legado.

### O que não foi executado de propósito
- Nenhum cenário destrutivo.
- Nenhuma criação de dados.
- Nenhum fluxo admin.
- Nenhuma alteração em Storage cleanup, admin banners, admin reports, comments/activities do perfil, schema, RLS, RPCs ou Edge Functions.

### Console e ruído observado
- Ruídos já conhecidos e não bloqueadores:
  - script externo da Kaspersky bloqueado pela CSP;
  - `https://vercel.live/_next-live/feedback/feedback.js` bloqueado pela CSP;
- Ruído material desta rodada:
  - `profiles?id=eq.USER_18` retornando `400` ao abrir perfil público de autor legado.

---

## 5) Conclusão do run
- Decisão operacional desta rodada: aprovado apenas para preview.
- O patch `8.2.6.2` passou no gate autenticado mínimo para login, shell autenticado e perfil próprio.
- O patch não está pronto para promote futuro neste momento por causa da incompatibilidade legada observada no fluxo de perfil público de autor `USER_18`.
- Próximo passo recomendado:
  - abrir uma frente pequena e isolada de compatibilidade legado->perfil público antes de qualquer promote futuro desse patch.
