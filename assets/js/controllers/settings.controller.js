(function () {
  'use strict';

  const shared = window.KCAccountProfileUtils || {};
  const NO_PUBLIC_CONTACT_OPTION = Object.freeze({
    value: 'no_public_contact',
    label: 'Sem contato público',
  });

  const state = {
    user: null,
    profile: null,
    nextPath: '/index.html',
    saving: false,
    lastRealPrimaryMethod: '',
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

  function cacheButtonHtml(button) {
    if (!button) return '';
    if (!button.dataset.defaultHtml) button.dataset.defaultHtml = button.innerHTML;
    return button.dataset.defaultHtml;
  }

  function restoreActionButton(button) {
    if (!button) return;
    if (button._kcResetTimer) {
      clearTimeout(button._kcResetTimer);
      button._kcResetTimer = null;
    }
    button.disabled = false;
    button.classList.remove('is-loading', 'is-success');
    const defaultHtml = cacheButtonHtml(button);
    if (defaultHtml) button.innerHTML = defaultHtml;
  }

  function setActionButtonState(button, mode, label) {
    if (!button) return;
    cacheButtonHtml(button);
    button.classList.remove('is-loading', 'is-success');
    button.disabled = false;

    if (mode === 'loading') {
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${esc(label || 'Salvando...')}</span>`;
      return;
    }

    if (mode === 'success') {
      button.classList.add('is-success');
      button.innerHTML = `<i class="fas fa-check"></i><span>${esc(label || 'Salvo')}</span>`;
      button._kcResetTimer = window.setTimeout(function () {
        restoreActionButton(button);
      }, 2200);
      return;
    }

    restoreActionButton(button);
  }

  function getPrimaryMethodOptions() {
    const options = Array.isArray(shared.CONTACT_METHOD_OPTIONS)
      ? shared.CONTACT_METHOD_OPTIONS.slice()
      : [];
    options.push(NO_PUBLIC_CONTACT_OPTION);
    return options;
  }

  function isNoPublicContactSelected() {
    return String($('#settingsPrimaryMethod')?.value || '').trim() === NO_PUBLIC_CONTACT_OPTION.value;
  }

  function syncContactPillLabel() {
    const label = $('#settingsCtaEnabledLabel');
    const toggle = $('#settingsCtaEnabled');
    if (!label || !toggle) return;
    label.textContent = toggle.checked ? 'Ativo' : 'Desativado';
  }

  function syncProfilePublicLabel() {
    const label = $('#settingsProfilePublicLabel');
    const toggle = $('#settingsProfilePublic');
    if (!label || !toggle) return;
    label.textContent = toggle.checked ? 'Ativado' : 'Desativado';
  }

  function syncContactControls(mode) {
    const select = $('#settingsPrimaryMethod');
    const toggle = $('#settingsCtaEnabled');
    if (!select || !toggle) return;

    const noPublic = String(select.value || '').trim() === NO_PUBLIC_CONTACT_OPTION.value;
    const wasDisabled = toggle.disabled === true;

    if (!noPublic && String(select.value || '').trim()) {
      state.lastRealPrimaryMethod = String(select.value || '').trim();
    }

    if (noPublic) {
      toggle.checked = false;
      toggle.disabled = true;
    } else {
      toggle.disabled = false;
      if (mode === 'select' && wasDisabled) toggle.checked = true;
    }

    syncContactPillLabel();
  }

  function renderPrimaryMethodOptions() {
    const select = $('#settingsPrimaryMethod');
    if (!select) return;
    select.innerHTML = getPrimaryMethodOptions().map((option) => {
      return `<option value="${esc(option.value)}">${esc(option.label)}</option>`;
    }).join('');
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
        '  <div class="kc-settings-network__body">',
        `    <strong><i class="${esc(entry.iconClass || 'fas fa-link')}"></i>${esc(entry.label || key)}</strong>`,
        `    <p title="${esc(preview || '')}">${preview ? esc(preview) : 'Preencha este link no onboarding para poder exibi-lo.'}</p>`,
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

  function buildPreviewProfile() {
    const selectedValue = String($('#settingsPrimaryMethod')?.value || '').trim();
    const ctaEnabled = $('#settingsCtaEnabled')?.checked !== false;
    const fallbackPrimary = state.lastRealPrimaryMethod || String((state.profile && state.profile.contact_primary_method) || '').trim();

    return Object.assign({}, state.profile || {}, {
      contact_primary_method: selectedValue === NO_PUBLIC_CONTACT_OPTION.value
        ? (fallbackPrimary || null)
        : (selectedValue || null),
      contact_cta_enabled: selectedValue === NO_PUBLIC_CONTACT_OPTION.value
        ? false
        : ctaEnabled,
    });
  }

  function updateContactPreview() {
    const preview = $('#settingsContactPreview');
    if (!preview) return;

    const selectedValue = String($('#settingsPrimaryMethod')?.value || '').trim();
    if (selectedValue === NO_PUBLIC_CONTACT_OPTION.value) {
      preview.textContent = 'Estado atual: sem contato público. O anúncio exibirá uma alternativa segura, como “Ver perfil”.';
      return;
    }

    const action = shared && typeof shared.buildContactAction === 'function'
      ? shared.buildContactAction({
          profile: buildPreviewProfile(),
          viewerAuthenticated: true,
          postTitle: 'Anúncio de teste',
          postUrl: `${window.location.origin}/product.html?id=demo`,
          viewProfileHref: buildProfileHref()
        })
      : null;

    if (!action) {
      preview.textContent = 'Não foi possível gerar a prévia do contato agora.';
      return;
    }

    const label = String(action.label || '').trim();
    const href = String(action.href || '').trim();
    if (!href && action.type !== 'login_required') {
      preview.textContent = `Estado atual: ${label || 'Contato indisponível'}. Complete o valor do contato no onboarding para ativar este botão.`;
      return;
    }

    if (action.type === 'view_profile') {
      preview.textContent = `Estado atual: ${label || 'Ver perfil'}. O anúncio exibirá uma alternativa segura no lugar do contato direto.`;
      return;
    }

    preview.textContent = `Estado atual: ${label || 'Contato pronto'}. O anúncio vai abrir o canal configurado quando alguém clicar em contato.`;
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
    const profilePublic = $('#settingsProfilePublic');
    const storedPrimaryMethod = String(profile.contact_primary_method || '').trim();

    state.lastRealPrimaryMethod = storedPrimaryMethod || state.lastRealPrimaryMethod;

    if (userSummary && state.user) {
      userSummary.textContent = `Conta ativa com ${state.user.email || 'seu e-mail institucional'}. Use estas ações para revisar o fluxo de conta e a segurança da sessão.`;
    }

    if (profileLink) profileLink.href = buildProfileHref();
    if (primaryMethod) {
      primaryMethod.value = profile.contact_cta_enabled === false
        ? NO_PUBLIC_CONTACT_OPTION.value
        : storedPrimaryMethod;
    }
    if (ctaEnabled) {
      ctaEnabled.checked = profile.contact_cta_enabled !== false;
    }
    if (profilePublic) {
      profilePublic.checked = profile.profile_public === true;
    }

    updateOnboardingStatus();
    buildNetworkRows();
    syncContactControls('populate');
    syncProfilePublicLabel();
    updateContactPreview();
    updateThemeButtons();
  }

  async function savePatch(patch, successMessage, buttonSelector, successButtonLabel) {
    const button = buttonSelector ? $(buttonSelector) : null;
    if (!window.KCAPI || typeof window.KCAPI.updateMyProfile !== 'function') {
      setStatus('Perfil indisponível neste ambiente.', 'error');
      setActionButtonState(button, 'idle');
      return;
    }
    if (state.saving) return;

    state.saving = true;
    setActionButtonState(button, 'loading', 'Salvando...');
    setStatus('Salvando suas configurações...', 'info');

    try {
      const result = await window.KCAPI.updateMyProfile(patch);
      if (!result || !result.ok) {
        setActionButtonState(button, 'idle');
        setStatus((result && result.error && result.error.message) || 'Não foi possível salvar agora.', 'error');
        return;
      }

      state.profile = result.data || state.profile;
      populate();
      setActionButtonState(button, 'success', successButtonLabel || 'Salvo');
      setStatus(successMessage || 'Configurações salvas com sucesso.', 'success');
    } catch (error) {
      console.error('[Settings] save failed:', error);
      setActionButtonState(button, 'idle');
      setStatus('Não foi possível salvar agora.', 'error');
    } finally {
      state.saving = false;
    }
  }

  async function saveContactSettings() {
    const selectedValue = String($('#settingsPrimaryMethod')?.value || '').trim();
    const noPublic = selectedValue === NO_PUBLIC_CONTACT_OPTION.value;
    const effectivePrimaryMethod = noPublic
      ? (state.lastRealPrimaryMethod || String((state.profile && state.profile.contact_primary_method) || '').trim() || null)
      : (selectedValue || null);

    if (!noPublic && effectivePrimaryMethod) {
      state.lastRealPrimaryMethod = effectivePrimaryMethod;
    }

    const patch = {
      contact_primary_method: effectivePrimaryMethod,
      contact_cta_enabled: noPublic ? false : ($('#settingsCtaEnabled')?.checked !== false)
    };

    await savePatch(
      patch,
      'Preferências de contato atualizadas.',
      '#settingsSaveContact',
      'Contato salvo'
    );
  }

  async function saveVisibilitySettings() {
    const visibility = normalizeVisibility(state.profile);
    document.querySelectorAll('[data-network-visible]').forEach((input) => {
      const key = String(input.getAttribute('data-network-visible') || '').trim();
      if (!key) return;
      visibility[key] = input.checked === true;
    });

    await savePatch(
      { social_visibility: visibility },
      'Visibilidade dos links públicos atualizada.',
      '#settingsSaveVisibility',
      'Visibilidade salva'
    );
  }

  async function saveProfilePublicSettings() {
    await savePatch(
      { profile_public: $('#settingsProfilePublic')?.checked === true },
      'Preferência de perfil público atualizada.',
      '#settingsSaveProfilePublic',
      'Perfil salvo'
    );
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
    const saveProfilePublic = $('#settingsSaveProfilePublic');
    const resend = $('#settingsResendConfirmation');
    const requestReset = $('#settingsRequestReset');
    const logout = $('#settingsLogout');
    const primaryMethod = $('#settingsPrimaryMethod');
    const ctaEnabled = $('#settingsCtaEnabled');
    const profilePublic = $('#settingsProfilePublic');

    if (saveContact) saveContact.addEventListener('click', saveContactSettings);
    if (saveVisibility) saveVisibility.addEventListener('click', saveVisibilitySettings);
    if (saveProfilePublic) saveProfilePublic.addEventListener('click', saveProfilePublicSettings);
    if (resend) resend.addEventListener('click', resendConfirmation);
    if (requestReset) requestReset.addEventListener('click', requestResetLink);
    if (logout) logout.addEventListener('click', doLogout);

    if (primaryMethod) {
      primaryMethod.addEventListener('change', function () {
        syncContactControls('select');
        updateContactPreview();
      });
      primaryMethod.addEventListener('input', updateContactPreview);
    }

    if (ctaEnabled) {
      ctaEnabled.addEventListener('change', function () {
        syncContactPillLabel();
        updateContactPreview();
      });
    }

    if (profilePublic) {
      profilePublic.addEventListener('change', syncProfilePublicLabel);
    }

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
    if (!window.KCSupabase) return;

    state.user = typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!state.user && typeof window.KCSupabase.getCurrentUser === 'function') {
      state.user = await window.KCSupabase.getCurrentUser();
    }
    if (!state.user) return;

    if (window.KCAPI) {
      state.profile = typeof window.KCAPI.getCurrentProfile === 'function'
        ? window.KCAPI.getCurrentProfile()
        : null;
      if (!state.profile && typeof window.KCAPI.getMyProfile === 'function') {
        state.profile = await window.KCAPI.getMyProfile();
      }
      if (!state.profile && typeof window.KCAPI.syncProfile === 'function') {
        await window.KCAPI.syncProfile();
        state.profile = typeof window.KCAPI.getCurrentProfile === 'function'
          ? window.KCAPI.getCurrentProfile()
          : null;
        if (!state.profile && typeof window.KCAPI.getMyProfile === 'function') {
          state.profile = await window.KCAPI.getMyProfile();
        }
      }
    }
  }

  async function init() {
    state.nextPath = readNextPath();
    renderPrimaryMethodOptions();
    bindEvents();

    try {
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

