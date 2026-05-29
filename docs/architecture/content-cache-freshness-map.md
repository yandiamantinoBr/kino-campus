# Mapa de cache e consistencia de publicacoes

Este documento descreve quais camadas aceleram a navegacao do KinoCampus e qual deve ser a fonte da verdade para publicacoes.

## Regra principal

`public.posts` no Supabase e a origem da verdade. Cache de navegador, memoria, Service Worker e snapshots locais podem antecipar renderizacao, mas nunca devem manter uma publicacao que foi ocultada, removida ou alterada no banco.

## Camadas de cache

| Camada | Onde fica | Conteudo | Retencao | Invalidacao |
| --- | --- | --- | --- | --- |
| `postCache` do feed | Memoria da pagina | Paginas de feed por modulo/filtro/cursor | 3 min | `KCPostFreshness`, refresh, pull-to-refresh e troca de filtro |
| Snapshot `feeds` | `sessionStorage` via `KCSessionStore` | Primeira pagina renderizada do feed | 2 min | `KCPostFreshness.clearContentCaches`, revalidacao em foco e Realtime |
| Snapshot `product-detail` | `sessionStorage` via `KCSessionStore` | Detalhe normalizado da publicacao | ate 30 min como stale | Sempre revalida em background; limpa quando `getPostById` retorna vazio ou status nao publico |
| `my-posts` | `sessionStorage` via `KCSessionStore` | Lista do usuario logado | SWR curto | Mutacoes do proprio usuario e `KCPostFreshness` |
| `profile` / `profile-posts` | `sessionStorage` via `KCSessionStore` | Perfil e posts publicos por autor | SWR curto | Mutacoes, Realtime e foco da pagina |
| `kc_user_posts` | `localStorage` legado/dev | Rascunhos/posts locais | Persistente local | Exclusao comum marca `status='deleted'` |
| Service Worker | Cache Storage | Shell e assets versionados | Por versao do SW | Nao cacheia Supabase; continua sem ser fonte de dados |

## Dados que nao sao fonte de verdade de publicacao

Votos, comentarios, salvos, buscas, afinidade de categorias, analytics e contadores ajudam o produto, mas nao decidem se uma publicacao deve aparecer. Se `posts.status` deixar de ser `published` ou `closed`, feeds publicos e detalhe devem remover o conteudo visual.

## Barramento `KCPostFreshness`

Interface publica:

- `window.KCPostFreshness.emit(change)`
- `window.KCPostFreshness.subscribe(handler)`
- `window.KCPostFreshness.clearContentCaches({ postId, scopes })`
- `window.KCRealtime.subscribePostChanges({ onChange })` (assina `postgres_changes`)
- Broadcast cross-cliente (tópico `kc-posts-changes`) é transporte interno do barramento `KCPostFreshness` (em `kc-api.client.js`): `emitPostFreshness` publica mudanças de origem local e o receptor faz `dispatch` em todos os clientes abertos.

Eventos aceitos:

- `created`
- `updated`
- `status_changed`
- `soft_deleted`
- `purged`

Payload minimo:

```json
{
  "type": "soft_deleted",
  "postId": "uuid",
  "legacyId": "123",
  "module": "eventos",
  "status": "deleted",
  "updated_at": "2026-05-27T12:00:00Z"
}
```

O payload e sanitizado: nao transporta titulo, descricao, e-mail, metadata completa, tokens, cookies, user-agent bruto ou dados pessoais.

## Fluxo apos mutacao

1. `KCAPI.createPost/updatePost/deletePost/...` conclui a chamada.
2. A fachada emite `KCPostFreshness`.
3. A aba atual limpa caches de conteudo e atualiza a tela.
4. Outras abas recebem por `BroadcastChannel` ou `localStorage`.
5. Outros navegadores/dispositivos/usuarios recebem por **broadcast** do Supabase Realtime no topico fixo `kc-posts-changes` (emitido pelo barramento `KCPostFreshness` para mudancas de origem local). O broadcast NAO passa pela RLS, entao alcanca todos os clientes abertos mesmo quando o post vira `deleted` (que a RLS esconde de `postgres_changes`).
6. Como rede de seguranca, o feed revalida a primeira pagina ao **focar**, ao **ficar visivel** (`visibilitychange`, cobrindo troca de aba e retorno no mobile) e no retorno via bfcache (`pageshow`).

## Propagacao cross-cliente (broadcast) e RLS

`postgres_changes` respeita a RLS: quando um post vira `deleted`, os demais usuarios deixam de poder le-lo e o evento de UPDATE e filtrado para eles (so o autor/admin recebem). Por isso, quem faz a mutacao tambem **publica um broadcast** no topico `kc-posts-changes` (transporte Realtime interno do `KCPostFreshness`), que nao passa pela RLS e alcanca todos os clientes abertos imediatamente.

Anti-loop: `emitPostFreshness` so publica no Realtime mudancas de **origem local** (source diferente de `realtime*`/`broadcast`/`remote`). Mudancas recebidas via broadcast reentram no barramento com `source='realtime-broadcast'` e nao sao re-publicadas.

## Exclusao comum

Exclusao feita pelo usuario nao apaga a linha de `posts`. Ela marca `status='deleted'`, registra metadados de remocao e tira a publicacao dos feeds publicos. Hard delete fica reservado para LGPD, manutencao administrativa ou limpeza controlada.

## Rollback

Se algum problema de consistencia aparecer:

1. Reverter a mudanca no `KCAPI.deletePost` para o comportamento anterior apenas em ambiente controlado.
2. Manter o filtro publico excluindo `hidden/deleted/pending`.
3. Limpar `sessionStorage` dos scopes `feeds` e `product-detail`.
4. Validar no Supabase se o status da publicacao esta correto.
