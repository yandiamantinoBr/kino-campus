# V76.49 — higiene de documentação e comentário de flag

**Data:** 2026-06-21
**Branch:** `codex/v76-docs-hygiene`
**Escopo:** correções de drift e esclarecimento de flag sem alteração de runtime

## Resultado

Três correções pontuais de higiene identificadas durante a revisão da rodada
V76.32–V76.46. Nenhuma altera comportamento, schema, ranking, storage ou rede.

1. **`docs/index.md`:** a linha de trabalho estava estagnada em `v76.40`, embora os
   relatórios já tivessem avançado até V76.46 (PR #609). Atualizada para refletir
   o estado real da sequência de busca/personalização e o No-Go vigente de
   migration/SQL até o reparo da cadeia canônica.
2. **`docs/planning/_INDEX.md`:** a descrição do plano
   `v76-search-personalization-architecture-plan.md` passou a indicar a fase
   seguinte (reparo da cadeia de migrations e reavaliação do gate SQL por
   evidência) em vez do gate de prova descartável já executado.
3. **`assets/js/boot/kc-env.js`:** a flag `search.personalization` (default `true`)
   recebeu comentário explicando que ela apenas libera a UI/integração local de
   preferências e afinidade (PR-J/K). O efeito real de reranking permanece atrás
   de consentimento explícito triplo (`mode=personalized` + `consent.granted=true`
   + `localAffinityConsent=true`) e o fallback é sempre o ranking comum.

## Validação

- `check:version`: aprovado (VERSION.json 75.1.0 / 8.6.1 íntegro);
- `check:structure`: aprovado (169 itens + raiz assets/js/ limpa);
- `check:scripts`: aprovado (cadeia de boot em 28 HTMLs);
- `check:hygiene`: aprovado (8.6.1);
- Jest focado (`kc-feature-flags`/`kc-env`): 12/12 aprovados;
- `git diff --check`: sem erros de whitespace.

## Rollback

Reverter o commit restaura integralmente o estado anterior. Não há migration,
RPC, storage, analytics, flag funcional, ranking ou HTML alterado.
