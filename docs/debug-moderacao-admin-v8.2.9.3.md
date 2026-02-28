# Debug Profundo — Moderação Admin KinoCampus
**Data:** 2026-02-28
**Versões analisadas:** frontend V8.1.11.0 · migrations v8.2.9.x + v8.2.10.x
**Projeto Supabase:** `wacyrkwhkvzwkqpolrbg`

---

## 1. Resumo Executivo

Após análise completa de banco, código, migrations e build system, foram identificadas **3 causas raiz** — uma delas com probabilidade alta de ser a responsável principal pelo "nada acontece" em produção:

| # | Hipótese | Status | Impacto |
|---|----------|--------|---------|
| H1 | Drift de ambiente (Vercel → Supabase) | ✅ Descartada | — |
| H2 | Admin não tem `is_admin = true` | ✅ Descartada — confirmado na query | — |
| H3 | RLS bloqueando UPDATE mesmo via SECURITY DEFINER | ⚠️ Parcialmente — `SET LOCAL row_security` não estava presente | Médio |
| H4 | Frontend em cache/release antiga | **🔴 Principal suspeita** | Alto |
| H5 | Estado local inconsistente após refresh | ⚠️ Possível UX (post some do filtro) | Baixo |
| H6 | Erro RPC não propagado / silencioso | **🔴 Confirmado: `client = null` não mostra toast** | Alto |

---

## 2. Evidências Coletadas

### 2.1 Banco de Dados (Supabase `wacyrkwhkvzwkqpolrbg`)

| Item | Resultado |
|------|-----------|
| `kc_admin_set_post_status` existe | ✅ SECURITY DEFINER, owner=postgres |
| `kc_is_admin` existe | ✅ Correta |
| `kc_admin_close_reports` existe | ✅ Correta |
| `kc_report_post` existe | ✅ Correta |
| Admin `yandiamantino@egresso.ufg.br` com `is_admin = true` | ✅ Confirmado |
| Políticas RLS de UPDATE em `posts` | ✅ `posts_update_authenticated` (v8.2.10.0) |
| `FORCE ROW LEVEL SECURITY` na tabela `posts` | ✅ Ausente — não é a causa |
| Função responde `AUTH_REQUIRED` sem JWT | ✅ Confirmado via REST |

### 2.2 Frontend (controller V8.1.11.0)

```
Estado do código:
- Committed no git: SIM (com RPC call)
- Git status: modificado localmente (só CRLF vs LF — sem diferença funcional)
- Versão deployada: depende do sucesso do build Vercel
```

### 2.3 Build System

**🔴 BUG ENCONTRADO — Nome de variável divergente:**

| Arquivo | Variável esperada | Variável no inject-env.js |
|---------|------------------|--------------------------|
| `.env.example` | `KC_SUPABASE_URL` | ❌ Não listada |
| `.env.example` | `KC_SUPABASE_ANON_KEY` | ❌ Não listada |
| `inject-env.js` | — | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |

Se o Vercel foi configurado com `KC_SUPABASE_URL` (seguindo o `.env.example`), o `inject-env.js` **falha na build com exit code 1** e o Vercel continua servindo o **último deploy bem-sucedido** (código antigo sem RPC).

---

## 3. Causas Raiz Identificadas

### 🔴 CAUSA 1 — Build Vercel pode estar falhando (variável de ambiente)

**Evidência:** `.env.example` documenta `KC_SUPABASE_URL`, mas `inject-env.js` não lê essa variante.

**Efeito:** Vercel serve código **antigo** que não tem o caminho RPC → usa só DML direto → em alguns cenários DML retorna `data = []` → mostra erro ou nada.

**Fix:** Adicionar suporte a `KC_SUPABASE_URL` / `KC_SUPABASE_ANON_KEY` no `inject-env.js`.

---

### 🔴 CAUSA 2 — Falha silenciosa quando `client === null`

**Evidência (linha ~418 do controller):**
```js
const client = getClient();
if (!client) return { ok: false, error: { message: '...' } };
// ↑ Não chama showToastSafe() nem showError() — silêncio total
```

