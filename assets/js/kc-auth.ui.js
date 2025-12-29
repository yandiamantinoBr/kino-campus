/*
  KinoCampus - Auth UI (Modal no Header) (V8.1.3.2.1)

  Objetivos:
  - UX mínima de sessão: Login, Cadastro e Logout sem redirecionamento.
  - Atualiza header + bloqueia ações de escrita quando driver=supabase e não há sessão.

  Dependências:
  - window.KCAPI (facade)
  - window.KCSupabase (client/auth)
*/

(function () {
  'use strict';

  const VERSION = '8.1.4.1';

  function readEnv() {
    const env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : {};
    const driver = String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();
    const allowedDomains = Array.isArray(env.AUTH_ALLOWED_DOMAINS)
      ? env.AUTH_ALLOWED_DOMAINS
      : ((env.auth && Array.isArray(env.auth.allowedEmailDomains)) ? env.auth.allowedEmailDomains : []);
    return { env, driver, allowedDomains };
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function safeText(el, text) {
    if (!el) return;
    el.textContent = String(text ?? '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function getEmailDomain(email) {
    const em = normalizeEmail(email);
    const at = em.lastIndexOf('@');
    if (at < 0) return '';
    return em.slice(at + 1);
  }

  function isAllowedDomain(email, allowedDomains) {
    const list = Array.isArray(allowedDomains) ? allowedDomains.filter(Boolean) : [];
    if (!list.length) return true; // sem restrição
    const d = getEmailDomain(email);
    if (!d) return false;
    // Alinhado ao hardening server-side (V8.1.3.3): aceitar SOMENTE domínios explícitos da allowlist.
    // Ex.: 'ufg.br' e 'discente.ufg.br' (não aceitar subdomínios adicionais como 'alumni.ufg.br').
    return list.some((ad) => d === String(ad).toLowerCase());
  }

  function getLoginTriggers() {
    return [
      ...$all('a.btn-login'),
      ...$all('a[href="#login"]'),
      ...$all('[data-kc-login]'),
    ];
  }

  function ensureModal() {
    if ($('#kcAuthOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'kcAuthOverlay';
    overlay.className = 'kc-auth-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const modal = document.createElement('div');
    modal.id = 'kcAuthModal';
    modal.className = 'kc-auth-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = `
      <div class="kc-auth-card">
        <button class="kc-auth-close" type="button" aria-label="Fechar">
          <i class="fas fa-times"></i>
        </button>

        <div class="kc-auth-header">
          <div class="kc-auth-title">
            <h2>Conta KinoCampus</h2>
            <p class="kc-auth-sub">Entrar, criar conta ou encerrar sessão.</p>
          </div>
        </div>

        <div class="kc-auth-status" id="kcAuthStatus" role="status" aria-live="polite"></div>

        <div class="kc-auth-content" id="kcAuthContent">
          <div class="kc-auth-tabs" role="tablist">
            <button class="kc-auth-tab active" type="button" data-tab="login" role="tab" aria-selected="true">Login</button>
            <button class="kc-auth-tab" type="button" data-tab="signup" role="tab" aria-selected="false">Cadastro</button>
          </div>

          <form class="kc-auth-form" data-form="login" autocomplete="on">
            <label>
              <span>E-mail</span>
              <input type="email" name="email" placeholder="seuemail@ufg.br" required />
            </label>
            <label>
              <span>Senha</span>
              <input type="password" name="password" placeholder="Sua senha" required minlength="6" />
            </label>
            <button class="kc-btn-primary" type="submit">Entrar</button>
            <p class="kc-auth-hint">Dica: se você ainda não tem conta, use a aba <b>Cadastro</b>.</p>
          </form>

          <form class="kc-auth-form" data-form="signup" autocomplete="on" style="display:none">
            <label>
              <span>E-mail institucional</span>
              <input type="email" name="email" placeholder="seuemail@ufg.br" required />
            </label>
            <label>
              <span>Senha</span>
              <input type="password" name="password" placeholder="Crie uma senha" required minlength="6" />
            </label>
            <label>
              <span>Confirmar senha</span>
              <input type="password" name="confirm" placeholder="Repita a senha" required minlength="6" />
            </label>
            <button class="kc-btn-primary" type="submit">Criar conta</button>
            <p class="kc-auth-hint">Ao criar conta, você concorda em usar a plataforma de forma respeitosa.</p>
          </form>

          <div class="kc-auth-user" id="kcAuthUser" style="display:none">
            <div class="kc-auth-user-card">
              <div class="kc-auth-user-icon"><i class="fas fa-user"></i></div>
              <div class="kc-auth-user-info">
                <div class="kc-auth-user-email" id="kcAuthUserEmail">—</div>
                <div class="kc-auth-user-meta" id="kcAuthUserMeta">Sessão ativa</div>
              </div>
            </div>
            <div class="kc-auth-user-actions">
              <button class="kc-btn-secondary" type="button" id="kcAuthLogoutBtn">
                <i class="fas fa-right-from-bracket"></i>
                <span>Sair</span>
              </button>
              <button class="kc-btn-primary" type="button" id="kcAuthCloseBtn">Fechar</button>
            </div>
          </div>
        </div>

        <div class="kc-auth-footer">
          <span class="kc-auth-footer-version">Auth UI v${VERSION}</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // close handlers
    overlay.addEventListener('click', () => closeModal());
    modal.addEventListener('click', (e) => {
      const close = e.target.closest('.kc-auth-close');
      if (close) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // tab switching
    modal.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.kc-auth-tab');
      if (!tabBtn) return;
      const tab = tabBtn.getAttribute('data-tab');
      if (!tab) return;
      setTab(tab);
    });

    // forms submit
    const loginForm = $('[data-form="login"]', modal);
    const signupForm = $('[data-form="signup"]', modal);

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await doLogin(loginForm);
    });

    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await doSignup(signupForm);
    });

    // user actions
    const logoutBtn = $('#kcAuthLogoutBtn', modal);
    const closeBtn = $('#kcAuthCloseBtn', modal);

    logoutBtn.addEventListener('click', async () => {
      await doLogout();
    });

    closeBtn.addEventListener('click', () => closeModal());
  }

  function setStatus(message, type = 'info') {
    const el = $('#kcAuthStatus');
    if (!el) return;
    el.className = 'kc-auth-status ' + String(type || 'info');
    el.textContent = String(message || '');
    if (!message) el.textContent = '';
  }

  function setTab(tab) {
    const modal = $('#kcAuthModal');
    if (!modal) return;

    const tabs = $all('.kc-auth-tab', modal);
    const forms = $all('.kc-auth-form', modal);

    tabs.forEach((b) => {
      const isActive = b.getAttribute('data-tab') === tab;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    forms.forEach((f) => {
      const isTarget = f.getAttribute('data-form') === tab;
      f.style.display = isTarget ? '' : 'none';
    });

    setStatus('', 'info');
  }

  function openModal() {
    ensureModal();

    const overlay = $('#kcAuthOverlay');
    const modal = $('#kcAuthModal');
    if (!overlay || !modal) return;

    overlay.classList.add('active');
    modal.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-hidden', 'false');

    // mantém foco no primeiro input visível
    setTimeout(() => {
      const user = (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') ? window.KCSupabase.getUser() : null;
      if (user) {
        const closeBtn = $('#kcAuthCloseBtn');
        if (closeBtn) closeBtn.focus();
        return;
      }
      const first = $('#kcAuthModal input');
      if (first) first.focus();
    }, 30);

    // scroll lock
    document.body.classList.add('kc-modal-open');

    // garante estado atual
    refreshUIFromUser();
  }

  function closeModal() {
    const overlay = $('#kcAuthOverlay');
    const modal = $('#kcAuthModal');
    if (!overlay || !modal) return;

    overlay.classList.remove('active');
    modal.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('kc-modal-open');
  }

  async function doLogin(form) {
    const { driver } = readEnv();

    if (driver !== 'supabase') {
      setStatus('Modo local: autenticação desativada. Para testar login, ative KC_ENV.DATA_DRIVER = "supabase".', 'warn');
      return;
    }

    const email = normalizeEmail(form.email.value);
    const password = String(form.password.value || '');

    if (!email || !password) {
      setStatus('Preencha e-mail e senha.', 'warn');
      return;
    }

    setStatus('Entrando...', 'info');

    try {
      if (window.KCAPI && typeof window.KCAPI.signIn === 'function') {
        const r = await window.KCAPI.signIn(email, password);
        if (r && r.error) {
          setStatus(r.error.message || 'Não foi possível entrar. Verifique seus dados.', 'error');
          return;
        }
        setStatus('Login realizado com sucesso.', 'success');
        // O listener de authchange atualiza o UI
        return;
      }
      setStatus('KCAPI não carregado. Recarregue a página.', 'error');
    } catch (e) {
      setStatus('Erro ao entrar. Tente novamente.', 'error');
      console.error('[KCAuthUI] login falhou:', e);
    }
  }

  async function doSignup(form) {
    const { driver, allowedDomains } = readEnv();

    if (driver !== 'supabase') {
      setStatus('Modo local: cadastro desativado. Para testar, ative KC_ENV.DATA_DRIVER = "supabase".', 'warn');
      return;
    }

    const email = normalizeEmail(form.email.value);
    const password = String(form.password.value || '');
    const confirm = String(form.confirm.value || '');

    if (!email || !password || !confirm) {
      setStatus('Preencha todos os campos.', 'warn');
      return;
    }

    if (password.length < 6) {
      setStatus('Sua senha precisa ter pelo menos 6 caracteres.', 'warn');
      return;
    }

    if (password !== confirm) {
      setStatus('As senhas não conferem.', 'warn');
      return;
    }

    if (!isAllowedDomain(email, allowedDomains)) {
      const hint = Array.isArray(allowedDomains) && allowedDomains.length
        ? `Use um e-mail institucional (${allowedDomains.join(', ')}).`
        : 'Use um e-mail institucional.';
      setStatus(hint, 'warn');
      return;
    }

    setStatus('Criando conta...', 'info');

    try {
      if (window.KCAPI && typeof window.KCAPI.signUp === 'function') {
        const r = await window.KCAPI.signUp(email, password);
        if (r && r.error) {
          setStatus(r.error.message || 'Não foi possível criar sua conta.', 'error');
          return;
        }

        // Supabase pode exigir confirmação por e-mail.
        // Se a sessão vier nula, avisamos.
        if (r && r.user && !r.session) {
          setStatus('Conta criada! Verifique seu e-mail para confirmar o cadastro.', 'success');
        } else {
          setStatus('Conta criada com sucesso. Você já está logado.', 'success');
        }

        // Troca para aba Login por segurança (se sem sessão)
        setTab('login');
        return;
      }
      setStatus('KCAPI não carregado. Recarregue a página.', 'error');
    } catch (e) {
      setStatus('Erro ao criar conta. Tente novamente.', 'error');
      console.error('[KCAuthUI] signup falhou:', e);
    }
  }

  async function doLogout() {
    const { driver } = readEnv();
    if (driver !== 'supabase') {
      closeModal();
      return;
    }

    setStatus('Saindo...', 'info');

    try {
      if (window.KCAPI && typeof window.KCAPI.logout === 'function') {
        await window.KCAPI.logout();
        setStatus('Sessão encerrada.', 'success');
        return;
      }
      setStatus('KCAPI não carregado. Recarregue a página.', 'error');
    } catch (e) {
      setStatus('Erro ao sair. Tente novamente.', 'error');
      console.error('[KCAuthUI] logout falhou:', e);
    }
  }

  function refreshHeaderLabel(user) {
    const btn = $('a.btn-login') || $('a[href="#login"]');
    if (!btn) return;

    // Perfil (quando disponível)
    const profile = (window.KCAPI && typeof window.KCAPI.getCurrentProfile === 'function')
      ? window.KCAPI.getCurrentProfile()
      : ((window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function')
        ? window.KCProfiles.getCurrentProfile()
        : null);

    if (user && user.email) {
      const nameFromProfile = profile && (profile.full_name || profile.display_name || profile.displayName || profile.name)
        ? String(profile.full_name || profile.display_name || profile.displayName || profile.name)
        : '';

      const display = nameFromProfile || String(user.email).split('@')[0] || 'Minha conta';

      const avatar = profile && (profile.avatar_url || profile.avatarUrl || profile.avatar)
        ? String(profile.avatar_url || profile.avatarUrl || profile.avatar)
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(user.email || user.id || 'kc').toLowerCase())}`;

      // Hardening (V8.1.3.3 retro): badge deve refletir SOMENTE o valor retornado do banco (profiles.verified)
      const verified = !!(profile && (profile.verified === true));

      const displayEsc = escapeHtml(display);
      const avatarEsc = escapeHtml(avatar);
      const altEsc = escapeHtml((String(display).split(' ')[0] || 'Usuário'));

      btn.innerHTML = `
        <span class="kc-header-user">
          <img class="kc-header-user__avatar" src="${avatarEsc}" alt="${altEsc}" loading="lazy" decoding="async" />
          <span class="kc-header-user__name">${displayEsc}</span>
          ${verified ? '<i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i>' : ''}
        </span>
      `.trim();
      btn.classList.add('is-auth');
      btn.setAttribute('data-kc-login', 'true');
      btn.setAttribute('href', '#login');
      btn.setAttribute('title', user.email);
    } else {
      btn.textContent = 'Login/Cadastro';
      btn.classList.remove('is-auth');
      btn.setAttribute('data-kc-login', 'true');
      btn.setAttribute('href', '#login');
      btn.removeAttribute('title');
    }
  }

  function setWriteGuards(user) {
    const { driver } = readEnv();
    if (driver !== 'supabase') return; // modo local não muda

    const isLogged = !!(user && user.id);

    // 1) Bloqueia triggers de create (capture, antes do kc-core)
    if (!document.body.getAttribute('data-kc-auth-guard')) {
      document.body.setAttribute('data-kc-auth-guard', 'true');

      document.addEventListener('click', (e) => {
        const trigger = e.target && e.target.closest
          ? e.target.closest('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn')
          : null;
        if (!trigger) return;

        const u = (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') ? window.KCSupabase.getUser() : null;
        const ok = !!(u && u.id);
        if (ok) return;

        e.preventDefault();
        e.stopPropagation();

        if (typeof window.showToast === 'function') {
          window.showToast('Faça login para publicar.', 'warn', 2400);
        }
        // V8.1.3.2.1: o modal de auth abre apenas quando o usuário clica em Login/Cadastro.
        const loginBtn = $('a.btn-login') || $('a[href="#login"]');
        if (loginBtn) {
          try { loginBtn.focus(); } catch (_) {}
          loginBtn.classList.add('kc-attention');
          setTimeout(() => loginBtn.classList.remove('kc-attention'), 900);
        }
      }, true);
    }

    // 2) Acessibilidade visual: marca links de create como desabilitados
    $all('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn').forEach((el) => {
      el.classList.toggle('kc-disabled', !isLogged);
      if (!isLogged) {
        el.setAttribute('aria-disabled', 'true');
      } else {
        el.removeAttribute('aria-disabled');
      }
    });
  }

  function refreshUIFromUser() {
    const user = (window.KCSupabase && typeof window.KCSupabase.getUser === 'function')
      ? window.KCSupabase.getUser()
      : null;

    refreshHeaderLabel(user);
    setWriteGuards(user);

    // Atualiza modal
    const userBox = $('#kcAuthUser');
    const content = $('#kcAuthContent');
    if (!userBox || !content) return;

    if (user && user.email) {
      userBox.style.display = '';
      content.querySelectorAll('.kc-auth-tabs, .kc-auth-form').forEach((el) => { el.style.display = 'none'; });
      safeText($('#kcAuthUserEmail'), user.email);
      safeText($('#kcAuthUserMeta'), user.id ? ('UID: ' + user.id.slice(0, 8) + '…') : 'Sessão ativa');
      setStatus('', 'info');
    } else {
      userBox.style.display = 'none';
      // restaura tabs/forms
      const tabs = $all('.kc-auth-tabs', content);
      tabs.forEach((t) => t.style.display = '');
      // mostra form ativo (login)
      setTab('login');
    }
  }

  function wireTriggers() {
    getLoginTriggers().forEach((a) => {
      a.setAttribute('data-kc-login', 'true');
      a.setAttribute('href', '#login');
    });

    document.addEventListener('click', (e) => {
      const trg = e.target && e.target.closest ? e.target.closest('[data-kc-login], a[href="#login"]') : null;
      if (!trg) return;
      e.preventDefault();
      openModal();
    });
  }

  // Exposição para integração com outras áreas (ex.: create-post)
  window.kcOpenAuthModal = openModal;
  window.kcCloseAuthModal = closeModal;

  function init() {
    wireTriggers();

    // Primeiro paint: tenta recuperar sessão e desenhar header
    try {
      if (window.KCSupabase && typeof window.KCSupabase.refreshSession === 'function') {
        window.KCSupabase.refreshSession().finally(() => refreshUIFromUser());
      } else {
        refreshUIFromUser();
      }
    } catch (_) { refreshUIFromUser(); }

    // Mantém header sempre sincronizado
    document.addEventListener('kc:authchange', () => {
      refreshUIFromUser();
    });

    // Quando o perfil termina de sincronizar, atualiza o header (nome/avatar/verified)
    document.addEventListener('kc:profilechange', () => {
      refreshUIFromUser();
    });
  }

  // init
  try {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } catch (_) {}
})();
