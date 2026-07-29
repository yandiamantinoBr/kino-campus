(function () {
  'use strict';

  const VERSION = '8.6.1';
  const TERMS_VERSION = '2026-06-04';
  const PRIVACY_VERSION = '2026-07-29';
  // An old metadata record without explicit document versions cannot be
  // relabelled as acceptance of the current texts.
  const LEGACY_UNVERSIONED = 'legacy-unversioned';
  const AUTH_INTENT_KEY = 'kc:auth:intents';
  const SHELL_SNAPSHOT_KEY = 'auth-shell';
  const SHELL_SNAPSHOT_MAX_AGE = 1000 * 60 * 60 * 12;
  const shared = window.KCAccountProfileUtils || {};
  const modalState = { panel: 'login', nextPath: '', trapHandler: null };
  const renderState = { inited: false, initScheduled: false, lastUiSignature: '' };
  const logoutState = { active: false, promise: null };

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $all(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function _t(key, fallback) { return window.KCi18n ? window.KCi18n.t(key) : fallback; }
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

  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function readShellSnapshot() {
    const store = getSessionStore();
    if (!store) return null;
    const entry = store.get('shell', SHELL_SNAPSHOT_KEY, { maxAge: SHELL_SNAPSHOT_MAX_AGE });
    if (!entry || !entry.value || typeof entry.value !== 'object') return null;
    return entry.value;
  }

  function writeShellSnapshot(user, profile) {
    const store = getSessionStore();
    if (!store) return;
    if (!user || !user.id) {
      store.remove('shell', SHELL_SNAPSHOT_KEY);
      setShellSnapshotClass(false);
      return;
    }
    store.set('shell', SHELL_SNAPSHOT_KEY, {
      user: {
        id: String(user.id || ''),
        email: String(user.email || ''),
      },
      profile: profile ? {
        id: String(profile.id || user.id || ''),
        display_name: String(profile.display_name || profile.full_name || '').trim(),
        full_name: String(profile.full_name || '').trim(),
        avatar_url: String(profile.avatar_url || '').trim(),
        verified: profile.verified === true,
        is_admin: profile.is_admin === true,
        onboarding_completed_at: profile.onboarding_completed_at || null,
      } : null,
    });
    setShellSnapshotClass(true);
  }

  function setShellSnapshotClass(active) {
    try {
      document.documentElement.classList.toggle('kc-auth-shell-cached', active === true);
    } catch (_) { }
  }

  function resolveShellState() {
    const user = getCurrentUser();
    const profile = getCurrentProfile();
    const snapshot = readShellSnapshot();
    setShellSnapshotClass(!!(snapshot && snapshot.user && snapshot.user.id));

    if (user && user.id) {
      if (profile) return { user, profile, fromSnapshot: false };
      if (snapshot && snapshot.user && String(snapshot.user.id || '') === String(user.id || '')) {
        return { user, profile: snapshot.profile || null, fromSnapshot: true };
      }
      return { user, profile: null, fromSnapshot: false };
    }

    if (snapshot && snapshot.user && snapshot.user.id) {
      return {
        user: snapshot.user,
        profile: snapshot.profile || null,
        fromSnapshot: true,
      };
    }

    return { user: null, profile: null, fromSnapshot: false };
  }

  function getUserDisplay(user, profile) {
    return String((profile && (profile.display_name || profile.full_name)) || (user && user.email ? String(user.email).split('@')[0] : '') || 'Minha conta').trim();
  }

  function getUserAvatarUrl(profile, options) {
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    void opts;
    return String((profile && profile.avatar_url) || '').trim();
  }

  function buildHeaderAvatarMarkup(avatarUrl, display) {
    if (avatarUrl) {
      return `<img class="kc-header-user__avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" loading="lazy" decoding="async" />`;
    }
    return '<span class="kc-header-user__avatar kc-header-user__avatar--placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>';
  }

  function buildDropdownAvatarMarkup(avatarUrl, display) {
    if (avatarUrl) {
      return `<img class="kc-profile-dropdown__avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" loading="lazy" />`;
    }
    return '<span class="kc-profile-dropdown__avatar kc-profile-dropdown__avatar--placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>';
  }

  function buildMobileAvatarMarkup(avatarUrl, display) {
    if (avatarUrl) {
      return `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" class="kc-mobile-menu-user-avatar" loading="lazy" />`;
    }
    return '<span class="kc-mobile-menu-user-avatar kc-mobile-menu-user-avatar--placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>';
  }

  function buildUserUiSignature(user, profile, options) {
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    if (!user || !user.id) return 'guest';
    const display = String((profile && (profile.display_name || profile.full_name)) || (user.email ? String(user.email).split('@')[0] : '') || '').trim();
    const avatar = getUserAvatarUrl(profile, { fromSnapshot: opts.fromSnapshot });
    return JSON.stringify({
      id: String(user.id || ''),
      email: String(user.email || ''),
      display,
      avatar,
      verified: !!(profile && profile.verified),
      onboarding: !!isOnboardingComplete(profile),
      admin: !!(profile && profile.is_admin),
      source: opts.fromSnapshot ? 'snapshot' : 'live',
    });
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

  function buildCallbackUrl(nextPath, authType) {
    const url = new URL('/auth-callback.html', window.location.origin);
    url.searchParams.set('next', normalizeNextPath(nextPath || buildCurrentPath()));
    if (authType === 'signup' || authType === 'recovery' || authType === 'invite') {
      url.searchParams.set('mode', authType);
    }
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
  function buildRootHref(file) { return String(window.location.pathname || '').includes('/admin/') ? `../${file}` : file; }
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
    };

    function apply() {
      if (document.documentElement.classList.contains('kc-scroll-locked')) return;
      // Salva scrollY e posiciona o body ANTES de adicionar a classe que aplica
      // position:fixed — tudo no mesmo frame → sem jump visual.
      const scrollY = window.scrollY || window.pageYOffset || 0;
      state.scrollTop = scrollY;
      document.body.style.top = `-${scrollY}px`;
      document.documentElement.classList.add('kc-scroll-locked');
      document.body.classList.add('kc-scroll-locked');
    }

    function release() {
      if (state.keys.size) return;
      const savedScroll = state.scrollTop;
      document.documentElement.classList.remove('kc-scroll-locked');
      document.body.classList.remove('kc-scroll-locked');
      document.body.style.top = '';
      state.scrollTop = 0;
      // Restaura a posição de scroll que estava antes do lock.
      if (savedScroll) window.scrollTo(0, savedScroll);
    }

    function lock(key) {
      state.keys.add(String(key || 'overlay'));
      apply();
    }

    function unlock(key) {
      state.keys.delete(String(key || 'overlay'));
      release();
    }

    function isLocked() {
      return state.keys.size > 0 || document.documentElement.classList.contains('kc-scroll-locked');
    }

    return Object.freeze({ lock, unlock, isLocked });
  }());

  window.KCOverlayLock = overlayLock;

  const AUTH_ERROR_MAP = [
    [/invalid login credentials/i,                            'E-mail ou senha incorretos.'],
    [/email not confirmed/i,                                   'E-mail ainda não confirmado. Verifique sua caixa de entrada.'],
    [/user already registered/i,                               'Este e-mail já está cadastrado.'],
    [/password should contain at least one character of each/i,'A senha deve conter letras maiúsculas, minúsculas, números e um símbolo (ex: !@#$).'],
    [/password should be at least/i,                           'A senha deve ter pelo menos 6 caracteres.'],
    [/email rate limit exceeded/i,                             'Muitas tentativas. Aguarde alguns minutos.'],
    [/over_email_send_rate_limit/i,                            'Aguarde antes de solicitar um novo e-mail.'],
    [/token has expired or is invalid/i,                       'Link expirado ou inválido. Solicite um novo.'],
    [/unable to validate email address/i,                      'E-mail inválido ou não aceito.'],
    [/signup.*disabled/i,                                      'Cadastro desabilitado no momento.'],
    [/too many requests/i,                                     'Muitas tentativas. Tente novamente em breve.'],
    [/network.*error|failed to fetch/i,                        'Sem conexão. Verifique sua internet.'],
  ];

  function translateAuthError(msg) {
    if (!msg) return msg;
    // Rate limit com contador: "For security purposes, you can only request this after X seconds."
    const rateLimitMatch = String(msg).match(/for security purposes.*?(\d+)\s*seconds?/i);
    if (rateLimitMatch) {
      const secs = parseInt(rateLimitMatch[1], 10);
      return `Por segurança, aguarde ${secs} segundo${secs === 1 ? '' : 's'} antes de tentar novamente.`;
    }
    for (const [re, pt] of AUTH_ERROR_MAP) {
      if (re.test(msg)) return pt;
    }
    return msg;
  }

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

  function ensureGlobalAuthStatus() {
    let status = $('#kcAuthGlobalStatus');
    if (status) return status;
    if (!document.body) return null;
    status = document.createElement('div');
    status.id = 'kcAuthGlobalStatus';
    status.className = 'kc-auth-status kc-auth-global-status';
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.style.position = 'fixed';
    status.style.top = 'max(1rem, env(safe-area-inset-top))';
    status.style.left = '50%';
    status.style.transform = 'translateX(-50%)';
    status.style.zIndex = '10000';
    status.style.width = 'min(calc(100% - 2rem), 36rem)';
    status.style.maxWidth = '36rem';
    status.style.margin = '0';
    status.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.32)';
    status.style.pointerEvents = 'none';
    document.body.appendChild(status);
    return status;
  }

  function setGlobalAuthStatus(message, tone) {
    const status = ensureGlobalAuthStatus();
    if (!status) return;
    const normalized = String(message || '').trim();
    if (!normalized) {
      status.textContent = '';
      status.className = 'kc-auth-status kc-auth-global-status';
      status.hidden = true;
      status.setAttribute('aria-live', 'polite');
      return;
    }
    const normalizedTone = String(tone || 'info').trim() || 'info';
    status.hidden = false;
    status.textContent = normalized;
    status.className = `kc-auth-status kc-auth-global-status show ${normalizedTone}`;
    status.setAttribute('aria-live', normalizedTone === 'error' ? 'assertive' : 'polite');
  }

  function isAuthModalVisible() {
    const modal = $('#kcAuthModal');
    return Boolean(
      modal &&
      modal.classList.contains('active') &&
      modal.getAttribute('aria-hidden') !== 'true'
    );
  }

  function setLogoutStatus(message, tone) {
    setStatus(message, tone);
    if (isAuthModalVisible()) {
      setGlobalAuthStatus('', 'info');
      return;
    }
    setGlobalAuthStatus(message, tone);
  }

  function setLogoutControlsBusy(active) {
    const busy = active === true;
    [
      '#kcAuthLogoutBtn',
      '#mobileMenuLogoutBtn',
      '#kcDropdownLogoutBtn',
    ].forEach((selector) => {
      const button = $(selector);
      if (!button) return;
      button.disabled = busy;
      button.setAttribute('aria-busy', busy ? 'true' : 'false');
    });
  }

  function toggleExternalAccessPrompt(email, show) {
    const prompt = $('#kcAuthExternalAccessPrompt');
    const emailInput = $('#kcExternalAccessEmail');
    if (!prompt) return;
    prompt.hidden = !show;
    prompt.classList.toggle('is-visible', show === true);
    if (show && emailInput && email) emailInput.value = normalizeEmail(email);
  }

  function buildLegalAcceptanceMetadata(email) {
    const acceptedAt = new Date().toISOString();
    return {
      display_name: String(email || '').split('@')[0],
      terms_accepted: true,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      legal_accepted_at: acceptedAt,
      legal_acceptance_source: 'kc-auth-card',
    };
  }

  async function syncLegalAcceptance(user) {
    if (!user || !user.id) return false;
    const meta = (user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};
    if (meta.terms_accepted !== true) return false;
    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
    if (!client || typeof client.from !== 'function') return false;

    const acceptedAt = String(meta.legal_accepted_at || meta.accepted_at || new Date().toISOString());
    const payload = {
      user_id: user.id,
      terms_version: String(meta.terms_version || LEGACY_UNVERSIONED),
      privacy_version: String(meta.privacy_version || LEGACY_UNVERSIONED),
      accepted_at: acceptedAt,
      source: String(meta.legal_acceptance_source || 'kc-auth-card'),
      metadata: {
        auth_metadata_synced: true,
      },
    };

    try {
      const result = await client
        .from('user_legal_acceptances')
        .upsert(payload, { onConflict: 'user_id,terms_version,privacy_version' });
      return !(result && result.error);
    } catch (_) {
      return false;
    }
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
    if (tabs) tabs.style.display = (panel === 'user' || panel === 'external') ? 'none' : 'grid';
    if (panel === 'signup') {
      const signupEmail = $('#kcAuthSignupEmail');
      toggleExternalAccessPrompt(signupEmail ? signupEmail.value : '', true);
    } else {
      toggleExternalAccessPrompt('', false);
    }
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
      '<div class="kc-auth-header"><div class="kc-auth-title"><h2>' + _t('auth.modal-title', 'Conta KinoCampus') + '</h2><p class="kc-auth-sub">' + _t('auth.modal-subtitle', 'Entre, confirme seu cadastro ou recupere sua senha sem sair da página.') + '</p></div><button class="kc-auth-close" type="button" aria-label="' + _t('common.close', 'Fechar') + '"><i class="fas fa-times"></i></button></div>',
      '<div class="kc-auth-status" id="kcAuthStatus" role="status" aria-live="polite"></div>',
      '<div class="kc-auth-body">',
      '<div class="kc-auth-tabs" role="tablist"><button class="kc-auth-tab active" type="button" data-auth-tab="login" role="tab" aria-selected="true">' + _t('auth.modal-tab-login', 'Login') + '</button><button class="kc-auth-tab" type="button" data-auth-tab="signup" role="tab" aria-selected="false">' + _t('auth.modal-tab-signup', 'Cadastro') + '</button></div>',
      '<section class="kc-auth-panel" data-auth-panel="login"><form class="kc-auth-form" id="kcAuthLoginForm"><div class="kc-auth-field"><label for="kcAuthLoginEmail">' + _t('auth.modal-email-institutional', 'E-mail institucional') + '</label><input id="kcAuthLoginEmail" name="email" type="email" autocomplete="email" placeholder="' + _t('auth.modal-email-placeholder', 'voce@ufg.br') + '" required /></div><div class="kc-auth-field"><label for="kcAuthLoginPassword">' + _t('auth.modal-password-label', 'Senha') + '</label><input id="kcAuthLoginPassword" name="password" type="password" autocomplete="current-password" minlength="6" placeholder="' + _t('auth.modal-current-password', 'Sua senha') + '" required /></div><div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit">' + _t('auth.modal-enter-btn', 'Entrar') + '</button></div></form><div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="forgot">' + _t('auth.modal-forgot-link', 'Esqueci minha senha') + '</button><button type="button" class="kc-auth-link-btn" data-auth-link="resend">' + _t('auth.modal-resend-link', 'Reenviar confirmação') + '</button><button type="button" class="kc-auth-link-btn" data-auth-link="signup">' + _t('auth.modal-no-account-link', 'Ainda não tenho conta') + '</button></div></section>',
      '<section class="kc-auth-panel" data-auth-panel="signup" style="display:none;" aria-hidden="true"><form class="kc-auth-form" id="kcAuthSignupForm"><div class="kc-auth-field"><label for="kcAuthSignupEmail">' + _t('auth.modal-email-institutional', 'E-mail institucional') + '</label><input id="kcAuthSignupEmail" name="email" type="email" autocomplete="email" placeholder="' + _t('auth.modal-email-placeholder', 'voce@ufg.br') + '" required /></div><div class="kc-auth-field"><label for="kcAuthSignupPassword">' + _t('auth.modal-password-label', 'Senha') + '</label><input id="kcAuthSignupPassword" name="password" type="password" autocomplete="new-password" minlength="6" placeholder="' + _t('auth.modal-new-password', 'Crie uma senha') + '" required /></div><div class="kc-auth-field"><label for="kcAuthSignupConfirm">' + _t('auth.modal-confirm-label', 'Confirmar senha') + '</label><input id="kcAuthSignupConfirm" name="confirm" type="password" autocomplete="new-password" minlength="6" placeholder="' + _t('auth.modal-confirm-placeholder', 'Repita a senha') + '" required /></div><p class="kc-auth-note">' + _t('auth.modal-signup-note', 'O link de confirmação será enviado para o seu e-mail institucional.') + '</p><div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit">' + _t('auth.modal-create-account', 'Criar conta') + '</button></div></form><div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="login">' + _t('auth.modal-have-account-link', 'Já tenho conta') + '</button><button type="button" class="kc-auth-link-btn" data-auth-link="resend">' + _t('auth.modal-resend-link', 'Reenviar confirmação') + '</button></div></section>',
      '<section class="kc-auth-panel" data-auth-panel="forgot" style="display:none;" aria-hidden="true"><form class="kc-auth-form" id="kcAuthForgotForm"><div class="kc-auth-field"><label for="kcAuthForgotEmail">' + _t('auth.modal-forgot-email-label', 'E-mail da sua conta') + '</label><input id="kcAuthForgotEmail" name="email" type="email" autocomplete="email" placeholder="' + _t('auth.modal-email-placeholder', 'voce@ufg.br') + '" required /></div><p class="kc-auth-note">' + _t('auth.modal-forgot-note', 'Enviaremos um link para redefinir sua senha pelo callback oficial do KinoCampus.') + '</p><div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit">' + _t('auth.modal-send-link', 'Enviar link') + '</button></div></form><div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="login">' + _t('auth.modal-back-to-login', 'Voltar ao login') + '</button></div></section>',
      '<section class="kc-auth-panel" data-auth-panel="resend" style="display:none;" aria-hidden="true"><form class="kc-auth-form" id="kcAuthResendForm"><div class="kc-auth-field"><label for="kcAuthResendEmail">' + _t('auth.modal-resend-email-label', 'E-mail do cadastro') + '</label><input id="kcAuthResendEmail" name="email" type="email" autocomplete="email" placeholder="' + _t('auth.modal-email-placeholder', 'voce@ufg.br') + '" required /></div><p class="kc-auth-note">' + _t('auth.modal-resend-note', 'Se o e-mail anterior expirou ou sumiu, enviamos outro agora.') + '</p><div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit">' + _t('auth.modal-resend-btn', 'Reenviar') + '</button></div></form><div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="login">' + _t('auth.modal-back-to-login', 'Voltar ao login') + '</button><button type="button" class="kc-auth-link-btn" data-auth-link="signup">' + _t('auth.modal-go-signup', 'Ir para cadastro') + '</button></div></section>',
      '<section class="kc-auth-panel" data-auth-panel="user" style="display:none;" aria-hidden="true"><div class="kc-auth-user"><div class="kc-auth-user-card"><div class="kc-auth-user-icon"><i class="fas fa-user"></i></div><div class="kc-auth-user-info"><div class="kc-auth-user-email" id="kcAuthUserEmail">-</div><div class="kc-auth-user-meta" id="kcAuthUserMeta">' + _t('auth.modal-session-active', 'Sessão ativa') + '</div></div></div><div class="kc-auth-user-actions"><a class="kc-auth-btn" id="kcAuthProfileLink" href="profile.html"><i class="fas fa-id-badge"></i><span>' + _t('auth.modal-my-profile', 'Meu perfil') + '</span></a><a class="kc-auth-btn" id="kcAuthSettingsLink" href="settings.html"><i class="fas fa-sliders"></i><span>' + _t('nav.settings', 'Configurações') + '</span></a><a class="kc-auth-btn" id="kcAuthSetupLink" href="account-setup.html"><i class="fas fa-list-check"></i><span>' + _t('auth.modal-complete-signup', 'Completar cadastro') + '</span></a><a class="kc-auth-btn" id="kcAuthHelpLink" href="ajuda.html"><i class="fas fa-circle-question"></i><span>' + _t('auth.modal-help-center', 'Central de ajuda') + '</span></a><button class="kc-auth-btn danger" type="button" id="kcAuthLogoutBtn"><i class="fas fa-right-from-bracket"></i><span>' + _t('common.logout', 'Sair') + '</span></button></div></div></section>',
      '</div><div class="kc-auth-footer"><span class="kc-auth-footer-version">Auth v' + VERSION + '</span></div></div>',
    ].join('');
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    enhanceAuthModal();
  }

  function enhanceAuthModal() {
    const signupForm = $('#kcAuthSignupForm');
    if (signupForm && !$('#kcAuthTermsAccepted')) {
      const actions = $('.kc-auth-actions', signupForm);
      if (actions) {
        actions.insertAdjacentHTML('beforebegin', [
          '<label class="kc-auth-legal">',
          '<input id="kcAuthTermsAccepted" name="termsAccepted" type="checkbox" required />',
          '<span>Li e aceito os <a href="' + escapeHtml(buildRootHref('termos.html')) + '" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="' + escapeHtml(buildRootHref('privacidade.html')) + '" target="_blank" rel="noopener">Declaração de Privacidade</a>.</span>',
          '</label>',
          '<div class="kc-auth-external-access" id="kcAuthExternalAccessPrompt">',
          '<p><strong>Não tem e-mail institucional UFG?</strong> Solicite uma análise de acesso externo para participar da comunidade KinoCampus.</p>',
          '<button class="kc-auth-btn secondary" type="button" id="kcAuthExternalRequestBtn"><i class="fas fa-paper-plane"></i><span>Solicitar acesso externo</span></button>',
          '</div>',
        ].join(''));
      }
    }

    const body = $('.kc-auth-body');
    if (body && !$('#kcExternalAccessForm')) {
      const externalPanel = document.createElement('section');
      externalPanel.className = 'kc-auth-panel';
      externalPanel.setAttribute('data-auth-panel', 'external');
      externalPanel.setAttribute('style', 'display:none;');
      externalPanel.setAttribute('aria-hidden', 'true');
      externalPanel.innerHTML = [
        '<form class="kc-auth-form" id="kcExternalAccessForm">',
        '<p class="kc-auth-note">Preencha a solicitação para análise manual. Ela será enviada ao contato oficial do KinoCampus e ficará registrada na central administrativa.</p>',
        '<div class="kc-auth-field"><label for="kcExternalAccessName">Nome completo</label><input id="kcExternalAccessName" name="name" type="text" autocomplete="name" maxlength="120" required /></div>',
        '<div class="kc-auth-field"><label for="kcExternalAccessEmail">E-mail para retorno</label><input id="kcExternalAccessEmail" name="email" type="email" autocomplete="email" maxlength="255" required /></div>',
        '<div class="kc-auth-field"><label for="kcExternalAccessAffiliation">Vínculo com a comunidade UFG ou KinoCampus</label><input id="kcExternalAccessAffiliation" name="affiliation" type="text" maxlength="180" placeholder="Ex.: parceiro, egresso, visitante, projeto vinculado" /></div>',
        '<div class="kc-auth-field"><label for="kcExternalAccessReason">Por que você quer acessar?</label><textarea id="kcExternalAccessReason" name="reason" rows="4" maxlength="1200" required></textarea></div>',
        '<div class="kc-auth-actions"><button class="kc-auth-btn primary" type="submit"><i class="fas fa-paper-plane"></i><span>Enviar solicitação</span></button></div>',
        '</form>',
        '<div class="kc-auth-links"><button type="button" class="kc-auth-link-btn" data-auth-link="signup">Voltar ao cadastro</button><button type="button" class="kc-auth-link-btn" data-auth-link="login">Voltar ao login</button></div>',
      ].join('');
      body.appendChild(externalPanel);
    }
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

  function buildDropdownContent(user, profile, options) {
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const display = getUserDisplay(user, profile);
    const avatar = getUserAvatarUrl(profile, { fromSnapshot: opts.fromSnapshot });
    const verified = profile && profile.verified === true;
    const isAdmin = profile && profile.is_admin === true;
    const onboardingPending = user && !isOnboardingComplete(profile);
    const handle = user && user.email ? `@${String(user.email).split('@')[0]}` : '';
    return [
      '<div class="kc-profile-dropdown__header">',
      buildDropdownAvatarMarkup(avatar, display),
      '<div class="kc-profile-dropdown__info">',
      `<span class="kc-profile-dropdown__name">${escapeHtml(display)}${verified ? ' <i class="fas fa-check-circle" style="color:#53d681;font-size:.8em;"></i>' : ''}</span>`,
      handle ? `<span class="kc-profile-dropdown__handle">${escapeHtml(handle)}</span>` : '',
      '</div></div><hr class="kc-profile-dropdown__divider" /><nav class="kc-profile-dropdown__menu">',
      `<a href="${escapeHtml(buildProfileHref(user && user.id))}" class="kc-profile-dropdown__item"><i class="fas fa-id-badge"></i><span>${_t('auth.dropdown-my-profile', 'Meu perfil')}</span></a>`,
      `<a href="my-posts.html" class="kc-profile-dropdown__item"><i class="fas fa-layer-group"></i><span>${_t('auth.dropdown-my-posts', 'Minhas publicações')}</span></a>`,
      `<a href="${escapeHtml(buildSettingsHref(buildCurrentPath()))}" class="kc-profile-dropdown__item"><i class="fas fa-sliders"></i><span>${_t('nav.settings', 'Configurações')}</span></a>`,
      onboardingPending ? `<a href="${escapeHtml(buildAccountSetupHref(buildCurrentPath()))}" class="kc-profile-dropdown__item"><i class="fas fa-list-check"></i><span>${_t('auth.dropdown-complete-signup', 'Completar cadastro')}</span></a>` : '',
      isAdmin ? `<a href="${escapeHtml(buildAdminHref())}" class="kc-profile-dropdown__item"><i class="fas fa-shield-halved" style="color:var(--kc-primary-brand);"></i><span>${_t('nav.admin', 'Administração')}</span></a>` : '',
      `<a href="${escapeHtml(buildHelpHref())}" class="kc-profile-dropdown__item"><i class="fas fa-circle-question"></i><span>${_t('auth.dropdown-help-center', 'Central de ajuda')}</span></a>`,
      '<button type="button" class="kc-profile-dropdown__item" data-kc-cookie-preferences><i class="fas fa-shield-halved"></i><span>Preferências de cookies</span></button>',
      `<hr class="kc-profile-dropdown__divider" /><button type="button" class="kc-profile-dropdown__item kc-profile-dropdown__logout" id="kcDropdownLogoutBtn"><i class="fas fa-right-from-bracket"></i><span>${_t('auth.dropdown-logout', 'Sair da conta')}</span></button></nav>`
    ].join('');
  }

  function openProfileDropdown(button) {
    ensureProfileDropdown();
    const dropdown = $('#kcProfileDropdown');
    const shellState = resolveShellState();
    const user = shellState.user;
    const profile = shellState.profile;
    if (!dropdown || !user) return;
    dropdown.innerHTML = buildDropdownContent(user, profile, { fromSnapshot: shellState.fromSnapshot });
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
    if (logoutButton) logoutButton.addEventListener('click', doLogout);
    setLogoutControlsBusy(logoutState.active);
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
    if (drawer.dataset.kcAccountStructureReady === '1') return;
    let accountSection = $('#mobileMenuAccountSection');
    if (!accountSection) {
      accountSection = document.createElement('div');
      accountSection.id = 'mobileMenuAccountSection';
      accountSection.className = 'kc-mobile-menu-account-section';
      const userSection = $('#mobileMenuUserSection');
      if (userSection) userSection.insertAdjacentElement('afterend', accountSection);
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
    ensureAccountNode('mobileMenuMyPostsLink', 'a', '<i class="fas fa-layer-group"></i><span>Minhas publicações</span>', 'kc-mobile-menu-account-link');
    ensureAccountNode('mobileMenuSettingsLink', 'a', '<i class="fas fa-sliders"></i><span>Configurações</span>', 'kc-mobile-menu-account-link');
    ensureAccountNode('mobileMenuAccountSetupLink', 'a', '<i class="fas fa-list-check"></i><span>Completar cadastro</span>', 'kc-mobile-menu-account-link');
    ensureAccountNode('mobileMenuAdminLink', 'a', '<i class="fas fa-shield-halved" style="color:var(--kc-primary-brand);"></i><span>Administração</span>', 'kc-mobile-menu-account-link');
    ensureAccountNode('mobileMenuHelpLink', 'a', '<i class="fas fa-circle-question"></i><span>Central de ajuda</span>', 'kc-mobile-menu-account-link');
    const cookiePrefsButton = ensureAccountNode('mobileMenuCookiePrefsBtn', 'button', '<i class="fas fa-shield-halved"></i><span>Preferências de cookies</span>', 'kc-mobile-menu-account-btn');
    const logoutButton = ensureAccountNode('mobileMenuLogoutBtn', 'button', '<i class="fas fa-right-from-bracket"></i><span>Sair da conta</span>', 'kc-mobile-menu-account-btn kc-mobile-menu-logout-btn');
    cookiePrefsButton.type = 'button';
    cookiePrefsButton.setAttribute('data-kc-cookie-preferences', '');
    logoutButton.type = 'button';
    setLogoutControlsBusy(logoutState.active);

    const settingsLink = $('#mobileMenuSettingsLink');
    const setupLink = $('#mobileMenuAccountSetupLink');
    const adminLink = $('#mobileMenuAdminLink');
    const helpLink = $('#mobileMenuHelpLink');
    if (settingsLink) settingsLink.href = buildSettingsHref(buildCurrentPath());
    if (setupLink) setupLink.href = buildAccountSetupHref(buildCurrentPath());
    if (adminLink) adminLink.href = buildAdminHref();
    if (helpLink) helpLink.href = buildHelpHref();

    const accountDivider = $('#mobileMenuAccountDivider') || content.querySelector('[data-kc-divider="profile"]');
    if (accountDivider && accountDivider.parentNode) {
      accountDivider.parentNode.removeChild(accountDivider);
    }
    drawer.dataset.kcAccountStructureReady = '1';
  }

  function refreshMobileMenuUser(user, profile, options) {
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const mobileUserLink = $('#mobileMenuUserLink');
    const mobileUserName = $('#mobileMenuUserName');
    const profileLink = $('#mobileMenuProfileLink');
    const myPostsLink = $('#mobileMenuMyPostsLink');
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
      const display = getUserDisplay(user, profile);
      const avatar = getUserAvatarUrl(profile, { fromSnapshot: opts.fromSnapshot });
      const avatarWrap = mobileUserLink.querySelector('.kc-mobile-menu-user-avatar-wrap');
      if (avatarWrap) avatarWrap.innerHTML = buildMobileAvatarMarkup(avatar, display);
        if (mobileUserName) mobileUserName.innerHTML = `<span class="kc-mobile-menu-user-display">${escapeHtml(display)}</span><span class="kc-mobile-menu-user-handle">@${escapeHtml(String(user.email).split('@')[0])}</span>`;
      mobileUserLink.href = '#login';
      if (profileLink) { profileLink.style.display = 'flex'; profileLink.href = buildProfileHref(user.id); }
      if (myPostsLink) { myPostsLink.style.display = 'flex'; myPostsLink.href = 'my-posts.html'; }
      if (settingsLink) { settingsLink.style.display = 'flex'; settingsLink.href = buildSettingsHref(buildCurrentPath()); }
      if (adminLink) { adminLink.style.display = profile && profile.is_admin === true ? 'flex' : 'none'; adminLink.href = buildAdminHref(); }
      if (setupLink) { setupLink.style.display = isOnboardingComplete(profile) ? 'none' : 'flex'; setupLink.href = buildAccountSetupHref(buildCurrentPath()); }
      if (logoutButton) logoutButton.style.display = 'flex';
    } else {
      const avatarWrap = mobileUserLink.querySelector('.kc-mobile-menu-user-avatar-wrap');
      if (avatarWrap) avatarWrap.innerHTML = buildMobileAvatarMarkup('', 'Conta KinoCampus');
        if (mobileUserName) mobileUserName.innerHTML = '<span class="kc-mobile-menu-user-display">Login / Cadastro</span><span class="kc-mobile-menu-user-handle">@minha-conta</span>';
      if (profileLink) profileLink.style.display = 'none';
      if (myPostsLink) myPostsLink.style.display = 'none';
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
    setGlobalAuthStatus('', 'info');
    refreshUIFromUser(true);
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
    let authUser = null;
    try {
      authUser = typeof window.KCAPI.getCurrentUser === 'function'
        ? await window.KCAPI.getCurrentUser()
        : getCurrentUser();
    } catch (_) { }
    try {
      profile = typeof window.KCAPI.getCurrentProfile === 'function'
        ? window.KCAPI.getCurrentProfile()
        : null;
      if (!profile) {
        profile = await window.KCAPI.getMyProfile();
      }
      if (!profile && typeof window.KCAPI.syncProfile === 'function') {
        await window.KCAPI.syncProfile();
        profile = typeof window.KCAPI.getCurrentProfile === 'function'
          ? window.KCAPI.getCurrentProfile()
          : null;
        if (!profile) {
          profile = await window.KCAPI.getMyProfile();
        }
      }
      await syncLegalAcceptance(authUser);
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
    refreshUIFromUser(true);
  }

  async function doLogin(form) {
    const env = readEnv();
    if (env.driver !== 'supabase') { setStatus(window.KCi18n ? window.KCi18n.t('auth.login-disabled') : 'A autenticação está desativada no modo local.', 'warn'); return; }
    const email = normalizeEmail(form.email.value);
    const password = String(form.password.value || '');
    if (!email || !password) { setStatus(window.KCi18n ? window.KCi18n.t('auth.fill-email-password') : 'Preencha e-mail e senha.', 'warn'); return; }
    setStatus(window.KCi18n ? window.KCi18n.t('auth.logging-in') : 'Entrando...', 'info');
    const result = await window.KCAPI.signIn(email, password);
    if (!result || result.error) { setStatus(translateAuthError((result && result.error && result.error.message) || (window.KCi18n ? window.KCi18n.t('auth.login-failed') : 'Não foi possível entrar.')), 'error'); return; }
    setStatus(window.KCi18n ? window.KCi18n.t('auth.login-success') : 'Login realizado com sucesso.', 'success');
    try {
      if (window.KCEvents && typeof window.KCEvents.trackRecommended === 'function') {
        var method = (window.KCAPI && window.KCAPI.authProvider) ? String(window.KCAPI.authProvider) : 'email';
        window.KCEvents.trackRecommended('login', { method: method });
      } else if (window.KCEvents && typeof window.KCEvents.track === 'function') {
        window.KCEvents.track('kc_login', { method: 'email' });
      }
    } catch (_) {}
    await handlePostAuthSuccess(modalState.nextPath);
  }

  async function doSignup(form) {
    const env = readEnv();
    if (env.driver !== 'supabase') { setStatus(window.KCi18n ? window.KCi18n.t('auth.signup-disabled') : 'O cadastro está desativado no modo local.', 'warn'); return; }
    const email = normalizeEmail(form.email.value);
    const password = String(form.password.value || '');
    const confirm = String(form.confirm.value || '');
    const termsAccepted = form.termsAccepted && form.termsAccepted.checked === true;
    if (!email || !password || !confirm) { setStatus(window.KCi18n ? window.KCi18n.t('auth.fill-all-fields') : 'Preencha todos os campos.', 'warn'); return; }
    if (password.length < 6) { setStatus(window.KCi18n ? window.KCi18n.t('auth.password-short') : 'Sua senha precisa ter pelo menos 6 caracteres.', 'warn'); return; }
    if (password !== confirm) { setStatus(window.KCi18n ? window.KCi18n.t('auth.password-mismatch') : 'As senhas não conferem.', 'warn'); return; }
    if (!isAllowedDomain(email, env.allowedDomains)) {
      const hint = formatAllowedDomains(env.allowedDomains);
      setStatus(hint ? `Use um e-mail institucional de um domínio aceito (${hint}) ou solicite acesso externo.` : 'Use um e-mail institucional válido ou solicite acesso externo.', 'warn');
      toggleExternalAccessPrompt(email, true);
      return;
    }
    if (!termsAccepted) { setStatus('Aceite os Termos de Uso e a Declaração de Privacidade para criar sua conta.', 'warn'); return; }
    toggleExternalAccessPrompt('', false);
    setStatus(window.KCi18n ? window.KCi18n.t('auth.creating-account') : 'Criando sua conta...', 'info');
    const result = await window.KCAPI.signUp(email, password, {
      emailRedirectTo: buildCallbackUrl(modalState.nextPath, 'signup'),
      data: buildLegalAcceptanceMetadata(email)
    });
    if (!result || result.error) { setStatus(translateAuthError((result && result.error && result.error.message) || (window.KCi18n ? window.KCi18n.t('auth.signup-failed') : 'Não foi possível criar sua conta.')), 'error'); return; }
    try {
      if (result.session && window.KCEvents && typeof window.KCEvents.trackRecommendedOnce === 'function') {
        window.KCEvents.trackRecommendedOnce('sign_up', { method: 'email', needs_confirmation: false });
      } else if (result.session && window.KCEvents && typeof window.KCEvents.trackRecommended === 'function') {
        window.KCEvents.trackRecommended('sign_up', { method: 'email', needs_confirmation: false });
      } else if (window.KCEvents && typeof window.KCEvents.track === 'function') {
        window.KCEvents.track(result.session ? 'kc_sign_up' : 'kc_sign_up_submit', {
          method: 'email',
          needs_confirmation: !result.session,
        });
      }
    } catch (_) {}
    if (result.session) {
      setStatus(window.KCi18n ? window.KCi18n.t('auth.account-created-verified') : 'Conta criada e autenticada. Vamos completar seu perfil.', 'success');
      await handlePostAuthSuccess(modalState.nextPath);
      return;
    }
    setStatus(window.KCi18n ? window.KCi18n.t('auth.account-created-email') : 'Conta criada. Abra o e-mail de confirmação para finalizar seu cadastro.', 'success');
    const resend = $('#kcAuthResendEmail');
    if (resend) resend.value = email;
    setPanel('resend');
  }

  async function doExternalAccessRequest(form) {
    if (!window.KCAPI || typeof window.KCAPI.createHelpRequest !== 'function') {
      setStatus('O envio de solicitações não está disponível neste ambiente.', 'error');
      return;
    }
    const name = String(form.name.value || '').trim();
    const email = normalizeEmail(form.email.value);
    const affiliation = String(form.affiliation.value || '').trim();
    const reason = String(form.reason.value || '').trim();
    if (!name || !email || !reason || reason.length < 10) {
      setStatus('Informe nome, e-mail e uma justificativa com detalhes suficientes.', 'warn');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Enviando...</span>';
    }
    setStatus('Enviando solicitação de acesso externo...', 'info');

    const payload = {
      expected_auth_state: 'anonymous',
      expected_user_id: null,
      type: 'external_access',
      topic: 'non_institutional_email',
      subtopic: affiliation ? 'has_context' : 'needs_context',
      subject: `Solicitação de acesso externo - ${name}`,
      message: reason,
      priority: 'normal',
      page_path: buildCurrentPath(),
      contact_email: email,
      allow_contact: true,
      metadata: {
        request_kind: 'external_access',
        source: 'kc-auth-non-ufg',
        requester_name: name,
        affiliation_context: affiliation,
        institutional_domain_hint: formatAllowedDomains(readEnv().allowedDomains),
        route: window.location.pathname || '/index.html',
        user_agent: navigator.userAgent || '',
      },
    };

    try {
      const result = await window.KCAPI.createHelpRequest(payload);
      if (!result || result.ok === false) {
        setStatus((result && result.error && result.error.message) || 'Não foi possível enviar sua solicitação agora.', 'error');
        return;
      }
      form.reset();
      setStatus('Solicitação enviada com sucesso. O KinoCampus analisará seu acesso e responderá por e-mail.', 'success');
      setTimeout(function () { setPanel('login'); }, 1400);
    } catch (error) {
      console.error('[KCAuthUI] external access request failed:', error);
      setStatus('Não foi possível enviar sua solicitação agora.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-paper-plane"></i><span>Enviar solicitação</span>';
      }
    }
  }

  async function doForgotPassword(form) {
    const email = normalizeEmail(form.email.value);
    if (!email) { setStatus(window.KCi18n ? window.KCi18n.t('auth.email-required') : 'Informe o e-mail da sua conta.', 'warn'); return; }
    setStatus(window.KCi18n ? window.KCi18n.t('auth.sending-reset') : 'Enviando link de redefinição...', 'info');
    const result = await window.KCAPI.requestPasswordReset(email, { redirectTo: buildCallbackUrl(modalState.nextPath, 'recovery') });
    if (!result || result.error || result.ok === false) { setStatus(translateAuthError((result && result.error && result.error.message) || (window.KCi18n ? window.KCi18n.t('auth.reset-failed') : 'Não foi possível enviar o link.')), 'error'); return; }
    setStatus(window.KCi18n ? window.KCi18n.t('auth.reset-sent') : 'Pronto. Enviamos um e-mail com o link para redefinir sua senha.', 'success');
  }

  async function doResendConfirmation(form) {
    const env = readEnv();
    const email = normalizeEmail(form.email.value);
    if (!email) { setStatus(window.KCi18n ? window.KCi18n.t('auth.resend-email-required') : 'Informe o e-mail usado no cadastro.', 'warn'); return; }
    // Não bloquear e-mails convidados: o Supabase retorna erro se o e-mail não existe ou já foi confirmado
    setStatus(window.KCi18n ? window.KCi18n.t('auth.resending') : 'Reenviando confirmação...', 'info');
    const result = await window.KCAPI.resendConfirmation(email, { emailRedirectTo: buildCallbackUrl(modalState.nextPath, 'signup') });
    if (!result || result.error || result.ok === false) { setStatus(translateAuthError((result && result.error && result.error.message) || (window.KCi18n ? window.KCi18n.t('auth.resend-failed') : 'Não foi possível reenviar a confirmação.')), 'error'); return; }
    setStatus(window.KCi18n ? window.KCi18n.t('auth.resend-sent') : 'Novo e-mail enviado. Abra o link recebido para concluir o cadastro.', 'success');
  }

  async function doLogout() {
    if (logoutState.active) return logoutState.promise || false;

    const loggingOutMessage = window.KCi18n
      ? window.KCi18n.t('auth.logging-out')
      : 'Saindo...';
    const failureMessage = window.KCi18n
      ? window.KCi18n.t('auth.logout-failed')
      : 'Não foi possível sair agora. Sua sessão continua ativa.';

    logoutState.active = true;
    setLogoutControlsBusy(true);
    setLogoutStatus(loggingOutMessage, 'info');

    const operation = Promise.resolve().then(async function () {
      try {
        const loggedOut = await window.KCAPI.logout();
        if (loggedOut !== true) {
          setLogoutStatus(failureMessage, 'error');
          return false;
        }
        writeShellSnapshot(null, null);
        try {
          if (window.KCEvents && typeof window.KCEvents.track === 'function') {
            window.KCEvents.track('kc_logout', {});
          }
        } catch (_) {}
        setGlobalAuthStatus('', 'info');
        closeProfileDropdown();
        if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
        closeModal();
        return true;
      } catch (error) {
        console.error('[KCAuthUI] logout failed:', error);
        setLogoutStatus(failureMessage, 'error');
        return false;
      }
    });

    logoutState.promise = operation.finally(function () {
      logoutState.active = false;
      logoutState.promise = null;
      setLogoutControlsBusy(false);
    });
    return logoutState.promise;
  }

  function refreshHeaderLabel(user, profile, options) {
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const button = $('a.btn-login') || $('a[href="#login"]');
    if (!button) return;
    refreshMobileMenuUser(user, profile, opts);
    if (user && user.email) {
      const display = getUserDisplay(user, profile);
      const avatar = getUserAvatarUrl(profile, { fromSnapshot: opts.fromSnapshot });
      const verified = profile && profile.verified === true;
      button.innerHTML = `<span class="kc-header-user">${buildHeaderAvatarMarkup(avatar, display)}<span class="kc-header-user__name">${escapeHtml(display)}</span>${verified ? '<i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i>' : ''}<i class="fas fa-chevron-down kc-header-user__chevron" aria-hidden="true"></i></span>`;
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
      closeProfileDropdown();
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
        if (typeof window.showToast === 'function') window.showToast(window.KCi18n ? window.KCi18n.t('auth.login-to-publish') : 'Faça login para publicar.', 'warn', 2200);
      }, true);
    }
    $all('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn').forEach((element) => {
      element.classList.toggle('kc-disabled', !isLogged);
      if (!isLogged) element.setAttribute('aria-disabled', 'true');
      else element.removeAttribute('aria-disabled');
    });
  }

  function refreshUIFromUser(force) {
    const shellState = resolveShellState();
    const user = shellState.user;
    const profile = shellState.profile;
    ensureMobileMenuStructure();
    const signature = buildUserUiSignature(user, profile, { fromSnapshot: shellState.fromSnapshot });
    const shouldForce = force === true;
    if (!shouldForce && renderState.lastUiSignature === signature) return;
    renderState.lastUiSignature = signature;
    writeShellSnapshot(user, profile);
    refreshHeaderLabel(user, profile, { fromSnapshot: shellState.fromSnapshot });
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
      if (userMeta) userMeta.textContent = isOnboardingComplete(profile) ? (window.KCi18n ? window.KCi18n.t('auth.profile-ready') : 'Conta pronta para publicar e receber contatos') : (window.KCi18n ? window.KCi18n.t('auth.profile-incomplete') : 'Cadastro incompleto: finalize seu onboarding');
      if (modalState.panel === 'user' || $('#kcAuthModal')?.classList.contains('active')) setPanel('user');
    } else if (modalState.panel === 'user') {
      setPanel('login');
    }
  }

  function applyCachedShellSnapshotToHeader() {
    const snapshot = readShellSnapshot();
    if (!snapshot || !snapshot.user || !snapshot.user.id) {
      setShellSnapshotClass(false);
      return;
    }
    setShellSnapshotClass(true);
    refreshHeaderLabel(snapshot.user, snapshot.profile || null, { fromSnapshot: true });
  }

  function handleAuthChange(event) {
    const detail = event && event.detail ? event.detail : {};
    const user = detail.user || null;
    const snapshot = readShellSnapshot();

    if (!user || !user.id) {
      writeShellSnapshot(null, null);
    } else if (snapshot && snapshot.user && snapshot.user.id && String(snapshot.user.id) !== String(user.id)) {
      writeShellSnapshot(null, null);
    }

    refreshUIFromUser(true);
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
      if (link) {
        const panel = String(link.getAttribute('data-auth-link') || 'login');
        if (panel === 'external') {
          const emailInput = $('#kcAuthSignupEmail');
          const externalEmail = $('#kcExternalAccessEmail');
          if (externalEmail && emailInput && emailInput.value) externalEmail.value = normalizeEmail(emailInput.value);
        }
        setPanel(panel);
      }
      const externalButton = event.target.closest('#kcAuthExternalRequestBtn');
      if (externalButton) {
        const emailInput = $('#kcAuthSignupEmail');
        const externalEmail = $('#kcExternalAccessEmail');
        if (externalEmail && emailInput && emailInput.value) externalEmail.value = normalizeEmail(emailInput.value);
        setPanel('external');
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeModal();
    });
    $('#kcAuthLoginForm').addEventListener('submit', function (event) { event.preventDefault(); doLogin(event.currentTarget); });
    $('#kcAuthSignupForm').addEventListener('submit', function (event) { event.preventDefault(); doSignup(event.currentTarget); });
    const signupEmailInput = $('#kcAuthSignupEmail');
    if (signupEmailInput && !signupEmailInput.dataset.externalSyncBound) {
      signupEmailInput.dataset.externalSyncBound = '1';
      signupEmailInput.addEventListener('input', function () {
        const prompt = $('#kcAuthExternalAccessPrompt');
        const externalEmail = $('#kcExternalAccessEmail');
        if (prompt && !prompt.hidden && externalEmail) externalEmail.value = normalizeEmail(signupEmailInput.value);
      });
    }
    $('#kcExternalAccessForm').addEventListener('submit', function (event) { event.preventDefault(); doExternalAccessRequest(event.currentTarget); });
    $('#kcAuthForgotForm').addEventListener('submit', function (event) { event.preventDefault(); doForgotPassword(event.currentTarget); });
    $('#kcAuthResendForm').addEventListener('submit', function (event) { event.preventDefault(); doResendConfirmation(event.currentTarget); });
    $('#kcAuthLogoutBtn').addEventListener('click', doLogout);
    const mobileLogout = $('#mobileMenuLogoutBtn');
    if (mobileLogout && !mobileLogout.dataset.bound) {
      mobileLogout.dataset.bound = '1';
      mobileLogout.addEventListener('click', doLogout);
    }
    setLogoutControlsBusy(logoutState.active);
  }

  function wireTriggers() {
    document.addEventListener('click', function (event) {
      const trigger = event.target && event.target.closest ? event.target.closest('[data-kc-login], a[href="#login"]') : null;
      if (!trigger) return;
      event.preventDefault();
      if (trigger.classList.contains('is-auth')) {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const drawer = document.querySelector('.kc-mobile-menu-drawer, .kc-mobile-menu');
        if (isMobile && drawer && typeof window.openMobileMenu === 'function' && typeof window.closeMobileMenu === 'function') {
          closeProfileDropdown();
          if (drawer.classList.contains('active')) window.closeMobileMenu();
          else window.openMobileMenu();
          return;
        }
        toggleProfileDropdown(trigger);
        return;
      }
      const requestedTab = String(trigger.getAttribute('data-auth-tab') || '').trim() || 'login';
      openModal({ tab: requestedTab, nextPath: buildCurrentPath() });
    });
  }

  function init() {
    if (renderState.inited) return;
    renderState.inited = true;
    applyCachedShellSnapshotToHeader();
    ensureMobileMenuStructure();
    ensureModal();
    ensureGlobalAuthStatus();
    bindModalEvents();
    wireTriggers();
    refreshUIFromUser(true);
    document.addEventListener('kc:authchange', handleAuthChange);
    document.addEventListener('kc:profilechange', refreshUIFromUser);
  }

  function scheduleInit() {
    if (renderState.inited || renderState.initScheduled) return;
    renderState.initScheduled = true;
    const run = function () {
      renderState.initScheduled = false;
      init();
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
      return;
    }
    window.setTimeout(run, 0);
  }

  window.kcOpenAuthModal = openModal;
  window.kcCloseAuthModal = closeModal;
  window.kcQueueAuthIntent = queueAuthIntent;
  window.kcPeekAuthIntent = peekAuthIntent;
  window.kcConsumeAuthIntent = consumeAuthIntent;
  window.kcClearAuthIntents = clearAuthIntents;
  window.kcOpenProfileDropdown = openProfileDropdown;
  window.kcCloseProfileDropdown = closeProfileDropdown;

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleInit, { once: true });
    } else {
      scheduleInit();
    }
  } catch (_) { }
})();
