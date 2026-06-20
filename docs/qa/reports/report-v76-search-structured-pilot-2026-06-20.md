# Relatório V76.39 — piloto estruturado de busca

**Data:** 2026-06-20  
**Escopo:** `/search-results.html`, `kcSearchDropdown` e seleção estruturada no frontend  
**Estado:** implementado sob flags; desligado por padrão

## Resultado

O pipeline estruturado pode ordenar e filtrar os posts já devolvidos pelo driver nas
duas superfícies de busca. A ativação exige simultaneamente:

- `search.structuredRuntime=true`;
- `search.structuredPilot=true`.

Sem as duas flags, não há carregamento dos quatro assets estruturados nem alteração
do comportamento legado. O piloto não amplia a descoberta no Supabase: ele atua
somente sobre os candidatos já retornados por `KCAPI.searchPosts`.

## Política de seleção e fallback

- módulo, intenção ou filtro suportado é necessário para aplicar o candidato;
- os IDs sanitizados são reconciliados com os objetos originais, sem substituir o
  contrato público dos cards;
- uma resposta vazia confiável é respeitada;
- ID inconsistente, runtime indisponível ou exceção restaura integralmente a lista
  legada;
- consultas não são incluídas nos avisos de erro;
- dropdown e página de resultados informam políticas próprias ao pipeline.

## Evidências

- integração do piloto: 6/6 testes;
- loader + piloto: 11/11 testes focados;
- E2E do gate: 2/2 testes em Chromium;
- flags desligadas: zero requisições para registry, projector, parser e pipeline;
- flags ligadas: quatro assets locais carregados, dropdown conectado e nenhum erro
  de página;
- verificador do snapshot portável entre LF/CRLF, sem drift falso no Windows;
- baseline consolidado: 189 suites Jest / 3767 testes / 3 snapshots;
- inventário Playwright: 11 specs / 70 testes listados.

## Privacidade, risco e rollback

Este gate não coleta comportamento, não cria perfil, não grava preferências e não
altera banco, RLS ou RPC. O rollback operacional é desligar qualquer uma das duas
flags; o caminho legado permanece no mesmo módulo e é usado automaticamente em
falha. Logs não recebem o texto consultado.

## Próximo gate

PR-G.2: chips removíveis, facetas e zero-results explicável, ainda sem migration e
sob as mesmas duas flags. Personalização comportamental e sincronização permanecem
fora do escopo.
