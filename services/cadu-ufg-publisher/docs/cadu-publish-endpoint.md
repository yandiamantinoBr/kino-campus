# Cadu: endpoint canonico de publicacao (`cadu-publish`)

Atualizado em 2026-05-30.

Este documento e o **contrato** entre o Cadu (servidor OpenClaw) e o Kino Campus.
A partir de agora o Cadu NAO faz mais INSERT direto em `posts`: ele chama a Edge
Function `cadu-publish`, que vive no repositorio em
`supabase/functions/cadu-publish/` (versionada, testavel, com deploy via Supabase).

## Por que mudou

Os scripts soltos do servidor (`cadu-curador-v4.1.js`, `publish_auto.js`) faziam
INSERT direto e caiam em `pending` por causa do anti-spam (`>3` URLs = `link_spam`,
comum em editais com varios PDFs). Agora:

- A conta do Cadu esta na allowlist `public.kc_trusted_publishers` (migration
  `20260530120000`), entao seus posts **nao caem em `pending`** por link_spam/novo-usuario.
  O controle de **ritmo (flood)** continua valendo como rede de seguranca.
- A montagem de campos por modulo, o upload de imagem, a edicao e a listagem ficam
  centralizados no endpoint — melhorias no repositorio passam a chegar ao Cadu.

## Endpoint

```
POST {SUPABASE_URL}/functions/v1/cadu-publish
Headers:
  Authorization: Bearer <access_token da conta do Cadu>
  Content-Type: application/json
  apikey: <SUPABASE_ANON_KEY>
```

Autentique a conta do Cadu com `signInWithPassword` (anon key) e use o
`session.access_token`. **Nunca** envie a `service_role` pelo cliente — ela vive
apenas como secret da funcao.

Exemplo de cliente fino: `services/cadu-ufg-publisher/scripts/publish_via_endpoint.example.js`.

## Acoes

O corpo tem sempre `{ "action": "...", ... }`.

### `publish` — cria um post

```json
{ "action": "publish", "item": { ... }, "options": { "dryRun": false, "runId": "abc" } }
```

Campos do `item` (semi-estruturado — o curador ja extrai a maior parte):

| Campo          | Tipo            | Observacao |
| -------------- | --------------- | ---------- |
| `module`       | string (obrig.) | `eventos`, `oportunidades`, `moradia`, `compra-venda`, `caronas`, `achados-perdidos` |
| `title`        | string (obrig.) | max 80 chars |
| `description`  | string          | usa este; senao `summary`/`text`. Vira markdown e recebe fonte + documentos |
| `formattedDescription` | string | descricao final ja revisada pelo formatador IA; quando for boa, o endpoint preserva o Markdown e so completa fonte/documentos ausentes |
| `summary`/`text` | string        | fallback de descricao |
| `score`        | number\|string | score do curador; se informado e menor que `0.70`, o endpoint bloqueia auto-publicacao |
| `dates`        | object          | datas detectadas pelo curador; usadas como sinal auxiliar, mas o endpoint recalcula os checks basicos |
| `category`     | string (obrig.) | chave canonica do modulo; rotulos e aliases explicitos (ex.: `academico`, `estagio`, `república`) sao normalizados. Ausencia, valor desconhecido ou categoria de outro modulo retorna `422`; nao ha default |
| `type`/`subcategoriaKey` | string | grupo secundario obrigatorio em `compra-venda` (`vendo`/`compro`) e `achados-perdidos` (`documentos`/`eletronicos`/`outros`); aliases explicitos devem ser validos e equivalentes, ou o publish retorna `422` |
| `location`     | string          | Local (eventos) / Cidade-Campus (oportunidades) |
| `price`        | number\|string  | aceita `"1.234,56"` ou `1234.56` |
| `contato`      | string          | oportunidades; senao tenta extrair e-mail do texto |
| `area`         | string          | oportunidades; senao inferida do texto |
| `workMode`     | string          | oportunidades; senao detecta Remoto/Hibrido/Presencial do texto |
| `regime`       | string          | oportunidades `emprego`: CLT/PJ/Temporario/Jovem Aprendiz |
| `remuneracao`  | string          | oportunidades; tambem vira `price` |
| `dateStart`    | ISO `yyyy-mm-dd`| eventos: data de inicio |
| `dateEnd`      | ISO `yyyy-mm-dd`| eventos: **data de termino** (multi-dia) |
| `time`         | `HH:MM`         | eventos |
| `gratuito`     | boolean         | eventos |
| `link`         | URL             | CTA / inscricao |
| `linkAsCta`    | boolean         | usar o link como botao principal (default: true se houver link) |
| `actionLabel`  | string          | texto do botao principal; se faltar, o endpoint infere `Acessar edital`, `Realizar inscricao`, `Acessar evento` etc. |
| `actionKey`    | string          | slug do botao em eventos/oportunidades; em `compra-venda`, alias explicito da acao obrigatoria `vendo`/`compro` |
| `image`        | URL             | capa preferida (sera baixada e re-hospedada em `kino-media`) |
| `images`       | URL[]           | galeria, até 6 imagens; a primeira vira capa |
| `allowExternalImageFallback` | boolean | quando `false`, nunca grava URL externa se o upload para Storage falhar |
| `userTags`     | string[]        | termos livres e editáveis do post; é a entrada canônica, tem no máximo 12 valores e cada chave é derivada do rótulo |
| `userTagKeys`  | string[]        | aceito apenas por compatibilidade; o publicador sempre recalcula as chaves a partir de `userTags` |
| `tags`/`tagKeys` | string[]      | facetas automáticas de taxonomia, fonte e prazo; o cliente não deve usá-las para editar Tags adicionais |
| `sourceUrl`    | URL             | fonte oficial (usado em dedup) |
| `sourceId`     | string          | id estavel da fonte (usado em dedup/idempotencia) |
| `sourceName`   | string          | ex.: "Eventos UFG" |
| `pdfLinks`     | URL[]           | editais/anexos (entram em "Editais e documentos") |
| `extractedLinks` | (string\|{url,label})[] | links extras |
| `enrichmentSources` | (string\|{url,label,type})[] | fontes consultadas no enriquecimento: site oficial, Instagram oficial, web complementar |
| `enrichmentCheckedAt` | ISO datetime | quando o enriquecimento ativo foi feito |
| `visibility`   | `public`\|`community` | default `public` |

