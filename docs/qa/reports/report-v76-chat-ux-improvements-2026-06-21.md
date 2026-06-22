# V76.52 — melhorias de UX/estética em /mensagens.html

**Data:** 2026-06-21
**Branch:** `codex/v76-chat-ux-improvements`
**Escopo:** três features de UX no chat 1-a-1, **sem migration** (o indicador
"digitando..." usa broadcast efêmero do Supabase Realtime, não persiste no banco)

## Resultado

Três melhorias entregues em `/mensagens.html`, preservando integralmente os 7
contratos de continuidade do chat, o roteamento `?with=`/`#c/`, os IDs de DOM, os
eventos custom e a fachada congelada `KCAPI.chat`.

### Feature 1 — Agrupar mensagens consecutivas

Mensagens do mesmo remetente em até 2 minutos formam uma "stack": reduzem o gap,
arredondam menos o canto que toca a anterior e escondem o horário até o hover
(só a primeira do grupo mostra meta). Implementado na camada de apresentação:

- `chat-inbox.controller.js`: `renderMessagesList` pré-computa boundaries em uma
  passada (mesmo remetente + delta ≤ 2 min + mesmo dia); `renderMessageBubble`
  recebe `{ isContinuation }` e aplica classe `kc-chat-msg--grouped`.
- `kc-chat.css`: `.kc-chat-msg--grouped` reduz padding/margin, ajusta
  border-radius do canto superior e oculta `.kc-chat-msg__meta` até hover.

### Feature 2 — Indicador "digitando..."

Três pontos pulsando no lugar do status do peer, via broadcast efêmero Realtime
(canal nomeado por conversa, `self: false` para não ecoar para o próprio emissor).
**Não toca `chat_messages` nem nenhuma tabela** — respeita o No-Go do SQL.

- `supabase.chat.adapter.js`: `subscribeTyping`, `broadcastTyping`,
  `unsubscribeTyping`. Falha graciosa se o projeto não tiver broadcast habilitado
  (o chat permanece 100% funcional, apenas sem o indicador).
- `kc-api.chat.js` + `local.chat.adapter.js`: expostos na fachada; stub local
  retorna null/no-op (sem Realtime).
- `chat-inbox.controller.js`: estado `typingChannel`/`typingBroadcastTimer`/
  `typingResetTimer`; `onInputTyping` debounced 1.5s chama `broadcastTyping`;
  `handleTyping` mostra o indicador por 3s; limpeza em back/cleanup/envio.
- `kc-chat.css`: `.kc-chat-typing` com keyframe `kc-chat-typing-bounce`.

### Feature 3 — Microinterações estéticas

- Shimmer animado sobre os skeletons (gradiente que desliza via
  `kc-chat-shimmer`).
- Botão "descer para o fim" com animação de entrada (bounce suave via
  `cubic-bezier`) e badge de contagem de não-lidas (`kc-chat-jump__badge`).
- Hover states consistentes (transições de 120ms já presentes, refinadas).

## Arquivos alterados (6 + cache-bust)

- `assets/js/controllers/public/chat-inbox.controller.js` (v9.3.5.17)
- `assets/js/adapters/supabase/supabase.chat.adapter.js` (v8.6.2)
- `assets/js/adapters/local/local.chat.adapter.js` (v8.6.2)
- `assets/js/api/kc-api.chat.js` (v8.6.2)
- `assets/css/kc-chat.css` (v8.6.3)
- `mensagens.html` (cache-bust dos 5 assets)

## Validação

- `npm run check:all`: 195 suites / 3.806 testes / 3 snapshots aprovados;
- `tests/contract/chat-continuity-contract.test.js`: 7/7 (todos os contratos
  preservados: getSignedUrl, data-media-retry, drafts, debounce, etc.);
- `npx playwright test`: 83/83 specs Chromium aprovadas;
- captura desktop+mobile: zero `pageerror`, layout íntegro, sem overflow;
- `git diff --check`: sem erros de whitespace.

## Segurança e compatibilidade

- **Nenhuma mudança de schema, RLS, policy, RPC ou dado.** Produção intocada.
- Fail-safe do broadcast: se o Realtime broadcast não estiver disponível, o chat
  continua funcionando sem o indicador — nada quebra.
- IDs/classes/eventos que o controller e o FAB global esperam: intocados.
- Roteamento `?with=<user_id>` e `#c/<conversation_id>`: mantido.
- Fachada `KCAPI.chat` permanece congelada; as 3 novas funções foram adicionadas
  em `_KCAPI.chat` (camada compartilhada), não em `KCAPI.chat` direto.

## Rollback

Reverter o commit restaura o chat ao estado anterior. Sem efeito em produção
(tudo é frontend). O broadcast channel, se criado, é efêmero e some ao
desconectar.