**Efeito:** Se o Supabase client não estiver inicializado (ENV mal injetado), o clique no botão não produz NENHUM feedback. O usuário vê literalmente "nada acontece".

**Fix:** Adicionar `showToastSafe()` nesse early return.

---

### ⚠️ CAUSA 3 — UPDATE no SECURITY DEFINER sem `SET LOCAL row_security = off`

**Evidência:** A função `kc_admin_set_post_status` faz UPDATE como `postgres`. Embora `postgres` seja superusuário e bypass RLS por padrão, a **ausência explícita** de `SET LOCAL row_security = off` torna o código frágil a mudanças futuras na configuração do banco.

**Fix:** Migration v8.2.9.3 com `set local row_security = off` explícito.

---

## 4. SQL de Diagnóstico (rodar no Supabase SQL Editor)

### 4.1 — Confirmar função e versão
```sql
SELECT
  pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'kc_admin_set_post_status';
```
✅ Esperado: corpo com `SET LOCAL row_security = off` (após aplicar v8.2.9.3).

### 4.2 — Confirmar admin
```sql
SELECT id, email, is_admin FROM public.profiles WHERE is_admin = true;
```
✅ Esperado: pelo menos 1 linha.

### 4.3 — Teste funcional simulado (APENAS para diagnóstico, usando service_role)
```sql
-- No Supabase SQL Editor (roda como postgres/service_role):
DO $$
DECLARE
  v_result jsonb;
  v_post_id uuid;
BEGIN
  -- Pega um post publicado
  SELECT id INTO v_post_id FROM public.posts WHERE status = 'published' LIMIT 1;

  IF v_post_id IS NULL THEN
    RAISE NOTICE 'Nenhum post publicado encontrado';
    RETURN;
  END IF;

  -- Simula o que a RPC faz (sem auth.uid() — só para testar o UPDATE)
  UPDATE public.posts SET status = 'published' WHERE id = v_post_id;
  RAISE NOTICE 'UPDATE ok, row_count=%', (SELECT COUNT(*) FROM public.posts WHERE id = v_post_id);

  -- Verifica que a policy não está bloqueando
  RAISE NOTICE 'Status atual: %', (SELECT status FROM public.posts WHERE id = v_post_id);
END $$;
```

### 4.4 — Confirmar policies consolidadas
```sql
SELECT policyname, cmd, roles,
       LEFT(qual, 120) AS qual_preview
FROM pg_policies
WHERE tablename = 'posts'
ORDER BY cmd, policyname;
```
✅ Esperado: `posts_update_authenticated` com `is_admin = true` na condição.

---

## 5. Diagnóstico via Console do Browser

Cole este script no DevTools Console **enquanto estiver na página `/admin/moderation.html`**:

