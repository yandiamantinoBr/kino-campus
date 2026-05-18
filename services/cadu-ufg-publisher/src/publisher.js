'use strict';

const { toPostgrestInsert } = require('./mapper');
const { sha256, slugify } = require('./utils');

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizeImages(payload) {
  const values = Array.isArray(payload.imagens) ? payload.imagens : (Array.isArray(payload.images) ? payload.images : []);
  return values.map((value) => {
    try {
      const url = new URL(String(value || '').trim());
      if (!/^https?:$/.test(url.protocol)) return '';
      return url.toString();
    } catch (_) {
      return '';
    }
  }).filter(Boolean).slice(0, 5);
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

  async createPost(payload) {
    if (!this.session) await this.signIn();
    const row = toPostgrestInsert(payload, this.session.user.id);
    const limit = await this.checkPostLimit(row.module);
    if (limit && limit.ok === false) {
      return { ok: false, code: 'POST_LIMIT_REACHED', limit };
    }

    const response = await fetch(`${this.url}/rest/v1/posts`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    const text = await response.text();
    if (!response.ok) {
      if (text.includes('flood_limit_exceeded')) {
        return { ok: false, code: 'FLOOD_LIMIT', message: 'Limite de 3 publicacoes por hora atingido.' };
      }
      throw new Error(`Post insert failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    const data = JSON.parse(text);
    const post = Array.isArray(data) ? data[0] : data;
    const prepared = post && post.id ? await this.prepareImagesForPost(post.id, normalizeImages(payload)) : { images: [], uploads: [] };
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
    const image = await this.downloadRemoteImage(url);
    const hash = sha256(url).slice(0, 12);
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

  async prepareImagesForPost(postId, images) {
    const uploads = [];
    const out = [];
    for (let index = 0; index < images.length; index += 1) {
      const originalUrl = images[index];
      try {
        const storedUrl = await this.uploadImageToStorage(postId, originalUrl, index);
        uploads.push({ ok: true, source: originalUrl, url: storedUrl });
        out.push(storedUrl);
      } catch (error) {
        uploads.push({ ok: false, source: originalUrl, error: error.message });
        out.push(originalUrl);
      }
    }
    return { images: out, uploads };
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

  async updatePost(postId, payload) {
    if (!this.session) await this.signIn();
    const row = toPostgrestInsert(payload, this.session.user.id);
    delete row.author_id;

    const response = await fetch(`${this.url}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      headers: {
        ...this.headers(),
        prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Post update failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    const data = JSON.parse(text);
    const post = Array.isArray(data) ? data[0] : data;
    const prepared = await this.prepareImagesForPost(postId, normalizeImages(payload));
    const media = await this.replacePostMedia(postId, prepared.images);
    return { ok: true, post, media: { ...media, uploads: prepared.uploads } };
  }
}

module.exports = {
  encodeStoragePath,
  inferImageContentType,
  normalizeImages,
  SupabasePublisher,
};