Resposta:

```json
{
  "ok": true,
  "code": "PUBLISHED",            // ou "PENDING" (flood), "DUPLICATE", "DRY_RUN", "VALIDATION_FAILED", "QUALITY_BLOCKED"
  "post_id": "uuid",
  "status": "published",
  "url": "https://www.kinocampus.com.br/eventos.html",
  "image_url": "https://.../kino-media/post-media/<uid>/<post>/cadu-1-xxxx.jpg",
  "media": {
    "uploaded": true,
    "uploaded_count": 2,
    "cover_url": "https://...",
    "images": ["https://.../capa.jpg", "https://.../programacao.png"],
    "uploads": []
  },
  "warnings": []
}
```

Quando a barreira editorial bloquear o item, o endpoint **nao cria post** e retorna HTTP 200 com `ok:false`:

```json
{
  "ok": false,
  "code": "QUALITY_BLOCKED",
  "message": "O item nao passou na barreira de qualidade editorial do Cadu.",
  "quality": {
    "blockingWarnings": ["event_past", "weak_description"],
    "warnings": ["event_past", "weak_description"],
    "recommendation": "Corrija o item, consulte fonte oficial complementar e rode dry-run antes de reenviar para publicacao."
  }
}
```

Bloqueios atuais: evento passado, prazo vencido, release institucional/biografico sem acao concreta, credito CMS na descricao, descricao fraca/crua, score informado abaixo de `0.70`, somente imagens temporarias/SVG e item originado apenas de Instagram sem fonte oficial complementar.

### `edit` — edita um post do Cadu

```json
{
  "action": "edit",
  "postId": "uuid",
  "fields":   { "title": "...", "description": "...", "status": "published" },
  "metadata": {
    "link": "https://...",
    "link_as_cta": true,
    "userTags": ["Acessibilidade", "Material aberto"]
  },
  "image": "https://.../nova-capa.jpg",
  "images": ["https://.../nova-capa.jpg", "https://.../programacao.jpg"]
}
```

- `metadata` faz **merge profundo** e preserva chaves independentes. Para Tags
  adicionais, omita `metadata.userTags` para manter o conjunto atual e envie
  `metadata.userTags: []` somente para limpá-lo de propósito.
- `metadata.userTags`/`metadata.userTagKeys` é o par canônico das Tags
  adicionais: rótulos são normalizados, duplicatas e facetas automáticas são
  removidas, e as chaves são sempre derivadas dos rótulos. O publicador limita
  esse conjunto a 12 valores.
- `metadata.tags`/`metadata.tagKeys` são facetas automáticas de taxonomia, fonte
  e prazo. Elas são recompostas pelo publicador e não devem ser usadas por
  clientes para alterar Tags adicionais. O fallback legado de `tags`/`tagKeys`
  só é considerado na preparação de novos itens, após remover essas facetas.
- `fields.category` aceita a chave canonica ou um alias explicito do modulo. A
  edicao sincroniza `category`, `categoriaKey`, `categoriaLabel`,
  `categoryKey`, `categoryLabel` e os campos derivados do modulo; em
  oportunidades, a area independente e preservada, e em moradia
  `housingTypeKey`/`housingTypeLabel` acompanham a categoria.
