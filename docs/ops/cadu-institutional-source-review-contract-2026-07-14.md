# Contrato operacional: revisão institucional do Mapa UFG

Data: 2026-07-14

Política: `INSTITUTIONAL_SOURCE_REVIEW`

Este contrato cria uma sugestão editorial durável sem publicar conteúdo. Ele é
separado da ação histórica `publish`: não usa fallback de Telegram, não faz
upload de imagem e só declara sucesso quando a Edge Function devolve a linha
persistida com `status = pending`.

## Envelope exato

O navegador envia ao proxy `/api/cadu/publish`; o `cadu-api` da VPS deve enviar
o mesmo envelope validado para `cadu-publish`:

```json
{
  "action": "review",
  "intent": "review",
  "source_id": "web.ufg.portal",
  "source_url": "https://ufg.br/",
  "content_url": "https://ufg.br/",
  "instagram_handle": "ufg_oficial",
  "content_kind": "institutional_site",
  "idempotency_key": "map-ufg-review:web.ufg.portal:<source_revision>",
  "source_revision": "<sha256 lowercase da projeção da fonte>",
  "registry_sha256": "<sha256 lowercase do catálogo canônico>",
  "name": "UFG — Universidade Federal de Goiás",
  "note": "Fonte canônica confirmada para revisão editorial",
  "tier": 1,
  "category": "university",
  "source": "cadu-admin-map-ufg"
}
```

`instagram_handle` pode ser `null` somente quando o catálogo não contém perfil
confirmado ou candidato para a fonte. O campo deve ser o handle normalizado,
sem `@` e sem URL. `content_url` é propositalmente separado de `source_url`; na
primeira versão de `institutional_site`, ambos devem coincidir com a
`canonicalUrl` da fonte.

## Fronteira obrigatória no Python/cadu-api

O corpo vindo do navegador não é autoridade. Antes de chamar a Edge Function,
o backend Python deve carregar a projeção canônica atual e rejeitar a operação,
sem retry automático, quando qualquer verificação falhar:

1. `source_id` existe no catálogo cuja resposta tem hash/headers fortes.
2. `role == primary_site` e `sourceKind` pertence à allowlist canônica
   `weby_site | ojs_site | html_page | external_site | mixed`. Os papéis
   `legacy_observation` e `official_profile` não são elegíveis.
3. `overrideOrigin == stable` e `overrideUnitId == source.id`.
4. `collision == false`, `reviewIssues` vazio e `reviewState` igual a
   `reviewed` ou `confirmed_official`.
5. `registry_sha256`, `source_revision`, `source_url`, `content_url`, `name`,
   `tier`, `note` e `category` coincidem com a projeção atual.
6. O Instagram enviado é o único perfil `confirmed`, observado diretamente na
   fonte (`viaSourceObservation == true`) e não compartilhado. Mais de um perfil
   direto/exclusivo confirmado ou qualquer perfil `tentative`/
   `pending_verification` bloqueia a ação. Perfis confirmados que sejam somente
   compartilhados ou indiretos permanecem como evidência no catálogo, mas são
   omitidos do envelope (`instagram_handle = null`) para não fabricar uma
   identidade exclusiva.
7. `idempotency_key` é exatamente
   `map-ufg-review:<source_id>:<source_revision>`.

Para evitar divergência entre JavaScript e Python, os valores derivados são:

```text
expected_name = " / ".join(
  f"{entity.acronym} — {entity.name}" if entity.acronym else entity.name
  for entity in source.entities
) or source.id

expected_category = source.entities[0].kind if source.entities else source.sourceKind
expected_tier = source.effectiveTier  # inteiro 1..3 ou null
expected_note = source.note           # string estável ou null
expected_source_url = source.canonicalUrl
expected_content_url = source.canonicalUrl
expected_source_revision = source.revision
expected_registry_sha256 = projection.registrySha256
expected_idempotency_key = (
  f"map-ufg-review:{source.id}:{source.revision}"
)
```

O handle esperado é o único item de `source.instagramProfiles` que satisfaz
simultaneamente `status == confirmed`, `viaSourceObservation == true` e
`shared != true`. Qualquer item `tentative`/`pending_verification` bloqueia a
fonte antes dessa seleção. Se não houver perfil direto/exclusivo selecionável,
inclusive quando existirem apenas perfis confirmados indiretos/compartilhados,
o valor esperado é `expected_instagram_handle = null`.

