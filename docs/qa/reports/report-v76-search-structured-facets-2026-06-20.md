# Relatório V76.40 — critérios removíveis e facetas estruturadas

**Data:** 2026-06-20  
**Escopo:** `/search-results.html`, `kcSearchDropdown` e pipeline estruturado 1.2  
**Estado:** implementado sob flags; desligado por padrão

## Resultado

Quando `search.structuredRuntime=true` e `search.structuredPilot=true`, a página de
resultados torna visíveis os critérios que realmente participaram da seleção:
módulo, intenção e filtros suportados. Cada critério é um botão removível; a remoção
vale apenas para a consulta atual em memória e `Reaplicar` restaura o plano original
sem alterar o texto pesquisado.

O seletor explícito de módulo prevalece sobre a inferência da frase. As opções de
módulo recebem contagens agregadas calculadas após os demais critérios, restritas aos
seis módulos do registry. Valores textuais livres não são reproduzidos em chips.

## Estados vazios e dropdown

- vazio estruturado explica que os critérios podem estar restritivos;
- `Remover critérios entendidos` amplia a busca sem reescrever a consulta;
- filtros removidos podem ser reaplicados;
- o dropdown vazio resume até três critérios canônicos e encaminha para a página de
  ajuste completo;
- sem as duas flags, markup progressivo permanece oculto e o fluxo legado continua.

## Evidências

- contratos focados de pipeline, piloto e página: 28/28;
- E2E estruturado: 6/6 em Chromium, incluindo viewport 390×844 sem overflow;
- baseline consolidado: 189 suites Jest / 3772 testes / 3 snapshots;
- inventário Playwright: 11 specs / 74 testes listados;
- benchmark sintético: 12/12, recall/precisão/estabilidade de 100% e zero falso
  positivo;
- auditoria SEO sem warnings/erros e auditoria de ownership CSS concluída sem mover
  seletores entre buckets.

## Privacidade, risco e rollback

Nenhum chip, remoção ou faceta é salvo em perfil, storage ou analytics. A saída do
pipeline contém IDs/pontuações, nomes de sinais e contagens agregadas; não contém a
consulta crua nem conteúdo dos posts. Módulos desconhecidos são descartados da
agregação. Não houve migration, RPC, RLS, Supabase ou coleta comportamental.

O rollback é desligar qualquer uma das duas flags. O HTML permanece funcional sem o
runtime estruturado e qualquer falha de contrato continua retornando a coleção
legada.

## Próximo gate

PR-H: dossiê SQL/RPC exclusivamente em ambiente isolado, com RLS, `EXPLAIN`, timeout,
rollback e decisão Go/No-Go antes de qualquer migration remota.
