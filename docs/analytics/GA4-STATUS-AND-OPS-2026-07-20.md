# GA4 / Search Console — status operacional (2026-07-21)

Documento vivo para o Yan: o que já está certo, o que o “erro” do GA significa, e como extrair o máximo de informação.

## 1. O “erro” do Google Analytics (tempo real)

Se a tela **Tempo real** mostrar algo como:

```text
Http failure response for .../realtime/.../getData: 499 OK
```

**Isso quase sempre NÃO é falha da tag do KinoCampus.**

- É um timeout/cancelamento **interno da UI do Google** (código 499), comum quando não há usuários ativos no momento.
- Confirme com:
  1. **DebugView** (com `?debug_mode=1` ou `window.KCEvents.enableDebug()` no console + consentimento de Métricas).
  2. **Relatórios → Engajamento → Eventos** (lag 5–60 min, às vezes 24–48 h para novos eventos).
  3. Admin KinoCampus → **GA4** (`/admin/ga4-dashboard.html`) se as Edge Functions estiverem configuradas.

A tag de produção é **`G-P9RKYHPB7Z`**, carregada por `assets/js/boot/kc-google-tag.js`, só em:

- host `kinocampus.com.br` / `www.kinocampus.com.br`
- **fora** de `/admin`
- com consentimento LGPD de **Métricas**

## 2. Arquitetura (como o site e o Google se falam)

| Camada | Ferramenta | O que responde |
| --- | --- | --- |
| Tag no browser | GA4 `G-P9RKYHPB7Z` | Pageviews + eventos `kc_*` e recomendados (`login`, `sign_up`, `share`, `generate_lead`) |
| Consentimento | `kc-consent.js` + Consent Mode v2 | Sem “Métricas”, nada vai para o GA |
| Eventos de produto | `kc-events.js` → `gtag('event', …)` | Login, post view, busca, cupom, chat, etc. |
| Painel admin | Edge Functions `kc-ga4-reports` / `kc-search-console-reports` | Lê Data API + Search Console sem expor secrets no front |
| Busca Google | Google Search Console (propriedade de domínio) | Cliques, impressões, CTR, posição, indexação |

## 3. Painel admin e `invalid_sa_key`

URL correta: **`/admin/ga4-dashboard.html`** (apenas administradores com `profiles.is_admin = true`).

- `/admin/ga4/dashboard.html` redireciona para o caminho certo.
- Botão **Diagnosticar** chama `POST …/kc-ga4-reports` com `{ "action": "diagnose" }` e devolve flags seguras (`sa_parse_ok`, `oauth_ok`, `data_api_ok`, `reason`) **sem** vazar chave privada.
- As Edge Functions usam o parser compartilhado `supabase/functions/_shared/google-service-account.ts`, que:
  - remove aspas/BOM de wrappers de secret;
  - aceita JSON double-encoded;
  - normaliza PEM com `\n` literal ou colapsado em uma linha;
  - retorna `reason` + `diagnostics` booleanos quando a chave falha.

### Secrets necessários (Supabase Edge)

| Secret | Valor |
| --- | --- |
| `KC_GA4_SA_KEY` | JSON completo da service account de leitura do GA4 |
| `KC_GA4_PROPERTY_ID` | `540208497` |
| `KC_SEARCH_CONSOLE_SA_KEY` | JSON completo da SA de leitura do Search Console |
| `KC_SEARCH_CONSOLE_SITE_URL` | `sc-domain:kinocampus.com.br` |

**Nunca** cole o JSON no PowerShell (`supabase secrets set KC_GA4_SA_KEY="{...}"`). Use:

```bash
npm run analytics:secrets:set -- \
  --project-ref wacyrkwhkvzwkqpolrbg \
  --ga-key ./path/ga4-sa.json \
  --ga-property 540208497 \
  --search-console-key ./path/sc-sa.json \
  --search-console-site sc-domain:kinocampus.com.br
```

### Evidência de saúde (2026-07-21)

- Secrets listados no projeto com digests presentes.
- Logs de Edge: `kc-ga4-reports` e `kc-search-console-reports` respondendo **HTTP 200** em produção.
- Security Advisor: **0** lints.
- Wrappers `public.kc_*` de analytics/busca: **SECURITY INVOKER** (implementação admin em `kc_private` DEFINER sem grant a anon/authenticated).

## 4. Eventos importantes no GA4

Veja a tabela completa em `docs/ops/google-search-console-analytics-runbook.md`.

Destaques:

- `page_view` — controlado (manual, URL sanitizada)
- `kc_post_view` — com `post_id`, opcional `module`, `content_type`
- `kc_search` — **sem** termo bruto (só `search_source` + `query_length_bucket`) por privacidade
- `kc_module_view` — landing em feed de módulo
- `login` / `sign_up` / `share` / `generate_lead` — eventos recomendados Google

### Melhoria 2026-07-20

- Fila de eventos é **reenviada** quando o usuário aceita Métricas (`flushQueue` em `kc:consentchange`).

### Melhoria 2026-07-21

- Parser robusto de service account nas Edge Functions + botão Diagnosticar no admin.
- Redirect de path legado `/admin/ga4/dashboard.html`.
- Reafirmação de grants INVOKER nas RPCs de analytics (advisors zerados).

## 5. Google Search Console

1. https://search.google.com/search-console — propriedade de domínio
2. **Desempenho → Resultados da pesquisa**
3. **Sitemaps** → `https://www.kinocampus.com.br/sitemap.xml`
4. No GA4: **Admin → Links de produto → Search Console**

Relatórios de pesquisa no GA4 têm atraso típico de **2–3 dias**.

## 6. Como maximizar insights (checklist semanal)

### No GA4

1. **Aquisição → Visão geral**
2. **Engajamento → Páginas e telas**
3. **Engajamento → Eventos** (filtrar `kc_`)
4. **Explorar → Funil** (ex.: `session_start` → `kc_post_view` → `kc_contact_click`)
5. Conversões: `sign_up`, `generate_lead`, `kc_contact_click`, `kc_post_create`, `kc_share`

### No Search Console

1. Muitas impressões / poucos cliques → título/descrição
2. Posição 8–20 → conteúdo e links internos
3. URLs “descobertas, não indexadas” → Inspeção de URL

### No Admin KinoCampus

- `/admin/ga4-dashboard.html` — visão consolidada (admin only)
- `/admin/privacy-analytics.html` — métricas internas de consentimento

## 7. O que o GA **não** captura (de propósito)

- Termo de busca digitado
- IDs de usuário brutos, chat, telefone, e-mail
- Tráfego em localhost / previews / `/admin`
- Eventos sem consentimento de Métricas

## 8. Validação rápida em produção

1. Aba anônima em `https://www.kinocampus.com.br/`
2. Aceitar **Métricas**
3. Home → oportunidades → abrir post → buscar
4. GA4 DebugView / Tempo real
5. Admin logado → `/admin/ga4-dashboard.html` → **Atualizar** e, se necessário, **Diagnosticar**

```js
KCEvents.enableDebug();
KCEvents.getQueue();
KCGoogleTag.measurementId; // "G-P9RKYHPB7Z"
```

## 9. Referências

- Runbook: `docs/ops/google-search-console-analytics-runbook.md`
- Auditoria 2026-07-14: `docs/analytics/GA4-SEARCH-CONSOLE-AUDIT-2026-07-14.md`
- Código: `kc-google-tag.js`, `kc-events.js`, `kc-ga4-reports`, `kc-search-console-reports`, `_shared/google-service-account.ts`
