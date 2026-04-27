# assets/js/components/

Componentes UI reutilizáveis carregados diretamente via `<script defer>` nas páginas que os utilizam.
Não expõem namespace `window.*` — seus símbolos são funções globais simples ou variáveis de módulo.

---

## Componentes

### `carousel.js`

**Responsabilidade:** Hero carousel de banners promocionais exibido no topo das páginas de feed.
Controla slides, auto-rotação e navegação por swipe/botões.

| Campo | Valor |
|-------|-------|
| Namespace global | *(sem window.\*)* — funções globais `showSlide`, `changeSlide`, `goToSlide`, `refreshHeroCarousel` |
| Páginas que carregam | `index.html`, `_product.html`, `caronas-feed.html`, `compra-venda-feed.html`, `eventos.html`, `moradia.html`, `achados-perdidos.html`, `oportunidades.html`, `create-post.html`, `my-posts.html`, `ods.html` e demais feeds |
| Dependências em runtime | `window.KC_ENV` (detecta modo supabase/local) |

---

### `toast.js`

**Responsabilidade:** Notificações toast (snackbar) temporárias exibidas ao usuário para feedback
de ações (sucesso, erro, aviso, info).

| Campo | Valor |
|-------|-------|
| Namespace global | *(sem window.\*)* — função global `showToast(message, type, duration)` |
| Páginas que carregam | Todas as páginas públicas e admin (mesmas que carregam carousel.js) |
| Dependências em runtime | Nenhuma |

---

### `voting.js`

**Responsabilidade:** Sistema de votos (upvote/downvote) em publicações com sincronização via
Supabase Realtime ou polling. Persiste sessão de votos no `KCSessionStore`.

| Campo | Valor |
|-------|-------|
| Namespace global | *(sem window.\*)* — variáveis de módulo `kcVotesRealtimeChannel`, timers internos |
| Páginas que carregam | Todas as páginas de feed e produto (mesmas que carregam carousel.js) |
| Dependências em runtime | `window.KCSupabase`, `window.KCSessionStore`, `window.KCAPI` |

---

## Observações

- Os três componentes são carregados **após** a cadeia de boot e KCAPI nas páginas.
- Nenhum componente usa `import/export` — seguem o padrão global do projeto (Vanilla JS, sem bundler).
- Adicionados ao `CANONICAL_JS` do validator em v16.1.0.
