# Kino Campus — Patch V7.0.0 (Sprint 1)

Este .zip contém **somente** os arquivos alterados na primeira subetapa da Fase 1 (Saneamento):
- Normalização de usuários (MOCK_USERS) e introdução do campo **authorId** no contrato de Post **via KCAPI**.
- Atualização de versionamento em `kc-core.js` (sem regressão visual/comportamental).

## Como aplicar
1. Extraia este zip na raiz do projeto **kinocampus-V6.1.0-clean-padronizado** (sobrescrevendo arquivos).
2. Abra `index.html` (recomendado via servidor local) e valide que nada mudou visualmente.
3. (Opcional) No console do navegador, rode:
   - `KCAPI.getDatabaseNormalized().then(r => console.log(r.users.length, r.posts[0]))`

## Arquivos incluídos
- `kino-campus/assets/js/kc-api.client.js`
- `kino-campus/assets/js/kc-core.js`

## Observação
Nesta sprint **nenhuma página HTML foi refatorada** ainda para consumir `KCAPI.getPosts()`.
Isso será feito na próxima rodada (V7.0.1).
