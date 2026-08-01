# Destravar produção Vercel após PR #747 (Turnstile)

## Adendo operacional - 2026-08-01

O bloqueio descrito abaixo foi provisionado sem registrar valores:

- widget Cloudflare `KinoCampus - Pedidos LGPD`, modo gerenciado, com
  `www.kinocampus.com.br` e `kinocampus.com.br`;
- `KC_TURNSTILE_SITE_KEY` em Vercel Production;
- secret, environment, hostnames e origens exatas na Edge Function;
- preflight CORS remoto 204 para a origem canônica;
- bundle temporário removido depois da transferência.

O próximo deploy de produção deve injetar a site key no frontend e ser seguido
por smoke visual do widget. Preview permanece deliberadamente sem a chave,
porque seus hostnames não pertencem à allowlist do widget de produção.

`scripts/ops/apply-turnstile-keys.ps1` foi corrigido para incluir
`KC_PRIVACY_HELP_ALLOWED_ORIGINS`, aceitar bundle temporário e adiar o deploy
até o merge normal. O switch `-DeleteCredentialBundle` remove o bundle após a
leitura quando a operação automatizada usa um arquivo efêmero.

**Data:** 2026-07-31 (atualizado após deploy das edges DSR/export/guest)  
**Sintoma (histórico):** deploys `target=production` em `ERROR` com  
`TURNSTILE_SITE_KEY_REQUIRED` enquanto o build **abortava** sem site key.  
**Política atual do build (2026-07-31+):** produção **pode buildar sem site key**  
(degraded). O build emite `TURNSTILE_SITE_KEY_REQUIRED` como **warning** e  
continua. O formulário LGPD **visitante** permanece fail-closed em runtime até  
existir `KC_TURNSTILE_SITE_KEY` real **e** secrets no Supabase Edge. Chaves  
oficiais de teste Cloudflare continuam **proibidas** em produção  
(`TURNSTILE_TEST_SITE_KEY_FORBIDDEN`).

### Estado verificado 2026-07-31 (ops)

| Camada | Status |
|---|---|
| Build produção (Vercel) | READY; UI privacy/FAQ/toast no `www` |
| `KC_TURNSTILE_SITE_KEY` no Vercel | **ausente** (`kc-env.js` com site key vazia) |
| Edge `kc-create-privacy-help-guest` | ACTIVE; sem body → `GUEST_PRIVACY_CONFIG_UNAVAILABLE` (503) |
| Secrets Supabase `KC_TURNSTILE_*` | **ausentes** (lista de secrets do projeto) |
| Edge `kc-data-subject-request` / export | ACTIVE (deploy 2026-07-31) — fluxo **autenticado** |
| RPC privacy help autenticada | Presente no banco de produção |

**Consequência:** visitante LGPD fail-closed (correto). Titular **logado** em  
Configurações / Help autenticado **não** depende do Turnstile.

## O que NÃO é o problema

As PRs de privacidade/UI que o Minimax/Codex trabalharam **já estão em**  
`kinocampus-V75.0-foundations` (código no Git). Em particular:

| Trabalho | PR / issue | Status no Git |
|---|---|---|
| LGPD DSR + erasure + guest Turnstile | #747 | mergeado (`d08bc14b`) |
| i18n privacy texts | #750 / tracking #755 | mergeado |
| FAQ LGPD em `ajuda.html#faq-lgpd` | #749 / tracking #757 | mergeado |
| Stash visitor payload no login | #752 / tracking #758 | mergeado |
| Matriz de cobertura de erasure | #753 / tracking #759 | mergeado |

Previews de branch (`VERCEL_ENV=preview`) **podem** ficar READY porque  
`scripts/inject-env.js` só exige site key quando o deploy é de **production**.

