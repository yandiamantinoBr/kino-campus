(function () {
  'use strict';

  const Help = window.KCHelpUtils || {};

  const PRIVACY_DEEP_LINKS = Object.freeze({
    data_access_copy: Object.freeze({
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_data_copy',
      subject: 'Solicitação de cópia dos meus dados',
      messagePlaceholder: 'Informe quais dados você espera receber e qualquer contexto necessário. Não envie senhas, tokens ou documentos desnecessários.',
      status: 'Formulário preparado para solicitar uma cópia dos seus dados.',
    }),
    data_portability: Object.freeze({
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_data_portability',
      subject: 'Solicitação de portabilidade dos meus dados',
      messagePlaceholder: 'Explique quais dados deseja portar, o formato ou serviço de destino pretendido e qualquer contexto necessário.',
      status: 'Formulário preparado para solicitar portabilidade dos seus dados.',
    }),
    account_erasure: Object.freeze({
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_deletion',
      subject: 'Solicitação de exclusão da minha conta e dos meus dados',
      messagePlaceholder: 'Explique seu pedido e qualquer contexto necessário. O envio não apaga a conta imediatamente; haverá confirmação de titularidade antes da etapa irreversível.',
      status: 'Formulário preparado para solicitar exclusão da conta e dos dados.',
    }),
  });

  const PRIVACY_GUIDANCE_BY_SUBTOPIC = Object.freeze({
    account_data_copy: 'Você está solicitando uma cópia dos dados associados à conta. Este formulário gera uma referência de atendimento; após a verificação de titularidade, ela será vinculada ao protocolo correto. O arquivo integral não é baixado imediatamente.',
    account_data_portability: 'Você está solicitando portabilidade. O formato e a viabilidade serão analisados conforme as categorias envolvidas e os padrões disponíveis.',
    account_deletion: 'Você está solicitando exclusão. O envio abre uma análise e não elimina a conta imediatamente; a titularidade e a confirmação final serão verificadas antes da etapa irreversível.',
  });
  const PRIVACY_IDEMPOTENCY_STORAGE_PREFIX = 'kc_help_privacy_idempotency_v1';
  const PRIVACY_IDEMPOTENCY_CLOCK_SKEW_MS = 5 * 60 * 1000;
  const PRIVACY_IDEMPOTENCY_KEY_RE = /^[a-f0-9]{64}$/;
  const PRIVACY_IDEMPOTENCY_KINDS = new Set([
    'data_access_copy',
    'data_portability',
    'account_erasure',
  ]);

  // Privacy payload stash (issue #752): visitors can fill a LGPD/DSR form
  // while unauthenticated. If they then sign in (or sign up), the form
  // payload is restored from sessionStorage and re-submitted so the user
  // does not lose what they typed.
  // - Stored in sessionStorage (not localStorage): cleared when the tab
  //   closes, which limits exposure of PII.
  // - TTL: 15 minutes from stash. After that, the payload is treated as
  //   expired and discarded.
  // - Sensitive PII (contact_email, message) is kept intact because the
  //   user just typed it themselves; we do not log it to console or to
  //   any other side channel. sessionStorage is the only sink.
  const PRIVACY_PENDING_STORAGE_KEY = 'kc-privacy-pending-payload-v1';
  const PRIVACY_PENDING_TTL_MS = 15 * 60 * 1000;
  const TURNSTILE_SCRIPT_ID = 'kc-help-privacy-turnstile-script';
  const TURNSTILE_SCRIPT_URL =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const TURNSTILE_ACTION = 'help_privacy_guest';
  const TURNSTILE_TOKEN_MAX_CHARS = 2048;
  let turnstileScriptPromise = null;
  const state = {
    user: null,
    profile: null,
    authResolved: false,
    submitting: false,
    operationOwner: null,
    operationSequence: 0,
    accountLoadGeneration: 0,
    conditionalFieldKeys: [],
    deepLinkPreset: null,
    privacyIdempotencyMemory: Object.create(null),
    privacyRecoveryBlocked: false,
    privacyRecoveryInProgress: false,
    turnstileToken: '',
    turnstileWidgetId: null,
    turnstileSiteKey: '',
    turnstileRenderGeneration: 0,
    guestLoginGateToastShown: false,
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value);
  }

  function getUserId(user) {
    return String(user && user.id || '').trim();
  }

  function isAuthenticatedAccountUser(user) {
    return Boolean(getUserId(user) && user.is_anonymous !== true);
  }

  function getPrivacyRequestKind(type, topic, subtopic) {
    const requestKind = Help.getPrivacyRequestKind
      ? Help.getPrivacyRequestKind(type, topic, subtopic)
      : '';
    return PRIVACY_IDEMPOTENCY_KINDS.has(requestKind) ? requestKind : '';
  }

  function getCurrentPrivacyRequestKind() {
    return getPrivacyRequestKind(
      getCurrentType(),
      getCurrentTopic(),
      getCurrentSubtopic()
    );
  }

  function getTurnstileSiteKey() {
    const env = window.KC_ENV && typeof window.KC_ENV === 'object'
      ? window.KC_ENV
      : {};
    const privacyHelp =
      env.privacyHelp &&
      typeof env.privacyHelp === 'object' &&
      !Array.isArray(env.privacyHelp)
        ? env.privacyHelp
        : {};
    const siteKey = String(
      env.TURNSTILE_SITE_KEY || privacyHelp.turnstileSiteKey || ''
    ).trim();
    if (
      !siteKey ||
      /^__KC_[A-Z0-9_]+__$/.test(siteKey) ||
      /^<[^>]+>$/.test(siteKey)
    ) {
      return '';
    }
    return siteKey;
  }

  function setPrivacyVerificationStatus(message, tone) {
    const status = $('#helpPrivacyVerificationStatus');
    if (!status) return;
    status.textContent = String(message || '');
    status.className = `kc-help-verification-status${tone ? ` is-${tone}` : ''}`;
  }

  function removePrivacyTurnstileWidget() {
    state.turnstileToken = '';
    const widgetId = state.turnstileWidgetId;
    state.turnstileWidgetId = null;
    state.turnstileSiteKey = '';
    if (
      widgetId !== null &&
      window.turnstile &&
      typeof window.turnstile.remove === 'function'
    ) {
      try {
        window.turnstile.remove(widgetId);
      } catch (_) { }
    }
    const target = $('#helpPrivacyTurnstileWidget');
    if (target) target.textContent = '';
  }

  function loadTurnstileApi() {
    if (
      window.turnstile &&
      typeof window.turnstile.render === 'function'
    ) {
      return Promise.resolve(window.turnstile);
    }
    if (turnstileScriptPromise) return turnstileScriptPromise;

    turnstileScriptPromise = new Promise((resolve, reject) => {
      let settled = false;
      let script = document.getElementById(TURNSTILE_SCRIPT_ID);
      const shouldAppend = !script;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (
          !error &&
          window.turnstile &&
          typeof window.turnstile.render === 'function'
        ) {
          resolve(window.turnstile);
          return;
        }
        if (
          script &&
          script.id === TURNSTILE_SCRIPT_ID &&
          script.parentNode
        ) {
          script.parentNode.removeChild(script);
        }
        reject(error || new Error('TURNSTILE_API_UNAVAILABLE'));
      };
      const timeoutId = window.setTimeout(
        () => finish(new Error('TURNSTILE_API_TIMEOUT')),
        15000
      );

      if (!script) {
        script = document.createElement('script');
        script.id = TURNSTILE_SCRIPT_ID;
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
      }
      script.addEventListener('load', () => finish(null), { once: true });
      script.addEventListener(
        'error',
        () => finish(new Error('TURNSTILE_SCRIPT_FAILED')),
        { once: true }
      );
      if (shouldAppend) document.head.appendChild(script);
    });
    turnstileScriptPromise.catch(() => {
      turnstileScriptPromise = null;
    });
    return turnstileScriptPromise;
  }

  function isGuestPrivacyRoute() {
    return Boolean(
      state.authResolved &&
      !isAuthenticatedAccountUser(state.user) &&
      getCurrentPrivacyRequestKind()
    );
  }

  function setPrivacyLoginGateVisible(visible) {
    const gate = $('#helpPrivacyLoginGate');
    const secondary = $('#helpPrivacyLoginSecondary');
    const title = $('#helpPrivacyVerificationTitle');
    const description = $('#helpPrivacyVerificationDescription');
    const widget = $('#helpPrivacyTurnstileWidget');
    const submit = $('#helpSubmitButton');
    if (gate) gate.hidden = !visible;
    if (secondary) secondary.hidden = !!visible;
    if (widget) widget.hidden = !!visible;
    if (visible) {
      if (title) {
        title.innerHTML =
          '<i class="fas fa-user-lock" aria-hidden="true"></i> Entre na conta para exercer seus direitos';
      }
      if (description) {
        description.textContent =
          'Pedidos de cópia, portabilidade e exclusão com protocolo estão liberados para quem está logado. Use o botão abaixo — leva menos de um minuto com o e-mail institucional.';
      }
      if (submit && isGuestPrivacyRoute()) {
        submit.disabled = true;
        submit.setAttribute('aria-disabled', 'true');
        submit.title = 'Entre na conta para enviar pedidos de privacidade';
      }
    } else {
      if (title) {
        title.innerHTML =
          '<i class="fas fa-shield-halved" aria-hidden="true"></i> Verificação de segurança';
      }
      if (description) {
        description.textContent =
          'Para enviar um pedido de privacidade sem uma conta autenticada, conclua a verificação abaixo. A prova fica somente em memória até esta tentativa e não é gravada no armazenamento persistente.';
      }
      if (submit && !state.submitting) {
        submit.disabled = false;
        submit.removeAttribute('aria-disabled');
        submit.removeAttribute('title');
      }
    }
  }

  async function syncPrivacyVerification() {
    const container = $('#helpPrivacyVerification');
    const target = $('#helpPrivacyTurnstileWidget');
    if (!container || !target) return;
    const shouldRender = isGuestPrivacyRoute();
    container.hidden = !shouldRender;
    if (!shouldRender) {
      state.turnstileRenderGeneration += 1;
      removePrivacyTurnstileWidget();
      setPrivacyLoginGateVisible(false);
      setPrivacyVerificationStatus('', '');
      return;
    }

    const siteKey = getTurnstileSiteKey();
    if (!siteKey) {
      // No Turnstile provisioned: fail-closed for guests, but guide to login
      // (authenticated privacy path works without CAPTCHA).
      state.turnstileRenderGeneration += 1;
      removePrivacyTurnstileWidget();
      setPrivacyLoginGateVisible(true);
      setPrivacyVerificationStatus(
        'Visitante sem CAPTCHA: use Entrar ou cadastrar. Depois do login, o envio e as Configurações → Privacidade funcionam normalmente.',
        'warn'
      );
      if (!state.guestLoginGateToastShown) {
        state.guestLoginGateToastShown = true;
        try {
          if (typeof window.showToast === 'function') {
            window.showToast(
              'Para copiar, portar ou excluir dados, entre na conta (botão no formulário).',
              'warn',
              5200
            );
          }
        } catch (_) { /* ignore */ }
      }
      return;
    }
    setPrivacyLoginGateVisible(false);
    if (
      state.turnstileWidgetId !== null &&
      state.turnstileSiteKey === siteKey
    ) {
      return;
    }

    const generation = ++state.turnstileRenderGeneration;
    removePrivacyTurnstileWidget();
    setPrivacyVerificationStatus('Carregando verificação de segurança...', 'info');
    try {
      const api = await loadTurnstileApi();
      if (
        generation !== state.turnstileRenderGeneration ||
        !isGuestPrivacyRoute()
      ) {
        return;
      }
      const widgetId = api.render(target, {
        sitekey: siteKey,
        action: TURNSTILE_ACTION,
        theme: 'auto',
        callback(token) {
          if (
            generation !== state.turnstileRenderGeneration ||
            !isGuestPrivacyRoute()
          ) {
            return;
          }
          const normalizedToken = String(token || '').trim();
          state.turnstileToken =
            normalizedToken &&
            normalizedToken.length <= TURNSTILE_TOKEN_MAX_CHARS
              ? normalizedToken
              : '';
          setPrivacyVerificationStatus(
            state.turnstileToken
              ? 'Verificação concluída. Você já pode enviar o pedido.'
              : 'Não foi possível confirmar a verificação. Tente novamente.',
            state.turnstileToken ? 'success' : 'error'
          );
        },
        'expired-callback'() {
          if (generation !== state.turnstileRenderGeneration) return;
          state.turnstileToken = '';
          setPrivacyVerificationStatus(
            'A verificação expirou. Conclua uma nova verificação antes de enviar.',
            'warn'
          );
        },
        'error-callback'() {
          if (generation !== state.turnstileRenderGeneration) return;
          state.turnstileToken = '';
          setPrivacyVerificationStatus(
            'A verificação não pôde ser concluída. Tente novamente ou entre na sua conta.',
            'error'
          );
        },
      });
      if (widgetId === null || typeof widgetId === 'undefined') {
        throw new Error('TURNSTILE_RENDER_FAILED');
      }
      state.turnstileWidgetId = widgetId;
      state.turnstileSiteKey = siteKey;
      setPrivacyVerificationStatus(
        'Conclua a verificação de segurança para habilitar o envio visitante.',
        'info'
      );
    } catch (_) {
      if (
        generation !== state.turnstileRenderGeneration ||
        !isGuestPrivacyRoute()
      ) {
        return;
      }
      state.turnstileRenderGeneration += 1;
      removePrivacyTurnstileWidget();
      setPrivacyVerificationStatus(
        'Não foi possível carregar a verificação de segurança. Tente novamente mais tarde ou entre na sua conta.',
        'error'
      );
    }
  }

  function resetPrivacyTurnstile() {
    state.turnstileToken = '';
    if (
      state.turnstileWidgetId !== null &&
      window.turnstile &&
      typeof window.turnstile.reset === 'function'
    ) {
      try {
        window.turnstile.reset(state.turnstileWidgetId);
        setPrivacyVerificationStatus(
          'Conclua uma nova verificação de segurança antes de outro envio.',
          'info'
        );
        return;
      } catch (_) { }
    }
    syncPrivacyVerification().catch(function () {});
  }

  // ── Privacy payload stash (issue #752) ─────────────────────────────────
  // The LGPD/DSR form can be filled by a visitor (no session). If the
  // visitor then signs in or signs up, we want the typed payload to
  // survive the navigation. The stash is the single point of contact with
  // sessionStorage: everything else in the controller reads through here.

  function safeSessionStorage() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage;
      }
    } catch (_) { /* sessionStorage can throw in privacy modes */ }
    return null;
  }

  function isPrivacyRequestKind(kind) {
    return PRIVACY_IDEMPOTENCY_KINDS.has(String(kind || ''));
  }

  function stashPrivacyPayloadForVisitor(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const requestKind = String(payload.request_kind || payload.type || '');
    if (!isPrivacyRequestKind(requestKind)) return false;
    const storage = safeSessionStorage();
    if (!storage) return false;
    const envelope = {
      v: 1,
      created_at_ms: Date.now(),
      request_kind: requestKind,
      payload: payload,
    };
    try {
      storage.setItem(PRIVACY_PENDING_STORAGE_KEY, JSON.stringify(envelope));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadStashedPrivacyPayload() {
    const storage = safeSessionStorage();
    if (!storage) return null;
    let raw;
    try {
      raw = storage.getItem(PRIVACY_PENDING_STORAGE_KEY);
    } catch (_) {
      return null;
    }
    if (!raw) return null;
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch (_) {
      // Corrupt stash: clear to avoid re-reading on every init.
      try { storage.removeItem(PRIVACY_PENDING_STORAGE_KEY); } catch (__) {}
      return null;
    }
    if (!envelope || envelope.v !== 1 || !envelope.payload) {
      try { storage.removeItem(PRIVACY_PENDING_STORAGE_KEY); } catch (__) {}
      return null;
    }
    const age = Date.now() - Number(envelope.created_at_ms || 0);
    if (!Number.isFinite(age) || age < 0 || age > PRIVACY_PENDING_TTL_MS) {
      try { storage.removeItem(PRIVACY_PENDING_STORAGE_KEY); } catch (__) {}
      return null;
    }
    if (!isPrivacyRequestKind(envelope.request_kind)) {
      try { storage.removeItem(PRIVACY_PENDING_STORAGE_KEY); } catch (__) {}
      return null;
    }
    return envelope.payload;
  }

  function clearStashedPrivacyPayload() {
    const storage = safeSessionStorage();
    if (!storage) return;
    try { storage.removeItem(PRIVACY_PENDING_STORAGE_KEY); } catch (_) { /* ignore */ }
  }

  // Apply a stashed visitor payload into the form fields so the user can
  // see what was preserved and decide to re-submit. Returns true if the
  // payload was applied.
  function applyStashedPrivacyPayloadToForm(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (typeof value !== 'string' || !value) return;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('helpType', payload.type);
    setValue('helpTopic', payload.topic);
    setValue('helpSubject', payload.subject);
    setValue('helpMessage', payload.message);
    setValue('helpContactEmail', payload.contact_email);
    if (payload.priority) setValue('helpPriority', payload.priority);
    return true;
  }

  async function restoreAndSubmitStashedPrivacyPayload() {
    if (state.submitting || state.privacyRecoveryInProgress) return;
    if (!state.user || !getUserId(state.user)) return; // only after sign-in
    const stashed = loadStashedPrivacyPayload();
    if (!stashed) return;
    // Only auto-restore if the form is empty (user has not started typing
    // a new request). Otherwise the restore would clobber fresh input.
    const formIsPristine = (function () {
      const subject = document.getElementById('helpSubject');
      const message = document.getElementById('helpMessage');
      return (!subject || !subject.value) && (!message || !message.value);
    })();
    if (!formIsPristine) {
      // The user is already typing a new request; leave the stash alone
      // so they can decide whether to discard it.
      return;
    }
    if (!applyStashedPrivacyPayloadToForm(stashed)) {
      clearStashedPrivacyPayload();
      return;
    }
    setStatus('Você voltou a uma tentativa de privacidade que ficou em aberto. Verifique os campos e reenvie quando estiver pronto.', 'info');
  }

  function getPrivacyVerificationForSubmission(payload) {
    const requestKind = getPrivacyRequestKind(
      payload && payload.type,
      payload && payload.topic,
      payload && payload.subtopic
    );
    if (!requestKind || isAuthenticatedAccountUser(state.user)) {
      return { required: false, ok: true, token: '' };
    }
    if (!state.authResolved) {
      return {
        required: true,
        ok: false,
        token: '',
        message: 'Aguarde a confirmação do estado da sua conta antes de enviar este pedido.',
      };
    }
    if (!getTurnstileSiteKey()) {
      return {
        required: true,
        ok: false,
        token: '',
        message:
          'Para pedidos de privacidade, entre ou cadastre-se (botão “Entrar ou cadastrar” acima). Com a conta aberta, o envio e as Configurações → Privacidade já funcionam.',
      };
    }
    const token = String(state.turnstileToken || '').trim();
    if (!token) {
      return {
        required: true,
        ok: false,
        token: '',
        message: 'Conclua a verificação de segurança antes de enviar o pedido ou entre na sua conta.',
      };
    }
    return { required: true, ok: true, token };
  }

  function isActiveAccountLoad(generation, userId) {
    return (
      state.accountLoadGeneration === generation &&
      getUserId(state.user) === String(userId || '').trim()
    );
  }

  function profileBelongsToUser(profile, userId) {
    if (!profile || typeof profile !== 'object') return false;
    const ownerId = String(profile.user_id || profile.userId || profile.id || '').trim();
    return Boolean(ownerId && ownerId === String(userId || '').trim());
  }

  async function sha256Utf8(value) {
    if (
      !window.crypto ||
      !window.crypto.subtle ||
      typeof window.crypto.subtle.digest !== 'function' ||
      typeof window.TextEncoder !== 'function'
    ) {
      return '';
    }
    const encoded = new window.TextEncoder().encode(String(value || ''));
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function generatePrivacyIdempotencyKey() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(32);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${window.crypto.randomUUID()}${window.crypto.randomUUID()}`
        .replace(/-/g, '')
        .toLowerCase();
    }
    return '';
  }

  function sortJsonForFingerprint(value) {
    if (Array.isArray(value)) {
      return value.map((item) => sortJsonForFingerprint(item));
    }
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (typeof value[key] !== 'undefined') {
          result[key] = sortJsonForFingerprint(value[key]);
        }
        return result;
      }, {});
  }

  function buildPrivacyFingerprintShape(payload, requestKind) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const rawMetadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata
      : {};
    const metadata = { request_kind: requestKind };
    const allowedMetadataKeys = ['route', 'source', 'account_email'];
    if (requestKind === 'data_access_copy') {
      allowedMetadataKeys.push('data_scope', 'data_copy_format');
    } else if (requestKind === 'data_portability') {
      allowedMetadataKeys.push('data_scope', 'portability_context');
    } else if (requestKind === 'account_erasure') {
      allowedMetadataKeys.push('export_before_erasure');
    }
    allowedMetadataKeys.forEach((key) => {
      if (rawMetadata[key] !== null && typeof rawMetadata[key] !== 'undefined') {
        metadata[key] = rawMetadata[key];
      }
    });
    return sortJsonForFingerprint({
      version: 1,
      request_kind: requestKind,
      type: String(input.type || '').trim().toLowerCase(),
      topic: String(input.topic || '').trim().toLowerCase(),
      subtopic: String(input.subtopic || '').trim().toLowerCase(),
      subject: String(input.subject || '').trim(),
      message: String(input.message || '').trim(),
      priority: String(input.priority || 'normal').trim().toLowerCase(),
      page_path: String(input.page_path || '').trim() || null,
      contact_email: String(input.contact_email || '').trim().toLowerCase(),
      allow_contact: input.allow_contact !== false,
      metadata,
    });
  }

  function getPrivacyCallerScope() {
    const authenticated = isAuthenticatedAccountUser(state.user);
    return {
      authState: authenticated ? 'authenticated' : 'anonymous',
      callerId: getUserId(state.user) || 'guest',
    };
  }

  function getPrivacyIdempotencyStorage() {
    try {
      return window.sessionStorage || null;
    } catch (_) {
      return null;
    }
  }

  function parsePrivacyIdempotencyRecord(raw, scopeHash, now) {
    let parsed = raw;
    try {
      if (typeof parsed === 'string') parsed = JSON.parse(parsed || 'null');
    } catch (_) {
      return null;
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      parsed.version !== 1 ||
      parsed.scope_hash !== scopeHash ||
      !parsed.entries ||
      typeof parsed.entries !== 'object' ||
      Array.isArray(parsed.entries)
    ) {
      return null;
    }
    const entryKeys = Object.keys(parsed.entries);
    if (
      entryKeys.some((kind) => !PRIVACY_IDEMPOTENCY_KINDS.has(kind))
    ) {
      return null;
    }
    const entries = {};
    for (const kind of PRIVACY_IDEMPOTENCY_KINDS) {
      const entry = parsed.entries[kind];
      if (typeof entry === 'undefined') continue;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const createdAt = Number(entry.created_at_ms);
      if (
        !PRIVACY_IDEMPOTENCY_KEY_RE.test(String(entry.key || '')) ||
        !/^[a-f0-9]{64}$/.test(String(entry.fingerprint || '')) ||
        !Number.isFinite(createdAt) ||
        createdAt <= 0 ||
        createdAt > now + PRIVACY_IDEMPOTENCY_CLOCK_SKEW_MS
      ) {
        return null;
      }
      entries[kind] = {
        key: String(entry.key),
        fingerprint: String(entry.fingerprint),
        created_at_ms: createdAt,
      };
    }
    return {
      version: 1,
      scope_hash: scopeHash,
      entries,
    };
  }

  function readPrivacyIdempotencyRecord(scopeHash) {
    const storageKey = `${PRIVACY_IDEMPOTENCY_STORAGE_PREFIX}:${scopeHash}`;
    const storage = getPrivacyIdempotencyStorage();
    const now = Date.now();
    if (!storage) {
      const memoryRecord = state.privacyIdempotencyMemory[storageKey] || null;
      return {
        storage: null,
        storageKey,
        durable: false,
        corrupt: Boolean(
          memoryRecord &&
          !parsePrivacyIdempotencyRecord(memoryRecord, scopeHash, now)
        ),
        record: parsePrivacyIdempotencyRecord(
          memoryRecord,
          scopeHash,
          now
        ) || { version: 1, scope_hash: scopeHash, entries: {} },
      };
    }
    let raw = null;
    try {
      raw = storage.getItem(storageKey);
    } catch (_) {
      return {
        storage: null,
        storageKey,
        durable: false,
        corrupt: false,
        record: { version: 1, scope_hash: scopeHash, entries: {} },
      };
    }
    let durable = raw !== null;
    if (raw === null && state.privacyIdempotencyMemory[storageKey]) {
      raw = state.privacyIdempotencyMemory[storageKey];
      durable = false;
    }
    const record = parsePrivacyIdempotencyRecord(raw, scopeHash, now);
    return {
      storage,
      storageKey,
      durable: Boolean(record && durable),
      corrupt: Boolean(raw !== null && !record),
      record: record || { version: 1, scope_hash: scopeHash, entries: {} },
    };
  }

  function persistPrivacyIdempotencyRecord(context) {
    const record = context && context.record;
    if (!context || !record || context.corrupt) return false;
    const hasEntries = Object.keys(record.entries || {}).length > 0;
    if (!context.storage) {
      if (hasEntries) {
        state.privacyIdempotencyMemory[context.storageKey] = record;
      } else {
        delete state.privacyIdempotencyMemory[context.storageKey];
      }
      context.durable = false;
      return false;
    }
    try {
      if (hasEntries) {
        const serialized = JSON.stringify(record);
        context.storage.setItem(context.storageKey, serialized);
        if (context.storage.getItem(context.storageKey) !== serialized) {
          state.privacyIdempotencyMemory[context.storageKey] = record;
          context.durable = false;
          return false;
        }
      } else {
        context.storage.removeItem(context.storageKey);
        if (context.storage.getItem(context.storageKey) !== null) {
          context.durable = false;
          return false;
        }
      }
      delete state.privacyIdempotencyMemory[context.storageKey];
      context.durable = true;
      return true;
    } catch (_) {
      if (hasEntries) {
        state.privacyIdempotencyMemory[context.storageKey] = record;
      }
      context.durable = false;
      return false;
    }
  }

  async function preparePrivacyIdempotency(payload) {
    const requestKind = Help.getPrivacyRequestKind
      ? Help.getPrivacyRequestKind(payload.type, payload.topic, payload.subtopic)
      : '';
    if (!PRIVACY_IDEMPOTENCY_KINDS.has(requestKind)) {
      return { ok: true, payload, token: null };
    }
    const caller = getPrivacyCallerScope();
    const scopeHash = await sha256Utf8(
      `help-privacy-caller:v1:${caller.authState}:${caller.callerId}`
    );
    const fingerprint = await sha256Utf8(
      JSON.stringify(buildPrivacyFingerprintShape(payload, requestKind))
    );
    if (!scopeHash || !fingerprint) {
      return {
        ok: false,
        error: {
          code: 'HELP_IDEMPOTENCY_CRYPTO_UNAVAILABLE',
          message: 'O navegador não disponibilizou a proteção criptográfica necessária para este envio. Atualize a página ou tente em outro navegador.',
        },
      };
    }

    const context = readPrivacyIdempotencyRecord(scopeHash);
    if (state.privacyRecoveryBlocked || context.corrupt) {
      state.privacyRecoveryBlocked = true;
      return {
        ok: false,
        error: {
          code: 'HELP_IDEMPOTENCY_STORAGE_CORRUPT',
          message: 'A proteção de uma tentativa anterior está incompleta no armazenamento desta sessão. Para evitar duplicidade, nenhum novo pedido de privacidade será enviado nesta aba. Aguarde a confirmação do atendimento ou encerre esta sessão do navegador.',
        },
      };
    }
    let entry = context.record.entries[requestKind] || null;
    if (entry && entry.fingerprint !== fingerprint) {
      return {
        ok: false,
        error: {
          code: 'HELP_IDEMPOTENCY_PAYLOAD_CONFLICT',
          message: 'O conteúdo mudou desde uma tentativa que ainda pode ter sido recebida. Para evitar duplicidade, restaure os mesmos dados da tentativa anterior ou confirme o atendimento antes de iniciar outro pedido.',
        },
      };
    }
    if (!entry) {
      const key = generatePrivacyIdempotencyKey();
      if (!PRIVACY_IDEMPOTENCY_KEY_RE.test(key)) {
        return {
          ok: false,
          error: {
            code: 'HELP_IDEMPOTENCY_CRYPTO_UNAVAILABLE',
            message: 'Não foi possível gerar uma chave segura para este envio. Atualize a página e tente novamente.',
          },
        };
      }
      const now = Date.now();
      entry = {
        key,
        fingerprint,
        created_at_ms: now,
      };
      context.record.entries[requestKind] = entry;
    }
    if (!context.durable && !persistPrivacyIdempotencyRecord(context)) {
      return {
        ok: false,
        error: {
          code: 'HELP_IDEMPOTENCY_STORAGE_UNAVAILABLE',
          message: 'O navegador não conseguiu guardar com segurança a proteção deste envio. Libere o armazenamento da sessão ou tente em outro navegador.',
        },
      };
    }

    return {
      ok: true,
      payload: Object.assign({}, payload, {
        idempotency_key: entry.key,
      }),
      token: {
        scopeHash,
        requestKind,
        key: entry.key,
        fingerprint: entry.fingerprint,
      },
    };
  }

  function clearPrivacyIdempotencyToken(token) {
    if (!token || !PRIVACY_IDEMPOTENCY_KINDS.has(token.requestKind)) return;
    const context = readPrivacyIdempotencyRecord(token.scopeHash);
    if (context.corrupt) return;
    const entry = context.record.entries[token.requestKind];
    if (
      !entry ||
      entry.key !== token.key ||
      entry.fingerprint !== token.fingerprint
    ) {
      return;
    }
    delete context.record.entries[token.requestKind];
    persistPrivacyIdempotencyRecord(context);
  }

  async function getPrivacyRecoveryContexts() {
    const caller = getPrivacyCallerScope();
    const descriptors = [{
      authState: caller.authState,
      callerId: caller.callerId,
    }];
    if (caller.authState === 'authenticated' && caller.callerId !== 'guest') {
      descriptors.push({
        authState: 'anonymous',
        callerId: caller.callerId,
      });
    }
    const contexts = [];
    for (const descriptor of descriptors) {
      const scopeHash = await sha256Utf8(
        `help-privacy-caller:v1:${descriptor.authState}:${descriptor.callerId}`
      );
      if (!scopeHash) continue;
      contexts.push({
        authState: descriptor.authState,
        scopeHash,
        storageContext: readPrivacyIdempotencyRecord(scopeHash),
      });
    }
    return contexts;
  }

  function getReceiptReference(data) {
    const payload = data && typeof data === 'object' ? data : {};
    const dataSubjectProtocol = String(
      payload.protocol ||
      (
        payload.data_subject_request &&
        payload.data_subject_request.protocol
      ) ||
      ''
    ).trim();
    const reference = String(
      dataSubjectProtocol || payload.id || payload.out_id || ''
    ).trim();
    return { dataSubjectProtocol, reference };
  }

  function renderRecoveredPrivacyReceipt(data) {
    const receipt = getReceiptReference(data);
    if (!receipt.reference) return false;
    setProtocol(
      receipt.reference,
      receipt.dataSubjectProtocol
        ? 'data_subject_protocol'
        : 'help_reference'
    );
    setStatus(
      receipt.dataSubjectProtocol
        ? `Recuperamos a tentativa anterior sem reenviar seus dados. Protocolo do titular: ${receipt.dataSubjectProtocol}.`
        : `Recuperamos a tentativa anterior sem reenviar seus dados. Referência de atendimento: ${receipt.reference}.`,
      'success'
    );
    return true;
  }

  async function recoverPendingPrivacySubmissions() {
    if (state.submitting || state.operationOwner) return;
    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    state.privacyRecoveryBlocked = false;
    const contexts = await getPrivacyRecoveryContexts();
    if (!isActiveAccountLoad(generation, userId)) return;

    const corruptContext = contexts.find(
      (item) => item.storageContext.corrupt
    );
    if (corruptContext) {
      state.privacyRecoveryBlocked = true;
      setStatus(
        'A proteção de uma tentativa anterior está corrompida nesta sessão. Para evitar duplicidade, nenhum novo pedido de privacidade será enviado nesta aba; o registro bruto foi preservado para recuperação segura.',
        'error'
      );
      return;
    }

    const pending = [];
    contexts.forEach((item) => {
      Object.entries(item.storageContext.record.entries || {})
        .forEach(([requestKind, entry]) => {
          pending.push({
            sourceAuthState: item.authState,
            scopeHash: item.scopeHash,
            requestKind,
            entry,
          });
        });
    });
    if (!pending.length) return;
    if (
      !window.KCAPI ||
      typeof window.KCAPI.recoverPrivacyHelpRequest !== 'function'
    ) {
      setStatus(
        'Há uma tentativa anterior protegida contra duplicidade, mas a recuperação não está disponível neste ambiente. A chave foi mantida.',
        'warn'
      );
      return;
    }

    const operationOwner = acquireSubmitOperation('recovery');
    if (!operationOwner) return;
    setStatus('Verificando uma tentativa anterior sem reenviar seus dados...', 'info');
    const currentCaller = getPrivacyCallerScope();
    let recoveredData = null;
    let retiredCount = 0;
    let ambiguousCount = 0;
    try {
      for (const item of pending) {
        const result = await window.KCAPI.recoverPrivacyHelpRequest({
          idempotency_key: item.entry.key,
          request_kind: item.requestKind,
          expected_auth_state: currentCaller.authState,
          expected_user_id:
            currentCaller.authState === 'authenticated'
              ? currentCaller.callerId
              : null,
          source_auth_state: item.sourceAuthState,
        });
        if (!isActiveAccountLoad(generation, userId)) return;
        const token = {
          scopeHash: item.scopeHash,
          requestKind: item.requestKind,
          key: item.entry.key,
          fingerprint: item.entry.fingerprint,
        };
        if (result && result.ok === true) {
          clearPrivacyIdempotencyToken(token);
          recoveredData = result.data || recoveredData;
          continue;
        }
        if (
          result &&
          result.error &&
          result.error.idempotency &&
          result.error.idempotency.safe_to_replace === true
        ) {
          clearPrivacyIdempotencyToken(token);
          retiredCount += 1;
          continue;
        }
        ambiguousCount += 1;
      }
    } catch (_) {
      ambiguousCount += 1;
    } finally {
      releaseSubmitOperation(operationOwner);
    }
    if (!isActiveAccountLoad(generation, userId)) return;
    if (recoveredData && renderRecoveredPrivacyReceipt(recoveredData)) {
      if (ambiguousCount > 0) {
        setStatus(
          'Recuperamos uma referência anterior, mas outra tentativa ainda está sendo verificada. Nenhuma chave ambígua foi removida.',
          'warn'
        );
      }
      return;
    }
    if (ambiguousCount > 0) {
      setStatus(
        currentCaller.authState === 'anonymous' &&
          currentCaller.callerId === 'guest'
          ? 'Ainda não foi possível confirmar se a tentativa visitante chegou ao servidor. A chave foi mantida; aguarde e use esta mesma aba para tentar recuperar novamente.'
          : 'Ainda não foi possível confirmar uma tentativa anterior. A chave foi mantida para evitar duplicidade.',
        'warn'
      );
      return;
    }
    if (retiredCount > 0) {
      setStatus(
        'Uma tentativa anterior sem recibo foi encerrada com segurança. Revise o formulário antes de enviar um novo pedido.',
        'info'
      );
    }
  }

  function resetAccountBoundForm() {
    invalidateSubmitOperation();
    setProtocol('');
    const form = $('#helpRequestForm');
    if (form) form.reset();
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateTopics();
    if (state.deepLinkPreset) applyPrivacyDeepLinkPreset({ announce: false });
    const contactEmail = $('#helpContactEmail');
    if (contactEmail) {
      contactEmail.value = '';
      delete contactEmail.dataset.kcAccountPrefillUserId;
    }
    const accountEmail = document.querySelector('[data-help-conditional="account_email"]');
    if (accountEmail) {
      accountEmail.value = '';
      delete accountEmail.dataset.kcAccountPrefillUserId;
    }
  }

  function mapHelpStatusTone(tone) {
    const normalized = String(tone || '').trim().toLowerCase();
    if (normalized === 'success' || normalized === 'error' || normalized === 'warn' || normalized === 'info') {
      return normalized;
    }
    return 'info';
  }

  function helpStatusToastDuration(tone, message) {
    const text = String(message || '');
    const kind = mapHelpStatusTone(tone);
    // Long protocol/reference receipts need more reading time near the form.
    if (kind === 'success') return text.length > 120 ? 7000 : 4200;
    if (kind === 'error') return text.length > 120 ? 6500 : 3600;
    if (kind === 'warn') return 3200;
    // Progress / prep messages (Enviando..., formulário preparado...)
    return text.length > 90 ? 3200 : 2200;
  }

  function announceHelpStatusToast(message, tone) {
    const text = String(message || '').trim();
    if (!text) return;
    const toastType = mapHelpStatusTone(tone);
    const duration = helpStatusToastDuration(toastType, text);
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(text, toastType, duration);
        return;
      }
    } catch (_) { /* ignore toast failures */ }
    try {
      if (typeof showToast === 'function') {
        showToast(text, toastType, duration);
      }
    } catch (_) { /* ignore toast failures */ }
  }

  function setStatus(message, tone) {
    const status = $('#helpStatus');
    const text = String(message || '');
    // Keep #helpStatus text for e2e assertions; do not paint a top-of-page banner.
    // Sighted + SR feedback uses the same kc-toast pattern as publish on index.
    if (status) {
      status.textContent = text;
      status.className = 'kc-settings-status kc-help-status-live';
      status.setAttribute('aria-hidden', 'true');
    }
    if (!text) return;
    announceHelpStatusToast(text, tone);
  }

  function renderSubmitState(active, operationKind) {
    state.submitting = !!active;
    const form = $('#helpRequestForm');
    if (form) form.setAttribute('aria-busy', state.submitting ? 'true' : 'false');
    const button = $('#helpSubmitButton');
    if (!button) return;
    button.disabled = state.submitting;
    button.setAttribute('aria-busy', state.submitting ? 'true' : 'false');
    button.innerHTML = state.submitting
      ? operationKind === 'recovery'
        ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Verificando tentativa...</span>'
        : '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Enviando pedido...</span>'
      : '<i class="fas fa-paper-plane" aria-hidden="true"></i><span>Enviar pedido</span>';
  }

  function acquireSubmitOperation(operationKind) {
    if (state.operationOwner) return null;
    const owner = Object.freeze({
      id: ++state.operationSequence,
      kind: String(operationKind || 'submit'),
    });
    state.operationOwner = owner;
    renderSubmitState(true, owner.kind);
    return owner;
  }

  function releaseSubmitOperation(owner) {
    if (!owner || state.operationOwner !== owner) return false;
    state.operationOwner = null;
    renderSubmitState(false, '');
    return true;
  }

  function invalidateSubmitOperation() {
    state.operationOwner = null;
    renderSubmitState(false, '');
  }

  function setProtocol(protocol, kind) {
    const container = $('#helpProtocol');
    const value = $('#helpProtocolValue');
    const label = $('#helpProtocolLabel');
    const guidance = $('#helpProtocolGuidance');
    if (!container || !value) return;
    const normalized = String(protocol || '').trim();
    const isDataSubjectProtocol = kind === 'data_subject_protocol';
    value.textContent = normalized;
    if (label) {
      label.textContent = isDataSubjectProtocol
        ? 'Protocolo do titular'
        : 'Referência de atendimento';
    }
    if (guidance) {
      guidance.textContent = isDataSubjectProtocol
        ? 'Guarde-o para acompanhar o pedido em Configurações, quando autenticado, ou com o atendimento verificado. Esta página não oferece consulta pública por protocolo.'
        : 'Guarde-a para informar ao suporte no retorno por e-mail. Ela não permite consulta pública nesta página.';
    }
    container.hidden = !normalized;
    container.style.display = normalized ? '' : 'none';
  }

  function readPrivacyDeepLink() {
    let request = '';
    try {
      request = String(new URLSearchParams(window.location.search || '').get('request') || '').trim();
    } catch (_) {
      return null;
    }
    return Object.prototype.hasOwnProperty.call(PRIVACY_DEEP_LINKS, request)
      ? PRIVACY_DEEP_LINKS[request]
      : null;
  }

  function updatePrivacyRequestGuidance() {
    const notice = $('#helpRequestPresetNotice');
    if (!notice) return;
    const guidance = PRIVACY_GUIDANCE_BY_SUBTOPIC[getCurrentSubtopic()] || '';
    notice.textContent = guidance;
    notice.hidden = !guidance;
    notice.style.display = guidance ? '' : 'none';
  }

  function renderOptions(select, options, placeholder, emptyLabel) {
    if (!select) return;
    const rows = [];
    const list = Array.isArray(options) ? options : [];
    if (placeholder) rows.push(`<option value="">${esc(placeholder)}</option>`);
    if (!list.length && emptyLabel) rows.push(`<option value="">${esc(emptyLabel)}</option>`);
    list.forEach((option) => {
      if (!option || !option.value) return;
      rows.push(`<option value="${esc(option.value)}">${esc(option.label || option.value)}</option>`);
    });
    select.innerHTML = rows.join('');
    select.disabled = list.length === 0;
  }

  function getCurrentType() {
    return String($('#helpType')?.value || '').trim();
  }

  function getCurrentTopic() {
    return String($('#helpTopic')?.value || '').trim();
  }

  function getCurrentSubtopic() {
    return String($('#helpSubtopic')?.value || '').trim();
  }

  function buildSelectFieldOptions(options, value) {
    const placeholder = '<option value="">Selecione uma opção</option>';
    const rows = (Array.isArray(options) ? options : []).map((option) => {
      const selected = String(option.value || '') === String(value || '') ? ' selected' : '';
      return `<option value="${esc(option.value)}"${selected}>${esc(option.label || option.value)}</option>`;
    }).join('');
    return `${placeholder}${rows}`;
  }

  function renderConditionalFields() {
    const container = $('#helpConditionalFields');
    if (!container) return;

    const type = getCurrentType();
    const topic = getCurrentTopic();
    const subtopic = getCurrentSubtopic();
    const fields = Help.getHelpConditionalFields ? Help.getHelpConditionalFields(type, topic, subtopic) : [];

    state.conditionalFieldKeys = (Array.isArray(fields) ? fields : [])
      .map((field) => String(field && field.key || '').trim())
      .filter(Boolean);

    if (!fields.length) {
      container.innerHTML = '';
      container.style.display = 'none';
      updatePrivacyRequestGuidance();
      syncPrivacyVerification().catch(function () {});
      return;
    }

    container.style.display = 'grid';
    container.innerHTML = fields.map((field) => {
      const key = String(field.key || '').trim();
      const id = `helpConditional_${key}`;
      const helpId = `${id}_help`;
      const label = esc(field.label || key);
      const wideClass = field.wide ? ' kc-help-field--wide' : '';
      const required = field.required === true ? ' required aria-required="true"' : '';
      const describedBy = field.help ? ` aria-describedby="${esc(helpId)}"` : '';
      const helpCopy = field.help
        ? `<small id="${esc(helpId)}" class="kc-settings-help">${esc(field.help)}</small>`
        : '';
      const currentValue = key === 'page_path'
        ? String(window.location.pathname || '/ajuda.html')
        : '';

      if (field.type === 'select') {
        return [
          `<label class="kc-help-field${wideClass}">`,
          `<span>${label}</span>`,
          `<select id="${esc(id)}" data-help-conditional="${esc(key)}"${required}${describedBy}>`,
          buildSelectFieldOptions(field.options, ''),
          '</select>',
          helpCopy,
          '</label>',
        ].join('');
      }

      if (field.type === 'textarea') {
        return [
          `<label class="kc-help-field${wideClass}">`,
          `<span>${label}</span>`,
          `<textarea id="${esc(id)}" data-help-conditional="${esc(key)}" rows="${esc(field.rows || 4)}" maxlength="${esc(field.maxLength || 1200)}" placeholder="${esc(field.placeholder || '')}"${required}${describedBy}></textarea>`,
          helpCopy,
          '</label>',
        ].join('');
      }

      const autocomplete = field.autocomplete ? ` autocomplete="${esc(field.autocomplete)}"` : '';
      return [
        `<label class="kc-help-field${wideClass}">`,
        `<span>${label}</span>`,
        `<input id="${esc(id)}" data-help-conditional="${esc(key)}" type="${esc(field.type || 'text')}" maxlength="${esc(field.maxLength || 255)}" placeholder="${esc(field.placeholder || '')}" value="${esc(currentValue)}"${autocomplete}${required}${describedBy} />`,
        helpCopy,
        '</label>',
      ].join('');
    }).join('');
    updatePrivacyRequestGuidance();
    prefillContext();
    syncPrivacyVerification().catch(function () {});
  }

  function populateTopics() {
    const topicSelect = $('#helpTopic');
    const type = getCurrentType();
    const topics = Help.getHelpTopicOptions ? Help.getHelpTopicOptions(type) : [];
    renderOptions(topicSelect, topics, topics.length ? 'Selecione o tema' : 'Selecione a categoria principal', topics.length ? '' : 'Sem temas para esta categoria');
    populateSubtopics();
  }

  function populateSubtopics() {
    const subtopicSelect = $('#helpSubtopic');
    const type = getCurrentType();
    const topic = getCurrentTopic();
    const subtopics = Help.getHelpSubtopicOptions ? Help.getHelpSubtopicOptions(type, topic) : [];
    renderOptions(subtopicSelect, subtopics, subtopics.length ? 'Selecione o subtipo' : 'Sem subtipo sugerido', subtopics.length ? '' : 'Sem subtipo sugerido');
    renderConditionalFields();
  }

  function applyPrivacyDeepLinkPreset(options) {
    const opts = options || {};
    const preset = state.deepLinkPreset;
    if (!preset) return false;

    const type = $('#helpType');
    const topic = $('#helpTopic');
    const subtopic = $('#helpSubtopic');
    const priority = $('#helpPriority');
    const subject = $('#helpSubject');
    const message = $('#helpMessage');

    if (!type || !topic || !subtopic) return false;
    type.value = preset.type;
    if (type.value !== preset.type) return false;
    populateTopics();
    topic.value = preset.topic;
    if (topic.value !== preset.topic) return false;
    populateSubtopics();
    subtopic.value = preset.subtopic;
    if (subtopic.value !== preset.subtopic) return false;
    renderConditionalFields();

    if (priority && !priority.value) priority.value = 'normal';
    if (subject && !subject.value) subject.value = preset.subject;
    if (message) message.placeholder = preset.messagePlaceholder;
    if (opts.announce !== false) setStatus(preset.status, 'info');
    return true;
  }

  function applyAccountEmailPrefill(input, value, userId) {
    if (!input) return;
    const previousOwner = String(input.dataset.kcAccountPrefillUserId || '');
    if (previousOwner && previousOwner !== userId) {
      input.value = '';
      delete input.dataset.kcAccountPrefillUserId;
    }
    if (!input.value && value) {
      input.value = value;
      input.dataset.kcAccountPrefillUserId = userId;
    }
  }

  function prefillContext() {
    const emailInput = $('#helpContactEmail');
    const accountEmailInput = document.querySelector('[data-help-conditional="account_email"]');
    const profileEmail = state.profile && state.profile.email ? String(state.profile.email).trim() : '';
    const userEmail = state.user && state.user.email ? String(state.user.email).trim() : '';
    const knownEmail = profileEmail || userEmail;
    const userId = getUserId(state.user);
    applyAccountEmailPrefill(emailInput, knownEmail, userId);
    applyAccountEmailPrefill(accountEmailInput, knownEmail, userId);
  }

  async function hydrateUser(options) {
    const opts = options || {};
    const generation = ++state.accountLoadGeneration;
    state.authResolved = false;
    syncPrivacyVerification().catch(function () {});
    if (!window.KCSupabase) {
      state.user = null;
      state.profile = null;
      state.authResolved = true;
      syncPrivacyVerification().catch(function () {});
      return { generation, userId: '' };
    }
    let nextUser = Object.prototype.hasOwnProperty.call(opts, 'sessionUser')
      ? opts.sessionUser
      : (typeof window.KCSupabase.getUser === 'function'
          ? window.KCSupabase.getUser()
          : null);
    if (!nextUser && !Object.prototype.hasOwnProperty.call(opts, 'sessionUser')
      && typeof window.KCSupabase.getCurrentUser === 'function') {
      nextUser = await window.KCSupabase.getCurrentUser();
    }
    if (generation !== state.accountLoadGeneration) {
      return { generation, userId: '', stale: true };
    }

    const previousUserId = getUserId(state.user);
    const userId = getUserId(nextUser);
    state.user = nextUser || null;
    state.authResolved = true;
    if (previousUserId !== userId) {
      state.profile = null;
      resetAccountBoundForm();
    }

    if (window.KCAPI && userId) {
      let profile = typeof window.KCAPI.getCurrentProfile === 'function'
        ? window.KCAPI.getCurrentProfile()
        : null;
      if (!profileBelongsToUser(profile, userId)) profile = null;
      if (!profile && typeof window.KCAPI.getMyProfile === 'function') {
        const fetchedProfile = await window.KCAPI.getMyProfile();
        if (!isActiveAccountLoad(generation, userId)) {
          return { generation, userId, stale: true };
        }
        profile = profileBelongsToUser(fetchedProfile, userId) ? fetchedProfile : null;
      }
      if (isActiveAccountLoad(generation, userId)) state.profile = profile;
    }
    if (isActiveAccountLoad(generation, userId)) {
      syncPrivacyVerification().catch(function () {});
    }
    return { generation, userId, stale: !isActiveAccountLoad(generation, userId) };
  }

  async function refreshHelpPage(options) {
    const opts = options || {};
    const generation = state.accountLoadGeneration + 1;
    state.privacyRecoveryInProgress = true;
    setStatus('Atualizando a central de ajuda...', 'info');
    try {
      const accountLoad = await hydrateUser(
        Object.prototype.hasOwnProperty.call(opts, 'sessionUser')
          ? { sessionUser: opts.sessionUser }
          : undefined
      );
      if (accountLoad && accountLoad.stale) return;
      prefillContext();
      setStatus('Central de ajuda atualizada.', 'success');
      await recoverPendingPrivacySubmissions();
    } catch (error) {
      if (state.accountLoadGeneration !== generation) return;
      console.warn('[Help] refresh failed.');
      setStatus('Não foi possível atualizar a central de ajuda agora.', 'error');
    } finally {
      if (state.accountLoadGeneration === generation) {
        state.privacyRecoveryInProgress = false;
      }
    }
  }

  function collectConditionalMetadata() {
    const requestKind = Help.getPrivacyRequestKind
      ? Help.getPrivacyRequestKind(getCurrentType(), getCurrentTopic(), getCurrentSubtopic())
      : '';
    const metadata = {
      route: window.location.pathname || '/ajuda.html',
    };
    if (!requestKind) metadata.user_agent = navigator.userAgent || '';

    state.conditionalFieldKeys.forEach((key) => {
      const field = document.querySelector(`[data-help-conditional="${key}"]`);
      if (!field) return;
      const value = String(field.value || '').trim();
      if (!value) return;
      metadata[key] = value;
    });

    if (requestKind) {
      metadata.request_kind = requestKind;
      metadata.source = state.deepLinkPreset ? 'help_privacy_deep_link' : 'help_form';
    }

    return metadata;
  }

  function buildPayload() {
    const metadata = collectConditionalMetadata();
    const authenticatedAccount = isAuthenticatedAccountUser(state.user);
    const expectedUserId = authenticatedAccount ? getUserId(state.user) : '';
    const raw = {
      user_id: expectedUserId || null,
      type: $('#helpType')?.value || '',
      topic: $('#helpTopic')?.value || '',
      subtopic: $('#helpSubtopic')?.value || '',
      subject: $('#helpSubject')?.value || '',
      message: $('#helpMessage')?.value || '',
      priority: $('#helpPriority')?.value || '',
      page_path: metadata.page_path || '',
      contact_email: $('#helpContactEmail')?.value || '',
      allow_contact: $('#helpAllowContact')?.checked !== false,
      metadata,
    };

    const normalized = Help.normalizeHelpRequestInput
      ? Help.normalizeHelpRequestInput(raw, {
          fallbackEmail: raw.contact_email,
        })
      : raw;
    return Object.assign({}, normalized, {
      expected_auth_state: authenticatedAccount ? 'authenticated' : 'anonymous',
      expected_user_id: expectedUserId || null,
    });
  }

  function validateNormalizedHelpPayload(payload) {
    const subject = String(payload && payload.subject || '').trim();
    const message = String(payload && payload.message || '').trim();
    const email = String(payload && payload.contact_email || '')
      .trim()
      .toLowerCase();
    const pagePath = String(payload && payload.page_path || '').trim();
    if (subject.length < 3 || subject.length > 140) {
      return 'O assunto deve ter entre 3 e 140 caracteres, sem contar espaços nas extremidades.';
    }
    if (message.length < 10 || message.length > 4000) {
      return 'A descrição deve ter entre 10 e 4.000 caracteres, sem contar espaços nas extremidades.';
    }
    if (
      email.length > 255 ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    ) {
      return 'Informe um e-mail de retorno válido com até 255 caracteres.';
    }
    if (pagePath.length > 255) {
      return 'O caminho da página ultrapassa o limite seguro.';
    }
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.submitting || state.privacyRecoveryInProgress) return;

    if (!window.KCAPI || typeof window.KCAPI.createHelpRequest !== 'function') {
      setStatus('O envio de pedidos de ajuda não está disponível neste ambiente.', 'error');
      return;
    }

    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    let payload = buildPayload();
    if (!payload.subject || !payload.message || !payload.contact_email || !payload.type || !payload.topic || !payload.priority) {
      setStatus('Preencha categoria, tema, assunto, descrição, urgência e e-mail para retorno.', 'warn');
      return;
    }
    const normalizedValidationError =
      validateNormalizedHelpPayload(payload);
    if (normalizedValidationError) {
      setStatus(normalizedValidationError, 'warn');
      return;
    }
    const firstInvalidConditional = document.querySelector('#helpConditionalFields [required]:invalid');
    if (firstInvalidConditional) {
      setStatus('Preencha os campos obrigatórios específicos deste pedido.', 'warn');
      if (typeof firstInvalidConditional.reportValidity === 'function') firstInvalidConditional.reportValidity();
      firstInvalidConditional.focus();
      return;
    }
    const privacyVerification =
      getPrivacyVerificationForSubmission(payload);
    if (!privacyVerification.ok) {
      setStatus(privacyVerification.message, 'error');
      setPrivacyVerificationStatus(privacyVerification.message, 'error');
      const verification = $('#helpPrivacyVerification');
      if (verification && typeof verification.focus === 'function') {
        verification.focus();
      }
      syncPrivacyVerification().catch(function () {});
      return;
    }

    const operationOwner = acquireSubmitOperation('submit');
    if (!operationOwner) return;
    setProtocol('');
    setStatus('Enviando seu pedido de ajuda...', 'info');

    // Issue #752: if the visitor is unauthenticated and the request is a
    // privacy form, stash the payload in sessionStorage BEFORE submit so
    // the form survives an interruption (login redirect, refresh, etc).
    if (!userId) {
      stashPrivacyPayloadForVisitor(payload);
    } else {
      // Authenticated user: there is no risk of losing the form, and any
      // leftover stash from a previous visit is now stale.
      clearStashedPrivacyPayload();
    }

    let privacyIdempotencyToken = null;
    const guestPrivacyAttempt = privacyVerification.required === true;
    try {
      const prepared = await preparePrivacyIdempotency(payload);
      if (!isActiveAccountLoad(generation, userId)) return;
      if (!prepared || prepared.ok === false) {
        setStatus(
          (prepared && prepared.error && prepared.error.message)
            || 'Não foi possível preparar a proteção contra envios duplicados.',
          'error'
        );
        return;
      }
      payload = prepared.payload;
      privacyIdempotencyToken = prepared.token;
      if (guestPrivacyAttempt) {
        payload = Object.assign({}, payload, {
          turnstile_token: privacyVerification.token,
        });
        state.turnstileToken = '';
      }
      let result;
      try {
        result = await window.KCAPI.createHelpRequest(payload);
      } finally {
        if (
          payload &&
          Object.prototype.hasOwnProperty.call(payload, 'turnstile_token')
        ) {
          delete payload.turnstile_token;
        }
        if (guestPrivacyAttempt) resetPrivacyTurnstile();
      }
      if (!isActiveAccountLoad(generation, userId)) return;
      if (!result || result.ok === false) {
        if (
          result &&
          result.error &&
          result.error.idempotency &&
          result.error.idempotency.safe_to_replace === true
        ) {
          clearPrivacyIdempotencyToken(privacyIdempotencyToken);
        }
        setStatus((result && result.error && result.error.message) || 'Não foi possível enviar seu pedido agora.', 'error');
        return;
      }

      const dataSubjectProtocol = String(
        (result.data && result.data.protocol)
        || (result.data && result.data.data_subject_request && result.data.data_subject_request.protocol)
        || ''
      ).trim();
      const protocol = String(
        dataSubjectProtocol
        || (result.data && (result.data.id || result.data.out_id))
        || result.id
        || ''
      ).trim();
      if (!protocol) {
        setStatus(
          'O servidor não confirmou uma referência para o pedido. Para evitar duplicidade, não reenvie agora; tente recuperar esta mesma tentativa mais tarde.',
          'error'
        );
        return;
      }
      clearPrivacyIdempotencyToken(privacyIdempotencyToken);
      // Issue #752: a successful submit clears the visitor stash so the
      // sessionStorage does not keep a stale PII payload around.
      clearStashedPrivacyPayload();
      setProtocol(
        protocol,
        dataSubjectProtocol ? 'data_subject_protocol' : 'help_reference'
      );
      setStatus(
        dataSubjectProtocol
          ? `Pedido enviado com sucesso. Protocolo do titular: ${dataSubjectProtocol}. Guarde-o para acompanhar o atendimento e, em pedidos de cópia ou portabilidade, consultar o download autenticado.`
          : protocol
          ? `Pedido enviado com sucesso. Referência de atendimento: ${protocol}. Guarde-a para informar quando o suporte entrar em contato.`
          : 'Pedido enviado com sucesso. A referência será informada no retorno do atendimento.',
        'success'
      );
      try {
        if (
          !(result.data && result.data.idempotency_replayed === true) &&
          window.KCPrivacyAnalytics &&
          typeof window.KCPrivacyAnalytics.track === 'function'
        ) {
          window.KCPrivacyAnalytics.track('help_submit', {
            source: 'help_form',
            status: 'submitted',
            reason: payload.type || '',
            category: payload.topic || '',
            page_path: payload.page_path || '/ajuda.html',
          }).catch(function () {});
        }
      } catch (_) { }
      const form = $('#helpRequestForm');
      if (form) form.reset();
      renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
      renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
      populateTopics();
      if (!applyPrivacyDeepLinkPreset({ announce: false })) prefillContext();
    } catch (_) {
      if (!isActiveAccountLoad(generation, userId)) return;
      console.error('[Help] submit failed.');
      setStatus('Não foi possível enviar seu pedido agora.', 'error');
    } finally {
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'turnstile_token')) {
        delete payload.turnstile_token;
      }
      releaseSubmitOperation(operationOwner);
    }
  }

  function handleReset() {
    const form = $('#helpRequestForm');
    if (form) form.reset();
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateTopics();
    setProtocol('');
    setStatus('', '');
    if (!applyPrivacyDeepLinkPreset()) prefillContext();
    resetPrivacyTurnstile();
  }

  function bindEvents() {
    const form = $('#helpRequestForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const resetButton = $('#helpResetButton');
    if (resetButton) resetButton.addEventListener('click', handleReset);

    const typeField = $('#helpType');
    if (typeField) {
      typeField.addEventListener('change', populateTopics);
    }

    const topicField = $('#helpTopic');
    if (topicField) {
      topicField.addEventListener('change', populateSubtopics);
    }

    const subtopicField = $('#helpSubtopic');
    if (subtopicField) {
      subtopicField.addEventListener('change', renderConditionalFields);
    }

    document.addEventListener('input', function (event) {
      const target = event && event.target;
      if (!target || !target.dataset) return;
      if (
        target.id === 'helpContactEmail' ||
        target.getAttribute('data-help-conditional') === 'account_email'
      ) {
        delete target.dataset.kcAccountPrefillUserId;
      }
    });

    document.addEventListener('kc:authchange', function (event) {
      const detail = event && event.detail && typeof event.detail === 'object'
        ? event.detail
        : {};
      const sessionUser = detail.user || (detail.session && detail.session.user) || null;
      refreshHelpPage({ sessionUser });
    });
  }

  function initPullToRefresh() {
    if (!window.KCPullToRefresh || document.body.dataset.kcHelpPtrReady === '1') return;
    document.body.dataset.kcHelpPtrReady = '1';
    window.KCPullToRefresh.init({
      container: document.body,
      onRefresh: refreshHelpPage,
    });
  }

  async function init() {
    state.privacyRecoveryInProgress = true;
    state.deepLinkPreset = readPrivacyDeepLink();
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateTopics();
    bindEvents();
    applyPrivacyDeepLinkPreset();

    try {
      await hydrateUser();
    } catch (error) {
      console.warn('[Help] hydrate user failed:', error);
    }

    prefillContext();
    try {
      await recoverPendingPrivacySubmissions();
    } finally {
      state.privacyRecoveryInProgress = false;
    }

    // Issue #752: if the user just signed in / signed up while a
    // visitor privacy payload was waiting in sessionStorage, restore it
    // and try to submit it under the authenticated session.
    await restoreAndSubmitStashedPrivacyPayload();

    initPullToRefresh();
    initPullToRefresh();
    try {
      if (window.KCPrivacyAnalytics && typeof window.KCPrivacyAnalytics.track === 'function') {
        window.KCPrivacyAnalytics.track('help_open', {
          source: 'help_page',
          page_path: '/ajuda.html',
        }).catch(function () {});
      }
    } catch (_) { }
  }

  window.KCHelpRefresh = refreshHelpPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
