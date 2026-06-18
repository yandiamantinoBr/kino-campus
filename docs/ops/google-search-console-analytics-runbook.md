# Google Search Console, GA4 e visibilidade do KinoCampus

Este runbook orienta como acompanhar indexação, tráfego orgânico, comportamento dos usuários e oportunidades de melhoria de SEO/IA no KinoCampus.

Para o gate conjunto de deploy, inspeção de URLs e solicitação de revisão no
AdSense, use também `docs/ops/adsense-search-console-readiness-runbook.md`.

## Decisão técnica

- O site usa Google Analytics 4 com a tag `G-P9RKYHPB7Z`.
- A tag é carregada por `assets/js/boot/kc-google-tag.js`, integrada ao consentimento LGPD do KinoCampus.
- O frontend não deve guardar token OAuth, refresh token, service account ou segredo Google.
- OAuth 2.0 Playground serve para teste manual de APIs. Não é um mecanismo de produção.
- Integrações com APIs Google devem ser server-side, em função protegida ou rotina administrativa, nunca em HTML público.

## O que cada ferramenta responde

| Ferramenta | Pergunta principal | Onde usar |
| --- | --- | --- |
| Google Search Console | O site aparece no Google? Por quais buscas? Quais páginas estão indexadas? | https://search.google.com/search-console |
| Google Analytics 4 | O que usuários fazem depois que entram no site? | https://analytics.google.com |
| Admin KinoCampus | O que acontece dentro da plataforma? Busca interna, banners, consentimento, posts e moderação. | `/admin/index.html` e `/admin/privacy-analytics.html` |
| Bing Webmaster Tools | O site aparece no Bing e em ecossistemas que usam Bing? | https://www.bing.com/webmasters |

## Rotina recomendada

### Após publicar mudança importante

1. Rode `npm run seo:audit`.
2. Abra `https://www.kinocampus.com.br/sitemap.xml` e confirme que responde XML.
3. No Search Console, use **Inspeção de URL** na home e em uma publicação importante.
4. Se a página estiver correta, clique em **Solicitar indexação**.
5. No GA4, abra **Relatórios > Tempo real** e confirme se acessos aparecem após aceitar métricas.

### Toda semana

1. Search Console > **Desempenho > Resultados da pesquisa**:
   - consultas com mais impressões e poucos cliques;
   - páginas com CTR baixo;
   - páginas com posição média entre 8 e 20, que podem melhorar com título/descrição/conteúdo.
2. Search Console > **Indexação > Páginas**:
   - páginas importantes não indexadas;
   - erros de rastreamento;
   - páginas duplicadas ou com canonical inesperado.
3. Search Console > **Sitemaps**:
   - `https://www.kinocampus.com.br/sitemap.xml` enviado e processado.
4. GA4 > **Aquisição de tráfego**:
   - origem do tráfego: Google, direto, redes sociais, referências.
5. GA4 > **Páginas e telas**:
   - páginas mais acessadas;
   - páginas com baixo engajamento;
   - publicações com tráfego real.

## APIs corretas

### Google Analytics

Use para relatórios de comportamento depois que o usuário chega ao site.

| API | Uso recomendado | Observação |
| --- | --- | --- |
| Google Analytics Data API v1 | Dashboards, relatórios de páginas, origem de tráfego, usuários ativos e eventos. | É a API correta para GA4. |
| Google Analytics Admin API v1 | Configuração de propriedades, data streams, permissões e recursos administrativos. | Útil para auditoria, não para ranquear páginas. |
| Google Analytics API v3 | Não usar para o KinoCampus. | É legado/Universal Analytics; não é o caminho correto para GA4. |

### Search Console

Use para entender visibilidade no Google.

| API | Uso recomendado | Observação |
| --- | --- | --- |
| Search Analytics API | Consultas, páginas, cliques, impressões, CTR e posição média. | Boa para um dashboard admin futuro. |
| Sitemaps API | Enviar/listar sitemap. | Útil para automação administrativa. |
| URL Inspection API | Diagnóstico de URLs específicas. | Use para páginas importantes, não para varrer tudo todo dia. |
| Indexing API | Não usar para posts comuns. | O Google limita a JobPosting e BroadcastEvent com VideoObject. |

## Dados que seriam úteis no Admin no futuro

Uma integração server-side pode consolidar:

- top consultas do Google por período;
- páginas com mais impressões e baixo CTR;
- páginas importantes não indexadas;
- status de sitemap;
- principais páginas de entrada no GA4;
- origem de tráfego por canal;
- usuários ativos agregados;
- comparação Search Console x GA4 x busca interna do KinoCampus.

## O que melhora ranking de verdade

- páginas públicas com conteúdo inicial rastreável, não apenas renderizado por JavaScript;
- títulos e descrições únicos, em português natural;
- publicação canônica em `/product.html?id=...`;
- sitemap atualizado;
- dados estruturados coerentes com o que aparece na página;
- imagens públicas e estáveis;
- páginas rápidas, responsivas e acessíveis;
- links internos entre home, módulos e publicações;
- remoção de páginas privadas/duplicadas do índice;
- conteúdo editorial claro: prazo, local, contato, fonte, categoria e CTA.

## O que não fazer

- Não colocar OAuth token do Google no frontend.
- Não usar OAuth Playground como integração permanente.
- Não tentar usar Indexing API para toda publicação comum.
- Não criar metadados falsos no JSON-LD.
- Não indexar busca interna, admin, perfil, configurações ou páginas pessoais.
- Não coletar analytics sem consentimento.

## Referências oficiais

- Google Analytics Data API: https://developers.google.com/analytics/devguides/reporting/data/v1
- Google Analytics Admin API: https://developers.google.com/analytics/devguides/config/admin/v1
- Search Console API: https://developers.google.com/webmaster-tools
- Search Analytics API: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- URL Inspection API: https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- Indexing API: https://developers.google.com/search/apis/indexing-api/v3/using-api
- Guia inicial de SEO do Google: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Dados estruturados do Google: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
