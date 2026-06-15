# SEO, Indexacao e Descoberta por IA

Este mapa define quais partes do KinoCampus devem ser rastreadas por buscadores e agentes de IA, e quais partes devem ficar fora da indexacao publica.

## Origem da verdade

- Publicacoes: `public.posts` no Supabase.
- Paginas canonicas publicas: HTML estatico na raiz do projeto.
- Detalhes de publicacao: `/product.html?id={uuid}`, servido por `api/og-product.js`.
- Fallback/app shell de detalhe: `_product.html`, mantido como `noindex`.
- Sitemap publico: `/sitemap.xml`, servido por `api/sitemap.js`.
- Politica de crawlers: `/robots.txt`.
- Verificacao Google Search Console por HTML tag: `index.html` (`google-site-verification`).
- Mapa auxiliar para agentes: `/llms.txt`.
- Google Analytics 4 consent-aware: `assets/js/boot/kc-google-tag.js`.
- Runbook operacional: `docs/ops/google-search-console-analytics-runbook.md`.

## Paginas indexaveis

| Pagina | Canonical | Motivo |
| --- | --- | --- |
| `/` | `https://www.kinocampus.com.br/` | Home e entidade principal da plataforma |
| `/eventos.html` | `https://www.kinocampus.com.br/eventos.html` | Colecao publica de eventos |
| `/oportunidades.html` | `https://www.kinocampus.com.br/oportunidades.html` | Colecao publica de oportunidades |
| `/moradia.html` | `https://www.kinocampus.com.br/moradia.html` | Colecao publica de moradia |
| `/compra-venda-feed.html` | `https://www.kinocampus.com.br/compra-venda-feed.html` | Colecao publica de compra e venda |
| `/caronas-feed.html` | `https://www.kinocampus.com.br/caronas-feed.html` | Colecao publica de caronas |
| `/achados-perdidos.html` | `https://www.kinocampus.com.br/achados-perdidos.html` | Colecao publica de achados e perdidos |
| `/sobre.html` | `https://www.kinocampus.com.br/sobre.html` | Missao, governanca, curadoria e autoria da plataforma |
| `/ajuda.html` | `https://www.kinocampus.com.br/ajuda.html` | Suporte e contato |
| `/ods.html` | `https://www.kinocampus.com.br/ods.html` | Contexto institucional e impacto |
| `/transparencia.html` | `https://www.kinocampus.com.br/transparencia.html` | Hub de transparencia, privacidade, cookies e suporte |
| `/privacidade.html` | `https://www.kinocampus.com.br/privacidade.html` | Politica de privacidade |
| `/termos.html` | `https://www.kinocampus.com.br/termos.html` | Termos de uso |
| `/product.html?id={uuid}` | URL com ID da publicacao | Publicacoes com `status=published`, nao expiradas e com conteudo minimo |

## Paginas nao indexaveis

| Pagina/rota | Regra | Motivo |
| --- | --- | --- |
| `/admin/` | `robots.txt: Disallow` | Painel administrativo |
| `/account-setup.html` | `noindex,follow,noarchive` | Fluxo de conta |
| `/auth-callback.html` | `noindex,nofollow,noarchive` | Callback de autenticacao |
| `/create-post.html` | `noindex,follow,noarchive` | Criacao de publicacao |
| `/mensagens.html` | `noindex,follow,noarchive` | Mensagens privadas |
| `/my-posts.html` | `noindex,follow,noarchive` | Area pessoal |
| `/profile.html` | `noindex,follow,noarchive` | Perfil dinamico/pessoal |
| `/search-results.html` | `noindex,follow,noarchive` | Resultados internos de busca |
| `/settings.html` | `noindex,follow,noarchive` | Configuracoes pessoais |

## Dados estruturados

- `assets/js/boot/kc-seo-structured-data.js` injeta JSON-LD para paginas publicas indexaveis.
- Tipos usados nas paginas: `Organization`, `WebSite`, `SearchAction`, `WebPage`, `AboutPage`, `CollectionPage`, `ContactPage`, `PrivacyPolicy`, `BreadcrumbList` e `ItemList`.
- `api/og-product.js` injeta JSON-LD server-side para publicacoes publicas.
- Tipos ricos de publicacao sao usados apenas quando os dados suficientes existem e tambem aparecem no HTML:
  - `Event` para eventos com data.
  - `JobPosting` para oportunidades com link de candidatura e prazo.
  - `Product` + `Offer` para compra/venda com preco.
  - `CreativeWork` como fallback seguro.

## Sitemap

`api/sitemap.js` monta XML com:

- paginas publicas estaveis;
- ate 1000 publicacoes `published` mais recentes/atualizadas, usando `updated_at` ou `created_at`;
- imagens principais em `<image:image>` quando a URL de imagem publica for valida;
- filtro de expiracao por `expires_at` ou datas de encerramento em `metadata`.

Se o Supabase estiver indisponivel, o sitemap ainda responde com as paginas estaticas para nao quebrar rastreamento.

## IA e agentes

- `robots.txt` permite rastreamento publico por `OAI-SearchBot` e `ChatGPT-User`, mantendo areas privadas bloqueadas.
- `GPTBot` fica bloqueado por padrao para separar descoberta em busca/assistente de uso amplo em treinamento.
- `llms.txt` e apenas um mapa auxiliar; nao deve ser tratado como fator garantido de ranking.
- A visibilidade real depende principalmente de conteudo publico claro, links internos, sitemap, metadados e qualidade das publicacoes.

## Monitoramento recomendado

- Executar `npm run seo:audit` antes de releases com mudancas em paginas publicas, sitemap ou robots.
- Google Search Console: enviar `https://www.kinocampus.com.br/sitemap.xml`.
- Bing Webmaster Tools: enviar o mesmo sitemap.
- Validar publicacoes importantes com URL Inspection depois de publicar.
- Revisar periodicamente se posts `hidden`, `deleted` ou `pending` nao aparecem no sitemap.
- GA4: acompanhar tempo real, aquisicao de trafego e paginas/telas depois do deploy de producao.
- APIs Google: usar apenas server-side quando houver necessidade de dashboard consolidado; nao guardar tokens OAuth no frontend.
- Transparencia publica: manter `/sobre.html`, `/transparencia.html`, `/privacidade.html`, `/termos.html` e `/ajuda.html#solicitacoes-suporte` consistentes entre rodape, sitemap, `llms.txt` e auditoria SEO.
