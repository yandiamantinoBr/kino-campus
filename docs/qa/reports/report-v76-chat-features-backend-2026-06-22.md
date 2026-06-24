# V76.53 — features de chat em produção (checkmarks, reações, reply)

**Data:** 2026-06-22
**Branch:** `codex/v76-chat-features-frontend`
**Escopo:** 3 features de chat aplicadas em **produção** (schema + RPCs) e no frontend
**Método:** conservador (prova local + transaction + rollback testado + Management API)

## Resultado

Três features reais (não offline) agora funcionam em `/mensagens.html`:

1. **Confirmação de leitura (checkmarks):** coluna `read_at` em `chat_messages` +
   trigger `trg_chat_mark_messages_read` que a preenche quando o destinatário marca a
   conversa como lida. Frontend mostra ✓ (enviada) ou ✓✓ azul (lida).
2. **Reações emoji:** tabela `chat_reactions` (RLS, allowlist de 6 emojis, FKs com
   ON DELETE CASCADE, Realtime habilitado). Frontend mostra chips com contagem,
   destacando as próprias; toggle ao clicar.
3. **Responder/quote:** coluna `reply_to_id` em `chat_messages` (FK ON DELETE SET NULL).
   Frontend: botão "Responder" mostra preview no composer; a bolha enviada exibe o
   quote clicável que rola até a original com highlight.

## Aplicação em produção (wacyrkwhkvzwkqpolrbg)

Todas via Supabase Management API (Node.js, `SUPABASE_ACCESS_TOKEN`, retry em
ECONNRESET). Status 201 em todas. Validadas por query pós-aplicação:

| Objeto | Estado em produção |
|---|---|
| `chat_messages.read_at` | ✅ existe |
| `chat_messages.reply_to_id` | ✅ existe |
| `chat_reactions` (tabela + RLS) | ✅ existe, RLS ativa |
| `trg_chat_mark_messages_read` | ✅ existe |
| `supabase_realtime` inclui `chat_reactions` | ✅ |
| RPC `kc_chat_list_messages` (3 novas colunas) | ✅ atualizado (public + kc_private) |

Antes de aplicar: backup de contagem (9 mensagens ativas), prova funcional em banco
local (trigger marcou `read_at`, reação inserida, allowlist rejeitou emoji fora da
lista) e teste de rollback (removeu tudo, count=0).

## Frontend (6 arquivos + cache-bust)

- `chat-inbox.controller.js` (v9.3.5.18): `renderMessageBubble` renderiza checkmarks,
  chips de reações, quote de reply; handlers `handleReactToMessage`,
  `handleToggleReaction`, `handleReplyToMessage`, `scrollToMessage`; `handleSubmit`
  chama `setMessageReply` e limpa preview; `appendMessage` inclui novos campos.
- `supabase.chat.adapter.js` (v8.6.3): `normalizeMessage` inclui `read_at`,
  `reply_to_id`, `reactions`; novos `toggleReaction` e `setMessageReply`.
- `kc-api.chat.js` (v8.6.3) + `local.chat.adapter.js` (v8.6.3): fachada + stub.
- `kc-chat.css` (v8.6.4): checkmarks, chips de reação, quote, reply preview,
  highlight de scroll-to.
- `mensagens.html`: cache-bust dos 5 assets.
- `supabase/migrations/20260622130000_chat_features_checkmarks_reactions_reply.sql`:
  espelha as mudanças no ambiente local (para `db reset` ficar alinhado).

## Validação

- `npm run check:all`: 195 suites / 3.806 testes / 3 snapshots aprovados;
- `chat-continuity-contract.test.js`: 7/7 (contratos preservados);
- `npx playwright test`: 83/83 Chromium aprovadas;
- captura desktop+mobile: zero `pageerror`, layout íntegro;
- `git diff --check`: sem erros de whitespace.

## Segurança

- Todas as mudanças são **aditivas** (colunas nullable, tabela nova, RPC expandido).
- RLS em `chat_reactions`: participantes só veem; usuário só insere/deleta as suas.
- `reply_to_id` FK ON DELETE SET NULL preserva a resposta se a original for apagada.
- allowlist de emoji (6) rejeita injeção via constraint CHECK.
- Produção validada pós-aplicação; rollback testado (remove trigger, função, tabela,
  publicação e colunas).

## Rollback (produção)

```sql
begin;
drop trigger if exists trg_chat_mark_messages_read on public.chat_read_state;
drop function if exists public.kc_chat_mark_messages_read();
alter publication supabase_realtime drop table public.chat_reactions;
drop table if exists public.chat_reactions;
-- restaurar RPCs kc_chat_list_messages à versão anterior (sem as 3 colunas)
alter table public.chat_messages drop column if exists reply_to_id;
alter table public.chat_messages drop column if exists read_at;
commit;
```
Frontend: `git revert` restaura os 6 arquivos.
