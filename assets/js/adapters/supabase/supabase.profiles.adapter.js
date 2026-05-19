/**
 * @file supabase.profiles.adapter.js
 * @description Sub-adapter para o grupo profiles (v11.30.9)
 * Extraído de supabase.adapter.js. Registra window._KCSA.profiles (operações de perfil).
 *
 * Dependências em runtime:
 *   - window._KCSA.getClient()         — via supabase.adapter.js
 *   - window._KCSA.getCurrentUser()    — via supabase.adapter.js
 *   - window._KCSA.media.*             — via supabase.media.adapter.js
 *   - window.KCAccountProfileUtils     — global facade (opcional)
 *   - window.KCProfiles                — global facade (opcional)
 *   - window.KCAPI.ENV                 — lazy, lido em getENV()
 */
'use strict';

(function () {
  'use strict';

  window._KCSA = window._KCSA || {};

  // ── Lazy accessors ────────────────────────────────────────────────────────
  function getSupabaseClient() {
    return window._KCSA && typeof window._KCSA.getClient === 'function'
      ? window._KCSA.getClient() : null;
  }

  function getCurrentUser() {
    return window._KCSA && typeof window._KCSA.getCurrentUser === 'function'
      ? window._KCSA.getCurrentUser() : Promise.resolve(null);
  }

  function getENV() {
    return (window.KCAPI && window.KCAPI.ENV) || {};
  }

  function getProfileShared() {
    return window.KCAccountProfileUtils || {};
  }

  function getOwnerProfileFields() {
    const profileShared = getProfileShared();
    return profileShared.OWNER_PROFILE_SELECT_FIELDS ||
      'id, display_name, full_name, avatar_url, avatar_path, bio, verified, is_admin, created_at, updated_at, onboarding_completed_at, affiliation, gender_identity, gender_identity_custom, race_color, profile_public, contact_primary_method, contact_cta_enabled, social_links, social_visibility';
  }

  // ── normalizeProfilePatchForAdapter ──────────────────────────────────────
  function normalizeProfilePatchForAdapter(patch) {
    const profileShared = getProfileShared();
    if (profileShared && typeof profileShared.normalizeProfilePatch === 'function') {
      return profileShared.normalizeProfilePatch(patch);
    }
    return (patch && typeof patch === 'object' && !Array.isArray(patch)) ? { ...patch } : {};
  }

  /**
   * Rasteriza um Blob SVG para PNG via <canvas>. Usado para avatares-emoji
   * (buildEmojiAvatarDataUrl gera SVG inline). Retorna Blob PNG quadrado de
   * `size`×`size` ou `null` em caso de falha.
   */
  function blobToDataUrl(blob) {
    if (!blob || typeof FileReader === 'undefined') return Promise.resolve('');
    return new Promise(function (resolve) {
      try {
        const reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { resolve(''); };
        reader.readAsDataURL(blob);
      } catch (_) {
        resolve('');
      }
    });
  }

  function canvasToPngBlob(canvas) {
    if (!canvas) return Promise.resolve(null);
    return new Promise(function (resolve) {
      const fallback = function () {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const media = window._KCSA && window._KCSA.media;
          resolve(media && typeof media.dataUrlToBlob === 'function' ? media.dataUrlToBlob(dataUrl) : null);
        } catch (_) {
          resolve(null);
        }
      };

      if (typeof canvas.toBlob !== 'function') {
        fallback();
        return;
      }

      try {
        canvas.toBlob(function (out) {
          if (out) resolve(out);
          else fallback();
        }, 'image/png');
      } catch (_) {
        fallback();
      }
    });
  }

  async function rasterizeSvgBlobToPng(svgBlob, width, height) {
    if (!svgBlob || typeof Image === 'undefined') return null;
    const w = Number.isFinite(width) ? width : 400;
    const h = Number.isFinite(height) ? height : 400;

    // Use data: first because production CSP allows data: images. A blob: URL is
    // still kept as a fallback for older browsers/FileReader failures.
    const dataUrl = await blobToDataUrl(svgBlob);

    return new Promise(function (resolve) {
      let url = '';
      const src = dataUrl || (function () {
        try {
          url = URL.createObjectURL(svgBlob);
          return url;
        } catch (_) {
          return '';
        }
      }());
      if (!src) {
        resolve(null);
        return;
      }

      const img = new Image();
      let settled = false;
      const finish = function (result) {
        if (settled) return;
        settled = true;
        if (url) {
          try { URL.revokeObjectURL(url); } catch (_) {}
        }
        resolve(result);
      };
      img.onload = async function () {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish(null);
            return;
          }
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          finish(await canvasToPngBlob(canvas));
        } catch (e) {
          console.warn('[KCAPI][profile] rasterizeSvg failed:', e);
          finish(null);
        }
      };
      img.onerror = function () { finish(null); };
      img.src = src;
    });
  }

  // ── uploadProfileAvatarToSupabaseStorage ──────────────────────────────────
  async function uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, options) {
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };

    const ENV = getENV();
    const bucket = (ENV && (ENV.STORAGE_BUCKET_POST_MEDIA || (ENV.supabase && ENV.supabase.storageBucket)))
      ? String(ENV.STORAGE_BUCKET_POST_MEDIA || ENV.supabase.storageBucket)
      : 'kino-media';

    const opts = (options && typeof options === 'object') ? options : {};
    const userId = String(opts.userId || '').trim();
    if (!userId) return { ok: false, error: { message: 'Usuário inválido para upload do avatar.' } };

    const maxBytes = (ENV && ENV.supabase && Number.isFinite(ENV.supabase.maxImageBytes))
      ? Number(ENV.supabase.maxImageBytes)
      : (5 * 1024 * 1024);
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

    let blob = null;
    let directUrl = '';

    if (typeof fileOrDataUrl === 'string') {
      const raw = String(fileOrDataUrl || '').trim();
      if (!raw) return { ok: false, error: { message: 'Imagem inválida para avatar.' } };
      if (/^https?:\/\//i.test(raw)) {
        directUrl = raw;
      } else {
        blob = window._KCSA.media.dataUrlToBlob(raw);
      }
    } else if (typeof Blob !== 'undefined' && fileOrDataUrl instanceof Blob) {
      blob = fileOrDataUrl;
    }

    if (directUrl) {
      return { ok: true, data: { url: directUrl } };
    }

    if (!blob) return { ok: false, error: { message: 'Formato de imagem inválido para avatar.' } };

    let mime = String(blob.type || '').toLowerCase();

    // Avatar emoji (gerado por buildEmojiAvatarDataUrl) chega como SVG.
    // Rasterizamos para PNG via canvas antes da validação para manter o
    // pipeline uniforme (allowedTypes restringe a JPG/PNG/WEBP/GIF) e
    // evitar SVG no Storage (vetor com risco de XSS embutido).
    if (mime === 'image/svg+xml') {
      const png = await rasterizeSvgBlobToPng(blob, 400, 400);
      if (!png) {
        return { ok: false, error: { message: 'Não foi possível gerar o avatar emoji. Tente novamente.' } };
      }
      blob = png;
      mime = 'image/png';
    }

    if (!allowedTypes.has(mime)) {
      return { ok: false, error: { message: 'Use uma imagem JPG, PNG ou WEBP para o avatar.' } };
    }
    if (blob.size > maxBytes) {
      return { ok: false, error: { message: 'A imagem do avatar excede o limite permitido.' } };
    }
    // Valida magic bytes (defesa contra arquivos maliciosos com MIME falsificado)
    const actualMime = await window._KCSA.media.checkImageMagicBytes(blob);
    if (!actualMime || !allowedTypes.has(actualMime)) {
      return { ok: false, error: { message: 'O arquivo não é uma imagem válida.' } };
    }

    // Comprime avatar antes do upload (v9.4.1) — max 400×400px
    const compressedAvatar = await window._KCSA.media.compressImage(blob, 400, 400, 0.85);
    const avatarMime = compressedAvatar.type || mime;
    const ext = window._KCSA.media.extFromMime(avatarMime);
    const filename = window._KCSA.media.sanitizeFilename(`avatar.${ext}`);
    const path = `profile-avatars/${userId}/${Date.now()}-${filename}`;
    const storage = client.storage.from(bucket);

    const up = await storage.upload(path, compressedAvatar, { contentType: avatarMime || 'application/octet-stream', upsert: false });
    if (up && up.error) {
      return {
        ok: false,
        error: {
          message: 'Falha no upload do avatar.',
          code: (up.error.code != null && String(up.error.code).trim()) ? String(up.error.code).trim() : 'PROFILE_AVATAR_UPLOAD_FAILED',
          details: up.error.details || null,
          hint: up.error.hint || null,
          bucket,
          path,
        },
      };
    }

    const pub = storage.getPublicUrl(path);
    const publicUrl = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
    if (!publicUrl) {
      return { ok: false, error: { message: 'Não foi possível obter a URL pública do avatar.' } };
    }

    return { ok: true, data: { url: publicUrl, path } };
  }

  // ── syncCurrentProfileCache ───────────────────────────────────────────────
  function syncCurrentProfileCache(profile) {
    if (window.KCProfiles && typeof window.KCProfiles.commitProfile === 'function') {
      try {
        return window.KCProfiles.commitProfile(profile);
      } catch (_) { }
    }
    try {
      document.dispatchEvent(new CustomEvent('kc:profilechange', { detail: { profile: profile || null } }));
    } catch (_) { }
    return profile || null;
  }

  // ── getMyProfile ─────────────────────────────────────────────────────────
  async function getMyProfile() {
    const client = getSupabaseClient();
    if (!client) return null;
    const user = await getCurrentUser();
    if (!user) return null;

    try {
      const res = await client
        .from('profiles')
        .select(getOwnerProfileFields())
        .eq('id', user.id)
        .maybeSingle();
      if (res && res.error) {
        console.error('[KCAPI][profile] getMyProfile:', res.error);
        return null;
      }
      if (res && res.data) syncCurrentProfileCache(res.data);
      return (res && res.data) ? res.data : null;
    } catch (e) {
      console.error('[KCAPI][profile] getMyProfile exceção:', e);
      return null;
    }
  }

  // ── updateMyProfile ──────────────────────────────────────────────────────
  async function updateMyProfile(patch) {
    if (patch === undefined) patch = {};
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para editar seu perfil.' } };

    const updates = normalizeProfilePatchForAdapter(patch);
    const displayName = Object.prototype.hasOwnProperty.call(updates, 'display_name')
      ? String(updates.display_name || '').trim()
      : '__skip__';
    if (Object.prototype.hasOwnProperty.call(updates, 'display_name') && !String(updates.display_name || '').trim()) {
      return { ok: false, error: { message: 'Informe um nome valido.' } };
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'avatar_url')) {
      const avatarUrl = String(updates.avatar_url || '').trim();
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        return { ok: false, error: { message: 'URL de avatar inválida.' } };
      }
      updates.avatar_url = avatarUrl || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'avatar_path')) {
      updates.avatar_path = String(updates.avatar_path || '').trim() || null;
    }
    if (!Object.keys(updates).length) {
      return { ok: false, error: { message: 'Nenhuma alteração informada.' } };
    }
    if (!displayName) return { ok: false, error: { message: 'Informe um nome válido.' } };

    try {
      const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select(getOwnerProfileFields())
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][profile] updateMyProfile:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível atualizar seu perfil.' } };
      }
      if (!data) {
        return { ok: false, error: { message: 'No momento, não é possível alterar seu nome.' } };
      }
      syncCurrentProfileCache(data);
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][profile] updateMyProfile exceção:', e);
      return { ok: false, error: { message: 'Não foi possível atualizar seu perfil.' } };
    }
  }

  // ── uploadProfileAvatar ──────────────────────────────────────────────────
  async function uploadProfileAvatar(fileOrDataUrl) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para atualizar seu avatar.' } };

    try {
      return await uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, { userId: user.id });
    } catch (e) {
      console.error('[KCAPI][profile] uploadProfileAvatar exceção:', e);
      return { ok: false, error: { message: 'Não foi possível enviar o avatar.' } };
    }
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCSA.profiles = {
    getMyProfile,
    updateMyProfile,
    uploadProfileAvatar,
  };

})();
