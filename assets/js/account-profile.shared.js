(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.KCAccountProfileUtils = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OWNER_PROFILE_SELECT_FIELDS = [
    'id',
    'display_name',
    'full_name',
    'avatar_url',
    'avatar_path',
    'bio',
    'verified',
    'is_admin',
    'created_at',
    'updated_at',
    'onboarding_completed_at',
    'affiliation',
    'gender_identity',
    'gender_identity_custom',
    'race_color',
    'contact_primary_method',
    'contact_cta_enabled',
    'social_links',
    'social_visibility'
  ].join(', ');

  const PUBLIC_PROFILE_SELECT_FIELDS = [
    'id',
    'display_name',
    'full_name',
    'avatar_url',
    'bio',
    'verified',
    'created_at',
    'updated_at',
    'onboarding_completed_at',
    'affiliation',
    'gender_identity',
    'gender_identity_custom',
    'race_color',
    'contact_primary_method',
    'contact_cta_enabled',
    'social_links',
    'social_visibility'
  ].join(', ');

  const AFFILIATION_OPTIONS = Object.freeze([
    Object.freeze({ value: 'undergrad_student', label: 'Estudante de graduação' }),
    Object.freeze({ value: 'graduate_student', label: 'Estudante de pós-graduação' }),
    Object.freeze({ value: 'professor', label: 'Professor(a)' }),
    Object.freeze({ value: 'staff', label: 'Técnico(a)-administrativo(a)' }),
    Object.freeze({ value: 'alumni', label: 'Egresso(a)' }),
    Object.freeze({ value: 'exchange_student', label: 'Intercambista' }),
    Object.freeze({ value: 'visiting_researcher', label: 'Pesquisador(a) visitante' }),
    Object.freeze({ value: 'other_ufg', label: 'Outro vínculo com a UFG' }),
    Object.freeze({ value: 'prefer_not_to_say', label: 'Prefiro não informar' })
  ]);

  const GENDER_IDENTITY_OPTIONS = Object.freeze([
    Object.freeze({ value: 'woman_cis', label: 'Mulher cis' }),
    Object.freeze({ value: 'man_cis', label: 'Homem cis' }),
    Object.freeze({ value: 'woman_trans', label: 'Mulher trans' }),
    Object.freeze({ value: 'man_trans', label: 'Homem trans' }),
    Object.freeze({ value: 'non_binary', label: 'Pessoa não binária' }),
    Object.freeze({ value: 'travesti', label: 'Travesti' }),
    Object.freeze({ value: 'agender', label: 'Agênero' }),
    Object.freeze({ value: 'self_described', label: 'Prefiro autodescrever' }),
    Object.freeze({ value: 'prefer_not_to_say', label: 'Prefiro não informar' })
  ]);

  const RACE_COLOR_OPTIONS = Object.freeze([
    Object.freeze({ value: 'branca', label: 'Branca' }),
    Object.freeze({ value: 'preta', label: 'Preta' }),
    Object.freeze({ value: 'parda', label: 'Parda' }),
    Object.freeze({ value: 'amarela', label: 'Amarela' }),
    Object.freeze({ value: 'indigena', label: 'Indígena' }),
    Object.freeze({ value: 'prefer_not_to_say', label: 'Prefiro não informar' })
  ]);

  const CONTACT_METHOD_OPTIONS = Object.freeze([
    Object.freeze({ value: 'whatsapp', label: 'WhatsApp' }),
    Object.freeze({ value: 'instagram', label: 'Instagram' }),
    Object.freeze({ value: 'linkedin', label: 'LinkedIn' }),
    Object.freeze({ value: 'facebook', label: 'Facebook' }),
    Object.freeze({ value: 'email_public', label: 'E-mail' })
  ]);

  const COUNTRY_DIAL_OPTIONS = Object.freeze([
    Object.freeze({ iso2: 'BR', name: 'Brasil', dialCode: '55' }),
    Object.freeze({ iso2: 'AR', name: 'Argentina', dialCode: '54' }),
    Object.freeze({ iso2: 'BO', name: 'Bolívia', dialCode: '591' }),
    Object.freeze({ iso2: 'CA', name: 'Canadá', dialCode: '1' }),
    Object.freeze({ iso2: 'CL', name: 'Chile', dialCode: '56' }),
    Object.freeze({ iso2: 'CN', name: 'China', dialCode: '86' }),
    Object.freeze({ iso2: 'CO', name: 'Colômbia', dialCode: '57' }),
    Object.freeze({ iso2: 'DE', name: 'Alemanha', dialCode: '49' }),
    Object.freeze({ iso2: 'EC', name: 'Equador', dialCode: '593' }),
    Object.freeze({ iso2: 'ES', name: 'Espanha', dialCode: '34' }),
    Object.freeze({ iso2: 'FR', name: 'França', dialCode: '33' }),
    Object.freeze({ iso2: 'GB', name: 'Reino Unido', dialCode: '44' }),
    Object.freeze({ iso2: 'IN', name: 'Índia', dialCode: '91' }),
    Object.freeze({ iso2: 'IT', name: 'Itália', dialCode: '39' }),
    Object.freeze({ iso2: 'JP', name: 'Japão', dialCode: '81' }),
    Object.freeze({ iso2: 'KR', name: 'Coreia do Sul', dialCode: '82' }),
    Object.freeze({ iso2: 'MX', name: 'México', dialCode: '52' }),
    Object.freeze({ iso2: 'MZ', name: 'Moçambique', dialCode: '258' }),
    Object.freeze({ iso2: 'NG', name: 'Nigeria', dialCode: '234' }),
    Object.freeze({ iso2: 'PE', name: 'Peru', dialCode: '51' }),
    Object.freeze({ iso2: 'PT', name: 'Portugal', dialCode: '351' }),
    Object.freeze({ iso2: 'PY', name: 'Paraguai', dialCode: '595' }),
    Object.freeze({ iso2: 'US', name: 'Estados Unidos', dialCode: '1' }),
    Object.freeze({ iso2: 'UY', name: 'Uruguai', dialCode: '598' }),
    Object.freeze({ iso2: 'VE', name: 'Venezuela', dialCode: '58' })
  ]);

  const AVATAR_EMOJI_OPTIONS = Object.freeze([
    '🎓', '📚', '💡', '🌱', '✨', '😄', '😎', '🤝',
    '🚲', '🏠', '💻', '🎨', '🧪', '🎧', '☕', '🌻'
  ]);

  const AVATAR_COLOR_OPTIONS = Object.freeze([
    '#FF7C00',
    '#41B5D3',
    '#70E291',
    '#5B6CFF',
    '#F973B7',
    '#FFC857',
    '#8E6FF7',
    '#1F2937'
  ]);

  const SOCIAL_NETWORKS = Object.freeze({
    whatsapp: Object.freeze({ key: 'whatsapp', label: 'WhatsApp', iconClass: 'fab fa-whatsapp', emoji: '💬', canBePrimary: true }),
    instagram: Object.freeze({ key: 'instagram', label: 'Instagram', iconClass: 'fab fa-instagram', emoji: '📸', canBePrimary: true }),
    linkedin: Object.freeze({ key: 'linkedin', label: 'LinkedIn', iconClass: 'fab fa-linkedin', emoji: '💼', canBePrimary: true }),
    email_public: Object.freeze({ key: 'email_public', label: 'E-mail', iconClass: 'fas fa-envelope', emoji: '✉️', canBePrimary: true }),
    lattes: Object.freeze({ key: 'lattes', label: 'Currículo Lattes', iconClass: 'fas fa-graduation-cap', emoji: '🎓', canBePrimary: false }),
    facebook: Object.freeze({ key: 'facebook', label: 'Facebook', iconClass: 'fab fa-facebook', emoji: '📘', canBePrimary: true }),
    x: Object.freeze({ key: 'x', label: 'X', iconClass: 'fab fa-x-twitter', emoji: '𝕏', canBePrimary: false }),
    tiktok: Object.freeze({ key: 'tiktok', label: 'TikTok', iconClass: 'fab fa-tiktok', emoji: '🎵', canBePrimary: false })
  });

  const SOCIAL_ORDER = Object.freeze([
    'whatsapp',
    'instagram',
    'linkedin',
    'email_public',
    'lattes',
    'facebook',
    'x',
    'tiktok'
  ]);

  const OPTION_LABELS = Object.freeze({
    affiliation: buildLabelMap(AFFILIATION_OPTIONS),
    gender_identity: buildLabelMap(GENDER_IDENTITY_OPTIONS),
    race_color: buildLabelMap(RACE_COLOR_OPTIONS),
    contact_primary_method: buildLabelMap(CONTACT_METHOD_OPTIONS)
  });

  function buildLabelMap(options) {
    const map = Object.create(null);
    (Array.isArray(options) ? options : []).forEach((option) => {
      if (!option || !option.value) return;
      map[String(option.value)] = String(option.label || option.value);
    });
    return Object.freeze(map);
  }

  function safeNormalize(value) {
    try {
      return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {
      return String(value || '');
    }
  }

  function normalizeKey(value) {
    return safeNormalize(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function trimText(value, maxLength) {
    const text = String(value == null ? '' : value).trim();
    if (!maxLength || !Number.isFinite(maxLength) || maxLength <= 0) return text;
    return text.slice(0, maxLength);
  }

  function normalizeChoice(value, options) {
    const normalized = normalizeKey(value);
    const allowed = new Set((Array.isArray(options) ? options : []).map((item) => String(item && item.value || '')));
    return allowed.has(normalized) ? normalized : '';
  }

  function ensureObject(value) {
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  }

  function normalizeBoolean(value, fallback) {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return !!fallback;
  }

  function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function stripLeadingHandle(value) {
    return String(value || '').trim().replace(/^@+/, '').replace(/\/+$/, '');
  }

  function clampInteger(value, minimum, maximum, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const rounded = Math.round(numeric);
    return Math.max(minimum, Math.min(maximum, rounded));
  }

  function ensureHttpsUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(raw)) return `https://${raw}`;
    return '';
  }

  function normalizeWhatsAppDigits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function normalizeWhatsappE164(value, defaultCountryCode) {
    const digits = normalizeWhatsAppDigits(value);
    if (!digits) return '';

    const countryCode = normalizeWhatsAppDigits(defaultCountryCode || '55') || '55';
    if (String(value || '').trim().charAt(0) === '+') return `+${digits}`;
    if (digits.startsWith(countryCode)) return `+${digits}`;
    return `+${countryCode}${digits}`;
  }

  function buildWhatsAppE164(countryCode, localNumber) {
    const cc = normalizeWhatsAppDigits(countryCode || '55') || '55';
    const local = normalizeWhatsAppDigits(localNumber || '');
    if (!local) return '';
    return `+${cc}${local}`;
  }

  function formatWhatsAppDisplay(e164Value) {
    const digits = normalizeWhatsAppDigits(e164Value);
    if (!digits) return '';
    if (digits.startsWith('55') && digits.length >= 12) {
      const ddd = digits.slice(2, 4);
      const body = digits.slice(4);
      if (body.length === 9) {
        return `+55 (${ddd}) ${body.slice(0, 5)}-${body.slice(5)}`;
      }
      if (body.length === 8) {
        return `+55 (${ddd}) ${body.slice(0, 4)}-${body.slice(4)}`;
      }
    }
    return `+${digits}`;
  }

  function resolveUrlInput(value, prefixes) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const directUrl = ensureHttpsUrl(raw);
    if (directUrl) return directUrl;

    const normalizedHandle = stripLeadingHandle(raw);
    if (!normalizedHandle) return '';
    const list = Array.isArray(prefixes) ? prefixes : [];
    if (!list.length) return normalizedHandle;
    return `${list[0]}${normalizedHandle}`;
  }

  function extractHandleFromUrl(url) {
    const safeUrl = ensureHttpsUrl(url);
    if (!safeUrl) return '';
    try {
      const parsed = new URL(safeUrl);
      const parts = parsed.pathname.split('/').map((item) => item.trim()).filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    } catch (_) {
      return '';
    }
  }

  function normalizeSocialValue(key, value, options) {
    const socialKey = String(key || '').trim();
    const raw = trimText(value, 280);
    if (!raw) return '';

    if (socialKey === 'whatsapp') {
      return normalizeWhatsappE164(raw, options && options.defaultCountryCode);
    }
    if (socialKey === 'email_public') {
      return normalizeEmail(raw);
    }
    if (socialKey === 'instagram') {
      return resolveUrlInput(raw, ['https://instagram.com/']);
    }
    if (socialKey === 'linkedin') {
      return resolveUrlInput(raw, ['https://www.linkedin.com/in/']);
    }
    if (socialKey === 'facebook') {
      return resolveUrlInput(raw, ['https://facebook.com/']);
    }
    if (socialKey === 'x') {
      return resolveUrlInput(raw, ['https://x.com/']);
    }
    if (socialKey === 'tiktok') {
      const normalized = stripLeadingHandle(raw);
      if (!normalized) return '';
      if (/^https?:\/\//i.test(raw)) return raw;
      return `https://www.tiktok.com/@${normalized}`;
    }
    if (socialKey === 'lattes') {
      if (/^https?:\/\//i.test(raw)) return raw;
      const digits = normalizeWhatsAppDigits(raw);
      if (digits.length >= 8) return `http://lattes.cnpq.br/${digits}`;
      return '';
    }
    return raw;
  }

  function normalizeSocialLinks(input, options) {
    const source = ensureObject(input);
    const normalized = {};
    SOCIAL_ORDER.forEach((key) => {
      const value = normalizeSocialValue(key, source[key], options);
      if (value) normalized[key] = value;
    });
    return normalized;
  }

  function normalizeSocialVisibility(input) {
    const source = ensureObject(input);
    const normalized = {};
    SOCIAL_ORDER.forEach((key) => {
      normalized[key] = normalizeBoolean(source[key], false);
    });
    return normalized;
  }

  function normalizeProfilePatch(patch, options) {
    const input = ensureObject(patch);
    const genderIdentity = normalizeChoice(input.gender_identity, GENDER_IDENTITY_OPTIONS);
    const normalized = {};

    if (Object.prototype.hasOwnProperty.call(input, 'display_name')) {
      normalized.display_name = trimText(input.display_name, 80);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'bio')) {
      normalized.bio = trimText(input.bio, 200);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'avatar_url')) {
      normalized.avatar_url = trimText(input.avatar_url, 500);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'avatar_path')) {
      normalized.avatar_path = trimText(input.avatar_path, 255);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'onboarding_completed_at')) {
      normalized.onboarding_completed_at = input.onboarding_completed_at ? String(input.onboarding_completed_at) : null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'affiliation')) {
      normalized.affiliation = normalizeChoice(input.affiliation, AFFILIATION_OPTIONS) || null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'gender_identity')) {
      normalized.gender_identity = genderIdentity || null;
      normalized.gender_identity_custom = genderIdentity === 'self_described'
        ? trimText(input.gender_identity_custom, 80) || null
        : null;
    } else if (Object.prototype.hasOwnProperty.call(input, 'gender_identity_custom')) {
      normalized.gender_identity_custom = trimText(input.gender_identity_custom, 80) || null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'race_color')) {
      normalized.race_color = normalizeChoice(input.race_color, RACE_COLOR_OPTIONS) || null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'contact_primary_method')) {
      normalized.contact_primary_method = normalizeChoice(input.contact_primary_method, CONTACT_METHOD_OPTIONS) || null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'contact_cta_enabled')) {
      normalized.contact_cta_enabled = normalizeBoolean(input.contact_cta_enabled, true);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'social_links')) {
      normalized.social_links = normalizeSocialLinks(input.social_links, options);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'social_visibility')) {
      normalized.social_visibility = normalizeSocialVisibility(input.social_visibility);
    }

    return normalized;
  }

  function getOptionLabel(kind, value) {
    const map = OPTION_LABELS[kind] || {};
    return map[String(value || '')] || '';
  }

  function formatProfileValue(kind, value, fallback) {
    const label = getOptionLabel(kind, value);
    return label || String(fallback || value || '').trim();
  }

  function buildWhatsAppHref(e164Value, message) {
    const digits = normalizeWhatsAppDigits(e164Value);
    if (!digits) return '';
    const text = String(message || '').trim();
    const suffix = text ? `?text=${encodeURIComponent(text)}` : '';
    return `https://wa.me/${digits}${suffix}`;
  }

  function buildMailtoHref(email, subject, body) {
    const safeEmail = normalizeEmail(email);
    if (!safeEmail) return '';
    const params = [];
    const safeSubject = String(subject || '').trim();
    const safeBody = String(body || '').trim();
    if (safeSubject) params.push(`subject=${encodeURIComponent(safeSubject)}`);
    if (safeBody) params.push(`body=${encodeURIComponent(safeBody)}`);
    return `mailto:${encodeURIComponent(safeEmail)}${params.length ? `?${params.join('&')}` : ''}`;
  }

  function buildContactMessage(postTitle, postUrl) {
    const title = trimText(postTitle, 120) || 'seu anúncio';
    const url = String(postUrl || '').trim();
    return `Oi! Tenho interesse no anúncio "${title}" no KinoCampus.${url ? ` Link: ${url}` : ''}`;
  }

  function formatSocialLink(key, rawValue) {
    const config = SOCIAL_NETWORKS[key];
    if (!config) return null;
    const value = String(rawValue || '').trim();
    if (!value) return null;

    if (key === 'whatsapp') {
      return {
        key,
        label: config.label,
        iconClass: config.iconClass,
        emoji: config.emoji,
        href: buildWhatsAppHref(value, ''),
        display: formatWhatsAppDisplay(value),
        handle: formatWhatsAppDisplay(value)
      };
    }

    if (key === 'email_public') {
      return {
        key,
        label: config.label,
        iconClass: config.iconClass,
        emoji: config.emoji,
        href: buildMailtoHref(value, '', ''),
        display: value,
        handle: value
      };
    }

    if (key === 'lattes') {
      return {
        key,
        label: config.label,
        iconClass: config.iconClass,
        emoji: config.emoji,
        href: value,
        display: 'Lattes',
        handle: extractHandleFromUrl(value) || 'Lattes'
      };
    }

    const url = ensureHttpsUrl(value);
    const handle = extractHandleFromUrl(url) || stripLeadingHandle(value);
    let display = config.label;

    if (key === 'instagram') display = handle ? `@${handle}` : 'Instagram';
    else if (key === 'facebook') display = handle ? `@${handle}` : 'Facebook';
    else if (key === 'linkedin') display = handle ? `@${handle}` : 'LinkedIn';
    else if (key === 'x') display = handle ? `@${handle}` : 'X';
    else if (key === 'tiktok') display = handle ? (handle.charAt(0) === '@' ? handle : `@${handle}`) : 'TikTok';

    return {
      key,
      label: config.label,
      iconClass: config.iconClass,
      emoji: config.emoji,
      href: url || value,
      display,
      handle: display
    };
  }

  function getVisibleSocialLinks(profile, options) {
    const source = ensureObject(profile);
    const links = normalizeSocialLinks(source.social_links, options);
    const visibility = normalizeSocialVisibility(source.social_visibility);
    const includeHidden = !!(options && options.includeHidden);

    return SOCIAL_ORDER
      .map((key) => {
        const entry = formatSocialLink(key, links[key]);
        if (!entry) return null;
        const visible = visibility[key] === true;
        if (!includeHidden && !visible) return null;
        return Object.freeze(Object.assign({}, entry, {
          visible,
          isPrimary: String(source.contact_primary_method || '').trim() === key
        }));
      })
      .filter(Boolean);
  }

  function getOnboardingMissingFields(profile) {
    const source = ensureObject(profile);
    const missing = [];
    if (!trimText(source.display_name, 80)) missing.push('display_name');
    if (!normalizeChoice(source.affiliation, AFFILIATION_OPTIONS)) missing.push('affiliation');
    if (!normalizeChoice(source.contact_primary_method, CONTACT_METHOD_OPTIONS)) missing.push('contact_primary_method');
    return missing;
  }

  function isOnboardingComplete(profile) {
    const source = ensureObject(profile);
    return getOnboardingMissingFields(source).length === 0 && !!source.onboarding_completed_at;
  }

  function buildOnboardingProfilePatch(input, options) {
    const normalized = normalizeProfilePatch(input, options);
    const shouldMarkCompleted = !options || options.markCompleted !== false;
    if (shouldMarkCompleted && getOnboardingMissingFields(normalized).length === 0) {
      normalized.onboarding_completed_at = new Date().toISOString();
    }
    return normalized;
  }

  function hashSeed(value) {
    const source = String(value || '');
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) - hash) + source.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function getSuggestedAvatarUrls(seedBase, options) {
    const base = trimText(seedBase, 120) || 'kinocampus';
    const opts = (options && typeof options === 'object') ? options : {};
    const batch = clampInteger(opts.batch, 0, 9999, 0);
    const size = clampInteger(opts.size, 1, 12, 8);
    const flavors = ['campus', 'ufg', 'cerrado', 'ipê', 'sol', 'lua', 'goiás', 'ponte', 'sombra', 'vento', 'brisa', 'vereda'];
    const hash = hashSeed(base);
    return Array.from({ length: size }, function (_, index) {
      const flavor = flavors[(hash + batch + index) % flavors.length];
      const variant = (hash + (batch * size) + index) % 97;
      const seed = `${base}-${flavor}-${batch}-${index}-${variant}`;
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
    });
  }

  function isAllowedEmojiAvatar(value) {
    return AVATAR_EMOJI_OPTIONS.indexOf(String(value || '').trim()) !== -1;
  }

  function isAllowedAvatarColor(value) {
    return AVATAR_COLOR_OPTIONS.indexOf(String(value || '').trim().toUpperCase()) !== -1;
  }

  function buildEmojiAvatarDataUrl(emoji, color) {
    const chosenEmoji = isAllowedEmojiAvatar(emoji) ? String(emoji).trim() : AVATAR_EMOJI_OPTIONS[0];
    const chosenColor = isAllowedAvatarColor(color) ? String(color).trim().toUpperCase() : AVATAR_COLOR_OPTIONS[0];
    const textColor = chosenColor === '#FFC857' ? '#1F2937' : '#FFFFFF';
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="Avatar emoji KinoCampus">',
      `<rect width="160" height="160" rx="48" fill="${chosenColor}"/>`,
      '<circle cx="80" cy="80" r="56" fill="rgba(255,255,255,0.12)"/>',
      `<text x="80" y="98" text-anchor="middle" font-size="72" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" fill="${textColor}">${chosenEmoji}</text>`,
      '</svg>'
    ].join('');
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function buildDefaultAvatarDataUrl(label) {
    const safeLabel = trimText(label, 48) || 'Avatar KinoCampus';
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="' + safeLabel.replace(/"/g, '&quot;') + '">',
      '  <defs>',
      '    <linearGradient id="kcAvatarBg" x1="0%" y1="0%" x2="100%" y2="100%">',
      '      <stop offset="0%" stop-color="#FF8A1F" />',
      '      <stop offset="100%" stop-color="#FF6B00" />',
      '    </linearGradient>',
      '  </defs>',
      '  <rect width="160" height="160" rx="44" fill="url(#kcAvatarBg)" />',
      '  <circle cx="80" cy="58" r="28" fill="#FFF3E8" opacity="0.98" />',
      '  <path d="M40 136c4-27 20-42 40-42s36 15 40 42" fill="#FFF3E8" opacity="0.98" />',
      '</svg>'
    ].join('');
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function normalizeNextPath(value, fallback) {
    const raw = String(value || '').trim();
    if (!raw) return String(fallback || '/index.html');
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        return `${parsed.pathname || '/index.html'}${parsed.search || ''}${parsed.hash || ''}` || String(fallback || '/index.html');
      } catch (_) {
        return String(fallback || '/index.html');
      }
    }
    if (raw.charAt(0) === '/') return raw;
    return `/${raw.replace(/^\/+/, '')}`;
  }

  function buildContactAction(params) {
    const source = ensureObject(params);
    const profile = ensureObject(source.profile);
    const postUrl = String(source.postUrl || '').trim();
    const postTitle = trimText(source.postTitle, 120);
    const viewerAuthenticated = source.viewerAuthenticated === true;
    const viewProfileHref = String(source.viewProfileHref || '').trim();

    const message = buildContactMessage(postTitle, postUrl);
    const socialLinks = normalizeSocialLinks(profile.social_links, source);
    const primary = normalizeChoice(profile.contact_primary_method, CONTACT_METHOD_OPTIONS);
    const enabled = profile.contact_cta_enabled !== false;

    if (!enabled) {
      return Object.freeze({
        type: 'view_profile',
        label: 'Ver perfil',
        href: viewProfileHref || ''
      });
    }

    if (!viewerAuthenticated) {
      return Object.freeze({
        type: 'login_required',
        label: 'Entrar para contatar'
      });
    }

    const candidates = [primary].concat(CONTACT_METHOD_OPTIONS.map((item) => item.value).filter((value) => value !== primary));
    for (let index = 0; index < candidates.length; index += 1) {
      const method = candidates[index];
      const value = socialLinks[method];
      if (!value) continue;

      if (method === 'whatsapp') {
        return Object.freeze({
          type: 'whatsapp',
          label: 'Falar no WhatsApp',
          href: buildWhatsAppHref(value, message),
          target: '_blank',
          rel: 'noopener noreferrer'
        });
      }

      if (method === 'email_public') {
        return Object.freeze({
          type: 'email_public',
          label: 'Enviar e-mail',
          href: buildMailtoHref(value, `Interesse no anúncio: ${postTitle || 'KinoCampus'}`, message)
        });
      }

      if (method === 'instagram') {
        return Object.freeze({
          type: 'instagram',
          label: 'Abrir Instagram',
          href: value,
          target: '_blank',
          rel: 'noopener noreferrer'
        });
      }

      if (method === 'linkedin') {
        return Object.freeze({
          type: 'linkedin',
          label: 'Abrir LinkedIn',
          href: value,
          target: '_blank',
          rel: 'noopener noreferrer'
        });
      }

      if (method === 'facebook') {
        return Object.freeze({
          type: 'facebook',
          label: 'Abrir Facebook',
          href: value,
          target: '_blank',
          rel: 'noopener noreferrer'
        });
      }
    }

    return Object.freeze({
      type: viewProfileHref ? 'view_profile' : 'unavailable',
      label: viewProfileHref ? 'Ver perfil' : 'Contato indisponível',
      href: viewProfileHref || ''
    });
  }

  return Object.freeze({
    OWNER_PROFILE_SELECT_FIELDS,
    PUBLIC_PROFILE_SELECT_FIELDS,
    AFFILIATION_OPTIONS,
    GENDER_IDENTITY_OPTIONS,
    RACE_COLOR_OPTIONS,
    CONTACT_METHOD_OPTIONS,
    COUNTRY_DIAL_OPTIONS,
    AVATAR_EMOJI_OPTIONS,
    AVATAR_COLOR_OPTIONS,
    SOCIAL_NETWORKS,
    SOCIAL_ORDER,
    normalizeKey,
    trimText,
    normalizeEmail,
    normalizeWhatsappE164,
    buildWhatsAppE164,
    formatWhatsAppDisplay,
    normalizeSocialLinks,
    normalizeSocialVisibility,
    normalizeProfilePatch,
    formatProfileValue,
    formatSocialLink,
    getVisibleSocialLinks,
    getOnboardingMissingFields,
    isOnboardingComplete,
    buildOnboardingProfilePatch,
    getSuggestedAvatarUrls,
    buildEmojiAvatarDataUrl,
    buildDefaultAvatarDataUrl,
    normalizeNextPath,
    buildContactMessage,
    buildContactAction
  });
}));
