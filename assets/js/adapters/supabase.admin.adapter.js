
(function () {
  'use strict';
  // Sub-adapter de admin/help-requests — registrado em window._KCSA.admin (v11.30.2)
  // Dependências resolvidas lazily via window._KCSA.getClient / getCurrentUser
  window._KCSA = window._KCSA || {};

  function getClient() {
    return (window._KCSA && typeof window._KCSA.getClient === 'function')
      ? window._KCSA.getClient() : null;
  }

  function getCurrentUser() {
    return (window._KCSA && typeof window._KCSA.getCurrentUser === 'function')
      ? window._KCSA.getCurrentUser() : Promise.resolve(null);
  }

  // ── Helpers de normalização ────────────────────────────────────────────────

  function normalizeHelpPayload(payload, user) {
    const sharedHelp = window.KCHelpUtils || {};
    if (sharedHelp && typeof sharedHelp.normalizeHelpRequestInput === 'function') {
      return sharedHelp.normalizeHelpRequestInput(payload, {
        fallbackEmail: user && user.email ? user.email : '',
      });
    }
    const input = (payload && typeof payload === 'object') ? payload : {};
    return {
      user_id: user && user.id ? String(user.id) : null,
      type: String(input.type || 'question').trim(),
      topic: String(input.topic || 'platform_use').trim(),
      subtopic: input.subtopic ? String(input.subtopic).trim() : null,
      subject: String(input.subject || '').trim().slice(0, 140),
      message: String(input.message || '').trim().slice(0, 4000),
      priority: String(input.priority || 'normal').trim(),
      status: String(input.status || 'new').trim(),
      page_path: input.page_path ? String(input.page_path).trim().slice(0, 255) : null,
      contact_email: String(input.contact_email || (user && user.email) || '').trim().toLowerCase(),
      allow_contact: input.allow_contact !== false,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    };
  }

  function attachAdminHelpListMeta(rows, meta = {}) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const totalCount = Number(meta.totalCount);
    const limit = Number(meta.limit);
    const offset = Number(meta.offset);
    return Object.assign(list, {
      totalCount: Number.isFinite(totalCount) ? totalCount : list.length,
      limit: Number.isFinite(limit) ? limit : list.length,
      offset: Number.isFinite(offset) ? offset : 0,
      hasMore: Boolean(meta.hasMore),
    });
  }

  function buildAdminHelpSearchQuery(rawValue) {
    const cleaned = String(rawValue || '')
      .replace(/[,%()']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';
    return [
      `subject.ilike.%${cleaned}%`,
      `message.ilike.%${cleaned}%`,
      `contact_email.ilike.%${cleaned}%`,
      `page_path.ilike.%${cleaned}%`,
      `type.ilike.%${cleaned}%`,
      `topic.ilike.%${cleaned}%`,
      `subtopic.ilike.%${cleaned}%`,
    ].join(',');
  }

  // ── API: Criar pedido de ajuda ─────────────────────────────────────────────

  async function createHelpRequest(payload = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await getCurrentUser();
    const normalized = normalizeHelpPayload(payload, user);

    if (!normalized.subject || !normalized.message || !normalized.contact_email) {
      return { ok: false, error: { message: 'Preencha assunto, descrição e e-mail de retorno.' } };
    }

    const insertPayload = {
      user_id: user && user.id ? user.id : null,
      type: normalized.type,
      topic: normalized.topic,
      subtopic: normalized.subtopic || null,
      subject: normalized.subject,
      message: normalized.message,
      priority: normalized.priority,
      status: normalized.status,
      page_path: normalized.page_path || null,
      contact_email: normalized.contact_email,
      allow_contact: normalized.allow_contact !== false,
      metadata: normalized.metadata || {},
    };

    try {
      const { data, error } = await client
        .from('help_requests')
        .insert(insertPayload)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][help] createHelpRequest:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível enviar o pedido de ajuda.' } };
      }

      return { ok: true, data: data || insertPayload };
    } catch (e) {
      console.error('[KCAPI][help] createHelpRequest exceção:', e);
      return { ok: false, error: { message: 'Não foi possível enviar o pedido de ajuda.' } };
    }
  }

  // ── API: Listar pedidos (admin) ────────────────────────────────────────────

  async function listAdminHelpRequests(filters = {}) {
    const client = getClient();
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 25));
    const offset = Math.max(0, Number(filters.offset) || 0);
    if (!client) return attachAdminHelpListMeta([], { totalCount: 0, limit, offset, hasMore: false });

    const status = filters.status && filters.status !== 'all' ? String(filters.status).trim() : '';
    const type = filters.type && filters.type !== 'all' ? String(filters.type).trim() : '';
    const priority = filters.priority && filters.priority !== 'all' ? String(filters.priority).trim() : '';
    const searchQuery = buildAdminHelpSearchQuery(filters.query);

    try {
      if (!priority && !searchQuery) {
        const rpcResult = await client.rpc('kc_admin_list_help_requests_paged', {
          p_status: status || null,
          p_type: type || null,
          p_limit: limit,
          p_offset: offset,
        });

        if (!rpcResult.error) {
          const rows = Array.isArray(rpcResult.data) ? rpcResult.data : [];
          const totalCount = rows.length ? Number(rows[0].total_count) || rows.length : 0;
          const normalizedRows = rows.map((row) => {
            const nextRow = { ...(row || {}) };
            delete nextRow.total_count;
            return nextRow;
          });
          return attachAdminHelpListMeta(normalizedRows, {
            totalCount,
            limit,
            offset,
            hasMore: (offset + normalizedRows.length) < totalCount,
          });
        }

        console.warn('[KCAPI][help] kc_admin_list_help_requests_paged fallback:', rpcResult.error);
      }

      let query = client
        .from('help_requests')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);
      if (type) query = query.eq('type', type);
      if (priority) query = query.eq('priority', priority);
      if (searchQuery) query = query.or(searchQuery);

      const { data, error, count } = await query;
      if (error) {
        console.error('[KCAPI][help] listAdminHelpRequests:', error);
        return attachAdminHelpListMeta([], { totalCount: 0, limit, offset, hasMore: false });
      }

      const rows = Array.isArray(data) ? data : [];
      const totalCount = Number.isFinite(Number(count)) ? Number(count) : rows.length;
      return attachAdminHelpListMeta(rows, {
        totalCount,
        limit,
        offset,
        hasMore: (offset + rows.length) < totalCount,
      });
    } catch (e) {
      console.error('[KCAPI][help] listAdminHelpRequests excecao:', e);
      return attachAdminHelpListMeta([], { totalCount: 0, limit, offset, hasMore: false });
    }
  }

  // ── API: Atualizar pedido (admin) ──────────────────────────────────────────

  async function updateAdminHelpRequest(id, patch = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const targetId = String(id || '').trim();
    if (!targetId) return { ok: false, error: { message: 'Pedido inválido.' } };

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) updates.status = String(patch.status || '').trim() || 'new';
    if (Object.prototype.hasOwnProperty.call(patch, 'priority')) updates.priority = String(patch.priority || '').trim() || 'normal';
    if (Object.prototype.hasOwnProperty.call(patch, 'metadata') && patch.metadata && typeof patch.metadata === 'object') {
      updates.metadata = patch.metadata;
    }

    if (!Object.keys(updates).length) {
      return { ok: false, error: { message: 'Nenhuma alteração informada.' } };
    }

    try {
      const { data, error } = await client
        .from('help_requests')
        .update(updates)
        .eq('id', targetId)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][help] updateAdminHelpRequest:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível atualizar o pedido.' } };
      }

      return { ok: true, data: data || null };
    } catch (e) {
      console.error('[KCAPI][help] updateAdminHelpRequest exceção:', e);
      return { ok: false, error: { message: 'Não foi possível atualizar o pedido.' } };
    }
  }

  window._KCSA.admin = {
    createHelpRequest,
    listAdminHelpRequests,
    updateAdminHelpRequest,
  };
})();
