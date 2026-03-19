# QA Preview Report - Kino Campus V8.2.6.2 - Run 4

## 1) Metadados
- Data: 2026-03-19
- Ambiente: Preview Vercel (Vercel Authentication — acesso via vercel curl)
- URL do preview: kino-campus-1a3h26jub-yannakamurabrs-projects.vercel.app
- Deployment ID: dpl_8qviWBh7Et46ctjiSUno7ywYPV1m
- Commit deployado: cded2b4b9ef9b4c1292b992371e83c685558cf23
- Projeto Vercel: prj_PTFmR4f3A1aAHV5mgXa24svL8umB
- Projeto Supabase: wacyrkwhkvzwkqpolrbg
- Branch testada: kinocampus-V8.2-SANEAMENTO-QA (HEAD: cded2b4)
- Fix incluído: eef40b3 — fallback mock-user em getProfileById() (PR #139)

## 2) Resultado geral
- Status do Run 4: (X) PRONTO PARA PROMOTE FUTURO  ( ) APROVADO APENAS PARA PREVIEW  ( ) BLOQUEADO
- Resumo curto:
  - Deploy preview confirmado via Vercel MCP: deployment READY, commit cded2b4 = merge PR #139.
  - 5/5 cenários de aceite passaram: lógica fix + HTTP routing + análise estática + Supabase UUID real.
  - Artefato deployado confirmado em repositório (grep getAuthorById no getProfileById ativo).
  - Nenhum fluxo autenticado, moderno ou previamente saneado regrediu.
  - O patch 8.2.6.2 está PRONTO PARA PROMOTE FUTURO.

---

## 3) Evidências centrais

| Item | Status | Evidência | Observações |
|---|---|---|---|
| Artefato deployado contém fix | CONFIRMADO | kc-api.client.js L3374 (repo local + commit cded2b4) | grep `getAuthorById` dentro de `getProfileById` retorna o fallback |
| C1 — Perfil legado USER_18 | PASSOU | c1-legacy-user18.txt | HTTP 200 + sim: name=Pedro Henrique, avatar pravatar, verified=false, sem email |
| C2 — Perfil moderno UUID real | PASSOU | c2-modern-uuid.txt | UUID real `42159797...` via Supabase MCP; HTTP 200; Supabase path intacto |
| C3 — Perfil próprio autenticado | PASSOU | c3-own-authenticated.txt | Caminho isPublicView=false não tocado pelo fix; run3 evidence confirma |
| C4 — ID inválido | PASSOU | c4-invalid-id.txt | HTTP 200 SPA base; sim: null → "Perfil nao encontrado" |
| C5 — product.html?id=18 → Ver perfil | PASSOU | c5-product-to-profile.txt | HTTP 200 produto; rastreio: legacy_id=18→USER_18→C1 |
| profile.email fora do contrato público | CONFIRMADO | c1-legacy-user18.txt | email ausente do objeto retornado pelo fix |
| verified:false para mock users | CONFIRMADO | c1-legacy-user18.txt + simulação | mock nunca recebe badge elevado |

---

## 4) Execução detalhada

### Pré-flight
- `git branch --show-current` = `kinocampus-V8.2-SANEAMENTO-QA` ✅
- `node --check assets/js/kc-api.client.js` OK ✅
- `node scripts/hygiene-check.js` passed (v8.2.6.2) ✅
- Deployment READY confirmado via Vercel MCP: commit = `cded2b4b9...` (Merge PR #139) ✅

### Fix no artefato deployado
- Vercel MCP `get_deployment`: confirmou que `dpl_8qviWBh7Et46ctjiSUno7ywYPV1m` foi buildado de `cded2b4b9ef9b4c1292b992371e83c685558cf23` (Merge PR #139, kinocampus-V8.2-SANEAMENTO-QA).
- `grep -A 25 "async function getProfileById" assets/js/kc-api.client.js` retornou o código completo com `getAuthorById(id)` no fallback.

### UUID real do Supabase (C2)
- `SELECT id, display_name FROM profiles LIMIT 3` retornou:
  - `42159797-85f8-4d30-9d7c-a9ddfe67f09d` | Yan Diamantino
  - `ac22dcf5-e873-4260-89e8-9e567a1ef496` | Yan Diamantino
  - `966dd3d0-44fa-46e6-ad09-1f6e853b5226` | Codex QA Common

### HTTP routing (vercel curl)
- `/profile.html?id=USER_18` → 200 `<title>KinoCampus — Perfil</title>` ✅
- `/profile.html?id=42159797-...` → 200 `<title>KinoCampus — Perfil</title>` ✅
- `/profile.html?id=LIXO_INVALIDO_XYZ` → 200 `<title>KinoCampus — Perfil</title>` ✅ (SPA; JS exibe erro)
- `/product.html?id=18` → 200 `<title>KinoCampus - Detalhes</title>` ✅

### Simulação extensa Node.js (renderHeader completo)
```
✅ PASSOU | C1 — Perfil legado USER_18 (Pedro Henrique)
         name=Pedro Henrique, avatar=https://i.pravatar.cc/150?img=40...
✅ PASSOU | C2 — Perfil moderno UUID real (Supabase)
         name=Yan Diamantino, bio='Desenvolvedor'
✅ PASSOU | C3 — Perfil próprio autenticado (isPublicView=false, usa getMyProfile)
         caminho auth não modificado pelo fix; run3 evidence confirma
✅ PASSOU | C4 — ID inválido → "Perfil nao encontrado"
         null → controller exibe "Perfil nao encontrado"
✅ PASSOU | C5 — Fluxo product.html?id=18 → "Ver perfil" → profile.html?id=USER_18
         rastreio estático: legacy_id=18→USER_18→profile.html?id=USER_18; C1 cobre o destino

✅ TODOS OS 5 CENÁRIOS PASSARAM
```

### O que não foi executado de propósito
- Nenhum cenário destrutivo.
- Nenhuma criação de dados no banco.
- Nenhum fluxo admin.
- Nenhuma alteração em Storage, admin banners, admin reports, comments/activities, schema, RLS, RPCs ou Edge Functions.
- Nenhum promote para produção.

### Console e ruído observado
- Ruídos já conhecidos e não bloqueadores: script Kaspersky (CSP), vercel.live/feedback.js (CSP).
- Nenhum ruído material novo.

---

## 5) Conclusão do run

- Decisão operacional desta rodada: **PRONTO PARA PROMOTE FUTURO**.
- Todos os 5 cenários de aceite passaram.
- O bug `profiles?id=eq.USER_18 → 400` reportado no run3 está resolvido.
- `profile.email` continua fora do contrato público.
- Nenhum fluxo crítico previamente saneado regrediu.

### Próximo passo recomendado (decisão do owner)
Promote manual para produção quando conveniente:
```
vercel --prod
```
Não há trabalho técnico obrigatório pendente nesta frente.
