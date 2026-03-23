(function () {
  'use strict';

  const VERSION = '8.3.4.4';
  const AUTH_INTENT_KEY = 'kc:auth:intents';
  const shared = window.KCAccountProfileUtils || {};
  const modalState = { panel: 'login', nextPath: '', trapHandler: null };

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $all(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function escapeHtml(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value);
  }

  function readEnv() {
    const env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : {};
    const driver = String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();
    const domains = Array.isArray(env.AUTH_ALLOWED_DOMAINS)
      ? env.AUTH_ALLOWED_DOMAINS
      : ((env.auth && Array.isArray(env.auth.allowedEmailDomains)) ? env.auth.allowedEmailDomains : []);
    return { driver, allowedDomains: Array.isArray(domains) ? domains.filter(Boolean) : [] };
  }

  function normalizeEmail(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeEmail === 'function') return window.KCUtils.normalizeEmail(value);
    return String(value || '').trim().toLowerCase();
  }

  function getCurrentUser() {
    return window.KCSupabase && typeof window.KCSupabase.getUser === 'function' ? window.KCSupabase.getUser() : null;
  }

  function getCurrentProfile() {
    return window.KCAPI && typeof window.KCAPI.getCurrentProfile === 'function' ? window.KCAPI.getCurrentProfile() : null;
  }

  function normalizeNextPath(value) {
    if (shared && typeof shared.normalizeNextPath === 'function') return shared.normalizeNextPath(value, window.location.pathname || '/index.html');
    const raw = String(value || '').trim();
    if (!raw) return window.location.pathname || '/index.html';
    return raw.charAt(0) === '/' ? raw : `/${raw}`;
  }

  function buildCurrentPath() {
    const path = String(window.location.pathname || '/index.html').trim() || '/index.html';
    return `${path}${window.location.search || ''}${window.location.hash || ''}`;
  }

  function buildCallbackUrl(nextPath) {
    const url = new URL('/auth-callback.html', window.location.origin);
    url.searchParams.set('next', normalizeNextPath(nextPath || buildCurrentPath()));
    return url.toString();
  }

  function buildAccountSetupHref(nextPath) {
    const url = new URL('/account-setup.html', window.location.origin);
    url.searchParams.set('next', normalizeNextPath(nextPath || buildCurrentPath()));
    return `${url.pathname}${url.search}`;
  }

  function buildSettingsHref(nextPath) {
    const url = new URL('/settings.html', window.location.origin);
    url.searchParams.set('next', normalizeNextPath(nextPath || buildCurrentPath()));
    return `${url.pathname}${url.search}`;
  }

  function buildProfileHref(profileId) {
    const isAdmin = String(window.location.pathname || '').includes('/admin/');
    const base = isAdmin ? '../profile.html' : 'profile.html';
    return profileId ? `${base}?id=${encodeURIComponent(profileId)}` : base;
  }

  function buildAdminHref() { return String(window.location.pathname || '').includes('/admin/') ? 'index.html' : 'admin/index.html'; }
  function buildHelpHref() { return String(window.location.pathname || '').includes('/admin/') ? '../ajuda.html' : 'ajuda.html'; }
  function isOnboardingComplete(profile) {
    return shared && typeof shared.isOnboardingComplete === 'function'
      ? shared.isOnboardingComplete(profile || {})
      : !!(profile && profile.onboarding_completed_at);
  }

  function isAllowedDomain(email, domains) {
    const list = Array.from(new Set((Array.isArray(domains) ? domains : []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
    if (!list.length) return true;
    const domain = normalizeEmail(email).split('@')[1] || '';
    return list.includes(domain);
  }

  function formatAllowedDomains(domains) {
    const list = Array.from(new Set((Array.isArray(domains) ? domains : []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
    return list.length ? list.map((item) => `@${item}`).join(', ') : '';
  }

  function readAuthIntents() {
    try {
      const raw = window.sessionStorage.getItem(AUTH_INTENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) { return []; }
  }

  function writeAuthIntents(intents) {
    try { window.sessionStorage.setItem(AUTH_INTENT_KEY, JSON.stringify(Array.isArray(intents) ? intents : [])); } catch (_) { }
  }

  function queueAuthIntent(intent) {
    const payload = (intent && typeof intent === 'object') ? { ...intent } : null;
    if (!payload || !payload.type) return null;
    const intents = readAuthIntents();
    intents.push({ ...payload, createdAt: new Date().toISOString() });
    writeAuthIntents(intents.slice(-10));
    return payload;
  }

  function peekAuthIntent() {
    const intents = readAuthIntents();
    return intents.length ? intents[intents.length - 1] : null;
  }

  function consumeAuthIntent(predicate) {
    const intents = readAuthIntents();
    if (!intents.length) return null;
    if (typeof predicate !== 'function') {
      const next = intents.shift();
      writeAuthIntents(intents);
      return next || null;
    }
    const index = intents.findIndex((item) => predicate(item));
    if (index < 0) return null;
    const match = intents.splice(index, 1)[0];
    writeAuthIntents(intents);
    return match || null;
  }

  function clearAuthIntents() { writeAuthIntents([]); }

  const overlayLock = (function initOverlayLock() {
    const state = {
      keys: new Set(),
      scrollTop: 0,
      bound: false,
    };

    function apply() {
      if (document.documentElement.classList.contains('kc-scroll-locked')) return;
      state.scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      document.documentElement.classList.add('kc-scroll-locked');
      document.body.classList.add('kc-scroll-locked');
      document.body.style.top = `-${state.scrollTop}px`;
    }

    function release() {
      if (state.keys.size) return;
      const offset = Math.abs(parseInt(document.body.style.top || '0', 10)) || state.scrollTop || 0;
      document.documentElement.classList.remove('kc-scroll-locked');
      document.body.classList.remove('kc-scroll-locked');
      document.body.style.top = '';
      state.scrollTop = 0;
      window.scrollTo(0, offset);
    }

    function lock(key) {
      state.keys.add(String(key || 'overlay'));
      apply();
    }

    function unlock(key) {
      state.keys.delete(String(key || 'overlay'));
      release();
    }

    function syncBodyModalClass() {
      const key = 'body:kc-modal-open';
      if (document.body.classList.contains('kc-modal-open')) lock(key);
      else unlock(key);
    }

    function ensureObserver() {
      if (state.bound || !document.body || typeof MutationObserver !== 'function') return;
      state.bound = true;
      const observer = new MutationObserver(syncBodyModalClass);
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      syncBodyModalClass();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureObserver, { once: true });
    } else {
      ensureObserver();
    }

    return Object.freeze({ lock, unlock, ensureObserver });
  }());

  window.KCOverlayLock = overlayLock;

  function setStatus(message, tone) {
    const el = $('#kcAuthStatus');
    if (!el) return;
    if (!message) {
      el.textContent = '';
      el.className = 'kc-auth-status';
      return;
    }
    el.textContent = String(message || '');
    el.className = `kc-auth-status show ${tone || 'info'}`;
  }

  function getFocusable(root) {
    return $all('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', root).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function trapFocus() {
    if (modalState.trapHandler) return;
    modalState.trapHandler = function (event) {
      if (event.key !== 'Tab') return;
      const modal = $('#kcAuthModal');
      if (!modal || !modal.classList.contains('active')) return;
      const focusable = getFocusable(modal);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', modalState.trapHandler);
  }

  function releaseTrap() {
    if (!modalState.trapHandler) return;
    document.removeEventListener('keydown', modalState.trapHandler);
    modalState.trapHandler = null;
  }

  function setPanel(panel) {
    modalState.panel = panel;
    const modal = $('#kcAuthModal');
    if (!modal) return;
    $all('[data-auth-tab]', modal).forEach((button) => {
      const active = button.getAttribute('data-auth-tab') === panel;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $all('[data-auth-panel]', modal).forEach((section) => {
      const active = section.getAttribute('data-auth-panel') === panel;
      section.style.display = active ? 'grid' : 'none';
      section.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    const tabs = $('.kc-auth-tabs', modal);
    if (tabs) tabs.style.display = panel === 'user' ? 'none' : 'grid';
    setStatus('', 'info');
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
    modal.innerHTML = [
      '<div class="kc-auth-card">',
      '<div class="kc-auth-header"><div class="kc-auth-title"><h2>Conta KinoCampus</h2><p class="kc-auth-sub">Entre, confirme seu cadastro ou recupere sua senha sem sair da página.</p></div><button class="kc-auth-close" type="button" aria-label="Fechar"><i class="fas fa-times"></i></button></div>',
      '<div class="kc-auth-status" id="kcAuthStatus" role="status" aria-live="polite"></div>',
      '<div class="kc-auth-body">',
      '<div class="kc-auth-tabs" role="tablist"><button class="kc-auth-tab active" type="button" data-auth-tab="login" role="tab" aria-selected="true">Login</button><button class="kc-auth-tab" type="button" data-auth-tab="signup" role="tab" aria-selected="false">Cadastro</button></div>',
      '<section class="kc-auth-panel" data-auth-panel="login"><form class="kc-auth-form" id="kcAuthLoginForm"><div class="kc-auth-field"><label for="kcAuthLoginEmail">E-mail institucional</label><input id="kcAuthLoginEmail" name="email" type="email" autocomplete="email" placeholder="voce@ufg.br" required /></div><div class="kc-auth-field"><label for="kcAuthLoginPassword">Senha</label><input id="kcAuthLoginPassword" name="password" type="password" autocomplete="current-password" minlength="6" placeholder="Sua senha" required /></div><div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit">Entrar</button></div></form><div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="forgot">Esqueci minha senha</button><button type="button" class="kc-auth-link-btn" data-auth-link="resend">Reenviar confirmação</button><button type="button" class="kc-auth-link-btn" data-auth-link="signup">Ainda não tenho conta</button></div></section>',
      '<section class="kc-auth-panel" data-auth-panel="signup" style="display:none;" aria-hidden="true"><form class="kc-auth-form" id="kcAuthSignupForm"><div class="kc-auth-field"><label for="kcAuthSignupEmail">E-mail institucional</label><input id="kcAuthSignupEmail" name="email" type="email" autocomplete="email" placeholder="voce@ufg.br" required /></div><div class="kc-auth-field"><label for="kcAuthSignupPassword">Senha</label><input id="kcAuthSignupPassword" name="password" type="password" autocomplete="new-password" minlength="6" placeholder="Crie uma senha" required /></div><div class="kc-auth-field"><label for="kcAuthSignupConfirm">Confirmar senha</label><input id="kcAuthSignupConfirm" name="confirm" type="password" autocomplete="new-password" minlength="6" placeholder="Repita a senha" required /></div><p class="kc-auth-note">O link de confirmação será enviado para o seu e-mail institucional.</p><div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit">Criar conta</button></div></form><div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="login">Já tenho conta</button><button type="button" class="kc-auth-link-btn" data-auth-link="resend">Reenviar confirmação</button></div></section>',
      '<section class="kc-auth-panel" data-auth-panel="forgot" style="display:none;" aria-hidden="true"><form class="kc-auth-form" id="kcAuthForgotForm"><div class="kc-auth-field"><label for="kcAuthForgotEmail">E-mail da sua conta</label><input id="kcAuthForgotEmail" name="email" type="email" autocomplete="email" placeholder="voce@ufg.br" required /></div><p class="kc-auth-note">Enviaremos um link para redefinir sua senha pelo callback oficial do KinoCampus.</p><div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit">Enviar link</button></div></form><div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="login">Voltar ao login</button></div></section>',
      '<section class="kc-auth-panel" data-auth-panel="resend" style="display:none;" aria-hidden="true"><form class="kc-auth-form" id="kcAuthResendForm"><div class="kc-auth-field"><label for="kcAuthResendEmail">E-mail do cadastro</label><input id="kcAuthResendEmail" name="email" type="email" autocomplete="email" placeholder="voce@ufg.br" required /></div><p class="kc-auth-note">Se o e-mail anterior expirou ou sumiu, enviamos outro agora.</p><div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit">Reenviar</button></div></form><div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="login">Voltar ao login</button><button type="button" class="kc-auth-link-btn" data-auth-link="signup">Ir para cadastro</button></div></section>',
      '<section class="kc-auth-panel" data-auth-panel="user" style="display:none;" aria-hidden="true"><div class="kc-auth-user"><div class="kc-auth-user-card"><div class="kc-auth-user-icon"><i class="fas fa-user"></i></div><div class="kc-auth-user-info"><div class="kc-auth-user-email" id="kcAuthUserEmail">-</div><div class="kc-auth-user-meta" id="kcAuthUserMeta">Sessão ativa</div></div></div><div class="kc-auth-user-actions"><a class="kc-auth-btn" id="kcAuthProfileLink" href="profile.html"><i class="fas fa-id-badge"></i><span>Meu perfil</span></a><a class="kc-auth-btn" id="kcAuthSettingsLink" href="settings.html"><i class="fas fa-sliders"></i><span>Configurações</span></a><a class="kc-auth-btn" id="kcAuthSetupLink" href="account-setup.html"><i class="fas fa-list-check"></i><span>Completar cadastro</span></a><a class="kc-auth-btn" id="kcAuthHelpLink" href="ajuda.html"><i class="fas fa-circle-question"></i><span>Central de ajuda</span></a><button class="kc-auth-btn danger" type="button" id="kcAuthLogoutBtn"><i class="fas fa-right-from-bracket"></i><span>Sair</span></button></div></div></section>',
      '</div><div class="kc-auth-footer"><span class="kc-auth-footer-version">Auth v' + VERSION + '</span></div></div>',
    ].join('');
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  function ensureProfileDropdown() {
    if ($('#kcProfileDropdown')) return;
    const dropdown = document.createElement('div');
    dropdown.id = 'kcProfileDropdown';
    dropdown.className = 'kc-profile-dropdown';
    dropdown.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dropdown);
    document.addEventListener('click', function (event) {
      const current = $('#kcProfileDropdown');
      if (!current || !current.classList.contains('active')) return;
      const trigger = document.querySelector('a.btn-login.is-auth');
      if (trigger && trigger.contains(event.target)) return;
      if (!current.contains(event.target)) closeProfileDropdown();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeProfileDropdown();
    });
  }

  function buildDropdownContent(user, profile) {
    const display = String((profile && (profile.display_name || profile.full_name)) || (user && user.email ? String(user.email).split('@')[0] : 'Minha conta')).trim();
    const avatar = String((profile && profile.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String((user && (user.email || user.id)) || 'kc').toLowerCase())}`).trim();
    const verified = profile && profile.verified === true;
    const isAdmin = profile && profile.is_admin === true;
    const onboardingPending = user && !isOnboardingComplete(profile);
    const handle = user && user.email ? `@${String(user.email).split('@')[0]}` : '';
    return [
      '<div class="kc-profile-dropdown__header">',
      `<img class="kc-profile-dropdown__avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(display)}" loading="lazy" />`,
      '<div class="kc-profile-dropdown__info">',
      `<span class="kc-profile-dropdown__name">${escapeHtml(display)}${verified ? ' <i class="fas fa-check-circle" style="color:#53d681;font-size:.8em;"></i>' : ''}</span>`,
      handle ? `<span class="kc-profile-dropdown__handle">${escapeHtml(handle)}</span>` : '',
      '</div></div><hr class="kc-profile-dropdown__divider" /><nav class="kc-profile-dropdown__menu">',
      `<a href="${escapeHtml(buildProfileHref(user && user.id))}" class="kc-profile-dropdown__item"><i class="fas fa-id-badge"></i><span>Meu perfil</span></a>`,
      `<a href="${escapeHtml(buildSettingsHref(buildCurrentPath()))}" class="kc-profile-dropdown__item"><i class="fas fa-sliders"></i><span>Configurações</span></a>`,
      onboardingPending ? `<a href="${escapeHtml(buildAccountSetupHref(buildCurrentPath()))}" class="kc-profile-dropdown__item"><i class="fas fa-list-check"></i><span>Completar cadastro</span></a>` : '',
      isAdmin ? `<a href="${escapeHtml(buildAdminHref())}" class="kc-profile-dropdown__item"><i class="fas fa-shield-halved" style="color:var(--kc-primary-brand);"></i><span>Administracao</span></a>` : '',
      `<a href="${escapeHtml(buildHelpHref())}" class="kc-profile-dropdown__item"><i class="fas fa-circle-question"></i><span>Central de ajuda</span></a>`,
      '<hr class="kc-profile-dropdown__divider" /><button type="button" class="kc-profile-dropdown__item kc-profile-dropdown__logout" id="kcDropdownLogoutBtn"><i class="fas fa-right-from-bracket"></i><span>Sair da conta</span></button></nav>'
    ].join('');
  }

  function openProfileDropdown(button) {
    ensureProfileDropdown();
    const dropdown = $('#kcProfileDropdown');
    const user = getCurrentUser();
    const profile = getCurrentProfile();
    if (!dropdown || !user) return;
    dropdown.innerHTML = buildDropdownContent(user, profile);
    const rect = button.getBoundingClientRect();
    const width = 244;
    let left = rect.right - width;
    if (left < 8) left = 8;
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${left}px`;
    dropdown.classList.add('active');
    dropdown.setAttribute('aria-hidden', 'false');
    button.classList.add('kc-dropdown-open');
    const logoutButton = $('#kcDropdownLogoutBtn');
    if (logoutButton) logoutButton.addEventListener('click', doLogout, { once: true });
  }

  function closeProfileDropdown() {
    const dropdown = $('#kcProfileDropdown');
    if (dropdown) {
      dropdown.classList.remove('active');
      dropdown.setAttribute('aria-hidden', 'true');
    }
    const button = document.querySelector('a.btn-login.kc-dropdown-open');
    if (button) button.classList.remove('kc-dropdown-open');
  }

  function toggleProfileDropdown(button) {
    const dropdown = $('#kcProfileDropdown');
    if (dropdown && dropdown.classList.contains('active')) closeProfileDropdown();
    else openProfileDropdown(button);
  }

  function ensureMobileMenuStructure() {
    const drawer = document.querySelector('.kc-mobile-menu-drawer, .kc-mobile-menu');
    const content = drawer ? drawer.querySelector('.kc-mobile-menu-content, .kc-mobile-menu-nav') : null;
    if (!content) return;
    let accountSection = $('#mobileMenuAccountSection');
    if (!accountSection) {
      accountSection = document.createElement('div');
      accountSection.id = 'mobileMenuAccountSection';
      accountSection.className = 'kc-mobile-menu-account-section';
      const userSection = $('#mobileMenuUserSection');
      const topDivider = content.querySelector('[data-kc-divider="top"]');
      if (topDivider) topDivider.insertAdjacentElement('afterend', accountSection);
      else if (userSection) userSection.insertAdjacentElement('afterend', accountSection);
      else content.insertBefore(accountSection, content.firstChild);
    }

    function ensureAccountNode(id, tagName, html, className) {
      let node = document.getElementById(id);
      if (!node) {
        node = document.createElement(tagName);
        node.id = id;
        node.innerHTML = html;
      }
      if (className) node.className = className;
      accountSection.appendChild(node);
      return node;
    }

    ensureAccountNode('mobileMenuProfileLink', 'a', '<i class="fas fa-id-badge"></i><span>Meu perfil</span>', 'kc-mobile-menu-account-link');
    ensureAccountNode('mobileMenuSettingsLink', 'a', '<i class="fas fa-sliders"></i><span>Configurações</span>', 'kc-mobile-menu-account-link');
    ensureAccountNode('mobileMenuAccountSetupLink', 'a', '<i class="fas fa-list-check"></i><span>Completar cadastro</span>', 'kc-mobile-menu-account-link');
    ensureAccountNode('mobileMenuAdminLink', 'a', '<i class="fas fa-shield-halved" style="color:var(--kc-primary-brand);"></i><span>Administração</span>', 'kc-mobile-menu-account-link');
    ensureAccountNode('mobileMenuHelpLink', 'a', '<i class="fas fa-circle-question"></i><span>Central de ajuda</span>', 'kc-mobile-menu-account-link');
    const logoutButton = ensureAccountNode('mobileMenuLogoutBtn', 'button', '<i class="fas fa-right-from-bracket"></i><span>Sair da conta</span>', 'kc-mobile-menu-account-btn kc-mobile-menu-logout-btn');
    logoutButton.type = 'button';

    const settingsLink = $('#mobileMenuSettingsLink');
    const setupLink = $('#mobileMenuAccountSetupLink');
    const adminLink = $('#mobileMenuAdminLink');
    const helpLink = $('#mobileMenuHelpLink');
    if (settingsLink) settingsLink.href = buildSettingsHref(buildCurrentPath());
    if (setupLink) setupLink.href = buildAccountSetupHref(buildCurrentPath());
    if (adminLink) adminLink.href = buildAdminHref();
    if (helpLink) helpLink.href = buildHelpHref();

    let accountDivider = $('#mobileMenuAccountDivider') || content.querySelector('[data-kc-divider="profile"]');
    if (!accountDivider) {
      accountDivider = document.createElement('hr');
      accountDivider.id = 'mobileMenuAccountDivider';
      accountDivider.className = 'kc-mobile-menu-divider';
      accountDivider.setAttribute('data-kc-divider', 'account');
    }
    accountDivider.id = 'mobileMenuAccountDivider';
    accountDivider.setAttribute('data-kc-divider', 'account');
    accountSection.insertAdjacentElement('afterend', accountDivider);
  }

  function refreshMobileMenuUser(user, profile) {
    const mobileUserLink = $('#mobileMenuUserLink');
    const mobileUserName = $('#mobileMenuUserName');
    const profileLink = $('#mobileMenuProfileLink');
    const settingsLink = $('#mobileMenuSettingsLink');
    const adminLink = $('#mobileMenuAdminLink');
    const setupLink = $('#mobileMenuAccountSetupLink');
    const helpLink = $('#mobileMenuHelpLink');
    const logoutButton = $('#mobileMenuLogoutBtn');
    if (!mobileUserLink) return;
    if (helpLink) {
      helpLink.style.display = 'flex';
      helpLink.href = buildHelpHref();
    }
    if (user && user.email) {
      const display = String((profile && (profile.display_name || profile.full_name)) || String(user.email).split('@')[0] || 'Minha conta').trim();
      const avatar = String((profile && profile.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(user.email || user.id).toLowerCase())}`).trim();
      const avatarWrap = mobileUserLink.querySelector('.kc-mobile-menu-user-avatar-wrap');
      if (avatarWrap) avatarWrap.innerHTML = `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(display)}" class="kc-mobile-menu-user-avatar" loading="lazy" />`;
      if (mobileUserName) mobileUserName.innerHTML = `${escapeHtml(display)}<br><small style="color:var(--kc-text-dark-secondary);font-size:.8em;">@${escapeHtml(String(user.email).split('@')[0])}</small>`;
      mobileUserLink.href = '#login';
      if (profileLink) { profileLink.style.display = 'flex'; profileLink.href = buildProfileHref(user.id); }
      if (settingsLink) { settingsLink.style.display = 'flex'; settingsLink.href = buildSettingsHref(buildCurrentPath()); }
      if (adminLink) { adminLink.style.display = profile && profile.is_admin === true ? 'flex' : 'none'; adminLink.href = buildAdminHref(); }
      if (setupLink) { setupLink.style.display = isOnboardingComplete(profile) ? 'none' : 'flex'; setupLink.href = buildAccountSetupHref(buildCurrentPath()); }
      if (logoutButton) logoutButton.style.display = 'flex';
    } else {
      const avatarWrap = mobileUserLink.querySelector('.kc-mobile-menu-user-avatar-wrap');
      if (avatarWrap) avatarWrap.innerHTML = '<i class="fas fa-user-circle" style="font-size:2rem;color:var(--kc-text-dark-secondary);"></i>';
      if (mobileUserName) mobileUserName.textContent = 'Login / Cadastro';
      if (profileLink) profileLink.style.display = 'none';
      if (settingsLink) { settingsLink.style.display = 'flex'; settingsLink.href = buildSettingsHref(buildCurrentPath()); }
      if (adminLink) adminLink.style.display = 'none';
      if (setupLink) setupLink.style.display = 'none';
      if (logoutButton) logoutButton.style.display = 'none';
    }
  }

  function openModal(options) {
    ensureModal();
    const overlay = $('#kcAuthOverlay');
    const modal = $('#kcAuthModal');
    if (!overlay || !modal) return;
    const opts = (options && typeof options === 'object') ? options : {};
    modalState.nextPath = normalizeNextPath(opts.nextPath || buildCurrentPath());
    overlay.classList.add('active');
    modal.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-hidden', 'false');
    overlayLock.lock('auth-modal');
    document.body.classList.add('kc-modal-open');
    trapFocus();
    refreshUIFromUser();
    setPanel(opts.tab || (getCurrentUser() ? 'user' : 'login'));
    setTimeout(function () {
      const panel = $(`[data-auth-panel="${modalState.panel}"]`, modal) || modal;
      const focusable = getFocusable(panel);
      if (focusable.length) focusable[0].focus();
    }, 30);
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
    overlayLock.unlock('auth-modal');
    releaseTrap();
    setStatus('', 'info');
  }

  async function handlePostAuthSuccess(nextPath) {
    let profile = null;
    try {
      profile = await window.KCAPI.getMyProfile();
      if (!profile && typeof window.KCAPI.syncProfile === 'function') {
        await window.KCAPI.syncProfile();
        profile = await window.KCAPI.getMyProfile();
      }
    } catch (_) { profile = null; }
    closeModal();
    if (!isOnboardingComplete(profile) && !String(window.location.pathname || '').includes('account-setup.html')) {
      window.location.href = buildAccountSetupHref(nextPath);
      return;
    }
    const normalizedNext = normalizeNextPath(nextPath);
    if (normalizedNext !== normalizeNextPath(buildCurrentPath())) {
      window.location.href = normalizedNext;
      return;
    }
    refreshUIFromUser();
  }

  async function doLogin(form) {
    const env = readEnv();
    if (env.driver !== 'supabase') { setStatus('A autenticacao esta desativada no modo local.', 'warn'); return; }
    const email = normalizeEmail(form.email.value);
    const password = String(form.password.value || '');
    if (!email || !password) { setStatus('Preencha e-mail e senha.', 'warn'); return; }
    setStatus('Entrando...', 'info');
    const result = await window.KCAPI.signIn(email, password);
    if (!result || result.error) { setStatus((result && result.error && result.error.message) || 'Não foi possível entrar.', 'error'); return; }
    setStatus('Login realizado com sucesso.', 'success');
    await handlePostAuthSuccess(modalState.nextPath);
  }

  async function doSignup(form) {
    const env = readEnv();
    if (env.driver !== 'supabase') { setStatus('O cadastro está desativado no modo local.', 'warn'); return; }
    const email = normalizeEmail(form.email.value);
    const password = String(form.password.value || '');
    const confirm = String(form.confirm.value || '');
    if (!email || !password || !confirm) { setStatus('Preencha todos os campos.', 'warn'); return; }
    if (password.length < 6) { setStatus('Sua senha precisa ter pelo menos 6 caracteres.', 'warn'); return; }
    if (password !== confirm) { setStatus('As senhas não conferem.', 'warn'); return; }
    if (!isAllowedDomain(email, env.allowedDomains)) {
      const hint = formatAllowedDomains(env.allowedDomains);
      setStatus(hint ? `Use um e-mail institucional de um domínio aceito (${hint}).` : 'Use um e-mail institucional válido.', 'warn');
      return;
    }
    setStatus('Criando sua conta...', 'info');
    const result = await window.KCAPI.signUp(email, password, {
      emailRedirectTo: buildCallbackUrl(modalState.nextPath),
      data: { display_name: email.split('@')[0] }
    });
    if (!result || result.error) { setStatus((result && result.error && result.error.message) || 'Não foi possível criar sua conta.', 'error'); return; }
    if (result.session) {
      setStatus('Conta criada e autenticada. Vamos completar seu perfil.', 'success');
      await handlePostAuthSuccess(modalState.nextPath);
      return;
    }
    setStatus('Conta criada. Abra o e-mail de confirmação para finalizar seu cadastro.', 'success');
    const resend = $('#kcAuthResendEmail');
    if (resend) resend.value = email;
    setPanel('resend');
  }

  async function doForgotPassword(form) {
    const email = normalizeEmail(form.email.value);
    if (!email) { setStatus('Informe o e-mail da sua conta.', 'warn'); return; }
    setStatus('Enviando link de redefinição...', 'info');
    const result = await window.KCAPI.requestPasswordReset(email, { redirectTo: buildCallbackUrl(modalState.nextPath) });
    if (!result || result.error || result.ok === false) { setStatus((result && result.error && result.error.message) || 'Não foi possível enviar o link.', 'error'); return; }
    setStatus('Pronto. Enviamos um e-mail com o link para redefinir sua senha.', 'success');
  }

  async function doResendConfirmation(form) {
    const env = readEnv();
    const email = normalizeEmail(form.email.value);
    if (!email) { setStatus('Informe o e-mail usado no cadastro.', 'warn'); return; }
    if (!isAllowedDomain(email, env.allowedDomains)) { setStatus('Use o mesmo e-mail institucional aceito na plataforma.', 'warn'); return; }
    setStatus('Reenviando confirmação...', 'info');
    const result = await window.KCAPI.resendConfirmation(email, { emailRedirectTo: buildCallbackUrl(modalState.nextPath) });
    if (!result || result.error || result.ok === false) { setStatus((result && result.error && result.error.message) || 'Não foi possível reenviar a confirmação.', 'error'); return; }
    setStatus('Novo e-mail enviado. Abra o link recebido para concluir o cadastro.', 'success');
  }

  async function doLogout() {
    setStatus('Saindo...', 'info');
    try {
      await window.KCAPI.logout();
      closeProfileDropdown();
      if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
      closeModal();
    } catch (error) {
      console.error('[KCAuthUI] logout failed:', error);
      setStatus('Não foi possível sair agora.', 'error');
    }
  }

  function refreshHeaderLabel(user) {
    const button = $('a.btn-login') || $('a[href="#login"]');
    if (!button) return;
    const profile = getCurrentProfile();
    refreshMobileMenuUser(user, profile);
    if (user && user.email) {
      const display = String((profile && (profile.display_name || profile.full_name)) || String(user.email).split('@')[0] || 'Minha conta').trim();
      const avatar = String((profile && profile.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(user.email || user.id).toLowerCase())}`).trim();
      const verified = profile && profile.verified === true;
      button.innerHTML = `<span class="kc-header-user"><img class="kc-header-user__avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(display)}" loading="lazy" decoding="async" /><span class="kc-header-user__name">${escapeHtml(display)}</span>${verified ? '<i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i>' : ''}<i class="fas fa-chevron-down kc-header-user__chevron" aria-hidden="true"></i></span>`;
      button.classList.add('is-auth');
      button.setAttribute('data-kc-login', 'true');
      button.setAttribute('href', '#login');
      button.setAttribute('title', user.email);
    } else {
      button.textContent = 'Login/Cadastro';
      button.classList.remove('is-auth');
      button.setAttribute('data-kc-login', 'true');
      button.setAttribute('href', '#login');
      button.removeAttribute('title');
    }
  }

  function setWriteGuards(user) {
    const env = readEnv();
    if (env.driver !== 'supabase') return;
    const isLogged = !!(user && user.id);
    if (!document.body.getAttribute('data-kc-auth-guard')) {
      document.body.setAttribute('data-kc-auth-guard', 'true');
      document.addEventListener('click', function (event) {
        const trigger = event.target && event.target.closest ? event.target.closest('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn') : null;
        if (!trigger || getCurrentUser()) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof window.showToast === 'function') window.showToast('Faca login para publicar.', 'warn', 2200);
      }, true);
    }
    $all('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn').forEach((element) => {
      element.classList.toggle('kc-disabled', !isLogged);
      if (!isLogged) element.setAttribute('aria-disabled', 'true');
      else element.removeAttribute('aria-disabled');
    });
  }

  function refreshUIFromUser() {
    const user = getCurrentUser();
    const profile = getCurrentProfile();
    refreshHeaderLabel(user);
    setWriteGuards(user);
    const profileLink = $('#kcAuthProfileLink');
    const settingsLink = $('#kcAuthSettingsLink');
    const setupLink = $('#kcAuthSetupLink');
    const helpLink = $('#kcAuthHelpLink');
    const userEmail = $('#kcAuthUserEmail');
    const userMeta = $('#kcAuthUserMeta');
    if (user && user.email) {
      if (profileLink) profileLink.href = buildProfileHref(user.id);
      if (settingsLink) settingsLink.href = buildSettingsHref(buildCurrentPath());
      if (setupLink) {
        setupLink.href = buildAccountSetupHref(buildCurrentPath());
        setupLink.style.display = isOnboardingComplete(profile) ? 'none' : 'inline-flex';
      }
      if (helpLink) helpLink.href = buildHelpHref();
      if (userEmail) userEmail.textContent = user.email;
      if (userMeta) userMeta.textContent = isOnboardingComplete(profile) ? 'Conta pronta para publicar e receber contatos' : 'Cadastro incompleto: finalize seu onboarding';
      if (modalState.panel === 'user' || $('#kcAuthModal')?.classList.contains('active')) setPanel('user');
    } else if (modalState.panel === 'user') {
      setPanel('login');
    }
  }

  function bindModalEvents() {
    const overlay = $('#kcAuthOverlay');
    const modal = $('#kcAuthModal');
    if (!overlay || !modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    overlay.addEventListener('click', closeModal);
    modal.addEventListener('click', function (event) {
      if (event.target.closest('.kc-auth-close')) closeModal();
      const tab = event.target.closest('[data-auth-tab]');
      if (tab) setPanel(String(tab.getAttribute('data-auth-tab') || 'login'));
      const link = event.target.closest('[data-auth-link]');
      if (link) setPanel(String(link.getAttribute('data-auth-link') || 'login'));
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeModal();
    });
    $('#kcAuthLoginForm').addEventListener('submit', function (event) { event.preventDefault(); doLogin(event.currentTarget); });
    $('#kcAuthSignupForm').addEventListener('submit', function (event) { event.preventDefault(); doSignup(event.currentTarget); });
    $('#kcAuthForgotForm').addEventListener('submit', function (event) { event.preventDefault(); doForgotPassword(event.currentTarget); });
    $('#kcAuthResendForm').addEventListener('submit', function (event) { event.preventDefault(); doResendConfirmation(event.currentTarget); });
    $('#kcAuthLogoutBtn').addEventListener('click', doLogout);
    const mobileLogout = $('#mobileMenuLogoutBtn');
    if (mobileLogout && !mobileLogout.dataset.bound) {
      mobileLogout.dataset.bound = '1';
      mobileLogout.addEventListener('click', doLogout);
    }
  }

  function wireTriggers() {
    document.addEventListener('click', function (event) {
      const trigger = event.target && event.target.closest ? event.target.closest('[data-kc-login], a[href="#login"]') : null;
      if (!trigger) return;
      event.preventDefault();
      if (trigger.classList.contains('is-auth')) {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const drawer = document.querySelector('.kc-mobile-menu-drawer, .kc-mobile-menu');
        if (isMobile && drawer && typeof window.openMobileMenu === 'function') { window.openMobileMenu(); return; }
        toggleProfileDropdown(trigger);
        return;
      }
      const requestedTab = String(trigger.getAttribute('data-auth-tab') || '').trim() || 'login';
      openModal({ tab: requestedTab, nextPath: buildCurrentPath() });
    });
  }

  function init() {
    ensureMobileMenuStructure();
    ensureModal();
    bindModalEvents();
    wireTriggers();
    if (window.KCSupabase && typeof window.KCSupabase.refreshSession === 'function') {
      window.KCSupabase.refreshSession().finally(refreshUIFromUser);
    } else {
      refreshUIFromUser();
    }
    document.addEventListener('kc:authchange', refreshUIFromUser);
    document.addEventListener('kc:profilechange', refreshUIFromUser);
  }

  window.kcOpenAuthModal = openModal;
  window.kcCloseAuthModal = closeModal;
  window.kcQueueAuthIntent = queueAuthIntent;
  window.kcPeekAuthIntent = peekAuthIntent;
  window.kcConsumeAuthIntent = consumeAuthIntent;
  window.kcClearAuthIntents = clearAuthIntents;
  window.kcOpenProfileDropdown = openProfileDropdown;
  window.kcCloseProfileDropdown = closeProfileDropdown;

  try { document.addEventListener('DOMContentLoaded', init, { once: true }); } catch (_) { }
})();