O estado `activation.state = shadow` não bloqueia esta revisão, porque a ação
não ativa a fonte nem publica no feed. Ele continua bloqueando a ação histórica
de publicação. O fallback legado permanece sempre somente leitura.

O Python deve autenticar a conta confiável do Cadu e chamar:

```text
POST <SUPABASE_URL>/functions/v1/cadu-publish
Authorization: Bearer <access token da conta Cadu>
Content-Type: application/json
```

Não é permitido transformar falha da Edge Function em mensagem de Telegram,
`ok: true`, ou notificação “para revisão”. Para esta ação, indisponibilidade é
erro `502/503` e conflito de revisão é `409`.

## Confirmação de sucesso

O `cadu-api` deve aceitar e devolver ao proxy somente a confirmação terminal:

```json
{
  "ok": true,
  "code": "PENDING",
  "policy_code": "INSTITUTIONAL_SOURCE_REVIEW",
  "review_id": "<uuid durável da fila editorial>",
  "post_id": "<mesmo uuid; alias temporário de compatibilidade>",
  "status": "pending",
  "pending": true,
  "published": false,
  "published_via": "edge-function",
  "intent": "review",
  "content_kind": "institutional_site",
  "source_id": "<eco do pedido>",
  "source_url": "<eco do pedido>",
  "content_url": "<eco do pedido>",
  "instagram_handle": "<eco do pedido ou null>",
  "source_revision": "<eco do pedido>",
  "registry_sha256": "<eco do pedido>",
  "idempotency_key": "<eco do pedido>",
  "replayed": false
}
```

Um retry idêntico retorna a mesma forma com `replayed: true` e os mesmos
`review_id`/`post_id`. O alias `post_id` não identifica uma linha de
`public.posts` e existe apenas durante a transição do contrato do frontend.
Qualquer divergência de identidade, revisão, política, status ou UUID deve
falhar fechado no Python e no navegador.

## Invariantes no banco

A migration `20260714204500_cadu_institutional_review_pending.sql` cria a fila
tipada `public.cadu_institutional_source_reviews`, separada de `public.posts`, e
estabelece:

- acesso direto revogado e RLS habilitada; somente RPCs `SECURITY DEFINER`
  concedidas a `service_role` podem criar ou resolver revisões;
- envelope canônico imutável, estados terminais imutáveis e transições apenas de
  `pending` para `approved`, `rejected` ou `superseded`;
- unicidade global da chave idempotente, unicidade por fonte/revisão e no máximo
  uma revisão pendente por fonte;
- advisory locks por chave, fonte e solicitante, evitando corridas de retry,
  fontes concorrentes e bypass do limite de 60 novas revisões por hora;
- criação/resolução e `audit_log` dentro da mesma transação.

Uma aprovação editorial apenas registra a decisão sobre o catálogo. Ela não
publica no feed. Se uma decisão futura originar conteúdo publicável, a
publicação deve ser criada por um fluxo separado e revalidado; a linha da fila
nunca pode ser promovida ou convertida em `public.posts`.

## Ordem de implantação

1. Aplicar a migration e conferir tabela, grants, trigger, índices e RPCs com
   provas locais de concorrência/replay/resolução.
2. Publicar a Edge Function `cadu-publish` mantendo
   `CADU_INSTITUTIONAL_REVIEW_ENABLED` ausente ou diferente de `1`; nesse estado,
   `action = review` deve responder `503 REVIEW_DISABLED`.
3. Atualizar o `server.py`/`cadu-api` com a revalidação canônica e comprovar o
   contrato contra uma Edge ainda desabilitada, sem fallback de Telegram.
4. Publicar proxy e frontend, mantendo o botão indisponível enquanto o catálogo
   não tiver fontes integralmente elegíveis.
5. Habilitar `CADU_INSTITUTIONAL_REVIEW_ENABLED=1` somente após a validação
   transacional completa e executar uma revisão controlada, nunca `publish`,
   confirmando `review_id`, auditoria e replay.

Essa ordem evita que uma interface nova alcance um backend antigo. A versão
antiga do Python não deve tentar interpretar o envelope de revisão como
`publish`; durante a transição, a operação deve falhar fechado.
