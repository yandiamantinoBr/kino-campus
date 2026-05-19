/**
 * @file supabase.posts-write.adapter.js
 * @description Sub-adapter para o grupo posts-write (v11.30.8)
 * Extraído de supabase.adapter.js. Registra window._KCSA.postsWrite (operações de escrita).
 *
 * Dependências em runtime:
 *   - window._KCSA.getClient()          — via supabase.adapter.js
 *   - window._KCSA.getCurrentUser()     — via supabase.adapter.js
 *   - window._KCSA.media.*              — via supabase.media.adapter.js
 *   - window._KCSA.posts.getPostById()  — via supabase.posts-read.adapter.js
 *   - window.KCAPI.normalizePost()      — lazy, lido em doNormalizePost()
 *   - window.KCAPI.ENV                  — lazy, lido em getENV()
 *   - window.KCProfiles                 — global facade (opcional)
 */
'use strict';

(function () {
  'use strict';

  window._KCSA = window._KCSA || {};

  // ── Lazy accessors ────────────────────────────────────────────────────────
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  function doNormalizePost(p) {
    const fn = window.KCAPI && typeof window.KCAPI.normalizePost === 'function'
      ? window.KCAPI.normalizePost : null;
    return fn ? fn(p) : p;
  }

  // ── createPostDiagnostics ─────────────────────────────────────────────────
  const createPostDiagnostics = Object.freeze({
    clear() {
      try {
        if (window.KCAPI && typeof window.KCAPI.clearLastCreatePostError === 'function') {
          window.KCAPI.clearLastCreatePostError();
        }
      } catch (_) { }
    },
    set(stage, error, context) {
      try {
        if (window.KCAPI && typeof window.KCAPI.setLastCreatePostError === 'function') {
          return window.KCAPI.setLastCreatePostError(stage, error, context);
        }
      } catch (_) { }
      return null;
    },
    get() {
      try {
        if (window.KCAPI && typeof window.KCAPI.getLastCreatePostError === 'function') {
          return window.KCAPI.getLastCreatePostError();
        }
      } catch (_) { }
      return null;
    }
  });

  // ── Helpers (create payload, profile sync) ────────────────────────────────
  function summarizeCreatePayloadForCreateDiagnostics(parsed) {
    try {
      if (window.KCAPI && typeof window.KCAPI.summarizeCreatePayloadForDiagnostics === 'function') {
        return window.KCAPI.summarizeCreatePayloadForDiagnostics(parsed);
      }
    } catch (_) { }

    const payload = (parsed && typeof parsed === 'object') ? parsed : {};
    return {
      moduleDB: payload.moduleDB || '',
      categoryDB: payload.categoryDB || '',
      subcategoryDB: payload.subcategoryDB || '',
      titleLength: String(payload.title || '').length,
      descriptionLength: String(payload.description || '').length,
      imagesCount: Array.isArray(payload.images) ? payload.images.length : 0,
    };
  }

  function getUserDisplayNameForProfile(user) {
    const meta = (user && user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};
    const direct = meta.display_name || meta.full_name || meta.name || meta.username || meta.preferred_username;
    if (direct && String(direct).trim()) return String(direct).trim();

    const email = String((user && user.email) || '').trim();
    if (email.includes('@')) return email.split('@')[0];
    return 'Usuário';
  }

  function getUserAvatarForProfile(user) {
    const profileAvatar = String((user && user.profile && user.profile.avatar_url) || '').trim();
    return profileAvatar || '';
  }

  async function ensureSupabaseProfileForCreate(client, user) {
    if (!client || !user || !user.id) {
      return {
        ok: false,
        error: {
          message: 'Pré-condição inválida para sincronizar profile.',
          code: 'PROFILE_SYNC_PRECONDITION_FAILED',
        }
      };
    }

    try {
      if (window.KCProfiles && typeof window.KCProfiles.ensureSynced === 'function') {
        const synced = await window.KCProfiles.ensureSynced();
        if (!synced || synced.id == null || String(synced.id) === String(user.id)) {
          return { ok: true };
        }
      }
    } catch (e) {
      console.warn('[KCAPI][Supabase] ensureSynced (KCProfiles) falhou; fallback upsert será usado.', e);
    }

    const payload = {
      id: user.id,
      full_name: getUserDisplayNameForProfile(user),
    };

    try {
      const q = client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('id');

      const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
      if (res && res.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  function hasAdminProfileFlag(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return profile.is_admin === true
      || profile.isAdmin === true
      || profile.admin === true
      || String(profile.role || '').toLowerCase() === 'admin';
  }

  async function getCurrentProfileForAdminCheck(client, user) {
    if (hasAdminProfileFlag(user && user.profile)) return user.profile;

    try {
      if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
        const currentProfile = window.KCProfiles.getCurrentProfile();
        if (currentProfile && String(currentProfile.id || (user && user.id) || '') === String((user && user.id) || '')) {
          return currentProfile;
        }
      }
    } catch (_) { }

    try {
      if (window.KCAPI && typeof window.KCAPI.getCurrentProfile === 'function') {
        const apiProfile = window.KCAPI.getCurrentProfile();
        if (apiProfile && String(apiProfile.id || (user && user.id) || '') === String((user && user.id) || '')) {
          return apiProfile;
        }
      }
    } catch (_) { }

    if (!client || !user || !user.id) return null;
    try {
      const result = await client.from('profiles').select('id, is_admin').eq('id', user.id).maybeSingle();
      if (!result || result.error) return null;
      return result.data || null;
    } catch (_) {
      return null;
    }
  }

  async function canManagePostRow(client, user, postRow) {
    const authorId = String((postRow && postRow.author_id) || '').trim();
    const userId = String((user && user.id) || '').trim();
    const isOwner = !!authorId && !!userId && authorId === userId;
    if (isOwner) return { ok: true, isOwner: true, isAdmin: false, isAdminOverride: false, authorId };

    const profile = await getCurrentProfileForAdminCheck(client, user);
    const isAdmin = hasAdminProfileFlag(profile) || hasAdminProfileFlag(user && user.app_metadata);
    return {
      ok: !!isAdmin,
      isOwner: false,
      isAdmin,
      isAdminOverride: !!isAdmin,
      authorId,
    };
  }

  async function recordPostAuditEvent(client, postId, action, payload) {
    if (!client || !postId || !action) return;
    try {
      const result = await client.rpc('kc_record_post_audit_event', {
        p_post_id: postId,
        p_action: action,
        p_payload: payload || {},
      });
      if (result && result.error) {
        console.warn('[KCAPI][Supabase] kc_record_post_audit_event falhou:', result.error);
      }
    } catch (error) {
      console.warn('[KCAPI][Supabase] kc_record_post_audit_event excecao:', error);
    }
  }

  function parsePriceMaybe(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v).trim();
    if (!s) return null;
    // tenta BRL: 1.234,56
    const norm = s
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.');
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }

  function toSlug(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    try {
      return s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    } catch (_) {
      return s.toLowerCase();
    }
  }

  function clampCreatedAtISO() {
    // Temporal clamp dinâmico (configurável via KC_ENV.clamp)
    const MONTH_MAP = { january:1,february:2,march:3,april:4,may:5,june:6,
                        july:7,august:8,september:9,october:10,november:11,december:12 };
    const d = new Date();
    const ENV = getENV();
    const y = (ENV.clamp && ENV.clamp.year) ? parseInt(String(ENV.clamp.year), 10) : d.getFullYear();
    const yy = Number.isFinite(y) ? y : d.getFullYear();
    const rawMonth = (ENV.clamp && ENV.clamp.month) ? String(ENV.clamp.month).toLowerCase() : null;
    const mi = (rawMonth && MONTH_MAP[rawMonth]) ? MONTH_MAP[rawMonth] : (d.getMonth() + 1);
    const mm = String(mi).padStart(2, '0');
    return `${yy}-${mm}-15T12:00:00.000Z`;
  }

  function normalizeCreatePayload(data) {
    const d = (data && typeof data === 'object') ? data : {};
    const rawVisibility = String(d.visibility || (d.metadata && d.metadata.visibility) || '').trim().toLowerCase();
    const visibility = rawVisibility === 'community' ? 'community' : 'public';

    const modulo = (d.modulo || d.module || '').toString().trim();
    const categoryKey = (d.categoriaKey || d.categoryKey || d.category || d.categoria || '').toString().trim();
    const subKey = (d.subcategoriaKey || d.subcategoryKey || d.subcategory || d.subcategoria || '').toString().trim();

    const title = (d.titulo || d.title || '').toString().trim();
    const description = (d.descricao || d.description || '').toString().trim();

    const price = (d.preco != null) ? parsePriceMaybe(d.preco) : parsePriceMaybe(d.price);
    const location = (d.localizacao || d.location || '').toString().trim();

    const images = Array.isArray(d.imagens) ? d.imagens : (Array.isArray(d.images) ? d.images : []);

    // labels (opcionais) para manter UI rica via metadata
    // (mantém retrocompatibilidade: payloads antigos usavam d.categoria/d.subcategoria como labels)
    const categoriaLabel = (d.categoriaLabel || d.categoryLabel || (d.categoriaKey ? '' : d.categoria) || (d.categoryKey ? '' : d.category) || '').toString().trim();
    const subcategoriaLabel = (d.subcategoriaLabel || d.subcategoryLabel || (d.subcategoriaKey ? '' : d.subcategoria) || (d.subcategoryKey ? '' : d.subcategory) || '').toString().trim();

    const moduleDB = toSlug(modulo);
    const categoryDB = toSlug(categoryKey || categoriaLabel);

    // V8.1.3.1: compra-venda usa tabs por categoria (ex.: eletronicos).
    // Se algum payload vier com subKey=ação, normalizamos para a categoria.
    const actionish = ['vendo', 'compro', 'troco', 'doacao', 'doação', 'procuro'];
    const subKeySlug = toSlug(subKey);
    const effectiveSubKey = (moduleDB === 'compra-venda' && subKeySlug && actionish.includes(subKeySlug) && categoryKey)
      ? categoryKey
      : subKey;

    const subcategoryDB = toSlug(effectiveSubKey || subcategoriaLabel);

    // metadata: mantém dados extras sem inflar colunas
    const metadata = {
      ...(d.metadata && typeof d.metadata === 'object' ? d.metadata : {}),
      // filtros (JSONB)
      ...(subcategoryDB ? { subcategory: subcategoryDB } : {}),
      // labels
      ...(categoriaLabel ? { categoryLabel: categoriaLabel } : {}),
      ...(subcategoriaLabel ? { subcategoryLabel: subcategoriaLabel } : {}),
      // chaves úteis do formulário
      ...((categoryKey || d.categoriaKey || d.categoryKey) ? { categoryKey: toSlug(categoryKey || d.categoriaKey || d.categoryKey) } : {}),
      ...((effectiveSubKey || d.subcategoriaKey || d.subcategoryKey) ? { subcategoryKey: toSlug(effectiveSubKey || d.subcategoriaKey || d.subcategoryKey) } : {}),
      ...(Array.isArray(d.tags) ? { tags: d.tags } : {}),
      ...(Array.isArray(d.tagKeys) ? { tagKeys: d.tagKeys } : {}),
      ...(d.condicao ? { condicao: String(d.condicao) } : {}),
      ...(d.precoTexto ? { precoTexto: String(d.precoTexto) } : {}),
      ...(typeof d.sustentavel === 'boolean' ? { sustentavel: d.sustentavel } : {}),
      ...(d.emoji ? { emoji: String(d.emoji) } : {}),
      ...(typeof d.verificado === 'boolean' ? { verificado: d.verificado } : {}),
      visibility,
    };

    return {
      moduleDB,
      categoryDB,
      subcategoryDB,
      title,
      description,
      price,
      location,
      visibility,
      images,
      metadata,
      // também devolvemos o payload bruto para retorno local (labels)
      raw: { ...d },
    };
  }

  // ── Core write functions ──────────────────────────────────────────────────
  function kcApiError(message) {
    return { ok: false, error: { message: String(message || 'Operação não concluída.') } };
  }

  function enforceSupabaseOnProduction(operationName) {
    const env = getENV();
    if (!env.isProduction) return null;
    if (env.driver === 'supabase') return null;
    return {
      ok: false,
      error: {
        code: 'PRODUCTION_REQUIRES_SUPABASE',
        message: `Operação crítica "${String(operationName || 'unknown')}" bloqueada: em produção, o driver "supabase" é obrigatório.`,
      },
    };
  }

  function normalizeUpdatePayload(data) {
    const parsed = normalizeCreatePayload(data);
    if (!parsed.title) return { ok: false, error: { message: 'Título é obrigatório.' } };
    if (!parsed.description) return { ok: false, error: { message: 'Descrição é obrigatória.' } };
    if (!parsed.moduleDB) return { ok: false, error: { message: 'Módulo é obrigatório.' } };
    if (!parsed.categoryDB) return { ok: false, error: { message: 'Categoria é obrigatória.' } };

    return {
      ok: true,
      data: {
        title: parsed.title,
        description: parsed.description,
        price: parsed.price,
        location: parsed.location,
        module: parsed.moduleDB,
        category: parsed.categoryDB,
        visibility: parsed.visibility,
        metadata: parsed.metadata,
      },
      images: parsed.images,
    };
  }

  async function resolvePostUuid(postId) {
    if (typeof postId === 'string' && UUID_RE.test(postId)) return String(postId);
    if (postId == null) return null;
    try {
      const getPostByIdFn = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function' ? window._KCSA.posts.getPostById : null;
      const post = getPostByIdFn ? await getPostByIdFn(String(postId)) : null;
      if (post && post.uuid && UUID_RE.test(String(post.uuid))) return String(post.uuid);
      if (post && post.id && UUID_RE.test(String(post.id))) return String(post.id);
    } catch (_) { }
    return null;
  }

  function isMissingImageUrlColumnError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes('image_url') && (
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache')
    );
  }

  function resolveFirstImageUrl(images) {
    const list = Array.isArray(images) ? images : [];
    for (let i = 0; i < list.length; i += 1) {
      const url = String((list[i] && list[i].url) || list[i] || '').trim();
      if (/^https?:\/\//i.test(url)) return url;
    }
    return '';
  }

  async function updatePostCoverImage(client, postId, metadata, imageUrl) {
    const cover = String(imageUrl || '').trim();
    const nextMetadata = {
      ...((metadata && typeof metadata === 'object') ? metadata : {}),
      image_url: cover,
      cover_url: cover,
    };
    const patch = { image_url: cover || null, metadata: nextMetadata };
    let result = await client.from('posts').update(patch).eq('id', postId).select('id').maybeSingle();
    if (result && result.error && isMissingImageUrlColumnError(result.error)) {
      result = await client.from('posts').update({ metadata: nextMetadata }).eq('id', postId).select('id').maybeSingle();
    }
    return result;
  }

  async function createPost(data) {
    createPostDiagnostics.clear();

    const client = getSupabaseClient();
    if (!client) {
      createPostDiagnostics.set('AUTH', {
        message: 'Supabase client não disponível para createPost.',
        code: 'SUPABASE_CLIENT_MISSING',
      }, { driver: getENV().driver });
      return null;
    }

    const user = await getCurrentUser();
    if (!user) {
      createPostDiagnostics.set('AUTH', {
        message: 'Usuário não autenticado para createPost.',
        code: 'NOT_AUTHENTICATED',
      }, { driver: getENV().driver });
      return null;
    }

    const parsed = normalizeCreatePayload(data);
    const payloadSummary = summarizeCreatePayloadForCreateDiagnostics(parsed);
    if (!parsed.title || !parsed.description || !parsed.moduleDB) {
      createPostDiagnostics.set('PAYLOAD', {
        message: 'Payload de createPost incompleto (título/descrição/módulo).',
        code: 'INVALID_CREATE_PAYLOAD',
      }, payloadSummary);
      return null;
    }

    const profileSync = await ensureSupabaseProfileForCreate(client, user);
    if (!profileSync.ok) {
      createPostDiagnostics.set('PROFILE_SYNC', profileSync.error, {
        userId: user.id,
      });
      return null;
    }

    // ── Verificação de limite de publicações ativas ─────────
    try {
      const moduleForLimit = (parsed && parsed.moduleDB) ? String(parsed.moduleDB).trim() : null;
      const limitCheck = await client.rpc('kc_check_post_limit', {
        p_user_id: user.id,
        p_module: moduleForLimit || null,
      });
      if (limitCheck && !limitCheck.error && limitCheck.data) {
        const check = limitCheck.data;
        if (check && check.ok === false) {
          const limitMsg = `Você atingiu o limite de ${check.limit} publicações ativas${moduleForLimit ? ' neste módulo' : ''}. Desabilite ou exclua uma publicação antes de criar uma nova.`;
          createPostDiagnostics.set('POST_LIMIT', {
            message: limitMsg,
            code: 'POST_LIMIT_REACHED',
            limit: check.limit,
            count: check.count,
          }, { module: moduleForLimit });
          return { _kcError: 'POST_LIMIT_REACHED', message: limitMsg, limit: check.limit, count: check.count };
        }
      }
    } catch (_limitErr) {
      // Falha na checagem de limite não bloqueia a criação (graceful degradation)
      console.warn('[KCAPI][Supabase] kc_check_post_limit falhou (criação permitida):', _limitErr);
    }

    let postId = null;
    let uploaded = [];

    async function rollbackCreatedPostSafely(targetPostId) {
      if (!targetPostId) return { ok: false };
      try {
        const del = await client.from('posts').delete().eq('id', targetPostId);
        if (del && del.error) {
          console.warn('[KCAPI][Supabase] rollback delete falhou:', del.error);
          return { ok: false, error: del.error };
        }
        return { ok: true };
      } catch (e) {
        console.warn('[KCAPI][Supabase] rollback delete excecao:', e);
        return { ok: false, error: e };
      }
    }

    try {

      // 1) Insere post primeiro (para obter postId) e habilitar path controlado no Storage
      // Não enviamos created_at: o BD usa DEFAULT now() para garantir ordenação correta (P0-C fix)

      const insertPayload = {
        author_id: user.id,
        title: parsed.title,
        description: parsed.description,
        price: parsed.price,
        location: parsed.location,
        module: parsed.moduleDB,
        category: parsed.categoryDB,
        visibility: parsed.visibility,
        metadata: parsed.metadata,
      };

      // Helper de rollback (evita órfãos quando upload falha após INSERT)
      async function rollbackCreatedPost(postId) {
        try {
          const del = await client.from('posts').delete().eq('id', postId);
          if (del && del.error) console.warn('[KCAPI][Supabase] rollback delete falhou:', del.error);
        } catch (e) {
          console.warn('[KCAPI][Supabase] rollback delete exceção:', e);
        }
      }

      // 2) INSERT posts (gera UUID)
      const ins = await client
        .from('posts')
        .insert(insertPayload)
        .select('id')
        .maybeSingle();

      if (ins && ins.error) {
        // v9.3.2: detectar flood control (trigger kc_anti_spam_gate)
        var insErrMsg = String((ins.error && ins.error.message) || '');
        if (insErrMsg.includes('flood_limit_exceeded')) {
          return {
            _kcError: 'FLOOD_LIMIT',
            message: 'Limite de 3 publicações por hora atingido. Aguarde antes de publicar novamente.',
          };
        }
        createPostDiagnostics.set('POST_INSERT', ins.error, {
          userId: user.id,
          payload: payloadSummary,
        });
        return null;
      }

      postId = (ins && ins.data && ins.data.id) ? ins.data.id : null;
      if (!postId) {
        createPostDiagnostics.set('POST_INSERT', {
          message: 'INSERT em posts não retornou id.',
          code: 'POST_INSERT_NO_ID',
        }, {
          userId: user.id,
          payload: payloadSummary,
        });
        return null;
      }

      // 3) Upload das imagens (se houver) com path controlado (post-media/{userId}/{postId}/...)
      const uploadResult = await window._KCSA.media.uploadImages(client, parsed.images, { userId: user.id, postId });
      if (!uploadResult || !uploadResult.ok) {
        const uploadCleanup = window._KCSA.media.buildCleanupContext(uploadResult && uploadResult.error ? uploadResult.error.cleanup : null);
        const cleanupFailed = uploadCleanup.failedPaths.length > 0;
        if (!cleanupFailed) {
          await rollbackCreatedPostSafely(postId);
        } else {
          console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup do upload:', uploadCleanup);
        }
        createPostDiagnostics.set('STORAGE_UPLOAD', uploadResult ? uploadResult.error : null, {
          postId,
          userId: user.id,
          imagesCount: Array.isArray(parsed.images) ? parsed.images.length : 0,
          rollbackSkipped: cleanupFailed,
          ...uploadCleanup,
        });
        return null;
      }
      uploaded = Array.isArray(uploadResult.uploaded) ? uploadResult.uploaded : [];
      const coverImageUrl = resolveFirstImageUrl(uploaded);
      if (coverImageUrl) {
        const coverUpdate = await updatePostCoverImage(client, postId, parsed.metadata, coverImageUrl);
        if (coverUpdate && coverUpdate.error) {
          console.warn('[KCAPI][Supabase] image_url fallback update falhou:', coverUpdate.error);
        }
      }

      // 4) Insere mídias (post_media) com capa + ordem
      if (Array.isArray(uploaded) && uploaded.length) {
        const mediaRowsFull = uploaded
          .filter((m) => m && m.url)
          .map((m, idx) => ({
            post_id: postId,
            url: String(m.url),
            is_cover: idx === 0, // regra: capa = 1Âª imagem ordenada
            sort_order: Number.isFinite(m.sort_order) ? m.sort_order : idx,
          }));

        // Tenta com sort_order (V8.1.5.1); fallback se schema ainda não tiver coluna.
        let mr = await client.from('post_media').insert(mediaRowsFull);
        if (mr && mr.error) {
          const msg = String(mr.error.message || '').toLowerCase();
          if (msg.includes('sort_order')) {
            const mediaRowsCompat = mediaRowsFull.map(({ sort_order, ...rest }) => rest);
            mr = await client.from('post_media').insert(mediaRowsCompat);
          }
        }

        if (mr && mr.error) {
          const cleanup = await window._KCSA.media.cleanupStorage(client, uploaded, { userId: user.id, postId });
          const cleanupContext = window._KCSA.media.buildCleanupContext(cleanup);
          const cleanupFailed = cleanupContext.failedPaths.length > 0;
          if (!cleanupFailed) {
            await rollbackCreatedPostSafely(postId);
          } else {
            console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup de post_media:', cleanupContext);
          }
          createPostDiagnostics.set('POST_MEDIA_INSERT', mr.error, {
            postId,
            mediaCount: mediaRowsFull.length,
            rollbackSkipped: cleanupFailed,
            ...cleanupContext,
          });
          return null;
        }
      }

      // 5) Rebusca completo (com JOINs) e normaliza no contrato do modo local (com JOINs) e normaliza no contrato do modo local
      const getPostByIdFn = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function' ? window._KCSA.posts.getPostById : null;
      const mapped = getPostByIdFn ? await getPostByIdFn(postId) : null;
      if (!mapped) {
        createPostDiagnostics.set('POST_FETCH', {
          message: 'Post criado, mas a leitura final falhou.',
          code: 'POST_FETCH_EMPTY',
        }, { postId });
        return null;
      }

      // injeta labels do payload bruto (caso category esteja em slug)
      const raw = { ...mapped };
      if (parsed.raw && parsed.raw.categoria && !raw.categoria) raw.categoria = parsed.raw.categoria;
      if (parsed.raw && parsed.raw.subcategoria && !raw.subcategoria) raw.subcategoria = parsed.raw.subcategoria;

      createPostDiagnostics.clear();
      var normalizedPost = doNormalizePost(raw);
      // v9.3.2: sinalizar post auto-moderado para o caller mostrar feedback
      if (normalizedPost && normalizedPost.status === 'pending') {
        normalizedPost._kcPending = true;
        normalizedPost._kcPendingReason = 'Sua publicação foi enviada para análise da moderação antes de aparecer nos feeds.';
      }
      return normalizedPost;
    } catch (e) {
      let cleanupContext = window._KCSA.media.buildCleanupContext(null);
      if (postId && Array.isArray(uploaded) && uploaded.length) {
        cleanupContext = window._KCSA.media.buildCleanupContext(await window._KCSA.media.cleanupStorage(client, uploaded, { userId: user.id, postId }));
      }
      const cleanupFailed = cleanupContext.failedPaths.length > 0;
      if (postId && !cleanupFailed) {
        await rollbackCreatedPostSafely(postId);
      } else if (postId && cleanupFailed) {
        console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup de excecao:', cleanupContext);
      }
      createPostDiagnostics.set('EXCEPTION', e, {
        userId: user.id,
        payload: payloadSummary,
        postId,
        rollbackSkipped: !!(postId && cleanupFailed),
        ...cleanupContext,
      });
      return null;
    }
  }

  /**
   * Sync post_media entries for an update operation.
   * Handles: keep existing URLs, upload new data URLs, delete removed images.
   */
  async function syncPostMediaForUpdate(client, postUuid, userId, newImages) {
    // 1) Fetch current post_media entries for this post
    const currentMedia = await client
      .from('post_media')
      .select('id, url, is_cover, sort_order')
      .eq('post_id', postUuid);

    const currentRows = (currentMedia && !currentMedia.error && Array.isArray(currentMedia.data))
      ? currentMedia.data
      : [];

    const currentUrlSet = new Set(currentRows.map(r => String(r.url || '')).filter(Boolean));

    // 2) Classify new images: existing URLs to keep vs new data URLs to upload
    const keepUrls = new Set();
    const toUpload = []; // { index, dataUrl }
    const orderedFinal = []; // { url, sort_order, is_cover }

    for (let i = 0; i < newImages.length; i++) {
      const item = newImages[i];
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        // Existing URL — keep it
        keepUrls.add(item);
        orderedFinal.push({ url: item, sort_order: i, is_cover: i === 0 });
      } else if (typeof item === 'string' && item.startsWith('data:')) {
        // New data URL — needs upload
        toUpload.push({ index: i, dataUrl: item });
        orderedFinal.push({ url: null, uploadIdx: toUpload.length - 1, sort_order: i, is_cover: i === 0 });
      }
    }

    // 3) Upload new images to Storage
    if (toUpload.length > 0) {
      const dataUrls = toUpload.map(t => t.dataUrl);
      const uploadResult = await window._KCSA.media.uploadImages(client, dataUrls, { userId, postId: postUuid });
      if (uploadResult && uploadResult.ok && Array.isArray(uploadResult.uploaded)) {
        // Map uploaded URLs back into orderedFinal
        for (let u = 0; u < uploadResult.uploaded.length; u++) {
          const uploadedItem = uploadResult.uploaded[u];
          const finalEntry = orderedFinal.find(f => f.uploadIdx === u);
          if (finalEntry && uploadedItem && uploadedItem.url) {
            finalEntry.url = uploadedItem.url;
          }
        }
      } else {
        console.error('[KCAPI][Supabase] syncPostMedia upload falhou:', uploadResult);
      }
    }

    // Filter out entries that failed to upload
    const validFinal = orderedFinal.filter(f => f.url);

    // 4) Delete removed images from Storage
    const removedUrls = [];
    currentRows.forEach(row => {
      if (row.url && !keepUrls.has(String(row.url))) {
        removedUrls.push(row);
      }
    });

    if (removedUrls.length > 0) {
      try {
        await window._KCSA.media.cleanupStorage(client, removedUrls, { userId, postId: postUuid });
      } catch (cleanupErr) {
        console.warn('[KCAPI][Supabase] syncPostMedia cleanup de imagens removidas falhou:', cleanupErr);
      }
    }

    // 5) Delete ALL current post_media rows for this post
    if (currentRows.length > 0) {
      const delMedia = await client.from('post_media').delete().eq('post_id', postUuid);
      if (delMedia && delMedia.error) {
        console.error('[KCAPI][Supabase] syncPostMedia delete post_media falhou:', delMedia.error);
      }
    }

    // 6) Insert new post_media rows in the correct order
    if (validFinal.length > 0) {
      const mediaRows = validFinal.map((f, idx) => ({
        post_id: postUuid,
        url: String(f.url),
        is_cover: idx === 0,
        sort_order: idx,
      }));

      let mr = await client.from('post_media').insert(mediaRows);
      if (mr && mr.error) {
        const msg = String(mr.error.message || '').toLowerCase();
        if (msg.includes('sort_order')) {
          const mediaRowsCompat = mediaRows.map(function (r) {
            var copy = { post_id: r.post_id, url: r.url, is_cover: r.is_cover };
            return copy;
          });
          mr = await client.from('post_media').insert(mediaRowsCompat);
        }
      }
      if (mr && mr.error) {
        console.error('[KCAPI][Supabase] syncPostMedia insert post_media falhou:', mr.error);
      }
    }

    return validFinal;
  }

  async function updatePost(postId, payload) {
    const client = getSupabaseClient();
    if (!client) return kcApiError('Supabase não inicializado.');

    const user = await getCurrentUser();
    if (!user) return kcApiError('Faça login para editar.');

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return kcApiError('Payload inválido para edição.');
    }

    const parsed = normalizeUpdatePayload(payload);
    if (!parsed.ok) return parsed;

    const postUuid = await resolvePostUuid(postId);
    if (!postUuid) return kcApiError('Post inválido para edição.');

    try {
      // 1) Permission check (author or admin)
      const own = await client.from('posts').select('id, author_id').eq('id', postUuid).maybeSingle();
      if (own && own.error) {
        console.error('[KCAPI][Supabase] updatePost ownership check erro:', own.error);
        return kcApiError('Não foi possível validar permissão de edição.');
      }
      if (!own || !own.data) return kcApiError('Publicação não encontrada.');
      const permission = await canManagePostRow(client, user, own.data);
      if (!permission.ok) return kcApiError('Você não pode editar este post.');

      // 2) Update post fields (text, metadata, etc.)
      const upd = await client
        .from('posts')
        .update(parsed.data)
        .eq('id', postUuid)
        .select('id')
        .maybeSingle();

      if (upd && upd.error) {
        console.error('[KCAPI][Supabase] updatePost erro:', upd.error);
        return kcApiError('Não foi possível salvar alterações.');
      }

      // 3) Handle image updates (upload new, delete removed, sync post_media)
      // Always sync — even if empty (user might have removed all images)
      const newImages = Array.isArray(parsed.images) ? parsed.images : [];
      try {
        const finalImages = await syncPostMediaForUpdate(client, postUuid, user.id, newImages);
        const coverImageUrl = resolveFirstImageUrl(finalImages);
        const coverUpdate = await updatePostCoverImage(client, postUuid, parsed.data.metadata, coverImageUrl);
        if (coverUpdate && coverUpdate.error) {
          console.warn('[KCAPI][Supabase] updatePost image_url fallback update falhou:', coverUpdate.error);
        }
      } catch (imgErr) {
        console.error('[KCAPI][Supabase] updatePost syncPostMedia erro:', imgErr);
        // Non-blocking: text fields were saved, image sync failed partially
      }

      await recordPostAuditEvent(client, postUuid, 'post_edited', {
        source: permission.isAdminOverride ? 'admin_update' : 'owner_update',
        fields: Object.keys(parsed.data || {}),
      });

      const getPostByIdFn2 = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function' ? window._KCSA.posts.getPostById : null;
      const updated = getPostByIdFn2 ? await getPostByIdFn2(postUuid) : null;
      if (!updated) return kcApiError('Post atualizado, mas não foi possível recarregar.');

      return { ok: true, data: updated };
    } catch (e) {
      console.error('[KCAPI][Supabase] updatePost exceção:', e);
      return kcApiError('Não foi possível salvar alterações.');
    }
  }

  async function deletePost(postId) {
    const client = getSupabaseClient();
    if (!client) return kcApiError('Supabase não inicializado.');

    const user = await getCurrentUser();
    if (!user) return kcApiError('Faça login para excluir.');

    const postUuid = await resolvePostUuid(postId);
    if (!postUuid) return kcApiError('Post inválido para exclusão.');

    try {
      const own = await client.from('posts').select('id, author_id').eq('id', postUuid).maybeSingle();
      if (own && own.error) {
        console.error('[KCAPI][Supabase] deletePost ownership check erro:', own.error);
        return kcApiError('Não foi possível validar permissão de exclusão.');
      }
      if (!own || !own.data) return kcApiError('Publicação não encontrada.');
      const permission = await canManagePostRow(client, user, own.data);
      if (!permission.ok) return kcApiError('Você não pode excluir este post.');

      const media = await client.from('post_media').select('id, url').eq('post_id', postUuid);
      if (media && media.error) {
        console.error('[KCAPI][Supabase] deletePost leitura de post_media falhou:', media.error);
        return kcApiError('NÀƒÂ£o foi possÀƒÂ­vel validar as mÀƒÂ­dias da publicaÀƒÂ§ÀƒÂ£o.');
      }

      const cleanup = await window._KCSA.media.cleanupStorage(client, (media && media.data) ? media.data : [], {
        userId: user.id,
        postId: postUuid,
      });
      if (Array.isArray(cleanup.failedPaths) && cleanup.failedPaths.length) {
        console.error('[KCAPI][Supabase] deletePost cleanup bloqueou a exclusao:', cleanup);
        return {
          ok: false,
          error: {
            message: 'N\u00E3o foi poss\u00EDvel excluir a publica\u00E7\u00E3o porque a remo\u00E7\u00E3o das m\u00EDdias falhou. Tente novamente.',
            code: 'POST_MEDIA_STORAGE_CLEANUP_FAILED',
            details: cleanup,
          },
        };
      }

      const del = await client.from('posts').delete().eq('id', postUuid);
      if (del && del.error) {
        console.error('[KCAPI][Supabase] deletePost erro:', del.error);
        return kcApiError('Não foi possível excluir a publicação.');
      }
      return { ok: true };
    } catch (e) {
      console.error('[KCAPI][Supabase] deletePost exceção:', e);
      return kcApiError('Não foi possível excluir a publicação.');
    }
  }

  // ---------- Reports (V8.1.6.2) ----------
  // Denunciar Post: insere 1 linha em public.reports (RLS força reporter_id = auth.uid())
  // Retorno: { ok, data?, error? }
  async function reportPost(postId, payload = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };

    const user = await getCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para denunciar.' } };

    // resolve UUID do post (aceita uuid direto; para legacy numérico tenta resolver via getPostById)
    let postUuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!postUuid && postId != null) {
      try {
        const getPostByIdFn3 = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function' ? window._KCSA.posts.getPostById : null;
        const p = getPostByIdFn3 ? await getPostByIdFn3(String(postId)) : null;
        if (p && p.uuid && UUID_RE.test(String(p.uuid))) postUuid = String(p.uuid);
        else if (p && p.id && UUID_RE.test(String(p.id))) postUuid = String(p.id);
      } catch (_) { }
    }
    if (!postUuid) return { ok: false, error: { message: 'Post inválido para denúncia.' } };

    const reason = String(payload.reason || '').trim().toLowerCase();
    const allowed = new Set(['spam', 'scam', 'inappropriate', 'hate', 'illegal', 'duplicate', 'other', 'post_closed']);
    if (!allowed.has(reason)) return { ok: false, error: { message: 'Selecione um motivo válido.' } };

    const detailsRaw = (payload.details == null) ? '' : String(payload.details);
    const details = detailsRaw.trim().slice(0, 1000);

    try {
      // Caminho preferencial (V8.2.9.1): RPC server-side para reduzir fragilidade de RLS no client.
      const rpc = await client.rpc('kc_report_post', {
        p_post_id: postUuid,
        p_reason: reason,
        p_details: details ? details : null,
      });

      if (rpc && !rpc.error && rpc.data && typeof rpc.data === 'object') {
        if (rpc.data.ok) {
          return {
            ok: true,
            data: {
              id: rpc.data.id || null,
              post_id: rpc.data.post_id || postUuid,
            },
          };
        }

        const rpcMessage = String(rpc.data.message || '').trim();
        const rpcCode = String(rpc.data.code || '').trim().toUpperCase();
        if (rpcCode === 'ALREADY_REPORTED') {
          return { ok: false, error: { message: rpcMessage || 'Você já denunciou este post.' }, meta: { duplicate: true } };
        }

        if (rpcMessage) {
          return { ok: false, error: { message: rpcMessage } };
        }
      }

      // Fallback legado: INSERT direto
      const ins = await client
        .from('reports')
        .insert({
          post_id: postUuid,
          reporter_id: user.id,
          reason,
          details: details ? details : null,
          status: 'open',
        })
        .select('id, created_at')
        .maybeSingle();

      if (ins && ins.error) {
        // UNIQUE parcial: reports_unique_open_post_reporter
        const code = String(ins.error.code || '');
        const msg = String(ins.error.message || '').toLowerCase();
        if (code === '23505' || msg.includes('reports_unique_open_post_reporter') || msg.includes('duplicate')) {
          return { ok: false, error: { message: 'Você já denunciou este post.' }, meta: { duplicate: true } };
        }
        console.error('[KCAPI][Supabase] reportPost erro:', ins.error);
        return { ok: false, error: { message: 'Não foi possível registrar a denúncia.' } };
      }

      return { ok: true, data: (ins && ins.data) ? ins.data : { id: null } };
    } catch (e) {
      console.error('[KCAPI][Supabase] reportPost exceção:', e);
      return { ok: false, error: { message: 'Não foi possível registrar a denúncia.' } };
    }
  }

  // ── kc_toggle_post_status ────────────────────────────────────
  // Permite ao autor alternar o próprio anúncio entre published ↔ hidden.
  // Bloqueia reativação quando o usuário está no limite de publicações ativas.
  async function togglePostStatus(postId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };

    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false, error: { message: 'ID de publicação inválido.' } };

    try {
      const { data, error } = await client.rpc('kc_toggle_post_status', { p_post_id: uuid });
      if (error) {
        return { ok: false, error };
      }
      if (!data || data.ok === false) {
        return {
          ok: false,
          code: (data && data.code) || 'UNKNOWN',
          message: (data && data.message) || 'Não foi possível alterar o status da publicação.',
          limit: data && data.limit,
          count: data && data.count,
        };
      }
      return {
        ok: true,
        new_status: data.new_status,
        message: data.message,
      };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  // ── Renovar post expirado/oculto ──────────────────────────────────────────
  async function renewPost(postId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false, error: { message: 'ID de publicação inválido.' } };
    try {
      const { data, error } = await client.rpc('kc_renew_post', { p_post_id: uuid });
      if (error) return { ok: false, error };
      if (!data || data.ok === false) {
        return {
          ok: false,
          _kcError: data && data.code === 'LIMIT_REACHED' ? 'POST_LIMIT_REACHED' : undefined,
          code: (data && data.code) || 'UNKNOWN',
          message: (data && data.message) || 'Não foi possível renovar a publicação.',
          limit: data && data.limit,
          count: data && data.count,
        };
      }
      return { ok: true, new_status: data.new_status, expires_at: data.expires_at, message: data.message };
    } catch (e) { return { ok: false, error: e }; }
  }

  // ── Impulsionar post (bump) ────────────────────────────────────────────────
  async function bumpPost(postId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false, error: { message: 'ID de publicação inválido.' } };
    try {
      const { data, error } = await client.rpc('kc_bump_post', { p_post_id: uuid });
      if (error) return { ok: false, error };
      if (!data || data.ok === false) {
        return {
          ok: false,
          code: (data && data.code) || 'UNKNOWN',
          message: (data && data.message) || 'Não foi possível impulsionar a publicação.',
          next_bump_at: data && data.next_bump_at,
        };
      }
      return { ok: true, bumped_at: data.bumped_at, next_bump_at: data.next_bump_at, message: data.message };
    } catch (e) { return { ok: false, error: e }; }
  }

  async function closePost(postId, payload = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false, error: { message: 'ID de publicaÃ§Ã£o invÃ¡lido.' } };
    const reason = String(payload.reason || 'owner_closed').trim().slice(0, 80) || 'owner_closed';

    try {
      const { data, error } = await client.rpc('kc_close_post', {
        p_post_id: uuid,
        p_reason: reason,
      });
      if (error) return { ok: false, error };
      if (!data || data.ok === false) {
        return {
          ok: false,
          code: (data && data.code) || 'UNKNOWN',
          message: (data && data.message) || 'NÃ£o foi possÃ­vel encerrar a publicaÃ§Ã£o.',
        };
      }
      return {
        ok: true,
        new_status: data.new_status || data.status || 'closed',
        status: data.status || data.new_status || 'closed',
        closed_at: data.closed_at || null,
        message: data.message,
      };
    } catch (e) { return { ok: false, error: e }; }
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  async function reactivatePost(postId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase n\u00E3o inicializado.' } };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false, error: { message: 'ID de publica\u00E7\u00E3o inv\u00E1lido.' } };

    try {
      const { data, error } = await client.rpc('kc_reactivate_post', { p_post_id: uuid });
      if (error) return { ok: false, error };
      if (!data || data.ok === false) {
        return {
          ok: false,
          _kcError: data && data.code === 'LIMIT_REACHED' ? 'POST_LIMIT_REACHED' : undefined,
          code: (data && data.code) || 'UNKNOWN',
          message: (data && data.message) || 'N\u00E3o foi poss\u00EDvel reativar a publica\u00E7\u00E3o.',
          limit: data && data.limit,
          count: data && data.count,
        };
      }
      return {
        ok: true,
        new_status: data.new_status || data.status || 'published',
        status: data.status || data.new_status || 'published',
        expires_at: data.expires_at || null,
        message: data.message,
      };
    } catch (e) { return { ok: false, error: e }; }
  }

  window._KCSA.postsWrite = {
    createPost,
    updatePost,
    deletePost,
    reportPost,
    togglePostStatus,
    renewPost,
    bumpPost,
    closePost,
    reactivatePost,
  };

})();
