# Navigation Map v8.2

## 1) Redirects ponte (compatibilidade)

| Origem legada | Destino final atual | Preserva querystring? |
| --- | --- | --- |
| `caronas.html` | `caronas-feed.html` | **SIM** |
| `compra-venda.html` | `compra-venda-feed.html` | **SIM** |

## 2) Links principais do `index.html` para destinos finais atuais

### Header (`.kc-nav-links`)
- Achados/Perdidos → `achados-perdidos.html`
- Eventos → `eventos.html`
- Moradia → `moradia.html`
- Oportunidades → `oportunidades.html`

### Tabs do feed (`.kc-feed-tabs`)
- Destaque → `#` (aba local ativa da página atual)
- Compra e Venda → `compra-venda-feed.html`
- Caronas → `caronas-feed.html`
- Livros → `compra-venda-feed.html?filter=livros`
- Eletrônicos → `compra-venda-feed.html?filter=eletronicos`
- Roupas → `compra-venda-feed.html?filter=vestuario`
- Moradia → `moradia.html`
- Eventos → `eventos.html`
- Sustentabilidade → `eventos.html?filter=sustentabilidade`

### Navegação móvel (`.kc-mobile-nav`)
- Início → `index.html`
- Eventos → `eventos.html`
- Criar post (botão `+`) → `create-post.html`
- Comprar → `compra-venda-feed.html`
- Menu → ação local (`openMobileMenu()`)

## 3) Regra explícita de roteamento de UI

**Regra:** links de UI devem preferir páginas `*-feed.html` como destino canônico de listagens. Páginas legadas (ex.: `caronas.html`, `compra-venda.html`) devem existir apenas como ponte de compatibilidade via redirect, preservando querystring.

## 4) Checklist curto de regressão

- [ ] Validar que nenhum link novo de UI aponta para `caronas.html` ou `compra-venda.html`.
- [ ] Confirmar que redirects ponte levam ao `*-feed.html` correspondente sem loop.
- [ ] Confirmar preservação de querystring nos redirects (ex.: `?filter=...`, `?q=...`).
- [ ] Verificar que o estado/contexto funcional da navegação continua após redirect (filtros ativos e resultados coerentes).
