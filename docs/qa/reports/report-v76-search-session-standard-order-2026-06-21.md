# V76.46 — ordem padrão por consulta

**Data:** 2026-06-21
**Escopo:** `/search-results.html` e runtime local da busca

## Resultado

A explicação da personalização agora oferece o toggle `Ordem padrão`. A ação ignora o reranking
somente na consulta atualmente visível, refaz a ordenação com o score comum e mantém consulta,
filtros e candidatos intactos. O estado não entra em URL, cookie, `localStorage`, analytics ou
perfil e é descartado quando a consulta muda.

Enquanto o bypass está ativo, a página confirma `Ordem padrão nesta busca`; o mesmo botão de
alternância permanece com `aria-pressed=true` e permite reativar o reranking. Preferências e
afinidade autorizadas não são apagadas; continuam gerenciáveis nas configurações. Ordenações
por data ou engajamento permanecem fora do reranking como antes.

## Contratos

- nenhuma mudança em Supabase, migration, RPC, grant ou dados reais;
- nenhum impacto no dropdown ou em outra consulta;
- `aria-pressed` expõe o estado do botão;
- E2E cobre ativação, ordem comum, ausência da explicação nos cards, consentimento preservado,
  reativação e layout mobile;
- rollback: remover o botão e a opção `disabled` restaura integralmente a V76.44.

## Validação

- `npm run check:all`: 195 suites, 3.806 testes e 3 snapshots aprovados;
- `npm run test:e2e`: 83/83 cenários Chromium aprovados;
- `npm run benchmark:search-shadow`: 12/12 casos, recall/precision/stability iguais a 1,
  p95 de 15,629 ms;
- E2E focado de personalização: 3/3;
- cache-bust `kc-search.js?v=8.6.5`: 16 consumidores e contratos atualizados;
- nenhuma alteração em `supabase/`, schema, flags, consentimento persistido ou analytics.
