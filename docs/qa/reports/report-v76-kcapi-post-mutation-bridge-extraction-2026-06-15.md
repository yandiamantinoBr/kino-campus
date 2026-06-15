# Report V76 - KCAPI Post Mutation Bridge Extraction

**Data:** 2026-06-15
**Escopo:** JS-I.3 do plano `docs/planning/v76-hotspot-decomposition-plan.md`
**Tipo:** refactor runtime controlado + contratos estáticos/runtime
**Status:** PASSOU
**Runtime alterado:** sim, apenas delegação interna da ponte de freshness de posts

---

## 1. Objetivo

Executar o candidato JS-I.3 apontado pelo inventário residual: remover da fachada
`assets/js/api/kc-api.client.js` a ponte privada `emitPostMutation` e suas funções auxiliares.

O contrato público permanece:

- `KCAPI.createPost(body)`
- `KCAPI.updatePost(postId, payload)`
- `KCAPI.deletePost(postId)`
- `KCAPI.togglePostStatus(postId)`
- `KCAPI.renewPost(postId)`
- `KCAPI.bumpPost(postId)`
- `KCAPI.closePost(postId, payload)`
- `KCAPI.reactivatePost(postId)`

Os eventos de freshness continuam sendo emitidos depois do retorno do driver ativo, mas a lógica de
montagem do payload agora fica concentrada em `window._KCAPI.postsWrite`.

---

## 2. Arquivos alterados no repositório

- `assets/js/api/kc-api.client.js`
- `assets/js/api/kc-api.posts-write.js`
- `scripts/audit-kcapi-facade-residual.js`
- `tests/contract/kc-api-facade-contract.test.js`
- `tests/integration/kc-api-posts-write-module.test.js`
- documentos de arquitetura, planejamento, índice e QA relacionados

Nenhum HTML, CSS, adapter local/Supabase, migration, secret, provider ou deploy foi alterado.

---

## 3. Decisão técnica

Antes:

- a fachada declarava `isPostMutationOk`;
- a fachada declarava `getPostMutationData`;
- a fachada declarava `emitPostMutation`;
- o inventário classificava essas três funções como bucket `post-mutation-bridge`.

Depois:

- `window._KCAPI.postsWrite` exporta `emitPostMutation`, `isPostMutationOk` e
  `getPostMutationData`;
- `buildPostsWriteDeps()` passa `postFreshness: window.KCPostFreshness`;
- a fachada mantém somente `emitPostsWriteMutation`, um wrapper interno curto que chama a ponte do
  submódulo;
- a ordem de emissão foi preservada: primeiro o driver/submódulo retorna, depois o evento de
  freshness é emitido;
- `window.KCAPI` permanece com 107 membros públicos.

Rollback simples: reverter este PR devolve as três funções privadas para a fachada sem tocar dados,
HTML, CSS, adapters ou providers.

---

## 4. Inventário residual após JS-I.3

Fonte: `npm run audit:kcapi-residual` em 2026-06-15.

| Métrica | Valor |
|---|---:|
| `assets/js/api/kc-api.client.js` | 1.459 linhas / 56.513 bytes |
| Membros públicos `window.KCAPI` | 107 |
| Declarações `function` | 141 |
| Wrappers exportados/globais | 98 |
| Namespaces `_KCAPI.*` inicializados | 17 |
| Buckets residuais | 10 |

Buckets principais atualizados:

| Bucket | Funções | Linhas | Exportadas | Delegam | Driver | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| `public-delegation-wrappers` | 80 | 668 | 80 | 80 | 18 | 62 |
| `bootstrap-driver-core` | 12 | 131 | 6 | 0 | 1 | 2 |
| `internal-helpers` | 9 | 29 | 0 | 9 | 0 | 0 |

O bucket `post-mutation-bridge` não aparece mais. O único candidato JS listado pelo script passa a
ser `bootstrap-driver-core`, mantido como P3 por risco alto e sem extração imediata.

---

## 5. Cobertura reforçada

Testes existentes reforçados:

- `tests/contract/kc-api-facade-contract.test.js` agora exige que a fachada não declare
  `emitPostMutation`, `isPostMutationOk` ou `getPostMutationData`.
- `tests/contract/kc-api-facade-contract.test.js` também fixa a injeção de
  `postFreshness: window.KCPostFreshness`.
- `tests/integration/kc-api-posts-write-module.test.js` cobre emissão de evento, fallback quando
  `result.data` não traz objeto de post e bloqueio de emissão para resultado inválido ou freshness
  ausente.

---

## 6. Validação local

Validação executada nesta etapa:

```text
node --check assets/js/api/kc-api.client.js
node --check assets/js/api/kc-api.posts-write.js
node --check scripts/audit-kcapi-facade-residual.js
npm test -- tests/integration/kc-api-posts-write-module.test.js tests/contract/kc-api-facade-contract.test.js
npm run audit:kcapi-residual
npm run audit:kcapi-residual -- --json
```

Resultados:

| Gate | Resultado |
|---|---|
| `node --check` nos JS tocados | passou |
| suites `kc-api-posts-write-module` + `kc-api-facade-contract` | passou; 57 testes |
| `npm run audit:kcapi-residual` | passou; 10 buckets residuais |
| `npm run audit:kcapi-residual -- --json` | passou |
| `git diff --check` | passou |
| `npm run check:all` | passou; 175 suites / 3577 testes Jest |
| `npx playwright test --list` | passou; 59 testes em 9 arquivos |

---

## 7. Próxima etapa

Seguir com uma frente única:

1. manter `bootstrap-driver-core` sem extração imediata e escolher um ajuste CSS-C de baixo risco,
   com base no dossiê visual existente; ou
2. executar CSS-B autenticado para dashboard/admin real antes de qualquer split visual; ou
3. abrir uma investigação específica para `bootstrap-driver-core`, sem editar runtime no primeiro
   passo.
