# GA4 / Search Console — status operacional (2026-07-20)

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

## 3. Eventos importantes no GA4

Veja a tabela completa em `docs/ops/google-search-console-analytics-runbook.md`.

Destaques:

- `page_view` — controlado (manual, URL sanitizada)
- `kc_post_view` — com `post_id`, opcional `module`, `content_type`
- `kc_search` — **sem** termo bruto (só `search_source` + `query_length_bucket`) por privacidade
- `kc_module_view` — landing em feed de módulo (eventos, oportunidades, …)
- `login` / `sign_up` / `share` / `generate_lead` — eventos recomendados Google (em paralelo aos `kc_*`)

### Melhoria 2026-07-20

- Fila de eventos agora é **reenviada** quando o usuário aceita Métricas (`flushQueue` em `kc:consentchange`). Antes, cliques/buscas feitos antes do consentimento podiam se perder.

## 4. Google Search Console (cliques no Google)

Isso é **outra ferramenta**, ligada mas distinta do Analytics:

1. Abra https://search.google.com/search-console
2. Propriedade de domínio do KinoCampus (ideal: `kinocampus.com.br`)
3. **Desempenho → Resultados da pesquisa** = cliques, impressões, CTR, posição
4. **Sitemaps** → confirme `https://www.kinocampus.com.br/sitemap.xml`
5. **Indexação → Páginas** → o que o Google indexou / excluiu
6. No GA4: **Admin → Links de produto → Search Console** (já auditado como vinculado em 2026-07-14)

Relatórios de pesquisa no GA4 aparecem com atraso típico de **2–3 dias**.

## 5. Como maximizar insights (checklist semanal)

### No GA4

1. **Aquisição → Visão geral da aquisição** — de onde vem o tráfego
2. **Engajamento → Páginas e telas** — o que as pessoas abrem
3. **Engajamento → Eventos** — filtrar `kc_`
4. **Explorar → Exploração de funil** — ex.: `session_start` → `kc_post_view` → `kc_contact_click`
5. Marcar como **conversões/eventos principais**: `sign_up`, `generate_lead`, `kc_contact_click`, `kc_post_create`, `kc_share` (vários já marcados na auditoria)

### No Search Console

1. Consultas com muitas impressões e poucos cliques → melhorar título/descrição da página
2. Páginas na posição 8–20 → reforçar conteúdo e links internos
3. URLs importantes “descobertas, não indexadas” → Inspeção de URL + solicitar indexação

### No Admin KinoCampus

- `/admin/ga4-dashboard.html` — visão consolidada (requer secrets de service account no Supabase)
- `/admin/privacy-analytics.html` — consentimento e métricas internas (não substitui o GA)

## 6. O que o GA **não** captura (de propósito)

- Termo de busca digitado (PII / alta cardinalidade)
- IDs de usuário brutos, chat, telefone, e-mail
- Tráfego em `localhost` / previews / `/admin`
- Qualquer evento sem consentimento de Métricas

Isso é correto para LGPD e para qualidade dos relatórios.

## 7. Validação rápida em produção

1. Abra `https://www.kinocampus.com.br/` em aba anônima
2. Aceite **Métricas** no banner
3. Navegue: home → oportunidades → abrir um post → buscar algo
4. GA4 → **Admin → DebugView** (ou Tempo real)
5. Confirme: `page_view`, `kc_module_view` (em feeds), `kc_post_view`, `kc_search`

No console (opcional):

```js
KCEvents.enableDebug();
KCEvents.getQueue(); // deve esvaziar após consentimento
KCGoogleTag.measurementId; // "G-P9RKYHPB7Z"
```

## 8. Referências internas

- Runbook: `docs/ops/google-search-console-analytics-runbook.md`
- Auditoria 2026-07-14: `docs/analytics/GA4-SEARCH-CONSOLE-AUDIT-2026-07-14.md`
- Código: `assets/js/boot/kc-google-tag.js`, `assets/js/boot/kc-events.js`
