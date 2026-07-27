# Cadu: edicao segura de posts no Kino Campus

Atualizado em 2026-05-22.

Este documento registra o contrato operacional para o Cadu editar posts sem quebrar
`metadata`, capa, `post_media` ou moderacao. O objetivo e dar autonomia ao agente,
mas impedir os erros que ocorreram com PATCH direto no REST do Supabase.

## Regra principal

O Cadu nao deve fazer `PATCH /rest/v1/posts` direto para reparos editoriais. Use
apenas o publisher oficial:

- `createPost(payload)`: cria publicacao nova pelo mapper completo.
- `caduEditPost(postId, fields, options)`: edita texto, metadata e imagens em um
  fluxo serializado por post.
- `mergeMetadata(postId, changes, options)`: altera apenas chaves de `metadata`
  sem substituir o objeto inteiro.
- `safeUpdatePost(postId, fields, options)`: alias conservador para
  `caduEditPost`.
- `publishPost(postId, options)`: publica, limpa `moderation_reason` e preserva
  metadata existente.

## Por que existe `mergeMetadata`

No Supabase/PostgREST, atualizar uma coluna `jsonb` com:

```json
{ "metadata": { "link": "https://..." } }
```

substitui a metadata inteira. Isso apaga `image_url`, `cover_url`, `tags`,
`tagKeys`, `link_as_cta`, `categoriaKey` e qualquer outro campo existente.

O metodo `mergeMetadata(postId, changes)` faz:

1. `GET` do post atual.
2. merge profundo em JavaScript.
3. um unico `PATCH` com a metadata completa.
4. novo `GET` para validar se o estado salvo bate com o esperado.

## Edicao com imagem

Use:

```js
await publisher.caduEditPost(postId, {
  metadata: {
    link: 'https://fonte-oficial...',
    link_as_cta: true,
  },
  images: ['https://files.cercomp.ufg.br/weby/up/.../capa.jpg'],
});
```

O publisher agora prepara a imagem antes de alterar o post. Se o upload para
`kino-media` funcionar, grava a URL do Storage em:

- `posts.image_url`
- `metadata.image_url`
- `metadata.cover_url`
- `metadata.gallery_image_urls`
- `post_media` com `is_cover=true`

`metadata.gallery_image_urls` deve espelhar exatamente a lista ordenada gravada
em `post_media`. Manter a galeria antiga após trocar a capa pode fazer o frontend
ou o preview social continuarem exibindo a mídia anterior.

Se o upload falhar para uma imagem oficial publica da UFG, o fallback externo
continua permitido por padrao. O erro aparece em `result.media.uploads`.

## Imagens recebidas pelo Telegram

URLs de arquivo do Telegram sao temporarias e podem conter token. Para uma imagem
enviada pelo Yan no Telegram:

1. Baixe ou obtenha a URL de arquivo somente como fonte temporaria de upload.
2. Chame `caduEditPost` com fallback externo desativado:

```js
await publisher.caduEditPost(postId, {
  images: [telegramFileUrl],
}, {
  allowExternalImageFallback: false,
});
```

3. Se o Storage falhar, o metodo retorna `ok:false`, `code:'IMAGE_UPLOAD_FAILED'`
   e nao grava a URL temporaria no post.
4. Nesse caso, avise o Yan e peca outra imagem ou aguarde a policy do bucket ser
   corrigida.

Nunca salve `api.telegram.org/file/...` em `posts.image_url` ou `metadata`.

## Edicao solicitada por conversa

Quando o Yan pedir "troque a imagem", "corrija a descricao", "adicione o link" ou
"publique esse pending", siga este fluxo:

1. Identifique o `postId` correto.
2. Busque o post atual com `getPost(postId)`.
3. Mostre preview resumido no Telegram quando a alteracao for editorial.
4. Aplique a alteracao com `caduEditPost`, `mergeMetadata` ou `publishPost`.
5. Confira `result.ok`.
6. Se `result.ok === false`, nao tente PATCH direto. Envie `code`, `message` e
   `validation.errors` para o Yan/Codex.

## Campos de metadata que devem ser preservados

Nunca remova sem intencao:

- `link`, `link_as_cta`
- `actionLabel`, `actionKey`
- `image_url`, `cover_url`
- `contato`
- `area`, `areaKey`
- `categoria`, `categoriaKey`, `categoryKey`
- `tags`, `tagKeys`
- `gratuito`
- `modalidadeTrabalho`
- `data_evento`, `hora_evento`
- `source_url`, `source_host`, `source_unit`, `source_id`
- `confidence_score`, `deadline_date`, `event_date_detected`
- `temporal_status`, `cadu_run_id`

## Concorrencia

`caduEditPost` usa um lock em memoria por `postId`. Dentro de um mesmo processo
Node, duas edicoes do mesmo post rodam em fila, nao em paralelo. Isso evita:

- imagem de um post sendo gravada em outro por corrida local;
- substituicao de `post_media` enquanto outra edicao ainda esta fazendo upload;
- validacao lendo estado intermediario.

Se existirem varios processos do Cadu rodando ao mesmo tempo, ainda e necessario
evitar editar o mesmo post simultaneamente em processos diferentes. O operador deve
preferir uma unica instancia do runner/publisher.

## Moderacao

Para publicar um post pendente:

```js
await publisher.publishPost(postId, {
  metadata: { reviewed_by_cadu: true },
});
```

Esse metodo define `status='published'`, limpa `moderation_reason` e preserva a
metadata existente.

## Service role

Nao coloque `service_role` no frontend, em logs, em mensagens do Telegram ou em
scripts que possam imprimir ambiente. A estrategia atual usa conta autenticada do
Cadu + RLS. Se o bucket `kino-media` continuar bloqueando upload, a correcao
preferida e aplicar policy de Storage por owner do projeto. Uma Edge Function
protegida pode ser avaliada depois, mas nao e requisito para as edicoes seguras
implementadas aqui.

## Checklist rapido

Antes de publicar ou editar:

- Nao usar REST direto para `metadata`.
- Nao salvar URL temporaria do Telegram.
- Conferir `result.ok`.
- Conferir `result.validation.ok` quando existir.
- Reportar `result.media.uploads` no digest se imagem tiver fallback.
- Usar preview antes de mudancas editoriais sensiveis.
