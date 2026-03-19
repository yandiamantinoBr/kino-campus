/*
  KinoCampus - Auth UI (Modal no Header) (V8.2.6.1)

  Objetivos:
  - UX mínima de sessão: Login, Cadastro e Logout sem redirecionamento.
  - Atualiza header + bloqueia ações de escrita quando driver=supabase e não há sessão.

  Dependências:
  - window.KCAPI (facade)
  - window.KCSupabase (client/auth)
*/

(function () {
  'use strict';

  const VERSION = '8.2.6.1';

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

  const escape = (value) => window.KCUtils.escapeHtml(value);

  function normalizeEmail(email) {
    if (window.KCUtils && typeof window.KCUtils.normalizeEmail === 'function') {
      return window.KCUtils.normalizeEmail(email);
    }
    return String(email || '').trim().toLowerCase();
  }

  function getEmailDomain(email) {
    if (window.KCUtils && typeof window.KCUtils.getEmailDomain === 'function') {
      return window.KCUtils.getEmailDomain(email);
    }
    const em = normalizeEmail(email);
    const at = em.lastIndexOf('@');
    if (at < 0) return '';
    return em.slice(at + 1);
  }

  function normalizeAllowedDomains(allowedDomains) {
    if (window.KCUtils && typeof window.KCUtils.normalizeAllowedDomains === 'function') {
      return window.KCUtils.normalizeAllowedDomains(allowedDomains);
    }
    if (!Array.isArray(allowedDomains)) return [];
    return Array.from(new Set(
      allowedDomains
        .map((d) => String(d || '').trim().toLowerCase())
        .filter(Boolean)
    ));
  }

  function isAllowedDomain(email, allowedDomains) {
    if (window.KCUtils && typeof window.KCUtils.isInstitutionalEmailAllowed === 'function') {
      return window.KCUtils.isInstitutionalEmailAllowed(email, allowedDomains);
    }
    const list = normalizeAllowedDomains(allowedDomains);
    if (!list.length) return true; // sem restrição
    const d = getEmailDomain(email);
    if (!d) return false;
    return list.includes(d);
  }

  function formatAllowedDomains(allowedDomains) {
    const domains = normalizeAllowedDomains(allowedDomains);
    if (!domains.length) return '';
    return domains.map((d) => `@${d}`).join(', ');
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
      const allowlistHint = formatAllowedDomains(allowedDomains);
      const hint = allowlistHint
        ? `Use um e-mail institucional de um domínio aceito (${allowlistHint}).`
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

  // ── Profile Dropdown (desktop) ──────────────────────────────────────────
  function ensureProfileDropdown() {
    if (document.getElementById('kcProfileDropdown')) return;
    const dropdown = document.createElement('div');
    dropdown.id = 'kcProfileDropdown';
    dropdown.className = 'kc-profile-dropdown';
    dropdown.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dropdown);

    document.addEventListener('click', (e) => {
      const dd = document.getElementById('kcProfileDropdown');
      if (!dd || !dd.classList.contains('active')) return;
      const btn = document.querySelector('a.btn-login.is-auth');
      if (btn && btn.contains(e.target)) return;
      if (!dd.contains(e.target)) closeProfileDropdown();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeProfileDropdown();
    });
  }

  function buildDropdownContent(user, profile) {
    const isAdminArea = window.location.pathname.includes('/admin/');
    const profileHref = isAdminArea ? '../profile.html' : 'profile.html';
    const adminHref   = isAdminArea ? 'index.html' : 'admin/index.html';
    const helpHref    = isAdminArea ? '../ajuda.html' : 'ajuda.html';

    const nameFromProfile = profile && (profile.display_name || profile.full_name)
      ? String(profile.display_name || profile.full_name) : '';
    const display  = nameFromProfile || (user ? String(user.email || '').split('@')[0] : '') || 'Minha conta';
    const email    = user ? String(user.email || '') : '';
    const handle   = email ? email.split('@')[0] : '';
    const avatar   = profile && (profile.avatar_url || profile.avatarUrl || profile.avatar)
      ? String(profile.avatar_url || profile.avatarUrl || profile.avatar)
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(email || 'kc').toLowerCase())}`;
    const verified = !!(profile && profile.verified === true);
    const isAdmin  = !!(profile && profile.is_admin === true);
    const uid      = (user && user.id) || (profile && profile.id) || '';
    const profileWithId = uid ? `${profileHref}?id=${encodeURIComponent(uid)}` : profileHref;

    return `
      <div class="kc-profile-dropdown__header">
        <img class="kc-profile-dropdown__avatar" src="${escape(avatar)}" alt="${escape((String(display).split(' ')[0] || 'Usuário'))}" loading="lazy" />
        <div class="kc-profile-dropdown__info">
          <span class="kc-profile-dropdown__name">${escape(display)}${verified ? ' <i class="fas fa-check-circle" style="color:#53d681;font-size:.8em;"></i>' : ''}</span>
          ${handle ? `<span class="kc-profile-dropdown__handle">@${escape(handle)}</span>` : ''}
        </div>
      </div>
      <hr class="kc-profile-dropdown__divider" />
      <nav class="kc-profile-dropdown__menu">
        <a href="${escape(profileWithId)}" class="kc-profile-dropdown__item">
          <i class="fas fa-id-badge"></i><span>Meu Perfil</span>
        </a>
        ${isAdmin ? `<a href="${escape(adminHref)}" class="kc-profile-dropdown__item">
          <i class="fas fa-shield-halved" style="color:var(--kc-primary-brand);"></i><span>Administração</span>
        </a>` : ''}
        <hr class="kc-profile-dropdown__divider" />
        <a href="${escape(helpHref)}" class="kc-profile-dropdown__item">
          <i class="fas fa-circle-question"></i><span>Central de Ajuda</span>
        </a>
        <hr class="kc-profile-dropdown__divider" />
        <button type="button" class="kc-profile-dropdown__item kc-profile-dropdown__logout" id="kcDropdownLogoutBtn">
          <i class="fas fa-right-from-bracket"></i><span>Sair da conta</span>
        </button>
      </nav>
    `;
  }

  function openProfileDropdown(btn) {
    ensureProfileDropdown();
    const dropdown = document.getElementById('kcProfileDropdown');
    if (!dropdown) return;

    const user    = (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') ? window.KCSupabase.getUser() : null;
    const profile = (window.KCAPI && typeof window.KCAPI.getCurrentProfile === 'function') ? window.KCAPI.getCurrentProfile() : null;

    dropdown.innerHTML = buildDropdownContent(user, profile);

    const rect     = btn.getBoundingClientRect();
    const dropWidth = 230;
    let leftPos = rect.right - dropWidth;
    if (leftPos < 8) leftPos = 8;
    dropdown.style.top  = (rect.bottom + 8) + 'px';
    dropdown.style.left = leftPos + 'px';

    dropdown.classList.add('active');
    dropdown.setAttribute('aria-hidden', 'false');
    btn.classList.add('kc-dropdown-open');

    const logoutBtn = document.getElementById('kcDropdownLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        closeProfileDropdown();
        await doLogout();
      });
    }
  }

  function closeProfileDropdown() {
    const dropdown = document.getElementById('kcProfileDropdown');
    if (dropdown) {
      dropdown.classList.remove('active');
      dropdown.setAttribute('aria-hidden', 'true');
    }
    const btn = document.querySelector('a.btn-login.kc-dropdown-open');
    if (btn) btn.classList.remove('kc-dropdown-open');
  }

  function toggleProfileDropdown(btn) {
    const dropdown = document.getElementById('kcProfileDropdown');
    if (dropdown && dropdown.classList.contains('active')) {
      closeProfileDropdown();
    } else {
      openProfileDropdown(btn);
    }
  }

  // ── Mobile menu user section ─────────────────────────────────────────────
  function refreshMobileMenuUser(user, profile) {
    const isAdminArea = window.location.pathname.includes('/admin/');
    const profileHref = isAdminArea ? '../profile.html' : 'profile.html';
    const adminHref = isAdminArea ? 'index.html' : 'admin/index.html';

    // Atualiza o link de usuário no menu mobile (mobileMenuUserLink)
    const mobileUserLink = document.getElementById('mobileMenuUserLink');
    const mobileUserName  = document.getElementById('mobileMenuUserName');
    const mobileProfileLink = document.getElementById('mobileMenuProfileLink');
    const mobileAdminLink   = document.getElementById('mobileMenuAdminLink');

    if (!mobileUserLink) return;

    if (user && user.email) {
      const nameFromProfile = profile && (profile.display_name || profile.full_name)
        ? String(profile.display_name || profile.full_name)
        : '';
      const display = nameFromProfile || String(user.email).split('@')[0] || 'Minha conta';
      const handle  = String(user.email).split('@')[0];
      const avatar  = profile && profile.avatar_url
        ? String(profile.avatar_url)
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(user.email || user.id || 'kc').toLowerCase())}`;
      const verified = !!(profile && profile.verified === true);

      // Atualiza o link de usuário
      const avatarWrap = mobileUserLink.querySelector('.kc-mobile-menu-user-avatar-wrap');
      if (avatarWrap) {
        avatarWrap.innerHTML = `<img src="${escape(avatar)}" alt="${escape(display.split(' ')[0])}" class="kc-mobile-menu-user-avatar" loading="lazy" />`;
      }
      if (mobileUserName) {
        mobileUserName.innerHTML = `${escape(display)}${verified ? ' <i class="fas fa-check-circle" style="color:#53d681;font-size:.8em;"></i>' : ''}<br><small style="color:var(--kc-text-dark-secondary);font-size:.8em;">@${escape(handle)}</small>`;
      }
      mobileUserLink.href = '#login';
      mobileUserLink.title = user.email;

      // Mostra link de perfil
      if (mobileProfileLink) {
        mobileProfileLink.style.display = 'flex';
        const uid = user.id || (profile && profile.id) || '';
        if (uid) mobileProfileLink.href = `${profileHref}?id=${encodeURIComponent(uid)}`;
      }

      // Mostra link de admin se is_admin
      if (mobileAdminLink) {
        const isAdmin = !!(profile && profile.is_admin === true);
        mobileAdminLink.style.display = isAdmin ? 'flex' : 'none';
        mobileAdminLink.href = adminHref;
      }
    } else {
      // Usuário não autenticado
      const avatarWrap = mobileUserLink.querySelector('.kc-mobile-menu-user-avatar-wrap');
      if (avatarWrap) {
        avatarWrap.innerHTML = '<i class="fas fa-user-circle" style="font-size:2rem;color:var(--kc-text-dark-secondary);"></i>';
      }
      if (mobileUserName) mobileUserName.textContent = 'Login / Cadastro';
      mobileUserLink.href = '#login';
      mobileUserLink.removeAttribute('title');
      if (mobileProfileLink) mobileProfileLink.style.display = 'none';
      if (mobileAdminLink) mobileAdminLink.style.display = 'none';
    }

    // Mostra/oculta botão Sair
    const mobileLogoutBtn = document.getElementById('mobileMenuLogoutBtn');
    if (mobileLogoutBtn) {
      mobileLogoutBtn.style.display = (user && user.email) ? 'flex' : 'none';
    }
  }


  function cleanupLegacyMobileAuthLinks(content) {
    if (!content) return;

    const links = Array.from(content.querySelectorAll('a[href="#login"], a[data-kc-login]'));
    links.forEach((link) => {
      const id = String(link.id || '');
      if (id === 'mobileMenuUserLink') return;
      link.remove();
    });

    const seen = new Set();
    Array.from(content.querySelectorAll('.kc-mobile-menu-divider')).forEach((divider) => {
      const key = String(divider.getAttribute('data-kc-divider') || '').trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) divider.remove();
      else seen.add(key);
    });
  }

  function ensureMobileMenuStructure() {
    const drawer = document.querySelector('.kc-mobile-menu-drawer, .kc-mobile-menu');
    const content = drawer ? drawer.querySelector('.kc-mobile-menu-content, .kc-mobile-menu-nav') : null;
    if (!content) return;

    const isAdminArea = window.location.pathname.includes('/admin/');
    const profileHref = isAdminArea ? '../profile.html' : 'profile.html';
    const adminHref = isAdminArea ? 'index.html' : 'admin/index.html';

    let userSection = document.getElementById('mobileMenuUserSection');
    if (!userSection) {
      userSection = document.createElement('div');
      userSection.className = 'kc-mobile-menu-user-section';
      userSection.id = 'mobileMenuUserSection';
      userSection.innerHTML = `
        <a href="#login" id="mobileMenuUserLink" class="kc-mobile-menu-user-link" data-kc-login="true">
          <span class="kc-mobile-menu-user-avatar-wrap">
            <i class="fas fa-user-circle" style="font-size:2rem;color:var(--kc-text-dark-secondary);"></i>
          </span>
          <span id="mobileMenuUserName">Login / Cadastro</span>
        </a>
      `;
      content.insertBefore(userSection, content.firstChild);
    }

    let topDivider = content.querySelector('.kc-mobile-menu-divider[data-kc-divider="top"]');
    if (!topDivider) {
      topDivider = document.createElement('hr');
      topDivider.className = 'kc-mobile-menu-divider';
      topDivider.setAttribute('data-kc-divider', 'top');
      content.insertBefore(topDivider, userSection.nextSibling);
    }

    cleanupLegacyMobileAuthLinks(content);

    let profileLink = document.getElementById('mobileMenuProfileLink');
    if (!profileLink) {
      profileLink = document.createElement('a');
      profileLink.id = 'mobileMenuProfileLink';
      profileLink.href = profileHref;
      profileLink.style.display = 'none';
      profileLink.innerHTML = '<i class="fas fa-id-badge"></i> Meu Perfil';
      content.insertBefore(profileLink, userSection.nextSibling);
    }

    let adminLink = document.getElementById('mobileMenuAdminLink');
    if (!adminLink) {
      adminLink = document.createElement('a');
      adminLink.id = 'mobileMenuAdminLink';
      adminLink.href = adminHref;
      adminLink.style.display = 'none';
      adminLink.innerHTML = '<i class="fas fa-shield-halved" style="color:var(--kc-primary-brand);"></i> Administração';
      content.insertBefore(adminLink, profileLink.nextSibling);
    }

    let profileDivider = content.querySelector('.kc-mobile-menu-divider[data-kc-divider="profile"]');
    if (!profileDivider) {
      profileDivider = document.createElement('hr');
      profileDivider.className = 'kc-mobile-menu-divider';
      profileDivider.setAttribute('data-kc-divider', 'profile');
      content.insertBefore(profileDivider, adminLink.nextSibling);
    }

    // Divisor entre módulos e central de ajuda
    let helpDivider = content.querySelector('.kc-mobile-menu-divider[data-kc-divider="help"]');
    if (!helpDivider) {
      helpDivider = document.createElement('hr');
      helpDivider.className = 'kc-mobile-menu-divider';
      helpDivider.setAttribute('data-kc-divider', 'help');
      content.appendChild(helpDivider);
    }

    // Central de Ajuda
    let helpLink = document.getElementById('mobileMenuHelpLink');
    if (!helpLink) {
      helpLink = document.createElement('a');
      helpLink.id = 'mobileMenuHelpLink';
      helpLink.href = isAdminArea ? '../ajuda.html' : 'ajuda.html';
      helpLink.innerHTML = '<i class="fas fa-circle-question"></i> Central de Ajuda';
      content.appendChild(helpLink);
    }

    // Divisor final
    let bottomDivider = content.querySelector('.kc-mobile-menu-divider[data-kc-divider="bottom"]');
    if (!bottomDivider) {
      bottomDivider = document.createElement('hr');
      bottomDivider.className = 'kc-mobile-menu-divider';
      bottomDivider.setAttribute('data-kc-divider', 'bottom');
      content.appendChild(bottomDivider);
    }

    // Ordem defensiva: módulos -> helpDivider -> helpLink -> bottomDivider -> logout
    if (helpDivider.parentNode === content) content.appendChild(helpDivider);
    if (helpLink.parentNode === content) content.appendChild(helpLink);
    if (bottomDivider.parentNode === content) content.appendChild(bottomDivider);

    // Botão Sair (destacado)
    let logoutBtn = document.getElementById('mobileMenuLogoutBtn');
    if (!logoutBtn) {
      logoutBtn = document.createElement('button');
      logoutBtn.id = 'mobileMenuLogoutBtn';
      logoutBtn.type = 'button';
      logoutBtn.className = 'kc-mobile-menu-logout-btn';
      logoutBtn.style.display = 'none';
      logoutBtn.innerHTML = '<i class="fas fa-right-from-bracket"></i><span>Sair da conta</span>';
      logoutBtn.addEventListener('click', async () => {
        if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
        await doLogout();
      });
      content.appendChild(logoutBtn);
    }
    if (logoutBtn.parentNode === content) content.appendChild(logoutBtn);

    const navLinks = document.querySelectorAll('.kc-mobile-nav a, .kc-mobile-nav button');
    navLinks.forEach((link) => {
      const href = String(link.getAttribute('href') || '').toLowerCase();
      const span = link.querySelector('span');
      if (!span || !href.includes('compra-venda-feed.html')) return;
      span.textContent = 'Compra/Venda';
      span.classList.add('kc-mobile-nav-label-long');
      link.setAttribute('title', 'Compra e Venda');
    });
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

    // Também atualiza o menu mobile
    refreshMobileMenuUser(user, profile);

    if (user && user.email) {
      const nameFromProfile = profile && (profile.display_name || profile.full_name || profile.displayName || profile.name)
        ? String(profile.display_name || profile.full_name || profile.displayName || profile.name)
        : '';

      const display = nameFromProfile || String(user.email).split('@')[0] || 'Minha conta';

      const avatar = profile && (profile.avatar_url || profile.avatarUrl || profile.avatar)
        ? String(profile.avatar_url || profile.avatarUrl || profile.avatar)
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(user.email || user.id || 'kc').toLowerCase())}`;

      // Hardening (V8.1.3.3 retro): badge deve refletir SOMENTE o valor retornado do banco (profiles.verified)
      const verified = !!(profile && (profile.verified === true));

      const displayEsc = escape(display);
      const avatarEsc = escape(avatar);
      const altEsc = escape((String(display).split(' ')[0] || 'Usuário'));

      btn.innerHTML = `
        <span class="kc-header-user">
          <img class="kc-header-user__avatar" src="${avatarEsc}" alt="${altEsc}" loading="lazy" decoding="async" />
          <span class="kc-header-user__name">${displayEsc}</span>
          ${verified ? '<i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i>' : ''}
          <i class="fas fa-chevron-down kc-header-user__chevron" aria-hidden="true"></i>
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

      // Botão de perfil (is-auth): dropdown no desktop, drawer no mobile
      if (trg.classList.contains('is-auth')) {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const drawer   = document.querySelector('.kc-mobile-menu-drawer, .kc-mobile-menu');
        if (isMobile && drawer && typeof window.openMobileMenu === 'function') {
          window.openMobileMenu();
          return;
        }
        // Desktop: dropdown flutuante
        toggleProfileDropdown(trg);
        return;
      }

      openModal();
    });
  }

  // Exposição para integração com outras áreas (ex.: create-post)
  window.kcOpenAuthModal       = openModal;
  window.kcCloseAuthModal      = closeModal;
  window.kcOpenProfileDropdown  = openProfileDropdown;
  window.kcCloseProfileDropdown = closeProfileDropdown;

  function init() {
    ensureMobileMenuStructure();
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
