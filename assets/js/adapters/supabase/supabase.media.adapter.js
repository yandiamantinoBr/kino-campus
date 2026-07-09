
(function () {
  'use strict';
  // Sub-adapter de media — registrado em window._KCSA.media (v11.30.5)
  // ENV resolvido lazily via window.KCAPI.ENV (sem acoplamento ao adapter principal)
  window._KCSA = window._KCSA || {};

  // ── Utilitários de blob/mime ───────────────────────────────────────────────

  function dataUrlToBlob(dataUrl) {
    const s = String(dataUrl || '');
    const m = s.match(/^data:([^;,]+)(?:;charset=[^;,]+)?(?:;(base64))?,([\s\S]*)$/i);
    if (!m) return null;

    const mime = String(m[1] || 'application/octet-stream').toLowerCase();
    const isBase64 = String(m[2] || '').toLowerCase() === 'base64';
    const payload = m[3] || '';

    try {
      if (isBase64) {
        const binStr = atob(payload);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      }

      const decoded = decodeURIComponent(payload);
      return new Blob([decoded], { type: mime });
    } catch (_) {
      return null;
    }
  }

  function extFromMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    return 'bin';
  }

  function sanitizeFilename(name) {
    const s = String(name || '').trim();
    if (!s) return 'image';
    return s
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'image';
  }

  // Valida magic bytes para confirmar que o conteúdo bate com o MIME declarado.
  // Defesa contra arquivos maliciosos renomeados como imagens (ex: script.svg → image.png).
  async function checkImageMagicBytes(blob) {
    try {
      const buf = await blob.slice(0, 12).arrayBuffer();
      const b = new Uint8Array(buf);
      // JPEG: FF D8 FF
      if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
      // GIF: 47 49 46 38
      if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
      // WEBP: RIFF????WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
      if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
          b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
      return null; // tipo desconhecido ou não-imagem
    } catch (_) {
      return null;
    }
  }

  // Comprime imagem via Canvas antes do upload (v9.4.1)
  // GIF: pass-through (pode ser animado). Demais formatos → JPEG 85%, max 1200×900.
  function compressImage(blob, maxWidth, maxHeight, quality) {
    if (!blob || blob.type === 'image/gif') return Promise.resolve(blob);
    var mw = (maxWidth != null) ? maxWidth : 1200;
    var mh = (maxHeight != null) ? maxHeight : 900;
    var q  = (quality  != null) ? quality  : 0.85;
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (w > mw || h > mh) {
          var ratio = Math.min(mw / w, mh / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        var canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (compressed) {
          resolve(compressed || blob);
        }, 'image/jpeg', q);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(blob); // fallback: envia original
      };
      img.src = url;
    });
  }

  // ── Bucket e path helpers ──────────────────────────────────────────────────

  function getPostMediaStorageBucket() {
    const ENV = window.KCAPI && window.KCAPI.ENV;
    return (ENV && (ENV.STORAGE_BUCKET_POST_MEDIA || (ENV.supabase && ENV.supabase.storageBucket)))
      ? String(ENV.STORAGE_BUCKET_POST_MEDIA || ENV.supabase.storageBucket)
      : 'kino-media';
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function stripSearchAndHash(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const hashIndex = raw.indexOf('#');
    const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    const queryIndex = withoutHash.indexOf('?');
    return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  }

  function safeDecodeUriComponent(value) {
    const raw = String(value || '');
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }

  function extractStoragePathFromPostMediaValue(value, bucket) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const normalizedBucket = String(bucket || getPostMediaStorageBucket()).trim();
    const stripped = stripSearchAndHash(raw);

    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        const pathname = safeDecodeUriComponent(String(parsed.pathname || ''));
        const patterns = [
          new RegExp(`/storage/v1/object/public/${escapeRegExp(normalizedBucket)}/(.+)$`, 'i'),
          new RegExp(`/storage/v1/object/sign/${escapeRegExp(normalizedBucket)}/(.+)$`, 'i'),
          new RegExp(`/storage/v1/object/authenticated/${escapeRegExp(normalizedBucket)}/(.+)$`, 'i'),
        ];

        for (let i = 0; i < patterns.length; i++) {
          const match = pathname.match(patterns[i]);
          if (match && match[1]) {
            return safeDecodeUriComponent(stripSearchAndHash(match[1]).replace(/^\/+/, ''));
          }
        }
      } catch (_) {
        // fallback to direct normalization below
      }
    }

    return safeDecodeUriComponent(stripped.replace(/^\/+/, ''));
  }

  function buildPostMediaCleanupContext(summary) {
    const cleanup = (summary && typeof summary === 'object') ? summary : {};
    return {
      bucket: String(cleanup.bucket || getPostMediaStorageBucket()),
      managedPaths: Array.isArray(cleanup.managedPaths) ? cleanup.managedPaths.slice() : [],
      removedPaths: Array.isArray(cleanup.removedPaths) ? cleanup.removedPaths.slice() : [],
      failedPaths: Array.isArray(cleanup.failedPaths) ? cleanup.failedPaths.slice() : [],
      skippedItems: Array.isArray(cleanup.skippedItems)
        ? cleanup.skippedItems.map((item) => ({
          raw: String((item && item.raw) || ''),
          path: String((item && item.path) || ''),
          reason: String((item && item.reason) || 'skipped'),
        }))
        : [],
    };
  }

  async function cleanupManagedPostMediaStorage(client, items, options) {
    const bucket = getPostMediaStorageBucket();
    const opts = (options && typeof options === 'object') ? options : {};
    const userId = (opts.userId != null) ? String(opts.userId).trim() : '';
    const postId = (opts.postId != null) ? String(opts.postId).trim() : '';
    const scopePrefix = (userId && postId) ? `post-media/${userId}/${postId}/` : '';
    const summary = {
      ok: true,
      bucket,
      managedPaths: [],
      removedPaths: [],
      failedPaths: [],
      skippedItems: [],
    };

    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return summary;

    const managedSet = new Set();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const rawValue = (typeof item === 'string')
        ? item
        : ((item && typeof item === 'object')
          ? (item.path || item.url || item.publicUrl || '')
          : '');
      const normalizedPath = extractStoragePathFromPostMediaValue(rawValue, bucket);

      if (!normalizedPath) {
        summary.skippedItems.push({ raw: String(rawValue || ''), path: '', reason: 'empty_or_unparseable' });
        continue;
      }

      if (!scopePrefix) {
        summary.skippedItems.push({ raw: String(rawValue || ''), path: normalizedPath, reason: 'missing_scope' });
        continue;
      }

      if (!normalizedPath.startsWith(scopePrefix)) {
        summary.skippedItems.push({ raw: String(rawValue || ''), path: normalizedPath, reason: 'unmanaged_path' });
        continue;
      }

      managedSet.add(normalizedPath);
    }

    summary.managedPaths = Array.from(managedSet);
    if (!summary.managedPaths.length) return summary;

    try {
      const storage = client.storage.from(bucket);
      const removal = await storage.remove(summary.managedPaths);
      if (removal && removal.error) {
        summary.ok = false;
        summary.failedPaths = summary.managedPaths.slice();
        console.error('[KCAPI][Supabase] post-media cleanup falhou:', removal.error, summary);
        return summary;
      }

      summary.removedPaths = summary.managedPaths.slice();
      return summary;
    } catch (e) {
      summary.ok = false;
      summary.failedPaths = summary.managedPaths.slice();
      console.error('[KCAPI][Supabase] post-media cleanup excecao:', e, summary);
      return summary;
    }
  }

  async function uploadImagesToSupabaseStorage(client, images, options) {
    // Bucket (compat): prefer STORAGE_BUCKET_POST_MEDIA (roadmap), senão ENV.supabase.storageBucket
    const bucket = getPostMediaStorageBucket();
    const ENV = window.KCAPI && window.KCAPI.ENV;

    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!list.length) return { ok: true, uploaded: [] };

    // Hard limits (mínimo anti-abuso)
    // v13.6.3: maxImages aumentado de 5 → 12 (matches create form)
    const maxImages = 12;
    const maxBytes = (ENV && ENV.supabase && Number.isFinite(ENV.supabase.maxImageBytes))
      ? Number(ENV.supabase.maxImageBytes)
      : (5 * 1024 * 1024); // 5MB

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

    const opts = (options && typeof options === 'object') ? options : {};
    const userId = (opts.userId != null) ? String(opts.userId) : '';
    const postId = (opts.postId != null) ? String(opts.postId) : '';

    // Path controlado: post-media/{userId}/{postId}/{filename}
    // Se não houver userId/postId, cai em modo "compat" (menos seguro) e loga warning.
    const hasStrongPath = !!(userId && postId);

    const storage = client.storage.from(bucket);
    const ts = Date.now();

    const uploaded = [];
    for (let i = 0; i < Math.min(list.length, maxImages); i++) {
      const item = list[i];

      // Se já for URL http(s), reaproveita.
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        uploaded.push({ url: item, path: '', is_cover: i === 0, sort_order: i });
        continue;
      }

      // dataURL -> Blob
      const blob = dataUrlToBlob(item);
      if (!blob) {
        console.warn('[KCAPI][Supabase] Imagem inválida (não é dataURL):', item);
        continue;
      }

      // Valida tipo MIME declarado
      const mime = String(blob.type || '').toLowerCase();
      if (!allowedTypes.has(mime)) {
        console.warn('[KCAPI][Supabase] Tipo de imagem não permitido:', mime);
        continue;
      }
      if (blob.size > maxBytes) {
        console.warn('[KCAPI][Supabase] Imagem excede tamanho máximo (bytes):', blob.size, '>', maxBytes);
        continue;
      }
      // Valida magic bytes (defesa contra arquivos maliciosos com MIME falsificado)
      const actualMime = await checkImageMagicBytes(blob);
      if (!actualMime || !allowedTypes.has(actualMime)) {
        console.warn('[KCAPI][Supabase] Magic bytes não correspondem a imagem válida:', mime);
        continue;
      }

      // Comprime imagem antes do upload (v9.4.1) — GIF é pass-through
      const compressed = await compressImage(blob, 1200, 900, 0.85);
      const uploadMime = compressed.type || mime;
      const ext = extFromMime(uploadMime);
      const filename = sanitizeFilename(`image-${i + 1}.${ext}`);

      const path = hasStrongPath
        ? `post-media/${userId}/${postId}/${ts}-${i + 1}-${filename}`
        : `posts/${ts}-${filename}`; // compat (evitar quebra caso postId/userId não exista)

      if (!hasStrongPath) {
        console.warn('[KCAPI][Supabase] Upload com path fraco (sem userId/postId). Considere hardening via post-media/{userId}/{postId}.');
      }

      const up = await storage.upload(path, compressed, { contentType: uploadMime || 'application/octet-stream', upsert: false });
      if (up && up.error) {
        const cleanup = await cleanupManagedPostMediaStorage(client, uploaded, { userId, postId });
        return {
          ok: false,
          error: {
            message: 'Falha no upload de imagem para o Storage.',
            code: (up.error.code != null && String(up.error.code).trim()) ? String(up.error.code).trim() : 'STORAGE_UPLOAD_FAILED',
            details: up.error.details || null,
            hint: up.error.hint || null,
            bucket,
            path,
            imageIndex: i,
            cleanup,
          },
        };
      }

      const pub = storage.getPublicUrl(path);
      const publicUrl = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
      if (!publicUrl) {
        console.warn('[KCAPI][Supabase] Upload OK, mas não consegui obter URL pública:', path);
      }

      uploaded.push({ url: publicUrl || path, path, is_cover: i === 0, sort_order: i });
    }

    return { ok: true, uploaded };
  }

  // Expõe compressImage globalmente (v9.4.1) — movido de supabase.adapter.js (v11.30.5)
  window.KCCompressImage = compressImage;

  window._KCSA.media = {
    compressImage,
    checkImageMagicBytes,
    dataUrlToBlob,
    extFromMime,
    sanitizeFilename,
    getStorageBucket: getPostMediaStorageBucket,
    extractStoragePath: extractStoragePathFromPostMediaValue,
    buildCleanupContext: buildPostMediaCleanupContext,
    cleanupStorage: cleanupManagedPostMediaStorage,
    uploadImages: uploadImagesToSupabaseStorage,
  };
})();
