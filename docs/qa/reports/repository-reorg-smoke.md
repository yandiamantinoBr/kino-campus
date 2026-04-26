# QA Smoke Checklist — Reorganização de Repositório V15

**Data:** 2026-04-26  
**Branch:** `kinocampus-V15.0-foundations`  
**Responsável:** Yan Diamantino  
**Objetivo:** Validar que nenhuma funcionalidade core foi quebrada após cada iteração de movimento de arquivos JS em V15.

---

## Instruções de Uso

Após cada iteração de movimento (v15.2.0–v15.14.0), execute o checklist de **Gate Automatizado** obrigatório. Antes de marcar o release gate v15.17.0, execute o checklist de **Smoke Manual**.

---

## Gate Automatizado (por iteração)

Executar após CADA commit de movimento de arquivo:

```bash
npm test                         # 134+ suites / 3046+ testes verdes
node scripts/hygiene-check.js    # hygiene 8.6.0 ✓
npm run check:all                # 5 validators verdes
```

### Verificações extras por track

**Boot group (v15.2.0–v15.5.0):**
```bash
node scripts/validate-script-chains.js
# Esperado: cadeia boot validada em 22 HTMLs
```

**v15.5.0 (kc-env.js — crítico):**
```bash
KC_ALLOW_LOCAL_INJECT=1 KC_SUPABASE_URL=https://example.supabase.co \
KC_SUPABASE_ANON_KEY=eyJtest node scripts/inject-env.js
# Esperado: "Arquivo encontrado: .../assets/js/boot/kc-env.js"
```

**Raiz limpa (v15.15.0+):**
```bash
node -e "const fs=require('fs');const f=fs.readdirSync('assets/js').filter(x=>x.endsWith('.js'));console.log(f.length===0?'✅ raiz vazia':'❌ restam: '+f.join(','))"
```

---

## Smoke Manual (pré-release v15.17.0)

### 1. Autenticação

- [ ] Login com e-mail @ufg.br / @discente.ufg.br funciona
- [ ] Logout funciona (sessão limpa)
- [ ] Auth callback OAuth (Google/GitHub se ativo) completa sem erro
- [ ] `window.KCAuth` disponível no console do browser
- [ ] Redirecionamento pós-login correto

### 2. Feed e Listagem

- [ ] `index.html` — feed carrega posts
- [ ] `achados-perdidos.html` — posts exibidos com categorias
- [ ] `caronas-feed.html` — feed OK
- [ ] `compra-venda-feed.html` — feed OK
- [ ] `eventos.html` — feed OK
- [ ] `moradia.html` — feed OK
- [ ] `oportunidades.html` — feed OK
- [ ] Filtros funcionam (kc-filters.js, kc-feed-filters.js)
- [ ] Pull-to-refresh funciona em mobile (kc-pull-to-refresh.js)
- [ ] Lazy loader funciona (kc-lazy-loader.js)

### 3. Post — Criação e Visualização

- [ ] `create-post.html` — formulário de criação abre
- [ ] Campos preenchíveis (kc-create-post.fields.js)
- [ ] Schema validado antes de submit (kc-create-post.schema.js)
- [ ] Upload de mídia funciona (kc-create-post.media.js)
- [ ] Submit cria post sem erro (kc-create-post.submit.js)
- [ ] `_product.html` — post individual carrega
- [ ] Seção de comentários visível (kc-comments.js)

### 4. Busca

- [ ] Campo de busca na navbar funciona (kc-search.js)
- [ ] Modal de busca abre (kc-search-modal.js)
- [ ] `search-results.html` — resultados exibidos
- [ ] Analytics de busca registrado (search-analytics.shared.js)

### 5. Perfil e Configurações

- [ ] `profile.html` — perfil carrega sem erro
- [ ] `settings.html` — página abre
- [ ] `account-setup.html` — setup de conta OK
- [ ] `my-posts.html` — lista de posts do usuário
- [ ] `account-profile.shared.js` — utils de perfil funcionando

### 6. Notificações

- [ ] Sino de notificações visível (kc-notifications.js)
- [ ] Notificações carregam ao clicar
- [ ] Badge de count atualiza

### 7. Ranking

- [ ] `profile.html` — ranking visível (kc-ranking.js)
- [ ] `admin/index.html` — ranking admin OK

### 8. Ajuda

- [ ] `ajuda.html` — página carrega (help.shared.js)
- [ ] Formulário de pedido de ajuda funciona

### 9. ODS

- [ ] `ods.html` — página carrega (ods.shared.js)

### 10. Páginas Admin

- [ ] `admin/index.html` — dashboard admin abre
- [ ] `admin/banners.html` — gestão de banners OK
- [ ] `admin/help-requests.html` — pedidos de ajuda visíveis
- [ ] `admin/moderation.html` — moderação OK
- [ ] `admin/reports.html` — relatórios OK
- [ ] `admin-shell.js` — menu admin funcional

### 11. Contratos `window.*` (verificar no console do browser)

- [ ] `window.KC` — undefined ou objeto (kc-constants)
- [ ] `window.KCSupabase` — objeto (kc-supabase.client.js)
- [ ] `window.KCAPI` — objeto com todos os métodos (kc-api.client.js)
- [ ] `window.KCAuth` — objeto (kc-auth.ui.js)
- [ ] `window.KCAccountProfileUtils` — objeto (kc-profiles.client.js)
- [ ] `window.KCI18n` — objeto (kc-i18n.js)

### 12. Service Worker e Cache

- [ ] Service Worker registrado (kc-sw-register.js)
- [ ] Cache funcional (reload offline mostra conteúdo cacheado)
- [ ] Telemetria de erro ativa (kc-telemetry.js — erros JS reportados)

### 13. Tema e Layout

- [ ] Tema dark/light funciona (kc-theme.js, kc-theme-boot.js)
- [ ] Shell público visível em todas as páginas públicas (kc-public-shell.js)
- [ ] Banners na home (kc-banners.js)
- [ ] Categorias na home (kc-home-categories.js, home-categories.shared.js)

### 14. Feature Flags e Env

- [ ] Feature flags ativas sem erro no console (kc-feature-flags.js)
- [ ] `kc-env.js` carregado antes de qualquer API call
- [ ] Vercel inject-env.js injetou variáveis corretamente no deploy

---

## Verificação de Scripts nos HTMLs

Após todas as iterações, confirmar que NENHUM HTML aponta para path inexistente:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const htmlFiles = [];
['.', 'admin'].forEach(dir => {
  fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => {
    htmlFiles.push(path.join(dir, f));
  });
});
let broken = 0;
htmlFiles.forEach(html => {
  const content = fs.readFileSync(html, 'utf8');
  const matches = [...content.matchAll(/src=\"([^\"]+\.js)/g)];
  matches.forEach(m => {
    const src = m[1].split('?')[0].replace(/^\//, '');
    if (!fs.existsSync(src)) {
      console.log('QUEBRADO: ' + html + ' → ' + src);
      broken++;
    }
  });
});
console.log(broken === 0 ? '✅ Todos os scripts existem' : '❌ ' + broken + ' scripts quebrados');
"
```

---

## Histórico de Execução

| Data | Iteração | Gate Auto | Smoke Manual | Responsável | Notas |
|---|---|---|---|---|---|
| 2026-04-26 | v15.0.0 | ✅ | — | Yan | Branch rename + jest bugfix |
| — | v15.1.0 | ✅ | — | Yan | Auditoria doc-only |
