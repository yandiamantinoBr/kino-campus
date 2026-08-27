(function () {
  'use strict';

  const shared = window.KCAccountProfileUtils || {};
  const STEP_IDS = ['basics', 'identity', 'contact'];
  const SOCIAL_VISIBILITY_KEYS = Object.freeze(
    Array.isArray(shared.SOCIAL_ORDER) && shared.SOCIAL_ORDER.length
      ? shared.SOCIAL_ORDER.slice()
      : ['whatsapp', 'instagram', 'linkedin', 'email_public', 'lattes', 'facebook', 'x', 'tiktok']
  );
  const SOCIAL_INPUT_KEYS = Object.freeze(SOCIAL_VISIBILITY_KEYS.filter((key) => key !== 'whatsapp'));

  const state = {
    user: null,
    profile: null,
    currentStep: 0,
    submitting: false,
    avatarSaving: false,
    avatarFile: null,
    avatarBatch: 0,
    selectedAvatarUrl: '',
    selectedEmoji: '',
    selectedEmojiColor: '',
    nextPath: '/index.html',
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

  function setStatus(message, tone) {
    const status = $('#accountSetupStatus');
    if (!status) return;
    if (!message) {
      status.style.display = 'none';
      status.textContent = '';
      status.className = 'kc-account-setup-status';
      return;
    }
    status.style.display = 'block';
    status.textContent = message;
    status.className = `kc-account-setup-status is-${tone || 'info'}`;
  }

  function normalizeNextPath(value) {
    if (shared && typeof shared.normalizeNextPath === 'function') {
      return shared.normalizeNextPath(value, '/index.html');
    }
    const raw = String(value || '').trim();
    if (!raw) return '/index.html';
    return raw.charAt(0) === '/' ? raw : `/${raw}`;
  }

  function readNextPath() {
    const params = new URLSearchParams(window.location.search || '');
    return normalizeNextPath(params.get('next'));
  }

  function buildProfileHref() {
    return state.user && state.user.id ? `/profile.html?id=${encodeURIComponent(state.user.id)}` : '/profile.html';
  }

  function buildPreviewPostUrl() {
    const relativeHref = window.KCUtils && typeof window.KCUtils.buildProductDetailHref === 'function'
      ? window.KCUtils.buildProductDetailHref('demo')
      : `product.html?id=${encodeURIComponent('demo')}`;
    return new URL(relativeHref, window.location.origin).toString();
  }

  function readProfileName(profile, user) {
    const direct = String((profile && (profile.display_name || profile.full_name)) || '').trim();
    if (direct) return direct;
    const email = String((user && user.email) || '').trim();
    if (email.includes('@')) return email.split('@')[0];
    return '';
  }

  function getCountryOptions() {
    return Array.isArray(shared.COUNTRY_DIAL_OPTIONS) ? shared.COUNTRY_DIAL_OPTIONS.slice() : [];
  }

  function getPrimaryMethods() {
    return Array.isArray(shared.CONTACT_METHOD_OPTIONS) ? shared.CONTACT_METHOD_OPTIONS.slice() : [];
  }

  function getSuggestionUrls() {
    const seed = readProfileName(state.profile, state.user) || String((state.user && state.user.id) || 'kinocampus');
    if (shared && typeof shared.getSuggestedAvatarUrls === 'function') {
      return shared.getSuggestedAvatarUrls(seed, { batch: state.avatarBatch, size: 8 });
    }
    return [];
  }

  function getEmojiOptions() {
    return Array.isArray(shared.AVATAR_EMOJI_OPTIONS) ? shared.AVATAR_EMOJI_OPTIONS.slice() : ['ðŸŽ“', 'ðŸ˜„', 'âœ¨', 'ðŸŒ±'];
  }

  function getEmojiColors() {
    return Array.isArray(shared.AVATAR_COLOR_OPTIONS) ? shared.AVATAR_COLOR_OPTIONS.slice() : ['#FF7C00', '#41B5D3', '#70E291', '#1F2937'];
  }

  function updateAvatarPreview() {
    const preview = $('#accountSetupAvatarPreview');
    if (!preview) return;

    if (state.avatarFile) {
      try {
        preview.src = URL.createObjectURL(state.avatarFile);
        preview.dataset.objectUrl = preview.src;
        return;
      } catch (_) { }
    }

    const chosen = String(state.selectedAvatarUrl || '').trim();
    if (chosen) {
      preview.removeAttribute('data-object-url');
      preview.src = chosen;
      return;
    }

    const existing = String((state.profile && state.profile.avatar_url) || '').trim();
    if (existing) {
      preview.removeAttribute('data-object-url');
      preview.src = existing;
      return;
    }

    const suggestions = getSuggestionUrls();
    preview.removeAttribute('data-object-url');
    if (shared && typeof shared.buildDefaultAvatarDataUrl === 'function') {
      preview.src = shared.buildDefaultAvatarDataUrl(readProfileName(state.profile, state.user) || 'Avatar KinoCampus');
      return;
    }

    preview.src = suggestions[0] || (shared.buildEmojiAvatarDataUrl
      ? shared.buildEmojiAvatarDataUrl(getEmojiOptions()[0], getEmojiColors()[0])
      : '');
  }

  function releaseAvatarPreview() {
    const preview = $('#accountSetupAvatarPreview');
    const objectUrl = preview && preview.dataset ? preview.dataset.objectUrl : '';
    if (objectUrl && /^blob:/i.test(objectUrl)) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) { }
      preview.removeAttribute('data-object-url');
    }
  }

  function renderAvatarSuggestions() {
    const container = $('#accountSetupAvatarSuggestions');
    if (!container) return;

    const suggestions = getSuggestionUrls();
    container.innerHTML = suggestions.map((url, index) => {
      const active = String(state.selectedAvatarUrl || '').trim() === String(url).trim();
      return [
        `<button class="kc-avatar-suggestion${active ? ' is-active' : ''}" type="button" data-avatar-url="${esc(url)}" aria-pressed="${active ? 'true' : 'false'}">`,
        `<img src="${esc(url)}" alt="Avatar sugerido ${index + 1}" loading="lazy" />`,
        '</button>',
      ].join('');
    }).join('');

    container.querySelectorAll('[data-avatar-url]').forEach((button) => {
      button.addEventListener('click', function () {
        state.selectedAvatarUrl = String(button.getAttribute('data-avatar-url') || '').trim();
        state.avatarFile = null;
        const input = $('#accountSetupAvatarInput');
        if (input) input.value = '';
        releaseAvatarPreview();
        renderAvatarSuggestions();
        renderEmojiAvatarBuilder();
        updateAvatarPreview();
      });
    });
  }

  function renderEmojiAvatarBuilder() {
    const emojiGrid = $('#accountSetupEmojiGrid');
    const colorGrid = $('#accountSetupEmojiColors');
    const current = $('#accountSetupEmojiCurrent');
    if (!emojiGrid || !colorGrid || !shared || typeof shared.buildEmojiAvatarDataUrl !== 'function') return;

    const emojis = getEmojiOptions();
    const colors = getEmojiColors();
    if (!state.selectedEmoji) state.selectedEmoji = emojis[0];
    if (!state.selectedEmojiColor) state.selectedEmojiColor = colors[0];

    emojiGrid.innerHTML = emojis.map((emoji) => {
      const active = emoji === state.selectedEmoji;
      return `<button class="kc-avatar-emoji-option${active ? ' is-active' : ''}" type="button" data-avatar-emoji="${esc(emoji)}" aria-pressed="${active ? 'true' : 'false'}">${esc(emoji)}</button>`;
    }).join('');

    colorGrid.innerHTML = colors.map((color) => {
      const active = String(color).toUpperCase() === String(state.selectedEmojiColor).toUpperCase();
      return `<button class="kc-avatar-color-chip${active ? ' is-active' : ''}" type="button" data-avatar-color="${esc(color)}" aria-pressed="${active ? 'true' : 'false'}" style="background:${esc(color)};"></button>`;
    }).join('');

    if (current) current.textContent = `Emoji atual: ${state.selectedEmoji} em ${state.selectedEmojiColor}`;

    emojiGrid.querySelectorAll('[data-avatar-emoji]').forEach((button) => {
      button.addEventListener('click', function () {
        state.selectedEmoji = String(button.getAttribute('data-avatar-emoji') || '').trim() || emojis[0];
        state.selectedAvatarUrl = shared.buildEmojiAvatarDataUrl(state.selectedEmoji, state.selectedEmojiColor);
        state.avatarFile = null;
        const input = $('#accountSetupAvatarInput');
        if (input) input.value = '';
        releaseAvatarPreview();
        renderAvatarSuggestions();
        renderEmojiAvatarBuilder();
        updateAvatarPreview();
      });
    });

    colorGrid.querySelectorAll('[data-avatar-color]').forEach((button) => {
      button.addEventListener('click', function () {
        state.selectedEmojiColor = String(button.getAttribute('data-avatar-color') || '').trim() || colors[0];
        state.selectedAvatarUrl = shared.buildEmojiAvatarDataUrl(state.selectedEmoji, state.selectedEmojiColor);
        state.avatarFile = null;
        const input = $('#accountSetupAvatarInput');
        if (input) input.value = '';
        releaseAvatarPreview();
        renderAvatarSuggestions();
        renderEmojiAvatarBuilder();
        updateAvatarPreview();
      });
    });
  }

  function renderSelectOptions(selector, options, placeholder) {
    const element = $(selector);
    if (!element) return;
    const current = String(element.value || '').trim();
    const html = [];
    if (placeholder) html.push(`<option value="">${esc(placeholder)}</option>`);
    html.push((Array.isArray(options) ? options : []).map((option) => {
      return `<option value="${esc(option.value)}">${esc(option.label)}</option>`;
    }).join(''));
    element.innerHTML = html.join('');
    if (current) element.value = current;
  }

  function renderCountryDatalist() {
    const datalist = $('#accountSetupCountryCodes');
    if (!datalist) return;
    datalist.innerHTML = getCountryOptions().map((option) => {
      return `<option value="+${esc(option.dialCode)}">${esc(option.name)} (+${esc(option.dialCode)})</option>`;
    }).join('');
  }

  function splitWhatsappValue(e164Value) {
    const normalized = String(e164Value || '').replace(/\D+/g, '');
    if (!normalized) return { dialCode: '55', localNumber: '' };

    const options = getCountryOptions().slice().sort((left, right) => String(right.dialCode).length - String(left.dialCode).length);
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      const dialCode = String(option.dialCode || '').trim();
      if (dialCode && normalized.startsWith(dialCode) && normalized.length > dialCode.length) {
        return {
          dialCode,
          localNumber: normalized.slice(dialCode.length),
        };
      }
    }

    return { dialCode: '55', localNumber: normalized };
  }

  function hasSavedSocialVisibility(config) {
    const source = (config && typeof config === 'object' && !Array.isArray(config)) ? config : {};
    return SOCIAL_VISIBILITY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(source, key));
  }

  function populateForm() {
    const profile = state.profile || {};
    const rawSocialLinks = profile.social_links || {};
    const rawSocialVisibility = profile.social_visibility || {};
    const socialLinks = shared && typeof shared.normalizeSocialLinks === 'function'
      ? shared.normalizeSocialLinks(rawSocialLinks, { defaultCountryCode: '55' })
      : rawSocialLinks;
    const socialVisibility = shared && typeof shared.normalizeSocialVisibility === 'function'
      ? shared.normalizeSocialVisibility(rawSocialVisibility)
      : rawSocialVisibility;
    const shouldDefaultWhatsappVisible = !hasSavedSocialVisibility(rawSocialVisibility)
      && String(profile.onboarding_completed_at || '').trim() === '';
    const whatsappSplit = splitWhatsappValue(socialLinks.whatsapp);

    const displayName = $('#accountSetupDisplayName');
    const affiliation = $('#accountSetupAffiliation');
    const bio = $('#accountSetupBio');
    const genderIdentity = $('#accountSetupGenderIdentity');
    const genderCustom = $('#accountSetupGenderIdentityCustom');
    const raceColor = $('#accountSetupRaceColor');
    const primaryMethod = $('#accountSetupPrimaryMethod');
    const ctaEnabled = $('#accountSetupCtaEnabled');
    const countryCode = $('#accountSetupCountryCode');
    const whatsappNumber = $('#accountSetupWhatsappNumber');

    if (displayName) displayName.value = String(profile.display_name || profile.full_name || readProfileName(profile, state.user) || '').trim();
    if (affiliation) affiliation.value = String(profile.affiliation || '').trim();
    if (bio) bio.value = String(profile.bio || '').trim();
    if (genderIdentity) genderIdentity.value = String(profile.gender_identity || '').trim();
    if (genderCustom) genderCustom.value = String(profile.gender_identity_custom || '').trim();
    if (raceColor) raceColor.value = String(profile.race_color || '').trim();
    if (primaryMethod) primaryMethod.value = String(profile.contact_primary_method || '').trim();
    if (ctaEnabled) ctaEnabled.checked = profile.contact_cta_enabled !== false;
    if (countryCode) countryCode.value = `+${whatsappSplit.dialCode || '55'}`;
    if (whatsappNumber) whatsappNumber.value = String(whatsappSplit.localNumber || '').trim();

    SOCIAL_INPUT_KEYS.forEach((key) => {
      const input = $(`[data-social-input="${key}"]`);
      if (input) input.value = String(socialLinks[key] || '').trim();
    });

    SOCIAL_VISIBILITY_KEYS.forEach((key) => {
      const checkbox = $(`[data-social-visible="${key}"]`);
      if (checkbox) checkbox.checked = socialVisibility[key] === true;
    });

    if (!$('#accountSetupEmailPublic')?.value && state.user && state.user.email) {
      const emailInput = $('#accountSetupEmailPublic');
      if (emailInput) emailInput.value = String(state.user.email || '').trim();
    }

    if (shouldDefaultWhatsappVisible) {
      const whatsappVisible = $('[data-social-visible="whatsapp"]');
      if (whatsappVisible) whatsappVisible.checked = true;
    }

    state.avatarBatch = 0;
    state.selectedAvatarUrl = '';
    state.selectedEmoji = getEmojiOptions()[0];
    state.selectedEmojiColor = getEmojiColors()[0];
    renderAvatarSuggestions();
    renderEmojiAvatarBuilder();
    updateAvatarPreview();
    updateIdentityConditional();
    updateContactPreview();
  }

  function updateIdentityConditional() {
    const genderIdentity = $('#accountSetupGenderIdentity');
    const customWrap = $('#accountSetupGenderIdentityCustomWrap');
    if (!genderIdentity || !customWrap) return;
    const show = String(genderIdentity.value || '').trim() === 'self_described';
    customWrap.style.display = show ? 'grid' : 'none';
  }

  function updateContactPreview() {
    const preview = $('#accountSetupContactPreview');
    if (!preview) return;

    const primaryMethod = String($('#accountSetupPrimaryMethod')?.value || '').trim();
    const action = shared && typeof shared.buildContactAction === 'function'
      ? shared.buildContactAction({
          profile: {
            contact_primary_method: primaryMethod,
            contact_cta_enabled: $('#accountSetupCtaEnabled')?.checked !== false,
            social_links: collectSocialLinks(),
            social_visibility: collectSocialVisibility(),
          },
          viewerAuthenticated: true,
          postTitle: 'Anúncio de teste',
          postUrl: buildPreviewPostUrl(),
          viewProfileHref: buildProfileHref(),
          defaultCountryCode: String($('#accountSetupCountryCode')?.value || '+55').trim(),
        })
      : null;

    if (!primaryMethod) {
      preview.textContent = 'Escolha o contato principal para definir como seus anúncios vão abrir contato.';
      return;
    }

    if (!action) {
      preview.textContent = 'Não foi possível gerar a prévia do contato agora.';
      return;
    }

    const href = String(action.href || '').trim();
    if (action.type === 'view_profile') {
      preview.textContent = `Contato público desativado. Seus anúncios vão mostrar “${String(action.label || 'Ver perfil').trim() || 'Ver perfil'}” como alternativa segura.`;
      return;
    }

    if (!href && action.type !== 'login_required') {
      preview.textContent = 'Preencha o valor do contato principal para ativar o contato nos anúncios.';
      return;
    }

    preview.textContent = `Contato principal pronto: ${String(action.label || 'Contato pronto').trim() || 'Contato pronto'}. Seus anúncios vão abrir o canal configurado quando alguém clicar em contato.`;
    return;

  }

  function setSubmitting(active) {
    state.submitting = !!active;
    $all('button, input, select, textarea').forEach((element) => {
      if (element.id === 'accountSetupBackButton' || element.id === 'accountSetupNextButton') {
        if (!active) return;
      }
      if (element.closest('.kc-header')) return;
      if (element.type === 'hidden') return;
      if (element.id === 'accountSetupBackButton' && !active) {
        element.disabled = state.currentStep === 0;
        return;
      }
      element.disabled = active;
    });
    renderStep();
  }

  function validateStep(stepIndex) {
    if (stepIndex === 0) {
      const displayName = String($('#accountSetupDisplayName')?.value || '').trim();
      const affiliation = String($('#accountSetupAffiliation')?.value || '').trim();
      if (!displayName) {
        setStatus('Informe como você quer aparecer no KinoCampus.', 'warn');
        return false;
      }
      if (!affiliation) {
        setStatus('Escolha seu vínculo principal com a UFG.', 'warn');
        return false;
      }
    }

    if (stepIndex === 2) {
      const primaryMethod = String($('#accountSetupPrimaryMethod')?.value || '').trim();
      if (!primaryMethod) {
        setStatus('Escolha o contato principal para concluir o onboarding.', 'warn');
        return false;
      }

      const socialLinks = collectSocialLinks();
      if (primaryMethod !== 'chat' && !String(socialLinks[primaryMethod] || '').trim()) {
        setStatus('Preencha o valor do contato principal escolhido para que o botão de contato funcione.', 'warn');
        return false;
      }
    }

    setStatus('', 'info');
    return true;
  }

  function collectSocialLinks() {
    const countryCode = String($('#accountSetupCountryCode')?.value || '+55').trim();
    const localNumber = String($('#accountSetupWhatsappNumber')?.value || '').trim();
    const whatsapp = shared.buildWhatsAppE164 ? shared.buildWhatsAppE164(countryCode, localNumber) : '';
    return SOCIAL_INPUT_KEYS.reduce((acc, key) => {
      const input = $(`[data-social-input="${key}"]`);
      acc[key] = String(input?.value || '').trim();
      return acc;
    }, { whatsapp });
  }

  function collectSocialVisibility() {
    return SOCIAL_VISIBILITY_KEYS.reduce((acc, key) => {
      const checkbox = $(`[data-social-visible="${key}"]`);
      acc[key] = checkbox?.checked === true;
      return acc;
    }, {});
  }

  async function resolveAvatarPatch() {
    if (state.avatarFile) {
      const upload = await window.KCAPI.uploadProfileAvatar(state.avatarFile);
      if (!upload || !upload.ok || !upload.data || !upload.data.url) {
        return { ok: false, error: { message: (upload && upload.error && upload.error.message) || 'Não foi possível enviar o avatar.' } };
      }
      return {
        ok: true,
        patch: {
          avatar_url: upload.data.url,
          avatar_path: upload.data.path || null,
        }
      };
    }

    const avatarSource = String(state.selectedAvatarUrl || '').trim();
    if (!avatarSource) return { ok: true, patch: {} };

    if (/^data:/i.test(avatarSource)) {
      const upload = await window.KCAPI.uploadProfileAvatar(avatarSource);
      if (!upload || !upload.ok || !upload.data || !upload.data.url) {
        return { ok: false, error: { message: (upload && upload.error && upload.error.message) || 'Não foi possível salvar o avatar escolhido.' } };
      }
      return {
        ok: true,
        patch: {
          avatar_url: upload.data.url,
          avatar_path: upload.data.path || null,
        }
      };
    }

    return {
      ok: true,
      patch: {
        avatar_url: avatarSource,
        avatar_path: null,
      }
    };
  }

  function buildPatch() {
    const raw = {
      display_name: String($('#accountSetupDisplayName')?.value || '').trim(),
      affiliation: String($('#accountSetupAffiliation')?.value || '').trim(),
      bio: String($('#accountSetupBio')?.value || '').trim(),
      gender_identity: String($('#accountSetupGenderIdentity')?.value || '').trim(),
      gender_identity_custom: String($('#accountSetupGenderIdentityCustom')?.value || '').trim(),
      race_color: String($('#accountSetupRaceColor')?.value || '').trim(),
      contact_primary_method: String($('#accountSetupPrimaryMethod')?.value || '').trim(),
      contact_cta_enabled: $('#accountSetupCtaEnabled')?.checked !== false,
      social_links: collectSocialLinks(),
      social_visibility: collectSocialVisibility(),
    };

    if (shared && typeof shared.buildOnboardingProfilePatch === 'function') {
      return shared.buildOnboardingProfilePatch(raw, {
        defaultCountryCode: String($('#accountSetupCountryCode')?.value || '+55').trim(),
        markCompleted: true,
      });
    }

    return raw;
  }

  async function persistProfile() {
    if (!window.KCAPI || typeof window.KCAPI.updateMyProfile !== 'function') {
      return { ok: false, error: { message: 'Perfil indisponível neste ambiente.' } };
    }

    const patch = buildPatch();
    const avatarResult = await resolveAvatarPatch();
    if (!avatarResult || !avatarResult.ok) return avatarResult;
    Object.assign(patch, avatarResult.patch || {});

    return window.KCAPI.updateMyProfile(patch);
  }

  function setAvatarSaving(active) {
    state.avatarSaving = !!active;
    const saveButton = $('#accountSetupAvatarSave');
    if (!saveButton) return;
    saveButton.disabled = state.avatarSaving || state.submitting;
    saveButton.innerHTML = state.avatarSaving
      ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Salvando foto...</span>'
      : '<i class="fas fa-check"></i><span>Salvar foto agora</span>';
  }

  async function saveAvatarOnly() {
    if (state.avatarSaving || state.submitting) return;
    if (!window.KCAPI || typeof window.KCAPI.updateMyProfile !== 'function') {
      setStatus('Perfil indisponível neste ambiente.', 'error');
      return;
    }

    const avatarResult = await resolveAvatarPatch();
    if (!avatarResult || !avatarResult.ok) {
      setStatus((avatarResult && avatarResult.error && avatarResult.error.message) || 'Não foi possível salvar o avatar agora.', 'error');
      return;
    }

    if (!avatarResult.patch || !Object.keys(avatarResult.patch).length) {
      setStatus('Escolha uma foto, um avatar sugerido ou um emoji antes de salvar.', 'warn');
      return;
    }

    setAvatarSaving(true);
    setStatus('Salvando sua foto de perfil...', 'info');

    try {
      const result = await window.KCAPI.updateMyProfile(avatarResult.patch);
      if (!result || !result.ok) {
        setStatus((result && result.error && result.error.message) || 'Não foi possível salvar o avatar agora.', 'error');
        return;
      }

      state.profile = result.data || state.profile;
      state.avatarFile = null;
      state.selectedAvatarUrl = '';
      releaseAvatarPreview();
      const input = $('#accountSetupAvatarInput');
      if (input) input.value = '';
      renderAvatarSuggestions();
      renderEmojiAvatarBuilder();
      updateAvatarPreview();
      setStatus('Foto de perfil salva com sucesso.', 'success');
    } catch (error) {
      console.error('[AccountSetup] avatar save failed:', error);
      setStatus('Não foi possível salvar o avatar agora.', 'error');
    } finally {
      setAvatarSaving(false);
    }
  }

  function renderStep() {
    const currentStepId = STEP_IDS[state.currentStep];

    $all('[data-step-chip]').forEach((chip, index) => {
      chip.classList.toggle('is-active', index === state.currentStep);
      chip.classList.toggle('is-complete', index < state.currentStep);
      chip.setAttribute('aria-current', index === state.currentStep ? 'step' : 'false');
    });

    $all('[data-step-panel]').forEach((panel) => {
      const isActive = panel.getAttribute('data-step-panel') === currentStepId;
      panel.style.display = isActive ? 'grid' : 'none';
    });

    const backButton = $('#accountSetupBackButton');
    const nextButton = $('#accountSetupNextButton');
    if (backButton) backButton.disabled = state.currentStep === 0 || state.submitting;
    if (nextButton) {
      nextButton.disabled = state.submitting;
      nextButton.innerHTML = state.currentStep === STEP_IDS.length - 1
        ? '<i class="fas fa-check"></i> Salvar e concluir'
        : 'Continuar <i class="fas fa-arrow-right"></i>';
    }
  }

  function goToStep(stepIndex) {
    const target = Math.max(0, Math.min(STEP_IDS.length - 1, Number(stepIndex) || 0));
    state.currentStep = target;
    renderStep();
    setStatus('', 'info');
  }

  async function handleNext() {
    if (state.submitting) return;
    if (!validateStep(state.currentStep)) return;

    if (state.currentStep < STEP_IDS.length - 1) {
      goToStep(state.currentStep + 1);
      return;
    }

    setSubmitting(true);
    setStatus('Salvando suas preferências...', 'info');

    try {
      const result = await persistProfile();
      if (!result || !result.ok) {
        setStatus((result && result.error && result.error.message) || 'Não foi possível salvar seu perfil agora.', 'error');
        return;
      }

      state.profile = result.data || state.profile;
      setStatus('Conta atualizada com sucesso. Redirecionando...', 'success');

      setTimeout(() => {
        window.location.href = state.nextPath || '/index.html';
      }, 600);
    } catch (error) {
      console.error('[AccountSetup] save failed:', error);
      setStatus('Não foi possível concluir seu onboarding agora.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function bindEvents() {
    const avatarInput = $('#accountSetupAvatarInput');
    if (avatarInput) {
      avatarInput.addEventListener('change', function (event) {
        const file = event && event.target && event.target.files && event.target.files[0];
        if (!file) return;
        releaseAvatarPreview();
        state.avatarFile = file;
        state.selectedAvatarUrl = '';
        renderAvatarSuggestions();
        renderEmojiAvatarBuilder();
        updateAvatarPreview();
      });
    }

    const avatarLoadMore = $('#accountSetupAvatarLoadMore');
    if (avatarLoadMore) {
      avatarLoadMore.addEventListener('click', function () {
        state.avatarBatch += 1;
        state.selectedAvatarUrl = '';
        renderAvatarSuggestions();
        renderEmojiAvatarBuilder();
        updateAvatarPreview();
      });
    }

    const avatarSave = $('#accountSetupAvatarSave');
    if (avatarSave) avatarSave.addEventListener('click', saveAvatarOnly);

    const genderIdentity = $('#accountSetupGenderIdentity');
    if (genderIdentity) genderIdentity.addEventListener('change', updateIdentityConditional);

    ['#accountSetupCountryCode', '#accountSetupWhatsappNumber'].forEach((selector) => {
      const field = $(selector);
      if (field) field.addEventListener('input', updateContactPreview);
      if (field) field.addEventListener('change', updateContactPreview);
    });

    ['#accountSetupPrimaryMethod', '#accountSetupInstagram', '#accountSetupLinkedin', '#accountSetupFacebook', '#accountSetupEmailPublic'].forEach((selector) => {
      const field = $(selector);
      if (field) field.addEventListener('input', updateContactPreview);
      if (field) field.addEventListener('change', updateContactPreview);
    });

    const ctaEnabled = $('#accountSetupCtaEnabled');
    if (ctaEnabled) ctaEnabled.addEventListener('change', updateContactPreview);

    const backButton = $('#accountSetupBackButton');
    if (backButton) backButton.addEventListener('click', function () {
      if (state.currentStep > 0) goToStep(state.currentStep - 1);
    });

    const nextButton = $('#accountSetupNextButton');
    if (nextButton) nextButton.addEventListener('click', handleNext);

    $all('[data-step-chip]').forEach((button, index) => {
      button.addEventListener('click', function () {
        if (index <= state.currentStep || validateStep(state.currentStep)) goToStep(index);
      });
    });
  }

  async function init() {
    state.nextPath = readNextPath();

    if (!window.KCAPI) return;

    state.user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!state.user && typeof window.KCAPI.getCurrentUser === 'function') {
      state.user = await window.KCAPI.getCurrentUser();
    }
    if (!state.user) {
      window.location.href = 'index.html#login';
      return;
    }

    try {
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
    } catch (_) {
      state.profile = null;
    }

    renderSelectOptions('#accountSetupAffiliation', shared.AFFILIATION_OPTIONS || [], 'Selecione seu vínculo');
    renderSelectOptions('#accountSetupGenderIdentity', shared.GENDER_IDENTITY_OPTIONS || [], 'Selecione uma opção');
    renderSelectOptions('#accountSetupRaceColor', shared.RACE_COLOR_OPTIONS || [], 'Selecione uma opção');
    renderSelectOptions('#accountSetupPrimaryMethod', getPrimaryMethods(), 'Selecione o contato principal');
    renderCountryDatalist();
    populateForm();
    bindEvents();
    renderStep();

    const loading = $('#accountSetupLoading');
    const content = $('#accountSetupContent');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'grid';
  }

  window.addEventListener('beforeunload', releaseAvatarPreview);
  document.addEventListener('DOMContentLoaded', init);
})();
