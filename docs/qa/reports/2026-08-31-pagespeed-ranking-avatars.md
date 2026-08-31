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

Integração, deploy e medições após publicação serão acrescentados após os checks.
