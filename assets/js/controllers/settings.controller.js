(function () {
  'use strict';

  const shared = window.KCAccountProfileUtils || {};

  const state = {
    user: null,
    profile: null,
    nextPath: '/index.html',
    saving: false,
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value);
  }

  function normalizeNextPath(value) {
    if (shared && typeof shared.normalizeNextPath === 'function') {
      return shared.normalizeNextPath(value, '/settings.html');
    }
    const raw = String(value || '').trim();
    if (!raw) return '/settings.html';
    return raw.charAt(0) === '/' ? raw : `/${raw}`;
  }

  function readNextPath() {
    const params = new URLSearchParams(window.location.search || '');
    return normalizeNextPath(params.get('next') || '/index.html');
  }

  function buildAccountSetupHref() {
    const next = shared && typeof shared.normalizeNextPath === 'function'
      ? shared.normalizeNextPath(state.nextPath, '/index.html')
      : (state.nextPath || '/index.html');
    return `/account-setup.html?next=${encodeURIComponent(next)}`;
  }

  function buildProfileHref() {
    return state.user && state.user.id ? `/profile.html?id=${encodeURIComponent(state.user.id)}` : '/profile.html';
  }

  function buildCallbackUrl() {
    const url = new URL('/auth-callback.html', window.location.origin);
    url.searchParams.set('next', normalizeNextPath(state.nextPath));
    return url.toString();
  }

  function setStatus(message, tone) {
    const status = $('#settingsStatus');
    if (!status) return;
    if (!message) {
      status.textContent = '';
      status.className = 'kc-settings-status';
      return;
    }
    status.textContent = message;
    status.className = 'kc-settings-status is-visible';
    if (tone) status.classList.add(`is-${tone}`);
  }

  function renderPrimaryMethodOptions() {
    const select = $('#settingsPrimaryMethod');
    if (!select) return;
    const options = Array.isArray(shared.CONTACT_METHOD_OPTIONS) ? shared.CONTACT_METHOD_OPTIONS : [];
    select.innerHTML = options.map((option) => {
      return `<option value="${esc(option.value)}">${esc(option.label)}</option>`;
    }).join('');
  }

  function normalizeSocialLinks(profile) {
    return shared && typeof shared.normalizeSocialLinks === 'function'
      ? shared.normalizeSocialLinks((profile && profile.social_links) || {})
      : ((profile && profile.social_links) || {});
  }

  function normalizeVisibility(profile) {
    return shared && typeof shared.normalizeSocialVisibility === 'function'
      ? shared.normalizeSocialVisibility((profile && profile.social_visibility) || {})
      : ((profile && profile.social_visibility) || {});
  }

  function buildNetworkRows() {
    const list = $('#settingsNetworksList');
    if (!list) return;
    const profile = state.profile || {};
    const networks = Array.isArray(shared.SOCIAL_ORDER) ? shared.SOCIAL_ORDER : [];
    const meta = shared.SOCIAL_NETWORKS || {};
    const socialLinks = normalizeSocialLinks(profile);
    const visibility = normalizeVisibility(profile);

    list.innerHTML = networks.map((key) => {
      const entry = meta[key] || { label: key, iconClass: 'fas fa-link' };
      const rawValue = String(socialLinks[key] || '').trim();
      const preview = key === 'whatsapp' && shared.formatWhatsAppDisplay
        ? shared.formatWhatsAppDisplay(rawValue)
        : rawValue;
      const checked = visibility[key] === true && !!rawValue;
      return [
        `<div class="kc-settings-network" data-network-row="${esc(key)}">`,
        '  <div>',
        `    <strong><i class="${esc(entry.iconClass || 'fas fa-link')}"></i>${esc(entry.label || key)}</strong>`,
        `    <p>${preview ? esc(preview) : 'Preencha este link no onboarding para poder exibi-lo.'}</p>`,
        '  </div>',
        `  <label class="kc-settings-pill" for="settingsVisible_${esc(key)}">`,
        `    <input id="settingsVisible_${esc(key)}" type="checkbox" data-network-visible="${esc(key)}"${checked ? ' checked' : ''}${rawValue ? '' : ' disabled'} />`,
        '    <span>Exibir</span>',
        '  </label>',
        '</div>'
      ].join('');
    }).join('');
  }

  function updateOnboardingStatus() {
    const pill = $('#settingsOnboardingPill');
    const copy = $('#settingsOnboardingCopy');
    const setupLink = $('#settingsSetupLink');
    const profile = state.profile || {};
    const complete = shared && typeof shared.isOnboardingComplete === 'function'
      ? shared.isOnboardingComplete(profile)
      : !!profile.onboarding_completed_at;

    if (pill) pill.textContent = complete ? 'Completa' : 'Pendente';
    if (copy) {
      copy.textContent = complete
        ? 'Seu perfil básico já está pronto. Você pode revisar detalhes e visibilidade sem passar por tudo de novo.'
        : 'Ainda faltam etapas do onboarding. Complete os campos obrigatórios para publicar e receber contatos.';
    }
    if (setupLink) {
      setupLink.href = buildAccountSetupHref();
      setupLink.innerHTML = complete
        ? '<i class="fas fa-pen"></i><span>Revisar onboarding</span>'
        : '<i class="fas fa-list-check"></i><span>Completar conta</span>';
    }
  }

  function updateContactPreview() {
    const preview = $('#settingsContactPreview');
    if (!preview) return;
    const profile = Object.assign({}, state.profile || {}, {
      contact_primary_method: String($('#settingsPrimaryMethod')?.value || '').trim(),
      contact_cta_enabled: $('#settingsCtaEnabled')?.checked !== false
    });
    const action = shared && typeof shared.buildContactAction === 'function'
      ? shared.buildContactAction({
          profile,
          viewerAuthenticated: true,
          postTitle: 'Anúncio de teste',
          postUrl: `${window.location.origin}/product.html?id=demo`,
          viewProfileHref: buildProfileHref()
        })
      : null;

    if (!action) {
      preview.textContent = 'Não foi possível gerar a prévia do CTA agora.';
      return;
    }

    const label = String(action.label || '').trim();
    const href = String(action.href || '').trim();
    if (!href && action.type !== 'login_required') {
      preview.textContent = `Estado atual: ${label || 'Contato indisponível'}. Complete o valor do canal no onboarding para ativar este CTA.`;
      return;
    }
    preview.textContent = `Estado atual: ${label || 'Contato pronto'}. O anúncio vai abrir ${href ? 'o canal configurado' : 'uma alternativa segura'} quando alguém clicar em contato.`;
  }

  function updateThemeButtons() {
    const current = typeof window.kcGetTheme === 'function' ? window.kcGetTheme() : 'light';
    $all('[data-theme-option]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-theme-option') === current);
    });
  }

  function populate() {
    const profile = state.profile || {};
    const userSummary = $('#settingsUserSummary');
    const profileLink = $('#settingsProfileLink');
    const primaryMethod = $('#settingsPrimaryMethod');
    const ctaEnabled = $('#settingsCtaEnabled');

    if (userSummary && state.user) {
      userSummary.textContent = `Conta ativa com ${state.user.email || 'seu e-mail institucional'}. Use estas ações para revisar o fluxo de conta e a segurança da sessão.`;
    }

    if (profileLink) profileLink.href = buildProfileHref();
    if (primaryMethod) primaryMethod.value = String(profile.contact_primary_method || '').trim();
    if (ctaEnabled) ctaEnabled.checked = profile.contact_cta_enabled !== false;

    updateOnboardingStatus();
    buildNetworkRows();
    updateContactPreview();
    updateThemeButtons();
  }

  async function savePatch(patch, successMessage) {
    if (!window.KCAPI || typeof window.KCAPI.updateMyProfile !== 'function') {
      setStatus('Perfil indisponível neste ambiente.', 'error');
      return;
    }
    if (state.saving) return;
    state.saving = true;
    setStatus('Salvando suas configurações...', 'info');
    try {
      const result = await window.KCAPI.updateMyProfile(patch);
      if (!result || !result.ok) {
        setStatus((result && result.error && result.error.message) || 'Não foi possível salvar agora.', 'error');
        return;
      }
      state.profile = result.data || state.profile;
      populate();
      setStatus(successMessage || 'Configurações salvas com sucesso.', 'success');
    } catch (error) {
      console.error('[Settings] save failed:', error);
      setStatus('Não foi possível salvar agora.', 'error');
    } finally {
      state.saving = false;
    }
  }

  async function saveContactSettings() {
    const patch = {
      contact_primary_method: String($('#settingsPrimaryMethod')?.value || '').trim(),
      contact_cta_enabled: $('#settingsCtaEnabled')?.checked !== false
    };
    await savePatch(patch, 'Preferências de contato atualizadas.');
  }

  async function saveVisibilitySettings() {
    const visibility = normalizeVisibility(state.profile);
    document.querySelectorAll('[data-network-visible]').forEach((input) => {
      const key = String(input.getAttribute('data-network-visible') || '').trim();
      if (!key) return;
      visibility[key] = input.checked === true;
    });
    await savePatch({ social_visibility: visibility }, 'Visibilidade dos links públicos atualizada.');
  }

  async function resendConfirmation() {
    if (!state.user || !state.user.email || !window.KCAPI || typeof window.KCAPI.resendConfirmation !== 'function') return;
    setStatus('Reenviando a confirmação...', 'info');
    const result = await window.KCAPI.resendConfirmation(state.user.email, { emailRedirectTo: buildCallbackUrl() });
    if (!result || result.ok === false || result.error) {
      setStatus((result && result.error && result.error.message) || 'Não foi possível reenviar a confirmação.', 'error');
      return;
    }
    setStatus('Novo e-mail de confirmação enviado.', 'success');
  }

  async function requestResetLink() {
    if (!state.user || !state.user.email || !window.KCAPI || typeof window.KCAPI.requestPasswordReset !== 'function') return;
    setStatus('Enviando o link para redefinir sua senha...', 'info');
    const result = await window.KCAPI.requestPasswordReset(state.user.email, { redirectTo: buildCallbackUrl() });
    if (!result || result.ok === false || result.error) {
      setStatus((result && result.error && result.error.message) || 'Não foi possível enviar o link de nova senha.', 'error');
      return;
    }
    setStatus('Link de nova senha enviado para o seu e-mail institucional.', 'success');
  }

  async function doLogout() {
    if (!window.KCAPI || typeof window.KCAPI.logout !== 'function') return;
    setStatus('Saindo da conta...', 'info');
    try {
      await window.KCAPI.logout();
      window.location.href = '/index.html';
    } catch (error) {
      console.error('[Settings] logout failed:', error);
      setStatus('Não foi possível sair da conta agora.', 'error');
    }
  }

  function bindEvents() {
    const saveContact = $('#settingsSaveContact');
    const saveVisibility = $('#settingsSaveVisibility');
    const resend = $('#settingsResendConfirmation');
    const requestReset = $('#settingsRequestReset');
    const logout = $('#settingsLogout');

    if (saveContact) saveContact.addEventListener('click', saveContactSettings);
    if (saveVisibility) saveVisibility.addEventListener('click', saveVisibilitySettings);
    if (resend) resend.addEventListener('click', resendConfirmation);
    if (requestReset) requestReset.addEventListener('click', requestResetLink);
    if (logout) logout.addEventListener('click', doLogout);

    ['#settingsPrimaryMethod', '#settingsCtaEnabled'].forEach((selector) => {
      const field = $(selector);
      if (!field) return;
      field.addEventListener('change', updateContactPreview);
      field.addEventListener('input', updateContactPreview);
    });

    $all('[data-theme-option]').forEach((button) => {
      button.addEventListener('click', function () {
        const theme = String(button.getAttribute('data-theme-option') || '').trim();
        if (typeof window.kcSetTheme === 'function') window.kcSetTheme(theme);
        updateThemeButtons();
      });
    });

    document.addEventListener('kc:themechange', updateThemeButtons);
  }

  async function loadProfile() {
    if (!window.KCSupabase || typeof window.KCSupabase.getCurrentUser !== 'function') return;
    state.user = await window.KCSupabase.getCurrentUser();
    if (!state.user) return;
    if (window.KCAPI && typeof window.KCAPI.getMyProfile === 'function') {
      state.profile = await window.KCAPI.getMyProfile();
      if (!state.profile && typeof window.KCAPI.syncProfile === 'function') {
        await window.KCAPI.syncProfile();
        state.profile = await window.KCAPI.getMyProfile();
      }
    }
  }

  async function init() {
    state.nextPath = readNextPath();
    renderPrimaryMethodOptions();
    bindEvents();

    try {
      if (window.KCSupabase && typeof window.KCSupabase.refreshSession === 'function') {
        await window.KCSupabase.refreshSession();
      }
      await loadProfile();
    } catch (error) {
      console.error('[Settings] init failed:', error);
    }

    if (!state.user) {
      $('#settingsGuest').style.display = 'grid';
      return;
    }

    $('#settingsContent').style.display = 'grid';
    populate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
