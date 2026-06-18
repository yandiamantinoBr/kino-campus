# Prontidão para Search Console e revisão do AdSense

**Escopo:** páginas públicas, indexação e verificação operacional
**Não inclui:** ativação de slots, Auto Ads, alteração de consentimento ou credenciais Google

## Objetivo

Executar uma revisão do Google AdSense somente depois que o estado publicado do
KinoCampus estiver coerente com o código, rastreável pelo Google e sem páginas
públicas presas em estados vazios genéricos. Este runbook não substitui as
políticas do Google nem garante aprovação.

## Estado técnico esperado

- domínio canônico: `https://www.kinocampus.com.br`;
- sitemap: `https://www.kinocampus.com.br/sitemap.xml`;
- feed: `https://www.kinocampus.com.br/feed.xml`;
- `ads.txt`: `https://www.kinocampus.com.br/ads.txt`;
- páginas de produto: `/product.html?id={id}`, com canonical sempre no domínio
  oficial, inclusive quando o deploy é acessado por uma URL de preview;
- páginas privadas, administrativas e busca interna permanecem `noindex`;
- AdSense continua restrito aos placements controlados de feed e ao
  consentimento de publicidade.

## Gate local antes do deploy

Executar na raiz do repositório:

```bash
npm run seo:audit
npm test -- --runInBand tests/integration/seo-indexing.test.js tests/integration/product-seo-metadata.test.js tests/integration/product.render.test.js tests/integration/product.related.test.js tests/unit/kc-utils-presentation.test.js
npm run check:all
npx playwright test --list
```

Critérios de Go:

- auditoria SEO sem erros;
- canonical de produto ancorada em `https://www.kinocampus.com.br`;
- `title` de produto com até 70 caracteres e description com até 180;
- cards de feed, relacionados e galeria de produto com `alt` contextual;
- estados vazios de home e módulos com contexto e próxima ação;
- regressão completa aprovada.

## Verificação após deploy

Validar sem autenticação e sem registrar cookies ou headers sensíveis:

1. Abrir home, os seis módulos, `sobre.html`, `editorial.html` e uma publicação
   real de cada tipo disponível.
2. Confirmar HTTP 200 em sitemap, feed e `ads.txt`.
3. Em duas publicações reais, conferir no HTML inicial:
   - canonical no domínio oficial;
   - robots `index,follow,max-image-preview:large,max-snippet:-1`;
   - title e description específicos;
   - `og:image:alt` e `twitter:image:alt`;
   - JSON-LD coerente com o conteúdo visível.
4. Abrir uma URL inexistente e confirmar a página 404 institucional com
   resposta HTTP 404.
5. Repetir uma publicação pela URL de preview da Vercel e confirmar que a
   canonical continua apontando para produção.
6. Confirmar que produto, admin, autenticação, perfil, mensagens e páginas
   legais não carregam slots AdSense.

Se qualquer item falhar, a decisão é No-Go para solicitar revisão.

## Sequência no Google Search Console

1. Confirmar a propriedade do domínio `kinocampus.com.br`.
2. Em **Sitemaps**, enviar ou validar
   `https://www.kinocampus.com.br/sitemap.xml`.
3. Em **Inspeção de URL**, verificar nesta ordem:
   - home;
   - `sobre.html` e `editorial.html`;
   - os seis módulos públicos;
   - pelo menos três publicações representativas e não expiradas.
4. Conferir canonical declarada e canonical selecionada pelo Google. Divergência
   para preview, URL sem `id` ou fonte externa é No-Go até investigação.
5. Solicitar indexação apenas para URLs importantes que passaram na inspeção.
   A Indexing API não deve ser usada para publicações comuns.
6. Registrar data, URL, resultado e eventual motivo de exclusão sem copiar
   tokens, cookies ou dados pessoais.

## Sequência no Google AdSense

1. Confirmar no painel que o site correto é `kinocampus.com.br` e que o
   publisher corresponde ao valor já versionado em `ads.txt`.
2. Confirmar que `ads.txt` aparece como encontrado/autorizado no painel.
3. Navegar como visitante sem sessão e revisar home, módulos, páginas
   institucionais e publicações reais.
4. Não ativar Auto Ads durante esta avaliação. Se houver ativação futura, manter
   exclusões explícitas para produto, admin, conta, mensagens, perfil,
   configurações e páginas legais.
5. Solicitar revisão somente quando o gate local, o deploy e as inspeções do
   Search Console estiverem verdes.
6. Após solicitar, registrar a data e o status no relatório operacional. Não
   alterar conteúdo ou placements apenas para provocar uma nova análise.

## Evidência mínima

| Evidência | Resultado esperado |
|---|---|
| `npm run seo:audit` | zero erros |
| CI do PR | Validators/Jest/Playwright, Lighthouse e Vercel aprovados |
| sitemap/feed/ads.txt | HTTP 200 e conteúdo válido |
| URL Inspection | URLs principais rastreáveis, canonical coerente |
| AdSense | site e `ads.txt` reconhecidos antes da revisão |
| páginas públicas | sem erro, loading permanente ou estado vazio genérico |

## Rollback e segurança

- falha de metadata: reverter o commit e aguardar novo deploy antes de outra
  inspeção;
- falha de conteúdo: manter revisão AdSense em No-Go e corrigir a origem;
- nunca registrar OAuth token, cookie do Google, credencial de service account
  ou captura com dados pessoais;
- não alterar `ads.txt` sem confirmar o publisher no painel;
- não ativar slots ou Auto Ads como efeito colateral deste runbook.

## Referências

- `docs/ops/google-search-console-analytics-runbook.md`;
- `docs/architecture/seo-indexing-map.md`;
- [Google Search Central: canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls);
- [Google Search Console API: URL Inspection](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect);
- [Ajuda do Google AdSense: ads.txt](https://support.google.com/adsense/answer/7532444?hl=pt-BR);
- [Políticas do programa Google AdSense](https://support.google.com/adsense/answer/48182?hl=pt-BR).
