'use strict';

const MAX_IMAGE_COUNT = 6;

const { canonicalCategoryIdentity, toPostgrestInsert } = require('./mapper');
const { sha256, slugify } = require('./utils');

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const TEMPORARY_IMAGE_HOST_RE = /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$|(^|\.)instagram\.com$|(^|\.)cdn-telegram\.org$|(^|\.)telegram\.org$/i;

function isTemporaryImageUrl(value) {
  const text = String(value || '').trim();
  if (!text || !/^https?:\/\//i.test(text)) return false;
  try {
    return TEMPORARY_IMAGE_HOST_RE.test(new URL(text).hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}
function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function imageUrlFromCandidate(value) {
  const raw = (() => {
    if (value && typeof value === 'object') {
      return value.url
        || value.publicUrl
        || value.public_url
        || value.image_url
        || value.imageUrl
        || value.cover_url
        || value.coverUrl
        || value.href
        || value.source
        || value.src
        || '';
    }
    return value;
  })();
  try {
    const url = new URL(String(raw || '').trim());
    if (!/^https?:$/.test(url.protocol)) return '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function normalizeImageValues(values) {
  return Array.from(new Set((values || []).map(imageUrlFromCandidate).filter(Boolean)))
    .slice(0, MAX_IMAGE_COUNT);
}

function normalizeImages(payload) {
  if (Array.isArray(payload)) return normalizeImageValues(payload);
  if (!payload || typeof payload !== 'object') return normalizeImageValues([payload]);
  const metadata = payload && payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  const values = [
    ...(Array.isArray(payload.imagens) ? payload.imagens : []),
    ...(Array.isArray(payload.images) ? payload.images : []),
    payload.image_url,
    payload.imageUrl,
    payload.cover_url,
    payload.coverUrl,
    metadata.image_url,
    metadata.imageUrl,
    metadata.cover_url,
    metadata.coverUrl,
  ];
  return normalizeImageValues(values);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeMetadata(base, patch) {
  const result = { ...(isPlainObject(base) ? base : {}) };
  if (!isPlainObject(patch)) return result;
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) return;
    // Block prototype-pollution keys before recursive merge (S41 / VPS archive).
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeMetadata(result[key], value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function metadataContains(actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((value, index) => metadataContains(actual[index], value));
  }
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) return false;
    return Object.entries(expected).every(([key, value]) => metadataContains(actual[key], value));
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function stripUndefined(row) {
  return Object.fromEntries(Object.entries(row || {}).filter(([, value]) => value !== undefined));
}

function encodeStoragePath(path) {
  return String(path || '').split('/').map((part) => encodeURIComponent(part)).join('/');
}

function inferImageContentType(response, url) {
  const header = response && response.headers && typeof response.headers.get === 'function'
    ? String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    : '';
  if (ALLOWED_IMAGE_TYPES.has(header)) return header;
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch (_) { return ''; } })();
  if (/\.jpe?g$/.test(path)) return 'image/jpeg';
  if (/\.png$/.test(path)) return 'image/png';
  if (/\.webp$/.test(path)) return 'image/webp';
  if (/\.gif$/.test(path)) return 'image/gif';
  return '';
}

function isMissingImageUrlColumn(text) {
  const lower = String(text || '').toLowerCase();
  return lower.includes('image_url') && (
    lower.includes('column') ||
    lower.includes('schema cache') ||
    lower.includes('could not find')
  );
}

function withoutImageUrl(row) {
  const copy = { ...(row || {}) };
  delete copy.image_url;
  return copy;
}

function withCoverImage(row, imageUrl) {
  const next = { ...(row || {}) };
  const cover = imageUrlFromCandidate(imageUrl);
  next.image_url = cover || null;
  next.metadata = {
    ...((row && row.metadata && typeof row.metadata === 'object') ? row.metadata : {}),
    image_url: cover,
    cover_url: cover,
  };
  return next;
}

class SupabasePublisher {
  constructor(config) {
    this.url = required('CADU_SUPABASE_URL', config.supabaseUrl).replace(/\/+$/, '');
    this.anonKey = required('CADU_SUPABASE_ANON_KEY', config.supabaseAnonKey);
    this.email = required('CADU_KINO_EMAIL', config.kinoEmail);
    this.password = required('CADU_KINO_PASSWORD', config.kinoPassword);
    this.storageBucket = config.supabaseStorageBucket || 'kino-media';
    this.maxImageBytes = Number(config.maxImageBytes || 6 * 1024 * 1024);
    this.userAgent = config.userAgent || 'CaduKinoCampusBot/1.0 (+contato@kinocampus.com.br)';
    this.session = null;
    this.postEditLocks = new Map();
  }

  authHeaders(token) {
    return {
      apikey: this.anonKey,
      authorization: `Bearer ${token || this.session.access_token}`,
    };
  }

  headers(token) {
    return {
      ...this.authHeaders(token),
      'content-type': 'application/json',
    };
  }

  async signIn() {
    const response = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: this.anonKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase Auth failed: HTTP ${response.status} ${text.slice(0, 300)}`);
    this.session = JSON.parse(text);
    if (!this.session.access_token || !this.session.user || !this.session.user.id) {
      throw new Error('Supabase Auth did not return a valid session.');
    }
    await this.ensureProfile();
    return this.session;
  }

  async ensureProfile() {
    const payload = {
      id: this.session.user.id,
      full_name: 'Cadu Bot',
      display_name: 'Cadu Bot',
      profile_public: true,
    };
    const response = await fetch(`${this.url}/rest/v1/profiles?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Profile sync failed: HTTP ${response.status} ${text.slice(0, 300)}`);
    }
  }

  async checkPostLimit(moduleName) {
    const response = await fetch(`${this.url}/rest/v1/rpc/kc_check_post_limit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_user_id: this.session.user.id, p_module: moduleName || null }),
    });
    if (!response.ok) return { ok: true, skipped: true };
    const data = await response.json();
    return data || { ok: true };
  }

  async checkPostFloodLimit(moduleName) {
    const response = await fetch(`${this.url}/rest/v1/rpc/kc_check_post_flood_limit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_user_id: this.session.user.id, p_module: moduleName || null }),
    });
    if (!response.ok) return { ok: true, skipped: true };
    const data = await response.json();
    return data || { ok: true };
  }

  formatFloodLimitMessage(check) {
    const limit = Number(check && (check.limit || check.max_posts)) || 3;
    const count = Number(check && check.count) || 0;
    const windowMinutes = Number(check && check.window_minutes) || 60;
    return `Limite de ${limit} publicacoes a cada ${windowMinutes} minutos atingido (${count}/${limit}).`;
  }

  async createPost(payload) {
    if (!this.session) await this.signIn();
    const row = toPostgrestInsert(payload, this.session.user.id);
    const floodLimit = await this.checkPostFloodLimit(row.module);
    if (floodLimit && floodLimit.ok === false) {
      return {
        ok: false,
        code: 'FLOOD_LIMIT',
        message: this.formatFloodLimitMessage(floodLimit),
        limit: floodLimit,
      };
    }
    const limit = await this.checkPostLimit(row.module);
    if (limit && limit.ok === false) {
      return { ok: false, code: 'POST_LIMIT_REACHED', limit };
    }

    let response = await fetch(`${this.url}/rest/v1/posts`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    let text = await response.text();
    if (!response.ok && isMissingImageUrlColumn(text)) {
      response = await fetch(`${this.url}/rest/v1/posts`, {
        method: 'POST',
        headers: {
          ...this.headers(),
          prefer: 'return=representation',
        },
        body: JSON.stringify(withoutImageUrl(row)),
      });
      text = await response.text();
    }
    if (!response.ok) {
      if (text.includes('flood_limit_exceeded')) {
        return { ok: false, code: 'FLOOD_LIMIT', message: 'Limite de publicacoes por janela atingido.' };
      }
      throw new Error(`Post insert failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    const data = JSON.parse(text);
    const post = Array.isArray(data) ? data[0] : data;
    const prepared = post && post.id ? await this.prepareImagesForPost(post.id, normalizeImages(payload)) : { images: [], uploads: [] };
    if (post && post.id && prepared.images[0]) {
      await this.updatePostCoverImage(post.id, row, prepared.images[0]);
      post.image_url = prepared.images[0];
      post.metadata = withCoverImage(row, prepared.images[0]).metadata;
    } else if (post && post.id && isTemporaryImageUrl(row.image_url)) {
      // O upload da capa falhou e a URL candidata e temporaria (Instagram/Facebook/
      // Telegram CDN): ela expiraria e quebraria o og:image e o feed. Em vez de
      // publicar com URL temporaria, limpa a capa - o SSR usa o fallback generico
      // ate a reconciliacao persistir uma imagem real no storage.
      await this.updatePostCoverImage(post.id, row, '');
      post.image_url = '';
      post.metadata = withCoverImage(row, '').metadata;
    }
    const media = post && post.id ? await this.insertPostMedia(post.id, prepared.images) : { ok: true, count: 0 };
    return {
      ok: true,
      post,
      media: { ...media, uploads: prepared.uploads },
      pending: post && post.status === 'pending',
      pendingReason: post && post.moderation_reason ? post.moderation_reason : '',
    };
  }

  async downloadRemoteImage(url) {
    const response = await fetch(url, {
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8,*/*;q=0.4',
        'user-agent': this.userAgent,
      },
    });
    if (!response.ok) throw new Error(`image_download_http_${response.status}`);
    const contentLength = Number(response.headers && response.headers.get && response.headers.get('content-length')) || 0;
    if (contentLength > this.maxImageBytes) throw new Error('image_too_large');
    const contentType = inferImageContentType(response, url);
    if (!contentType) throw new Error('unsupported_image_type');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > this.maxImageBytes) throw new Error('image_too_large');
    return {
      buffer,
      contentType,
      ext: IMAGE_EXTENSIONS[contentType] || 'jpg',
    };
  }

  async uploadImageToStorage(postId, url, index) {
    const sourceUrl = imageUrlFromCandidate(url);
    if (!sourceUrl) throw new Error('invalid_image_url');
    const image = await this.downloadRemoteImage(sourceUrl);
    const hash = sha256(sourceUrl).slice(0, 12);
    const safePostId = slugify(postId, 80) || 'post';
    const objectPath = `post-media/${this.session.user.id}/${safePostId}/cadu-${index + 1}-${hash}.${image.ext}`;
    const encodedPath = encodeStoragePath(objectPath);
    const response = await fetch(`${this.url}/storage/v1/object/${encodeURIComponent(this.storageBucket)}/${encodedPath}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'content-type': image.contentType,
        'cache-control': '31536000',
        'x-upsert': 'false',
      },
      body: image.buffer,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`storage_upload_http_${response.status}:${text.slice(0, 200)}`);
    return `${this.url}/storage/v1/object/public/${encodeURIComponent(this.storageBucket)}/${encodedPath}`;
  }

  async prepareImagesForPost(postId, images, options = {}) {
    const allowExternalFallback = options.allowExternalFallback !== false;
    const uploads = [];
    const out = [];
    const candidates = normalizeImageValues(images);
    for (let index = 0; index < candidates.length; index += 1) {
      const originalUrl = candidates[index];
      try {
        const storedUrl = await this.uploadImageToStorage(postId, originalUrl, index);
        uploads.push({ ok: true, source: originalUrl, source_url: imageUrlFromCandidate(originalUrl), url: storedUrl });
        out.push(storedUrl);
      } catch (error) {
        const fallbackUrl = imageUrlFromCandidate(originalUrl);
        uploads.push({ ok: false, source: originalUrl, source_url: fallbackUrl, error: error.message });
        // Fallback externo e aceitavel para URLs permanentes (ex.: cercomp UFG),
        // mas nunca para CDNs temporarias de redes sociais (expira e quebra o
        // og:image/feed). Se o upload falhou e a candidata e temporaria, o post
        // fica sem capa ate a reconciliacao persistir uma imagem real.
        if (allowExternalFallback && fallbackUrl && !isTemporaryImageUrl(fallbackUrl)) out.push(fallbackUrl);
      }
    }
    return { images: out, uploads };
  }

  async updatePostCoverImage(postId, row, imageUrl) {
    const patch = withCoverImage(row, imageUrl);
    const response = await fetch(`${this.url}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      headers: {
        ...this.headers(),
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        image_url: patch.image_url,
        metadata: patch.metadata,
      }),
    });
    if (response.ok) return { ok: true };

    const text = await response.text();
    if (isMissingImageUrlColumn(text)) {
      const compatResponse = await fetch(`${this.url}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        headers: {
          ...this.headers(),
          prefer: 'return=minimal',
        },
        body: JSON.stringify({ metadata: patch.metadata }),
      });
      if (compatResponse.ok) return { ok: true, compat: true };
      const compatText = await compatResponse.text();
      return { ok: false, error: compatText.slice(0, 300) };
    }

    return { ok: false, error: text.slice(0, 300) };
  }

  async insertPostMedia(postId, images) {
    if (!Array.isArray(images) || !images.length) return { ok: true, count: 0 };
    const rows = images.map((url, index) => ({
      post_id: postId,
      url,
      is_cover: index === 0,
      sort_order: index,
    }));
    const response = await fetch(`${this.url}/rest/v1/post_media`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (response.ok) return { ok: true, count: rows.length };

    const text = await response.text();
    if (!text.toLowerCase().includes('sort_order')) {
      return { ok: false, count: 0, error: text.slice(0, 300) };
    }

    const compatRows = rows.map(({ sort_order, ...rest }) => rest);
    const compatResponse = await fetch(`${this.url}/rest/v1/post_media`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        prefer: 'return=minimal',
      },
      body: JSON.stringify(compatRows),
    });
    if (compatResponse.ok) return { ok: true, count: compatRows.length };
    const compatText = await compatResponse.text();
    return { ok: false, count: 0, error: compatText.slice(0, 300) };
  }

  async replacePostMedia(postId, images) {
    const deleteResponse = await fetch(`${this.url}/rest/v1/post_media?post_id=eq.${encodeURIComponent(postId)}`, {
      method: 'DELETE',
      headers: {
        ...this.headers(),
        prefer: 'return=minimal',
      },
    });
    if (!deleteResponse.ok) {
      const text = await deleteResponse.text();
      return { ok: false, count: 0, error: text.slice(0, 300) };
    }
    return this.insertPostMedia(postId, images);
  }

  async getPostMedia(postId) {
    const response = await fetch(`${this.url}/rest/v1/post_media?post_id=eq.${encodeURIComponent(postId)}&select=*&order=sort_order.asc`, {
      method: 'GET',
      headers: {
        ...this.headers(),
        accept: 'application/json',
      },
    });
    const text = await response.text();
    if (!response.ok) return [];
    try {
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  async getPost(postId) {
    if (!this.session) await this.signIn();
    const response = await fetch(`${this.url}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}&select=*`, {
      method: 'GET',
      headers: {
        ...this.headers(),
        accept: 'application/json',
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Post fetch failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    const post = Array.isArray(data) ? data[0] : data;
    return post || null;
  }

  buildSafePatch(current, fields) {
    const input = fields && typeof fields === 'object' ? fields : {};
    const patch = {};
    const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
    const pick = (...keys) => {
      for (const key of keys) {
        if (has(key)) return input[key];
      }
      return undefined;
    };

    const title = pick('title', 'titulo');
    const description = pick('description', 'descricao');
    const price = pick('price', 'preco');
    const location = pick('location', 'localizacao');
    const moduleName = pick('module', 'modulo');
    const category = pick('category', 'categoriaKey', 'categoryKey', 'categoria');
    const visibility = pick('visibility');
    const status = pick('status');
    const expiresAt = pick('expires_at', 'expiresAt');
    const moderationReason = pick('moderation_reason', 'moderationReason');
    const taxonomySurfaceKeys = [
      'category',
      'categoryKey',
      'categoriaKey',
      'categoryLabel',
      'categoria',
      'categoriaLabel',
    ];
    const nestedTaxonomyTouched = isPlainObject(input.metadata)
      && taxonomySurfaceKeys.some((key) => Object.prototype.hasOwnProperty.call(input.metadata, key));
    const topLevelTaxonomyTouched = taxonomySurfaceKeys.some((key) => has(key));

    if (title !== undefined) patch.title = String(title || '').trim();
    if (description !== undefined) patch.description = String(description || '').trim();
    if (price !== undefined) patch.price = price == null ? null : Number(price);
    if (location !== undefined) patch.location = String(location || '').trim();
    if (moduleName !== undefined) patch.module = String(moduleName || '').trim();
    if (category !== undefined) patch.category = String(category || '').trim();
    if (visibility !== undefined) patch.visibility = String(visibility || '').trim() || 'public';
    if (status !== undefined) patch.status = String(status || '').trim();
    if (expiresAt !== undefined) patch.expires_at = expiresAt || null;
    if (moderationReason !== undefined) patch.moderation_reason = moderationReason || null;

    const candidateImages = normalizeImages(input);
    if (candidateImages[0]) patch.image_url = candidateImages[0];

    const metadataPatch = {};
    if (isPlainObject(input.metadata)) Object.assign(metadataPatch, input.metadata);
    [
      'contato',
      'link',
      'link_as_cta',
      'actionLabel',
      'actionKey',
      'gratuito',
      'area',
      'areaLabel',
      'areaKey',
      'modalidadeTrabalho',
      'remuneracao',
      'tags',
      'tagKeys',
      'category',
      'categoria',
      'categoriaKey',
      'categoryKey',
      'categoryLabel',
      'categoriaLabel',
      'subcategory',
      'subcategoryKey',
      'subcategoryLabel',
      'data_evento',
      'hora_evento',
      'source_url',
      'source_host',
      'source_unit',
      'source_id',
      'confidence_score',
      'deadline_date',
      'event_date_detected',
      'temporal_status',
      'cadu_run_id',
    ].forEach((key) => {
      if (has(key)) metadataPatch[key] = input[key];
    });
    if (candidateImages[0]) {
      metadataPatch.image_url = candidateImages[0];
      metadataPatch.cover_url = candidateImages[0];
    }
    patch.metadata = mergeMetadata(current && current.metadata, metadataPatch);

    const effectiveModule = patch.module !== undefined ? patch.module : (current && current.module);
    const effectiveCategory = patch.category !== undefined ? patch.category : (current && current.category);
    const taxonomyChanged = moduleName !== undefined
      || category !== undefined
      || nestedTaxonomyTouched
      || topLevelTaxonomyTouched;
    let categoryIdentity = null;
    try {
      categoryIdentity = canonicalCategoryIdentity(effectiveModule, effectiveCategory);
    } catch (error) {
      // Preserve unrelated edits to historical legacy rows, but never allow an
      // edit to introduce or move to an invalid module/category pair.
      if (taxonomyChanged) throw error;
    }
    if (categoryIdentity) {
      if (moduleName !== undefined || (current && current.module) !== categoryIdentity.module) {
        patch.module = categoryIdentity.module;
      }
      if (category !== undefined || (current && current.category) !== categoryIdentity.category) {
        patch.category = categoryIdentity.category;
      }
      Object.assign(patch.metadata, categoryIdentity.metadata);
    }
    return stripUndefined(patch);
  }

  async patchPost(postId, row) {
    let response = await fetch(`${this.url}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      headers: {
        ...this.headers(),
        prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    let text = await response.text();
    if (!response.ok && isMissingImageUrlColumn(text)) {
      response = await fetch(`${this.url}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        headers: {
          ...this.headers(),
          prefer: 'return=representation',
        },
        body: JSON.stringify(withoutImageUrl(row)),
      });
      text = await response.text();
    }
    if (!response.ok) {
      throw new Error(`Post update failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    const data = text ? JSON.parse(text) : null;
    const post = Array.isArray(data) ? data[0] : data;
    if (post && post.id) return post;
    return this.getPost(postId);
  }

  async withPostEditLock(postId, task) {
    const key = String(postId || '').trim();
    const previous = this.postEditLocks.get(key) || Promise.resolve();
    let release;
    const queued = previous.catch(() => {}).then(() => new Promise((resolve) => { release = resolve; }));
    this.postEditLocks.set(key, queued);
    await previous.catch(() => {});
    try {
      return await task();
    } finally {
      if (typeof release === 'function') release();
      if (this.postEditLocks.get(key) === queued) this.postEditLocks.delete(key);
    }
  }

  validatePostPatch(post, row, changedFields = {}) {
    const errors = [];
    const checkScalar = (key) => {
      if (!hasOwn(row, key)) return;
      const expected = row[key] == null ? null : String(row[key]);
      const actual = post && post[key] == null ? null : String(post && post[key]);
      if (actual !== expected) errors.push(`mismatch_${key}`);
    };
    ['title', 'description', 'location', 'module', 'category', 'status', 'visibility', 'image_url'].forEach(checkScalar);
    if (hasOwn(row, 'moderation_reason')) {
      const expected = row.moderation_reason == null ? null : String(row.moderation_reason);
      const actual = post && post.moderation_reason == null ? null : String(post && post.moderation_reason);
      if (actual !== expected) errors.push('mismatch_moderation_reason');
    }

    const metadata = isPlainObject(post && post.metadata) ? post.metadata : {};
    Object.entries(changedFields).forEach(([key, expected]) => {
      const actual = metadata[key];
      if (!metadataContains(actual, expected)) errors.push(`mismatch_metadata_${key}`);
    });
    if (hasOwn(row, 'image_url') && row.image_url) {
      if (metadata.image_url !== row.image_url) errors.push('mismatch_metadata_image_url');
      if (metadata.cover_url !== row.image_url) errors.push('mismatch_metadata_cover_url');
    }
    return {
      ok: errors.length === 0,
      errors,
      post,
    };
  }

  async safeUpdatePost(postId, fields, options = {}) {
    return this.caduEditPost(postId, fields, options);
  }

  async caduEditPost(postId, fields, options = {}) {
    if (!this.session) await this.signIn();
    return this.withPostEditLock(postId, async () => {
      const current = await this.getPost(postId);
      if (!current) throw new Error(`Post not found: ${postId}`);

      const imageCandidates = normalizeImages(fields);
      const allowExternalFallback = options.allowExternalImageFallback !== false;
      const row = this.buildSafePatch(current, fields);
      const changedMetadata = isPlainObject(fields && fields.metadata) ? fields.metadata : {};
      let prepared = { images: [], uploads: [] };
      let previousMedia = [];

      if (imageCandidates.length) {
        previousMedia = await this.getPostMedia(postId);
        prepared = await this.prepareImagesForPost(postId, imageCandidates, { allowExternalFallback });
        if (!prepared.images[0]) {
          return {
            ok: false,
            code: 'IMAGE_UPLOAD_FAILED',
            message: allowExternalFallback
              ? 'Nao foi possivel preparar uma imagem valida para o post.'
              : 'Upload da imagem falhou e fallback externo esta desativado.',
            post: current,
            media: { ok: false, count: 0, uploads: prepared.uploads },
          };
        }
        const coverPatch = withCoverImage(row, prepared.images[0]);
        row.image_url = coverPatch.image_url;
        row.metadata = {
          ...coverPatch.metadata,
          gallery_image_urls: prepared.images.slice(),
        };
      }

      const post = await this.patchPost(postId, row);
      let media = { ok: true, count: 0, uploads: prepared.uploads, skipped: true };

      if (imageCandidates.length) {
        media = await this.replacePostMedia(postId, prepared.images);
        if (!media.ok) {
          await this.patchPost(postId, {
            image_url: current.image_url || null,
            metadata: isPlainObject(current.metadata) ? current.metadata : {},
          }).catch(() => {});
          const previousUrls = previousMedia.map((item) => item && item.url).filter(Boolean);
          await this.replacePostMedia(postId, previousUrls).catch(() => {});
          return {
            ok: false,
            code: 'POST_MEDIA_SYNC_FAILED',
            message: 'A imagem foi preparada, mas a sincronizacao de post_media falhou. O post foi restaurado para a capa anterior quando possivel.',
            post: current,
            media: { ...media, uploads: prepared.uploads },
          };
        }
      }

      const fresh = await this.getPost(postId);
      const expectedMetadata = {
        ...changedMetadata,
      };
      if (row.image_url) {
        expectedMetadata.image_url = row.image_url;
        expectedMetadata.cover_url = row.image_url;
      }
      if (imageCandidates.length) {
        expectedMetadata.gallery_image_urls = prepared.images.slice();
      }
      const validation = this.validatePostPatch(fresh, row, expectedMetadata);
      if (!validation.ok) {
        return {
          ok: false,
          code: 'POST_VALIDATE_FAILED',
          message: 'O post foi salvo, mas a validacao posterior encontrou divergencias.',
          post: validation.post || post,
          validation,
          media: { ...media, uploads: prepared.uploads },
        };
      }
      return {
        ok: true,
        post: fresh || post,
        validation,
        media: { ...media, uploads: prepared.uploads },
      };
    });
  }

  async mergeMetadata(postId, changes, options = {}) {
    return this.caduEditPost(postId, { metadata: changes || {} }, options);
  }

  async updatePost(postId, payload) {
    const row = toPostgrestInsert(payload, this.session && this.session.user ? this.session.user.id : '');
    delete row.author_id;
    return this.safeUpdatePost(postId, row);
  }

  async publishPost(postId, options = {}) {
    return this.safeUpdatePost(postId, {
      ...(options && typeof options === 'object' ? options : {}),
      status: 'published',
      moderation_reason: null,
      metadata: {
        ...((options && options.metadata && typeof options.metadata === 'object') ? options.metadata : {}),
        published_by_cadu: true,
        published_by_cadu_at: new Date().toISOString(),
      },
    });
  }
}

module.exports = {
  encodeStoragePath,
  imageUrlFromCandidate,
  inferImageContentType,
  isMissingImageUrlColumn,
  mergeMetadata,
  normalizeImages,
  SupabasePublisher,
};
