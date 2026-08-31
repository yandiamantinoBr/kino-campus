# Performance — avatares públicos do ranking (2026-08-31)

## Gargalo confirmado

O PageSpeed original apontou 1.110 KiB de possível economia em imagens. Um
avatar do ranking, exibido com aproximadamente 41 CSS px, transferia 862.958
bytes como JPEG de 2.179 × 2.180 px. A imagem transformada em 144 × 144 px,
quality 90 e cover transferiu 6.118 bytes como WebP (−99,29%). Ambas responderam
HTTP 200. A medição compara esses objetos específicos, não todos os avatares.

O maior avatar de ranking tem 44 CSS px: 144 px preservam densidade acima de
3×, inclusive nesse tamanho. O sidebar permanece com 32 CSS px.

## Limites da implementação

- Somente `kc-ranking.js`: home e rankings dos módulos. Nenhuma mudança de CSS,
  dimensões, nomes, pontuação, links ou ordenação.
- Apenas HTTPS na origem Supabase exata configurada, sob o caminho público
  `kino-media/profile-avatars/`, com extensão JPEG/JPG/PNG/WebP.
- URLs com query, fragmento, credenciais, token, formato não elegível ou origem
  externa não são transformadas. GIF/SVG e URLs assinadas são preservados.
- O endereço original permanece na API, assinatura/cache de ranking e perfil.
  Não há upload, sobrescrita, migração, alteração de RLS ou de permissões.
- Falha da thumbnail restaura a imagem original uma única vez por elemento,
  usando listener compatível com CSP. Falhas cacheadas também são tratadas;
  falha do original não provoca loop ou tempestade de requisições.

## Verificação

- 73 testes Jest em quatro suítes passaram, inclusive sanitização, origem
  semelhante, query/tokens, cache imutável, erro cacheado e fallback único.
- 10 E2E passaram: home mobile/desktop e sidebar, claro/escuro, DPR 3; geometria
  e pixels idênticos usando a mesma fixture raster antes/depois; erros 503 da
  transformação e do original sob o CSP real da plataforma.
- Revisão independente repetiu os 73 Jest e 10 E2E, sem P1/P2 pendente.
- Duas verificações com a imagem pública real confirmaram carregamento de
  original e thumbnail e dimensões CSS idênticas: home 41,390625 px e sidebar
  32 px. Comparação visual real registrada em `output/playwright/*real-avatar*`.
- Vision Assist comparou os dois pares reais em DPR 3: mesmo enquadramento,
  orientação, cores, alinhamento e nitidez perceptível no tamanho de uso. No
  sidebar, eventual perda de textura fina não altera a aparência de uso;
  conversão com perdas não é descrita como identidade de pixels.
- Estrutura, cadeia de scripts, versão, higiene e build minificado aprovados.

A fixture de pixels comprova estabilidade do componente, não qualidade da
conversão JPEG/WebP real. Essa última tem evidência visual separada. Imagens e
relatórios de QA são locais/ignorados; nenhum dado de sessão é versionado.

## Operação e custo

A transformação de imagens já estava disponível no projeto Pro e é utilizada
pela busca existente. Nenhum plano, limite ou configuração de cobrança foi
alterado. O cache conserva o comportamento do serviço (GET observado com
`public, max-age=3600`); não se aumentou TTL dos arquivos de usuário.

Segundo a [documentação de uso do Supabase](https://supabase.com/docs/guides/platform/manage-your-usage/storage-image-transformations),
a cobrança considera imagens-origem distintas por ciclo, não cada request ou
variação de tamanho: 100 incluídas em Pro/Team; excedentes em pacotes de
US$ 5/1.000. Não foi verificado o saldo atual da franquia, portanto esta mudança
não é apresentada como custo zero. O escopo é limitado aos avatares públicos
efetivamente renderizados no ranking.

[Contrato da transformação e parâmetros oficiais](https://supabase.com/docs/guides/storage/serving/image-transformations).

## Integração e medição da página completa

PR [#916](https://github.com/yandiamantinoBr/kino-campus/pull/916) integrada com
todos os checks verdes. Merge `bc4e7a2da66cf7cf40822c8ca3bdd7c3c6094269`,
deploy `dpl_2njyfDRg9xnVUZkMdWJyKczc18WM`, READY/production/main e SHA no HTML
canônico confirmados. A validação completa passou 342 suítes / 5.842 testes
Jest (7 ignorados preexistentes), 243 E2E do fonte e 243 do artefato minificado.
Uma falha transitória Windows EPERM na limpeza de fixture Cadu foi investigada:
34 testes isolados passaram e a repetição de todas as 342 suítes ficou verde.
Não se alterou o teste ou o código Cadu para esconder essa falha.

O componente ficou menor, mas o boot completo ainda baixava o mesmo original
de 862.958 bytes para um autor de card com 20 CSS px. A investigação de rede e
DOM confirmou `kc-card__author`, não um segundo boot do ranking. Esse achado
motivou o complemento do terceiro lote: ambos passam a compartilhar a mesma
URL 144 px, em vez de afirmar indevidamente que o primeiro ajuste do ranking
já tinha economizado esse download na página inteira.

As medições remotas variaram; a nota 89 do primeiro lote não é constante:

| PSI / horário GMT-3 | Performance | FCP | LCP | TBT | CLS | SI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [12:45](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/mk7mjoh6b7?hl=en_GB&form_factor=mobile) | 66 | 2,0 s | 9,4 s | 100 ms | 0,07 | 6,2 s |
| [12:52](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/ewznnenhri?hl=en_GB&form_factor=mobile) | 67 | 2,0 s | 9,4 s | 0 ms | 0,017 | 6,7 s |

Ambos usam Lighthouse 13.4.1/Moto G Power/4G lento; acessibilidade, boas práticas
e SEO permaneceram 95/96/100. LCP continua sendo o parágrafo de consentimento,
não o avatar. A decomposição observada informa render delay ~2,41 s, enquanto
a métrica simulada é 9,4 s. Não confundir esses dois valores nem ocultar o
consentimento para melhorar a nota. As duas amostras não provam causalidade
entre a transformação e a regressão de LCP, mas impedem alegar ganho uniforme.

Medição local controlada Lighthouse 12.6.1: nota 74, FCP 3,33 s, LCP 4,32 s,
TBT 32,5 ms, CLS 0,0821, SI 5,22 s; payload total 3.245.746 bytes. A auditoria
identificou tanto original quanto miniatura no tráfego, antes do complemento.
