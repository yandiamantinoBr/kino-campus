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
| `summary`/`text` | string        | fallback de descricao |
| `category`     | string (key)    | ex.: `academicos`, `empregos`, `estagios`. Default por modulo |
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
| `image`        | URL             | capa (sera baixada e re-hospedada em `kino-media`) |
| `images`       | URL[]           | alternativa a `image` |
| `tags`         | string[]        | complementa as tags derivadas |
| `sourceUrl`    | URL             | fonte oficial (usado em dedup) |
| `sourceId`     | string          | id estavel da fonte (usado em dedup/idempotencia) |
| `sourceName`   | string          | ex.: "Eventos UFG" |
| `pdfLinks`     | URL[]           | editais/anexos (entram em "Editais e documentos") |
| `extractedLinks` | (string\|{url,label})[] | links extras |
| `visibility`   | `public`\|`community` | default `public` |

Resposta:

```json
{
  "ok": true,
  "code": "PUBLISHED",            // ou "PENDING" (flood), "DUPLICATE", "DRY_RUN", "VALIDATION_FAILED"
  "post_id": "uuid",
  "status": "published",
  "url": "https://www.kinocampus.com.br/eventos.html",
  "image_url": "https://.../kino-media/post-media/<uid>/<post>/cadu-1-xxxx.jpg",
  "media": { "uploaded": true, "cover_url": "https://..." },
  "warnings": []
}
```

### `edit` — edita um post do Cadu

```json
{
  "action": "edit",
  "postId": "uuid",
  "fields":   { "title": "...", "description": "...", "status": "published" },
  "metadata": { "link": "https://...", "link_as_cta": true },
  "image": "https://.../nova-capa.jpg"
}
```

- `metadata` faz **merge profundo** (nao apaga `cover_url`, `tags`, `data_evento`, etc.).
- `fields.status = "published"` publica um pendente e limpa `moderation_reason`.
- Edita apenas posts cujo `author_id` e o do Cadu.

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

## Imagem

- O endpoint baixa a `image`/`images[0]` e re-hospeda em `kino-media`
  (`post-media/<uid>/<post_id>/...`), gravando `posts.image_url`,
  `metadata.image_url`, `metadata.cover_url` e `post_media(is_cover=true)`.
- Se o upload falhar (ex.: fonte indisponivel), mantem a **URL externa** como
  fallback (`media.uploaded=false`, `media.error` no retorno).

## Modulos

`eventos` e `oportunidades` sao os fluxos exercitados pelo Cadu hoje e estao
cobertos ponta a ponta. Os demais (`moradia`, `compra-venda`, `caronas`,
`achados-perdidos`) ja estao prontos pelo schema: basta enviar os campos do
modulo (ver tabela) que o endpoint preenche as chaves de `metadata` corretas.

## Seguranca

- So contas em `public.kc_trusted_publishers` (gerida por admin) usam o endpoint.
- `service_role` fica como secret da funcao; nunca no cliente/logs/Telegram.
- O anti-spam continua integral para todos os outros usuarios.
