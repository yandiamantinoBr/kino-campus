# Report V76.23 — contexto responsivo dos módulos e página 404

**Data:** 2026-06-18
**Escopo:** seis feeds públicos, diálogo contextual compartilhado e `404.html`
**Runtime frontend:** `8.6.1` inalterado

## Resultado

A etapa substitui o bloco contextual expandido no mobile por um acionador de
informação ao lado do título do módulo. O mesmo conteúdo da sidebar é clonado
para um diálogo acessível, sem mover os nós usados pelos controllers de filtros.
No desktop, o card contextual permanece visível e agora aparece depois do
ranking em todos os seis módulos.

A `404.html` deixou de herdar o grid de `.kc-main-content`, recebeu composição
dedicada e removeu o rodapé estático que coexistia com o
`kc-platform-footer` injetado por `kc-consent.js`.

## Arquivos funcionais

- `achados-perdidos.html`
- `eventos.html`
- `moradia.html`
- `oportunidades.html`
- `compra-venda-feed.html`
- `caronas-feed.html`
- `404.html`
- `assets/css/kc-sidebar-context.css`
- `assets/css/kc-error-page.css`
- `assets/js/features/kc-sidebar-context.js`
- `assets/js/features/kc-error-page.js`
- `assets/js/core/kc-i18n.js`

## Contratos preservados

- `frontendRuntimeVersion=8.6.1` não foi alterado.
- Nenhum controller de feed, filtro, ranking ou anúncio foi modificado.
- Nenhuma migration, policy, Edge Function, variável ou configuração Vercel foi alterada.
- O conteúdo editorial de cada `kc-sidebar-section--context` foi preservado.
- A 404 continua com `noindex, follow, noarchive` e canonical para o domínio raiz.

## Acessibilidade e interação

- Botões contextuais têm `type="button"`, `aria-haspopup="dialog"`,
  `aria-label` e chave `data-i18n-aria-label` específica por módulo.
- O diálogo usa `role="dialog"`, `aria-modal="true"` e título associado.
- Fechamento por backdrop, botão e tecla Escape.
- Trap de Tab/Shift+Tab e restauração de foco no acionador.
- Integração com `KCOverlayLock`, com fallback local para bloquear scroll.
- Ícones decorativos novos usam `aria-hidden="true"`.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `node --check` nos dois novos módulos | aprovado |
| `git diff --check` | aprovado |
| 3 suites Jest focadas | 16/16 testes aprovados |
| `npm run audit:css` | aprovado; novos CSS mapeados em 6 e 1 páginas |
| `npm run seo:audit` | aprovado sem warnings ou errors |
| `npm run check:all` | 180/180 suites, 3616/3616 testes, 3 snapshots |
| E2E focado `context-404-responsive.spec.js` | 8/8 testes aprovados |
| E2E completo | 66/67 aprovados; única falha no caso legado de header em 769 px no Windows |
| `npx playwright test --list` | 67 testes em 10 arquivos |
| Browser desktop em `/eventos.html` | contexto abaixo do ranking, sidebar visível, acionador mobile oculto, sem overflow |
| Browser desktop em `/404.html` | painel único, 6 destinos, 1 footer institucional, sem footer legado e sem overflow |
| Console do navegador em `/eventos.html` e `/404.html` | nenhum warning ou error |
| CI remoto do PR #586 | Validators/Jest/Playwright list, Lighthouse, Vercel e Preview Comments aprovados |

## Matriz E2E responsiva

O teste focado usa 390×844 para cada um dos seis módulos e confirma:

1. acionador contextual visível;
2. sidebar expandida oculta;
3. diálogo aberto com conteúdo não vazio;
4. fechamento por Escape;
5. foco restaurado ao botão;
6. ausência de overflow horizontal.

A 404 é validada em 1440×900 e 390×844, com painel central, seis destinos,
um único rodapé institucional e colunas empilhadas no mobile.

## Limitação conhecida fora do escopo

O caso `header-responsive.spec.js` em 769 px continua falhando no ambiente
Windows porque a largura CSS efetiva é reduzida pela barra de rolagem e cruza o
breakpoint de 767 px. A falha já existia antes desta etapa e nenhum seletor,
markup ou script do header foi modificado. Os outros 66 testes da rodada
completa, inclusive todos os oito novos cenários V76.23, passaram.

## Rollback

O rollback é inteiramente frontend: remover os quatro assets V76.23, restaurar
os seis títulos/ordem dos cards contextuais e recuperar o markup V76.20 da
`404.html`. Não há rollback de banco, Vercel ou Supabase.
