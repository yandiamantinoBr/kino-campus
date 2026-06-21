# Relatório V76.42 — combobox, cancelamento e desempenho da busca

**Data:** 2026-06-20
**Escopo:** `kcSearchDropdown`, resultados e modal mobile
**Estado:** implementado; flags estruturadas desligadas

## Resultado

O dropdown agora usa o padrão combobox/listbox: o foco permanece no input, enquanto
`aria-activedescendant` e `aria-selected` comunicam a opção ativa. Setas, Home, End,
Enter, Escape e Tab funcionam no cabeçalho e no modal mobile. Mensagem vazia usa
`role=status`; ações do popup são opções reais do listbox.

Cada nova consulta cria um `AbortController`, encerra a anterior e usa também um
sequence guard. Assim, drivers sem suporte físico a abort ainda não conseguem renderizar
resposta obsoleta. O sinal atravessa `KCAPI`, adapter local, adapter Supabase e o builder
PostgREST por `abortSignal`.

## Desempenho e privacidade

Um buffer circular de no máximo 40 amostras fica apenas em memória. O snapshot contém
surface, contagens, abortos, stale/errors, p50, p95 e máximo. Não contém consulta, IDs,
conteúdo, usuário, sessão ou preferência; nada é salvo ou enviado.

Nos cenários Chromium com drivers sintéticos locais, dropdown e resultados concluíram
abaixo do gate de 1.000 ms. Esse teto é um gate de regressão do teste, não SLA de produção.

## Evidências

- Jest focado: 3 suites / 34 testes aprovados;
- novos contratos: 4 testes (combobox/concorrência, Supabase abort e local fetch);
- baseline completo: 191 suites / 3.784 testes / 3 snapshots;
- E2E focado: 10/10 em Chromium;
- inventário Playwright: 11 specs / 78 testes;
- desktop: foco preservado, setas/Home/End/Escape e atributos ARIA;
- mobile 390×844: mesmo combobox, primeiro Escape fecha popup e segundo fecha modal;
- dropdown e resultados: requisição lenta abortada e resposta antiga ausente do DOM;
- métricas: p95 abaixo de 1.000 ms e ausência do texto pesquisado.
- benchmark shadow: 12/12, recall/precisão/estabilidade de 100%, zero falso positivo;
- SEO sem warnings/erros e auditoria de ownership CSS concluída.

## Compatibilidade e rollback

As duas flags estruturadas seguem `false`; o combobox melhora também o caminho legado.
Não houve migration, RPC, grant, perfil, storage ou analytics. Cache busting foi elevado
para `kc-search.js?v=8.6.4`, `kc-search-modal.js?v=8.6.2` e `styles.css?v=8.6.5`.

Rollback: reverter os três assets e seus query params. Os adapters continuam compatíveis
com chamadas sem `signal`; métricas desaparecem com o reload por serem somente memória.

## Próximo gate

PR-J: preferências explícitas, consentimento e direitos, ainda sem afinidade implícita.
