# Patch para assets/js/kc-auth.ui.js

## Mudanças necessárias

Abra o arquivo `assets/js/kc-auth.ui.js` no seu repositório e aplique as substituições abaixo.

---

### Substituição 1 — Corrigir `setStatus()` (bug: classe `.show` nunca adicionada)

**Encontre este trecho:**
```javascript
  function setStatus(message, type = 'info') {
    const el = $('#kcAuthStatus');
    if (!el) return;
    el.className = 'kc-auth-status ' + String(type || 'info');
    el.textContent = String(message ?? '');
    if (!message) el.textContent = '';
  }
```

**Substitua por:**
```javascript
  function setStatus(message, type = 'info') {
    const el = $('#kcAuthStatus');
    if (!el) return;
    const hasMsg = !!(message && String(message).trim());
    // Bug fix: a classe .show é necessária para exibir o elemento (display:none por padrão no CSS)
    el.className = 'kc-auth-status ' + String(type || 'info') + (hasMsg ? ' show' : '');
    el.textContent = hasMsg ? String(message) : '';
  }
```

---

### Substituição 2 — Melhorar feedback de cadastro (mensagem mais clara sobre e-mail)

**Encontre este trecho** (dentro de `doSignup`, após chamar `KCAPI.signUp`):
```javascript
        // Supabase pode exigir confirmação por e-mail.
        // Se a sessão vier nula, avisamos.
        if (r && r.user && !r.session) {
          setStatus('Conta criada! Verifique seu e-mail para confirmar o cadastro.', 'success');
        } else {
          setStatus('Conta criada com sucesso. Você já está logado.', 'success');
        }

        // Troca para aba Login por segurança (se sem sessão)
        setTab('login');
```

**Substitua por:**
```javascript
        // Supabase pode exigir confirmação por e-mail.
        // Se a sessão vier nula, o usuário precisa confirmar o e-mail primeiro.
        if (r && r.user && !r.session) {
          // Substitui o conteúdo do modal por uma mensagem clara de "cheque seu e-mail"
          const content = $('#kcAuthContent');
          if (content) {
            content.innerHTML = `
              <div style="text-align:center; padding: 16px 0 8px;">
                <div style="font-size:2.8rem; margin-bottom:16px;">📧</div>
                <h3 style="margin:0 0 12px; font-size:1.1rem; color:var(--kc-text-dark-primary)">
                  Confirme seu e-mail
                </h3>
                <p style="margin:0 0 20px; font-size:0.92rem; color:var(--kc-text-dark-secondary); line-height:1.6">
                  Enviamos um link de confirmação para<br>
                  <strong style="color:var(--kc-text-dark-primary)">${escapeHtml(email)}</strong>.<br><br>
                  Abra o e-mail e clique em <em>"Confirm your mail"</em>.<br>
                  Após confirmar, volte aqui para fazer login.
                </p>
                <button class="kc-btn-primary" type="button" onclick="kcCloseAuthModal()" style="width:100%">
                  Entendido, vou verificar
                </button>
                <p style="margin-top:14px; font-size:0.82rem; color:var(--kc-text-dark-secondary)">
                  Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
                </p>
              </div>
            `;
          }
        } else {
          setStatus('Conta criada e confirmada! Você já está logado.', 'success');
          setTimeout(() => closeModal(), 1800);
        }
```

---

### Substituição 3 — Melhorar mensagem de erro de login

**Encontre este trecho** (dentro de `doLogin`):
```javascript
        if (r && r.error) {
          setStatus(r.error.message || 'Não foi possível entrar. Verifique seus dados.', 'error');
          return;
        }
        setStatus('Login realizado com sucesso.', 'success');
```

**Substitua por:**
```javascript
        if (r && r.error) {
          // Traduz os erros mais comuns do Supabase para português
          let msg = r.error.message || '';
          if (msg.toLowerCase().includes('invalid login credentials')) {
            msg = 'E-mail ou senha incorretos. Verifique seus dados.';
          } else if (msg.toLowerCase().includes('email not confirmed')) {
            msg = 'E-mail ainda não confirmado. Cheque sua caixa de entrada e clique no link de confirmação.';
          } else if (msg.toLowerCase().includes('too many requests')) {
            msg = 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
          } else if (!msg) {
            msg = 'Não foi possível entrar. Verifique seus dados.';
          }
          setStatus(msg, 'error');
          return;
        }
        setStatus('Login realizado! Bem-vindo(a) de volta.', 'success');
        setTimeout(() => closeModal(), 1500);
```

---

## Resumo das mudanças

| # | Onde | O que muda | Por quê |
|---|------|-----------|---------|
| 1 | `setStatus()` | Adiciona classe `show` quando há mensagem | CSS tem `display:none` e requer `.show` para aparecer — era o bug que escondia todo feedback |
| 2 | `doSignup()` | Exibe tela clara de "confirme seu e-mail" no modal | Usuário não sabia que precisava checar o e-mail |
| 3 | `doLogin()` | Traduz erros do Supabase para português | Mensagens como "Invalid login credentials" confundem usuários leigos |