```javascript
// ============================================================
// KinoCampus Admin — Diagnóstico de Moderação
// Cole no console do browser na página admin/moderation.html
// ============================================================
(async function kc_diag() {
  console.group('🔍 KinoCampus Admin Diagnóstico');

  // 1. Verificar driver
  const driver = window.KCAPI?.ENV?.driver;
  const supabaseUrl = window.KCAPI?.ENV?.SUPABASE_URL;
  console.log('Driver:', driver, driver === 'supabase' ? '✅' : '❌ NÃO É SUPABASE');
  console.log('Supabase URL:', supabaseUrl);
  console.log('URL correta (wacyrkwhkvzwkqpolrbg):', supabaseUrl?.includes('wacyrkwhkvzwkqpolrbg') ? '✅' : '❌');

  // 2. Verificar client
  const client = window.KCSupabase?.getClient?.();
  console.log('Supabase client:', client ? '✅ disponível' : '❌ NULL — causa de silêncio total');

  if (!client) {
    console.error('CAUSA DO PROBLEMA: getClient() retorna null. Verifique as env vars na Vercel.');
    console.groupEnd();
    return;
  }

  // 3. Verificar usuário autenticado
  const { data: { user }, error: userErr } = await client.auth.getUser();
  console.log('Usuário auth:', user ? `✅ ${user.email} (${user.id})` : `❌ Não autenticado: ${userErr?.message}`);

  if (!user) {
    console.error('CAUSA: Usuário não autenticado. JWT expirado?');
    console.groupEnd();
    return;
  }

  // 4. Verificar is_admin no banco
  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('is_admin, display_name')
    .eq('id', user.id)
    .maybeSingle();
  console.log('is_admin:', profile?.is_admin ? '✅ true' : `❌ FALSE ou ausente: ${profileErr?.message}`);

  if (!profile?.is_admin) {
    console.error('CAUSA: Usuário não tem is_admin = true no banco.');
    console.groupEnd();
    return;
  }

  // 5. Testar a RPC diretamente
  const { data: posts } = await client.from('posts').select('id, status').limit(1);
  const testPost = posts?.[0];
  if (!testPost) {
    console.warn('Nenhum post encontrado para testar RPC');
    console.groupEnd();
    return;
  }

  console.log('Post de teste:', testPost.id, 'status:', testPost.status);

  // Chama a RPC (mantém o mesmo status — não altera nada de fato)
  const rpc = await client.rpc('kc_admin_set_post_status', {
    p_post_id: testPost.id,
    p_status: testPost.status, // mesma status = update sem efeito visível
    p_close_reports: false,
  });

  console.log('RPC response raw:', rpc);
  console.log('RPC data:', rpc?.data);
  console.log('RPC error:', rpc?.error);

  if (rpc?.error) {
    console.error('❌ ERRO NA RPC:', rpc.error);
  } else if (rpc?.data?.ok) {
    console.log('✅ RPC funcionou! updated_posts:', rpc.data.updated_posts, 'code:', rpc.data.code);
  } else {
    console.warn('⚠️ RPC retornou ok=false:', rpc?.data);
  }

  // 6. Verificar typeof rpc.data (crítico para lógica do controller)
  console.log('typeof rpc.data:', typeof rpc?.data);
  if (typeof rpc?.data === 'string') {
    console.warn('⚠️ rpc.data é STRING, não objeto! Precisa de JSON.parse()');
    console.log('Parsed:', JSON.parse(rpc.data));
  }

  console.groupEnd();
})();
```

---

## 6. Patches

### 6.1 — Migration v8.2.9.3 (já criada em `supabase/migrations/`)
**Arquivo:** `v8.2.9.3_admin_rpc_hardening.sql`

Adições principais:
- `set local row_security = off;` antes de qualquer SELECT/UPDATE (belt-and-suspenders)
- `updated_at = now()` no UPDATE (atualiza o timestamp corretamente)
- `'code': 'OK'` no retorno de sucesso (facilita debugging)
- Mensagens de erro mais descritivas

**Aplicar no Supabase:**
```bash
supabase db push  # ou copiar o SQL no SQL Editor do dashboard
```

### 6.2 — Patch `inject-env.js` (suporte a variáveis KC_*) ✅ APLICADO

Adicionados ao início dos arrays `resolveEnv` em `scripts/inject-env.js`:
```js
const SUPABASE_URL = resolveEnv([
  'SUPABASE_URL',
  'KC_SUPABASE_URL',           // ← ADICIONAR (compatibilidade com .env.example)
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'REACT_APP_SUPABASE_URL',
]);

const SUPABASE_PUBLIC_KEY = resolveEnv([
  'SUPABASE_ANON_KEY',
  'KC_SUPABASE_ANON_KEY',      // ← ADICIONAR
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLIC_KEY',
  ...
]);
```

### 6.3 — Patch controller `admin-moderation.controller.js` ✅ APLICADO

```js
// ANTES (linha ~418):
const client = getClient();
if (!client) return { ok: false, error: { message: 'Supabase client não disponível.' } };

// DEPOIS:
const client = getClient();
if (!client) {
  const noClientMsg = 'Supabase client não disponível. Verifique env vars (SUPABASE_URL/SUPABASE_ANON_KEY) na Vercel.';
  console.error('[Admin moderation] getClient() retornou null.', { postId, status });
  showToastSafe(noClientMsg, 'error', 4000);  // ← ADICIONAR FEEDBACK
  return { ok: false, error: { message: noClientMsg } };
}
```

