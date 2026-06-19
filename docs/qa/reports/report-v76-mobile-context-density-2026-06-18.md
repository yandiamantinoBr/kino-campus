# Report V76.24 — densidade mobile do contexto dos módulos

**Data:** 2026-06-18
**Escopo:** faixa de título e bottom sheet contextual dos seis feeds públicos
**Runtime frontend:** `8.6.1` inalterado

## Resultado

A faixa mobile que reúne ícone, título do módulo e acesso ao contexto foi
compactada para 50 px de altura, com margem inferior de 10 px. O acionador de
informação passou a 38 px e foi integrado visualmente ao mesmo card, reduzindo a
sensação de espaço vazio observada após a V76.23.

O diálogo mobile agora é um bottom sheet flutuante, com margem de 8 px, raio de
18 px e indicador visual superior. Cabeçalho, corpo e tipografia receberam
paddings menores. O `<details>` é clonado recolhido, mantendo a informação longa
sob demanda e reduzindo a altura inicial do diálogo.

## Arquivos funcionais

- `assets/css/kc-sidebar-context.css`
- `assets/js/features/kc-sidebar-context.js`
- `tests/unit/kc-sidebar-context.test.js`
- `tests/e2e/context-404-responsive.spec.js`

## Contratos preservados

- O markup dos seis HTMLs não foi alterado.
- O contexto desktop continua abaixo do ranking e visível na sidebar.
- A abertura, backdrop, Escape, trap de foco e restauração de foco permanecem.
- Os conteúdos editoriais e links de cada módulo não foram reescritos.
- Nenhum controller, banco, Supabase, Vercel, anúncio ou runtime version mudou.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `node --check assets/js/features/kc-sidebar-context.js` | aprovado |
| Jest focado | 2 suites / 13 testes aprovados |
| E2E focado em 390×844 | 8/8 testes aprovados |
| Contrato da faixa mobile | altura ≤52 px; margem inferior ≤10 px; botão ≤38 px |
| Contrato do diálogo | altura inicial ≤320 px e `<details>` recolhido |
| `npm run audit:css` | aprovado; CSS dedicado em 6 páginas |
| `npm run check:all` | 180 suites / 3.616 testes / 3 snapshots aprovados |
| Navegador mobile 390×844 | faixa 51,19 px; botão 37,99 px; sem overflow horizontal |
| Modal no navegador | 193,15 px inicial; `<details>` recolhido; sem erros ou alertas no console |
| CI do PR #587 | validadores/Jest/lista Playwright, Lighthouse, Vercel e preview aprovados |

## Rollback

Reverter somente o bloco mobile de `kc-sidebar-context.css`, restaurar o clone
aberto em `kc-sidebar-context.js` e retornar as expectativas correspondentes dos
dois testes. Não há rollback remoto ou de dados.