Por isso em `www.kinocampus.com.br` ainda **não** aparece FAQ LGPD / botões de  
privacidade: o alias de produção aponta para o último build READY (pré-#747),  
não porque o código tenha sumido do repositório.

## Causa raiz

1. O #747 tornou `KC_TURNSTILE_SITE_KEY` (ou aliases) **obrigatória** no build  
   de produção (`scripts/inject-env.js`).
2. No projeto Vercel `kino-campus` **não há** nenhuma env `*TURNSTILE*`  
   (confirmado com `vercel env ls`).
3. Também **não** há a chave no `.env` local nem em `.env.vercel.pull`.
4. Sem a env, **todo** push na branch de produção falha em ~6–10s no  
   `buildCommand = node scripts/inject-env.js`.

Isso é fail-closed **correto** para o formulário visitante de LGPD (Turnstile).  
O gap é de **ops**: mergeou-se o código sem provisionar a env.

## Destravar (ordem segura)

### A) Site key pública (Vercel build)

1. Cloudflare Dashboard → **Turnstile** → widget de  
   `www.kinocampus.com.br` / `kinocampus.com.br` → copiar **Site Key**  
   (começa com `0x4AAAA…`, ~40+ chars).
2. No projeto Vercel:

```bash
cd /path/to/kino-campus
npx vercel env add KC_TURNSTILE_SITE_KEY production
# opcional, se quiser o widget em preview:
npx vercel env add KC_TURNSTILE_SITE_KEY preview
```

3. Redeploy de produção (não use chave de teste `1x0000…` / `2x0000…` — o build  
   recusa com `TURNSTILE_TEST_SITE_KEY_FORBIDDEN`):

```bash
npx vercel --prod
# ou: git commit --allow-empty -m "chore(ops): redeploy after Turnstile env" && git push
```

### B) Secret server-side (Supabase Edge — guest form)

O frontend só precisa da **site key**. O endpoint visitante  
`kc-create-privacy-help-guest` exige no Supabase:

| Secret | Valor |
|---|---|
| `KC_TURNSTILE_SECRET_KEY` | Secret Key do mesmo widget (nunca no Vercel público) |
| `KC_TURNSTILE_ENVIRONMENT` | `production` |
| `KC_TURNSTILE_EXPECTED_HOSTNAMES` | hostnames reais, ex. `www.kinocampus.com.br,kinocampus.com.br` |

Sem B, o build de produção sobe, mas o pedido LGPD **visitante** falha closed  
em runtime (`TURNSTILE_*`). Exclusão/export **autenticados** em Configurações  
não dependem do widget visitante.

### C) Verificação pós-deploy

1. Build production = **Ready**.
2. `https://www.kinocampus.com.br/assets/js/boot/kc-env.js` contém  
   `TURNSTILE_SITE_KEY` real (não placeholder `__KC_…__` / exemplo).
3. `settings.html#settingsPrivacyData` e `ajuda.html#faq-lgpd` presentes.
4. Fluxo autenticado: baixar dados / solicitar exclusão (sem Turnstile).
5. Fluxo visitante: formulário na Central de Ajuda com widget Turnstile ok.

## O que NÃO fazer

- **Não** colocar chave oficial de teste Cloudflare em produção.
- **Não** “desligar” o check de produção em `inject-env.js` só para ver a UI:  
  reintroduz formulário guest sem prova de humanidade.
- **Não** re-mergear as PRs #749–#753: o código já está na base; o bloqueio é env.

## Relação com o Minimax

O diagnóstico do Minimax sobre `TURNSTILE_SITE_KEY_REQUIRED` está **correto**.  
A sugestão de chave dummy para “destravar visualmente” **não** deve ir a  
produção: o build proíbe chaves de teste e o produto LGPD ficaria inseguro.

As 4/5 PRs de UI/FAQ/matriz que ele citou já foram mergeadas; o que falta para  
o usuário ver o trabalho em `www` é **só** provisionar Turnstile + redeploy.

## Checklist rápido

- [ ] Site Key real no Vercel Production (`KC_TURNSTILE_SITE_KEY`)
- [ ] Secret + environment + hostnames no Supabase Edge
- [ ] Production deploy Ready
- [ ] Smoke FAQ LGPD + card Privacidade em Configurações
- [ ] Smoke guest form (Turnstile) + authenticated erasure