Também atualizar a mensagem de `UPDATE_NOT_APPLIED`:
```js
// ANTES (linha ~433):
? 'A ação foi aceita, mas o banco não aplicou a alteração (RLS/role). Rode a migration v8.2.9.2 no projeto Supabase em produção.'

// DEPOIS:
? 'O banco não aplicou a alteração. Rode a migration v8.2.9.3 no Supabase Dashboard → SQL Editor.'
```

---

## 7. Checklist Operacional de Produção

```
ORDEM DE EXECUÇÃO:

[ ] 1. VERIFICAR ENV VARS NA VERCEL
       Vercel Dashboard → kino-campus → Settings → Environment Variables
       Deve ter: SUPABASE_URL = https://wacyrkwhkvzwkqpolrbg.supabase.co
                 SUPABASE_ANON_KEY = eyJ... (ou sb_publishable_...)
       Se tiver KC_SUPABASE_URL → renomear para SUPABASE_URL

[ ] 2. APLICAR MIGRATION v8.2.9.3
       Supabase Dashboard → SQL Editor
       Copiar e executar: supabase/migrations/v8.2.9.3_admin_rpc_hardening.sql
       Confirmar: SELECT proname FROM pg_proc WHERE proname = 'kc_admin_set_post_status';

[ ] 3. APLICAR PATCH inject-env.js
       Adicionar 'KC_SUPABASE_URL' e 'KC_SUPABASE_ANON_KEY' nos arrays resolveEnv

[ ] 4. APLICAR PATCH controller
       Adicionar showToastSafe no early return de client=null
       Atualizar mensagem UPDATE_NOT_APPLIED para v8.2.9.3

[ ] 5. COMMIT E PUSH
       git add supabase/migrations/v8.2.9.3_admin_rpc_hardening.sql
       git add scripts/inject-env.js
       git add assets/js/controllers/admin-moderation.controller.js
       git commit -m "fix(admin): harden moderation RPC with row_security bypass and fix KC_ env vars"
       git push origin main

[ ] 6. AGUARDAR BUILD VERCEL
       Vercel Dashboard → Deployments → checar se a build passou
       Se falhar: ver logs do build e corrigir

[ ] 7. SMOKE TEST EM PRODUÇÃO
       a. Acessar /admin/moderation.html
       b. Abrir DevTools console
       c. Colar e rodar o script de diagnóstico da seção 5
       d. Confirmar: driver=supabase, client disponível, is_admin=true, RPC ok=true
       e. Clicar "Ocultar" num post
       f. Verificar no Supabase Dashboard: posts → status deve ser 'hidden'
       g. Badge na UI deve mudar para laranja "hidden"
       h. Clicar "Restaurar" no mesmo post — deve voltar a "published"
```

---

## 8. Plano de Rollback

Se após aplicar os patches o painel deixar de funcionar completamente:

```sql
-- ROLLBACK migration v8.2.9.3 (restaura v8.2.9.2):
CREATE OR REPLACE FUNCTION public.kc_admin_set_post_status(
  p_post_id uuid, p_status text, p_close_reports boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
-- [colar aqui o conteúdo original de v8.2.9.2]
$$;
```

Para rollback do frontend: `git revert HEAD` e force-push para main.

---

## 9. Verificação Final (Definition of Done)

- [ ] Clicar "Ocultar" muda badge para `hidden` imediatamente na UI
- [ ] Status no banco confirma a mudança (Supabase Dashboard → Table Editor → posts)
- [ ] Se falhar, toast mostra código real: `FORBIDDEN`, `AUTH_REQUIRED`, `UPDATE_NOT_APPLIED`
- [ ] `profiles.is_admin` é validado na RPC (retorna `FORBIDDEN` para não-admin)
- [ ] Clicar em "Ocultar" num post já oculto → botão disabled, nenhuma chamada desnecessária
- [ ] Nenhum erro crítico novo no console (CSP `.map` é ruído, pode ignorar)
- [ ] Fluxo de denúncias (`/admin/reports.html`) continua funcional

---

*Relatório gerado por análise automatizada — KinoCampus Debug Session 2026-02-28*
