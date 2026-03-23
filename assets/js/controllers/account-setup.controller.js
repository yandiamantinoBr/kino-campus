(function () {
  'use strict';

  const shared = window.KCAccountProfileUtils || {};
  const STEP_IDS = ['basics', 'identity', 'contact'];

  const state = {
    user: null,
    profile: null,
    currentStep: 0,
    submitting: false,
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
    return Array.isArray(shared.AVATAR_EMOJI_OPTIONS) ? shared.AVATAR_EMOJI_OPTIONS.slice() : ['🎓', '😄', '✨', '🌱'];
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
    preview.src = suggestions[0] || (shared.buildEmojiAvatarDataUrl
      ? shared.buildEmojiAvatarDataUrl(getEmojiOptions()[0], getEmojiColors()[0])
      : 'https://api.dicebear.com/7.x/avataaars/svg?seed=kinocampus');
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

  function populateForm() {
    const profile = state.profile || {};
    const socialLinks = profile.social_links || {};
    const socialVisibility = profile.social_visibility || {};
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

    [
      'instagram',
      'linkedin',
      'facebook',
      'x',
      'tiktok',
      'email_public',
      'lattes'
    ].forEach((key) => {
      const input = $(`[data-social-input="${key}"]`);
      if (input) input.value = String(socialLinks[key] || '').trim();
    });

    Object.keys(socialVisibility || {}).forEach((key) => {
      const checkbox = $(`[data-social-visible="${key}"]`);
      if (checkbox) checkbox.checked = socialVisibility[key] === true;
    });

    if (!$('#accountSetupEmailPublic')?.value && state.user && state.user.email) {
      const emailInput = $('#accountSetupEmailPublic');
      if (emailInput) emailInput.value = String(state.user.email || '').trim();
    }

    const visibilityDefaults = ['whatsapp', 'instagram', 'linkedin', 'email_public', 'facebook', 'x', 'tiktok', 'lattes'];
    visibilityDefaults.forEach((key) => {
      const checkbox = $(`[data-social-visible="${key}"]`);
      if (checkbox && String(profile.onboarding_completed_at || '').trim() === '' && key === 'whatsapp') {
        checkbox.checked = true;
      }
    });

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

    const countryCode = String($('#accountSetupCountryCode')?.value || '+55').replace(/[^\d+]/g, '');
    const localNumber = String($('#accountSetupWhatsappNumber')?.value || '').trim();
    const whatsappE164 = shared.buildWhatsAppE164
      ? shared.buildWhatsAppE164(countryCode, localNumber)
      : '';
    const formatted = shared.formatWhatsAppDisplay ? shared.formatWhatsAppDisplay(whatsappE164) : whatsappE164;
    const primaryMethod = String($('#accountSetupPrimaryMethod')?.value || '').trim();
    const socialLinks = collectSocialLinks();
    const primaryValue = String(socialLinks[primaryMethod] || '').trim();

    if (!primaryMethod) {
      preview.textContent = formatted ? `WhatsApp pronto para contato: ${formatted}` : 'O contato principal aparecera aqui depois de preenchido.';
      return;
    }

    const labels = {
      whatsapp: formatted || '',
      instagram: primaryValue,
      linkedin: primaryValue,
      facebook: primaryValue,
      email_public: primaryValue
    };

    const labelMap = {
      whatsapp: 'WhatsApp',
      instagram: 'Instagram',
      linkedin: 'LinkedIn',
      facebook: 'Facebook',
      email_public: 'E-mail'
    };

    preview.textContent = labels[primaryMethod]
      ? `Canal principal pronto: ${labelMap[primaryMethod] || primaryMethod} (${labels[primaryMethod]})`
      : 'Preencha o valor do canal principal para ativar o CTA dos anuncios.';
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
        setStatus('Informe como voce quer aparecer no KinoCampus.', 'warn');
        return false;
      }
      if (!affiliation) {
        setStatus('Escolha seu vinculo principal com a UFG.', 'warn');
        return false;
      }
    }

    if (stepIndex === 2) {
      const primaryMethod = String($('#accountSetupPrimaryMethod')?.value || '').trim();
      if (!primaryMethod) {
        setStatus('Escolha o canal principal de contato para concluir o onboarding.', 'warn');
        return false;
      }

      const socialLinks = collectSocialLinks();
      if (!String(socialLinks[primaryMethod] || '').trim()) {
        setStatus('Preencha o valor do canal principal escolhido para que o botao de contato funcione.', 'warn');
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

    return {
      whatsapp,
      instagram: String($('#accountSetupInstagram')?.value || '').trim(),
      linkedin: String($('#accountSetupLinkedin')?.value || '').trim(),
      facebook: String($('#accountSetupFacebook')?.value || '').trim(),
      x: String($('#accountSetupX')?.value || '').trim(),
      tiktok: String($('#accountSetupTiktok')?.value || '').trim(),
      email_public: String($('#accountSetupEmailPublic')?.value || '').trim(),
      lattes: String($('#accountSetupLattes')?.value || '').trim(),
    };
  }

  function collectSocialVisibility() {
    return {
      whatsapp: $('#accountSetupWhatsappVisible')?.checked === true,
      instagram: $('#accountSetupInstagramVisible')?.checked === true,
      linkedin: $('#accountSetupLinkedinVisible')?.checked === true,
      email_public: $('#accountSetupEmailPublicVisible')?.checked === true,
      lattes: $('#accountSetupLattesVisible')?.checked === true,
      facebook: $('#accountSetupFacebookVisible')?.checked === true,
      x: $('#accountSetupXVisible')?.checked === true,
      tiktok: $('#accountSetupTiktokVisible')?.checked === true,
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
      return { ok: false, error: { message: 'Perfil indisponivel neste ambiente.' } };
    }

    const patch = buildPatch();

    if (state.avatarFile) {
      const upload = await window.KCAPI.uploadProfileAvatar(state.avatarFile);
      if (!upload || !upload.ok || !upload.data || !upload.data.url) {
        return { ok: false, error: { message: (upload && upload.error && upload.error.message) || 'Nao foi possivel enviar o avatar.' } };
      }
      patch.avatar_url = upload.data.url;
      patch.avatar_path = upload.data.path || null;
    } else if (String(state.selectedAvatarUrl || '').trim()) {
      patch.avatar_url = String(state.selectedAvatarUrl || '').trim();
      patch.avatar_path = null;
    }

    return window.KCAPI.updateMyProfile(patch);
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
    setStatus('Salvando suas preferencias...', 'info');

    try {
      const result = await persistProfile();
      if (!result || !result.ok) {
        setStatus((result && result.error && result.error.message) || 'Nao foi possivel salvar seu perfil agora.', 'error');
        return;
      }

      state.profile = result.data || state.profile;
      setStatus('Conta atualizada com sucesso. Redirecionando...', 'success');

      setTimeout(() => {
        window.location.href = state.nextPath || '/index.html';
      }, 600);
    } catch (error) {
      console.error('[AccountSetup] save failed:', error);
      setStatus('Nao foi possivel concluir seu onboarding agora.', 'error');
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

    const genderIdentity = $('#accountSetupGenderIdentity');
    if (genderIdentity) genderIdentity.addEventListener('change', updateIdentityConditional);

    ['#accountSetupCountryCode', '#accountSetupWhatsappNumber'].forEach((selector) => {
      const field = $(selector);
      if (field) field.addEventListener('input', updateContactPreview);
    });

    ['#accountSetupPrimaryMethod', '#accountSetupInstagram', '#accountSetupLinkedin', '#accountSetupFacebook', '#accountSetupEmailPublic'].forEach((selector) => {
      const field = $(selector);
      if (field) field.addEventListener('input', updateContactPreview);
      if (field) field.addEventListener('change', updateContactPreview);
    });

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

    renderSelectOptions('#accountSetupAffiliation', shared.AFFILIATION_OPTIONS || [], 'Selecione seu vinculo');
    renderSelectOptions('#accountSetupGenderIdentity', shared.GENDER_IDENTITY_OPTIONS || [], 'Prefiro nao informar');
    renderSelectOptions('#accountSetupRaceColor', shared.RACE_COLOR_OPTIONS || [], 'Prefiro nao informar');
    renderSelectOptions('#accountSetupPrimaryMethod', getPrimaryMethods(), 'Selecione o canal principal');
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
