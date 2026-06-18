# Report V76 - Contrato de seis imagens do Cadu

**Data:** 2026-06-17
**Escopo:** publisher Node e Edge Function `cadu-publish`
**Tipo:** correção funcional de baixo risco + contrato + documentação
**Status:** PASSOU localmente
**Runtime alterado:** sim, apenas no pipeline confiável do Cadu

---

## 1. Objetivo

Concluir as alterações locais interrompidas que elevavam de cinco para seis o
limite de imagens do Cadu. O estado inicial estava inconsistente: mapper e
endpoint Deno usavam seis, enquanto o publisher Node havia perdido o limite e os
guias ainda informavam cinco.

## 2. Decisão técnica

O contrato final aceita até seis URLs HTTP/HTTPS válidas e únicas:

- a ordem de entrada é preservada;
- a primeira imagem continua sendo a capa;
- as demais continuam em `post_media`, com `sort_order` estável;
- duplicatas e URLs inválidas são removidas antes do truncamento;
- a sétima imagem e as seguintes não são baixadas nem enviadas ao Storage;
- chamadas diretas de `prepareImagesForPost` recebem a mesma proteção;
- `supabase/functions/cadu-publish/mapper.ts` exporta o limite usado também por
  `index.ts`, evitando duas constantes independentes no runtime Deno.

O limite dos formulários usados por pessoas não foi alterado. Nenhuma migration,
policy, tabela, secret, provider, página pública, CSS ou configuração Vercel foi
modificada.

## 3. Arquivos afetados

- `services/cadu-ufg-publisher/src/publisher.js`
- `supabase/functions/cadu-publish/index.ts`
- `supabase/functions/cadu-publish/mapper.ts`
- `tests/unit/cadu-ufg-publisher.test.js`
- `tests/integration/cadu-trusted-publisher-contract.test.js`
- guias de operação, endpoint e hardening do Cadu
- `CHANGELOG.md` e índices de QA/documentação

## 4. Cobertura adicionada

Os testes novos comprovam:

1. deduplicação de uma URL repetida em formatos string e objeto;
2. descarte de URL com protocolo inválido;
3. preservação das seis primeiras imagens válidas;
4. ausência de upload para a sétima imagem em chamada direta;
5. compartilhamento da constante entre mapper e endpoint Deno.

## 5. Validação local

| Gate | Resultado |
|---|---|
| `git diff --check` | passou; apenas avisos LF/CRLF esperados no Windows |
| testes focados do Cadu | passou; 2 suites / 62 testes |
| `deno check --node-modules-dir=auto supabase/functions/cadu-publish/index.ts` | passou |
| busca residual por limite antigo no escopo Cadu | passou; nenhuma ocorrência |
| `npm run check:all` | passou; 5 validadores, 176 suites, 3.593 testes e 3 snapshots |
| `npx playwright test --list` | passou; 59 testes em 9 arquivos |

## 6. Deploy e rollback

O merge do código não atualiza automaticamente a Edge Function remota. Após CI
verde, o deploy deve usar o projeto Supabase canônico e ser seguido por consulta
read-only de versão, status e hash, sem registrar secrets.

Rollback de código: reverter o PR restaura o limite anterior. Rollback remoto:
republicar a revisão anterior da função caso o smoke test operacional falhe.

## 7. Risco residual

O pipeline pode processar uma imagem adicional por publicação, aumentando de
forma limitada tráfego, armazenamento e tempo de execução. O teto de 8 MB por
imagem, a validação de URL, o filtro de fontes temporárias e as regras de Storage
permanecem inalterados.