- Em `compra-venda`, a acao pode ser alterada por `metadata.subcategoriaKey`,
  `metadata.subcategoria`, `metadata.actionKey` ou `metadata.actionLabel`. Em
  `achados-perdidos`, o tipo aceita `metadata.subcategoriaKey`,
  `metadata.subcategoria`, `metadata.subcategoryKey` ou `metadata.subcategory`.
  Um alias presente no patch e autoritativo; varios aliases equivalentes sao
  aceitos, mas valores que normalizem para chaves diferentes retornam `422`.
  Em `compra-venda`, `metadata.subcategory`, `subcategoryKey` e
  `subcategoryLabel` representam a categoria primaria e devem concordar com
  `fields.category`; a resposta persiste os tres aliases em forma canonica.
- `fields.status = "published"` publica um pendente e limpa `moderation_reason`.
- Edita apenas posts cujo `author_id` e o do Cadu.
- Quando `image` for URL temporaria (Telegram, Instagram CDN, token assinado),
  use `allowExternalImageFallback=false` no cliente. Se o upload falhar, a capa
  anterior e preservada em vez de gravar URL temporaria no Kino.

### `list` — o que ja foi postado / pendente

```json
{ "action": "list", "filters": { "module": "eventos", "status": "pending", "since": "2026-05-01", "limit": 50 } }
```

Resposta: `{ ok, count, posts: [{ id, title, module, status, created_at, image_url, source_url, source_id }] }`.

### `check` — dedup por fonte

```json
{ "action": "check", "sourceUrl": "https://eventos.ufg.br/x" }
```

Resposta: `{ ok, exists, post_id, status }`.

## Codigos de erro

| code               | HTTP | significado |
| ------------------ | ---- | ----------- |
| `AUTH_REQUIRED`    | 401  | sem Bearer token |
| `AUTH_INVALID`     | 401  | token invalido/expirado — refaca login |
| `NOT_TRUSTED`      | 403  | conta fora da allowlist `kc_trusted_publishers` |
| `NOT_OWNER`        | 403  | tentou editar post de outro autor |
| `VALIDATION_FAILED`| 422  | item invalido (ver `validation.errors`) |
| `DUPLICATE`        | 200  | ja existe post com a mesma fonte (`post_id` no retorno) |
| `POST_NOT_FOUND`   | 404  | postId inexistente |
| `INSERT_FAILED` / `UPDATE_FAILED` / `LIST_FAILED` | 500 | erro no banco (ver `message`) |
| `INTERNAL_ERROR`   | 500  | excecao inesperada |

## Imagens

- O endpoint baixa `image` e `images[]`, re-hospeda até 6 imagens em
  `kino-media` (`post-media/<uid>/<post_id>/...`) e grava:
  - `posts.image_url` com a primeira imagem final;
  - `metadata.image_url` e `metadata.cover_url` com a capa;
  - `metadata.gallery_image_urls` com a galeria final;
  - `post_media` com `is_cover=true` na primeira e `sort_order` crescente.
- A primeira URL enviada deve ser sempre a capa preferida. As demais devem ser
  imagens complementares realmente uteis, como programacao, card oficial ou
  banner do edital.
- Se o upload de alguma imagem falhar, o endpoint usa fallback externo apenas
  quando a URL e estavel (por exemplo `files.cercomp.ufg.br` ou dominio oficial
  HTTP/HTTPS). SVG, Instagram CDN, Facebook CDN e URLs temporarias de Telegram
  nao viram capa/galeria definitiva; nesses casos o retorno traz detalhes em
  `media.uploads[]`, e o Cadu deve procurar imagem oficial ou publicar sem capa.

## Contrato para o formatador IA

O formatador pode devolver `formattedDescription`. O endpoint preserva essa
descricao quando ela tem conteudo acionavel e Markdown seguro. Isso evita o erro
operacional de o Cadu montar um texto bom e o publicador substituir por texto
bruto da fonte.

Regras praticas:

- envie `formattedDescription` no mesmo item que sera publicado;
- mantenha links como `[https://...](https://...)`;
- nao envie HTML;
- inclua prazo/data, publico-alvo, CTA e contato real quando existir;
- se nao houver contato real, deixe `contato` vazio e use a fonte oficial como
  caminho de esclarecimento.

## Modulos

`eventos` e `oportunidades` sao os fluxos exercitados pelo Cadu hoje e estao
cobertos ponta a ponta. Os demais (`moradia`, `compra-venda`, `caronas`,
`achados-perdidos`) ja estao prontos pelo schema: basta enviar os campos do
modulo (ver tabela) que o endpoint preenche as chaves de `metadata` corretas.

## Seguranca

- So contas em `public.kc_trusted_publishers` (gerida por admin) usam o endpoint.
- `service_role` fica como secret da funcao; nunca no cliente/logs/Telegram.
- O anti-spam continua integral para todos os outros usuarios.
