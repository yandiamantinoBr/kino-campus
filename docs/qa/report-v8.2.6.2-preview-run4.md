# QA Preview Report - Kino Campus V8.2.6.2 - Run 4

## 1) Metadados
- Data: 2026-03-19
- Ambiente: Preview Vercel protegido por Vercel Authentication
- URL do preview: kino-campus-1a3h26jub-yannakamurabrs-projects.vercel.app
- Projeto Vercel: prj_PTFmR4f3A1aAHV5mgXa24svL8umB
- Projeto Supabase: wacyrkwhkvzwkqpolrbg
- Branch testada: kinocampus-V8.2-SANEAMENTO-QA (HEAD: cded2b4)
- Fix incluído: eef40b3 — fallback mock-user em getProfileById() (PR #139)

## 2) Resultado geral
- Status do Run 4: ( ) PRONTO PARA PROMOTE FUTURO  (X) APROVADO PARCIALMENTE — PENDENTE VALIDAÇÃO BROWSER  ( ) BLOQUEADO
- Resumo curto:
  - Deploy preview criado com sucesso com o fix de compatibilidade legada já mergeado.
  - Validação lógica via Node.js simulation: 5/5 cenários passaram (lógica do fix confirmada).
  - Browser automation (Playwright MCP) indisponível nesta sessão; preview protegido por Vercel Authentication bloqueia WebFetch.
  - Cenários de browser (5 cenários visuais) ficam PENDENTE MANUAL.
  - A lógica central está correta e testada; o patch pode ser declarado PRONTO PARA PROMOTE FUTURO após o owner confirmar os 5 cenários browser manualmente.

---

## 3) Evidências centrais

| Item | Status | Evidência | Observações |
|---|---|---|---|
| Deploy preview | PASSOU | URL: kino-campus-1a3h26jub-yannakamurabrs-projects.vercel.app | Build completou em ~24s, inject-env.js OK, driver=supabase |
| Lógica fix C1 — USER_18 retorna mock | PASSOU | validation-logic-unit-test.txt | `getProfileById('USER_18')` → `{display_name:'Pedro Henrique', verified:false, sem email}` |
| Lógica fix C2 — UUID real retorna Supabase | PASSOU | validation-logic-unit-test.txt | Supabase é tentado primeiro; fallback só ativa em miss |
| Lógica fix C4 — ID inválido retorna null | PASSOU | validation-logic-unit-test.txt | `getProfileById('LIXO_INVALIDO')` → null → "Perfil nao encontrado" |
| Contrato: verified:false para mocks | PASSOU | validation-logic-unit-test.txt | Mock users nunca ganham badge elevado |
| Contrato: email não exposto | PASSOU | validation-logic-unit-test.txt | Campo email ausente do objeto retornado |
| C1 browser — profile.html?id=USER_18 | PENDENTE MANUAL | — | Requer bypass Vercel Auth + browser real |
| C2 browser — profile.html?id=<uuid> | PENDENTE MANUAL | — | Requer UUID real do Supabase |
| C3 browser — perfil próprio autenticado | PENDENTE MANUAL | — | Requer login com conta @ufg.br |
| C5 browser — product.html?id=18 → Ver perfil | PENDENTE MANUAL | — | Fluxo completo produto→perfil legado |

---

## 4) Execução detalhada

### Pré-flight
- `git branch --show-current` = `kinocampus-V8.2-SANEAMENTO-QA` ✅
- `node --check assets/js/kc-api.client.js` OK ✅
- `node scripts/hygiene-check.js` passed (v8.2.6.2) ✅
- Fix do PR #139 confirmado em HEAD (cded2b4) ✅

### Deploy
- `npx vercel --confirm` completou em ~24s
- inject-env.js atualizou kc-env.js com SUPABASE_URL e SUPABASE_PUBLIC_KEY ✅
- Driver confirmado: `supabase` ✅
- URL gerada: `kino-campus-1a3h26jub-yannakamurabrs-projects.vercel.app`

### Validação lógica (Node.js simulation)
Simulação isolou a função `getProfileById()` com o fix aplicado, o `getAuthorById()` real do MOCK_USERS e um `KCProfiles` stub que retorna null para IDs `USER_xx` (replicando o comportamento Supabase real):

```
✅ PASSOU | C1: perfil legado USER_18
✅ PASSOU | C2: perfil moderno UUID
✅ PASSOU | C4: ID inválido
✅ PASSOU | C1b: verified sempre false para mock
✅ PASSOU | C1c: email não exposto
```

### Limitações desta rodada
- Preview protegido por Vercel Authentication retornou 401 para WebFetch (sem bypass de sessão disponível).
- Playwright MCP foi dispensado antes desta sessão; sem browser automation.
- Cenários visuais browser (C1..C5) não puderam ser capturados com screenshot.

### O que não foi executado de propósito
- Nenhum cenário destrutivo.
- Nenhuma criação de dados.
- Nenhum fluxo admin.
- Nenhuma alteração em Storage, admin banners, admin reports, comments/activities, schema, RLS, RPCs ou Edge Functions.
- Nenhum promote para produção.

### Console e ruído observado
- Ruídos já conhecidos (não bloqueadores): script Kaspersky bloqueado por CSP, vercel.live/feedback.js bloqueado por CSP.
- Nenhum ruído material novo observado no deploy.

---

## 5) Conclusão do run

- Decisão operacional desta rodada: **aprovado parcialmente — pendente validação browser manual**.
- A lógica central do fix está correta e validada via unit simulation.
- O patch 8.2.6.2 está tecnicamente pronto; a declaração formal de PRONTO PARA PROMOTE FUTURO depende da confirmação visual dos 5 cenários browser pelo owner.

### Passos para concluir a validação manual

1. Acessar o preview com bypass/share link de autenticação Vercel:
   `https://kino-campus-1a3h26jub-yannakamurabrs-projects.vercel.app`

2. Executar os 5 cenários e capturar screenshots em `output/playwright/evidence/v8.2.6.2-preview-run4/`:

| # | Ação | URL alvo | Critério |
|---|------|----------|---------|
| C1 | Navegar direto | `/profile.html?id=USER_18` | "Pedro Henrique" + avatar aparecem |
| C2 | Navegar direto | `/profile.html?id=<uuid-real-supabase>` | Perfil do usuário Supabase carrega |
| C3 | Login + navegar | `/profile.html` (com sessão ativa) | Avatar, handle, botão "Editar perfil" |
| C4 | Navegar direto | `/profile.html?id=LIXO_INVALIDO_XYZ` | Mensagem "Perfil nao encontrado" |
| C5 | Navegar + clicar | `/product.html?id=18` → "Ver perfil" | Perfil "Pedro Henrique" renderiza |

3. Se todos passarem: declarar o patch como PRONTO PARA PROMOTE FUTURO e executar `vercel --prod`.
4. Se algum falhar: abrir issue com screenshot + console error e acionar próximo prompt de correção.
