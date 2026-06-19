# Report V76.25 — densidade mobile do contexto da home

**Data:** 2026-06-18  
**Escopo:** card `Sobre o KinoCampus` da sidebar contextual da home  
**Runtime frontend:** `8.6.1` inalterado

## Resultado

O contexto institucional da home deixou de ocupar aproximadamente 177 px no
mobile e passou a uma faixa de 50 px. Ícone, título e acionador de 38 px usam o
mesmo tratamento visual compacto dos seis módulos públicos.

A descrição, o `<details>` editorial e o link para `sobre.html` permanecem no
DOM e são apresentados no diálogo contextual compartilhado. O estado inicial do
diálogo mediu 215,23 px em 390×844, com os detalhes longos recolhidos. No desktop,
o card original permanece completo e o acionador mobile fica oculto.

## Arquivos funcionais

- `index.html`
- `assets/css/kc-sidebar-context.css`
- `assets/js/core/kc-i18n.js`
- `assets/js/features/kc-sidebar-context.js` (reuso sem alteração)
- `tests/e2e/context-404-responsive.spec.js`

## Contratos preservados

- o conteúdo institucional e o link para a página Sobre não foram reescritos;
- os seis módulos mantêm a faixa e o modal introduzidos nas V76.23/V76.24;
- Escape, backdrop, trap/restauração de foco e scroll lock continuam compartilhados;
- desktop continua exibindo descrição e detalhes diretamente na sidebar;
- nenhum controller, banco, Supabase, Vercel ou runtime version mudou.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `node --check assets/js/features/kc-sidebar-context.js` | aprovado |
| Jest focado | 1 suite / 1 teste aprovado |
| E2E responsivo focado | 9/9 testes aprovados |
| `npx playwright test --list` | 10 specs / 68 testes listados |
| Card mobile 390×844 | 50 px; botão 37,99 px; sem overflow horizontal |
| Modal mobile | 215,23 px; `<details>` recolhido; sem erros ou alertas no console |
| Desktop 1280×800 | conteúdo completo visível; acionador mobile oculto |
| `npm run audit:css` | aprovado; CSS contextual carregado em 7 páginas |
| `npm run seo:audit` | aprovado; 0 warnings / 0 errors |
| `npm run check:all` | 180 suites / 3.616 testes / 3 snapshots aprovados |
| CI do PR #588 | validadores/Jest/lista Playwright, Lighthouse, Vercel e preview aprovados |

## Rollback

Remover da home o link/script contextual, restaurar o `h3` simples e a classe
original do aside, e retirar somente os seletores `.kc-sidebar--home-context` e
`.kc-home-context-*` do CSS dedicado. Não há rollback remoto ou de dados.
