
(function () {
  'use strict';
  // Sub-adapter de admin/help-requests — registrado em window._KCSA.admin (v11.30.2)
  // Dependências resolvidas lazily via window._KCSA.getClient / getCurrentUser
  window._KCSA = window._KCSA || {};
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      ok: meta.ok !== false,
      error: meta.error && typeof meta.error === 'object' ? meta.error : null,
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

  function isExternalAccessHelpRequest(row) {
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return String((row && row.type) || '').trim() === 'external_access'
      || String(metadata.request_kind || '').trim() === 'external_access';
  }

  function isAnonymousAuthUser(user) {
    return Boolean(user && user.is_anonymous === true);
  }

  function getPrivacyHelpRequestKind(row) {
    const type = String((row && row.type) || '').trim().toLowerCase();
    const topic = String((row && row.topic) || '').trim().toLowerCase();
    const subtopic = String((row && row.subtopic) || '').trim().toLowerCase();
    if (type !== 'account_access' || topic !== 'onboarding_settings') return '';
    if (subtopic === 'account_data_copy') return 'data_access_copy';
    if (subtopic === 'account_data_portability') return 'data_portability';
    if (subtopic === 'account_deletion') return 'account_erasure';
    return '';
  }

  function normalizeHelpRpcError(error) {
    const rawMessage = String((error && error.message) || '').trim();
    const rawDetails = String(
      (error && (error.details || error.detail)) || ''
    ).trim();
    const applicationCode = /^[A-Z][A-Z0-9_]{2,80}$/.test(rawMessage)
      ? rawMessage
      : String((error && error.code) || '').trim();
    const messages = {
      HELP_IDEMPOTENCY_PAYLOAD_CONFLICT:
        'O conteúdo difere de uma tentativa ainda protegida contra duplicidade. Restaure os mesmos dados da tentativa anterior ou confirme o atendimento antes de iniciar outro pedido.',
      HELP_IDEMPOTENCY_KEY_INVALID:
        'Não foi possível validar a proteção deste envio. Atualize a página e revise o pedido antes de tentar novamente.',
      HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR:
        'A referência protegida deste envio não pôde ser confirmada. Não reenvie; use a Central de Ajuda para verificar o atendimento.',
      HELP_IDEMPOTENCY_PAYLOAD_TOO_LARGE:
        'O pedido ultrapassa o tamanho seguro aceito. Reduza a descrição ou os campos adicionais e tente novamente.',
      HELP_IDEMPOTENCY_KEY_RETIRED:
        'A tentativa anterior foi encerrada com segurança. Revise os dados e envie novamente.',
      HELP_RATE_LIMIT_1H:
        'O limite temporário de pedidos foi atingido. Aguarde e tente novamente mais tarde.',
      HELP_TURNSTILE_TOKEN_REQUIRED:
        'Conclua a verificação de segurança antes de enviar o pedido ou entre na sua conta.',
      HELP_TURNSTILE_VERIFICATION_FAILED:
        'A verificação de segurança expirou ou não pôde ser confirmada. Faça uma nova verificação e tente novamente.',
      HELP_TURNSTILE_UNAVAILABLE:
        'A verificação de segurança está indisponível agora. Tente novamente mais tarde ou entre na sua conta.',
      TURNSTILE_TOKEN_REQUIRED:
        'Conclua a verificação de segurança antes de enviar o pedido ou entre na sua conta.',
      TURNSTILE_VERIFICATION_FAILED:
        'A verificação de segurança expirou ou não pôde ser confirmada. Faça uma nova verificação e tente novamente.',
      TURNSTILE_INVALID:
        'A verificação de segurança não foi aceita. Conclua uma nova verificação e tente novamente.',
      TURNSTILE_UNAVAILABLE:
        'A verificação de segurança está indisponível agora. Tente novamente mais tarde ou entre na sua conta.',
      GUEST_PRIVACY_BUSY:
        'Há muitos pedidos visitantes sendo processados agora. Aguarde um instante e tente novamente ou entre na sua conta.',
    };
    const safeToReplace =
      rawDetails === 'HELP_IDEMPOTENCY_SAFE_TO_REPLACE';
    return {
      code: applicationCode || 'HELP_REQUEST_FAILED',
      db_code: String((error && error.code) || '').trim() || null,
      message: messages[applicationCode]
        || rawMessage
        || 'Não foi possível enviar o pedido de ajuda.',
      idempotency: {
        safe_to_replace: safeToReplace,
        response_confirmed: false,
      },
    };
  }

  async function normalizePrivacyGuestEdgeError(error, responseData) {
    let edgeBody =
      responseData &&
      typeof responseData === 'object' &&
      !Array.isArray(responseData)
        ? responseData
        : null;
    if (
      !edgeBody &&
      error &&
      error.context &&
      typeof error.context.json === 'function'
    ) {
      try {
        const parsed = await error.context.json();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          edgeBody = parsed;
        }
      } catch (_) {
        edgeBody = null;
      }
    }

    const nestedError =
      edgeBody &&
      edgeBody.error &&
      typeof edgeBody.error === 'object' &&
      !Array.isArray(edgeBody.error)
        ? edgeBody.error
        : null;
    const structured = nestedError || edgeBody || {};
    const stringError =
      edgeBody && typeof edgeBody.error === 'string'
        ? String(edgeBody.error).trim()
        : '';
    const applicationCode = String(
      structured.code ||
      (edgeBody && edgeBody.code) ||
      (/^[A-Z][A-Z0-9_]{2,80}$/.test(stringError) ? stringError : '')
    ).trim();
    const publicMessage = String(
      structured.message ||
      (edgeBody && edgeBody.message) ||
      stringError ||
      (error && error.message) ||
      ''
    ).trim();
    const details = String(
      structured.details ||
      structured.detail ||
      (edgeBody && (edgeBody.details || edgeBody.detail)) ||
      ''
    ).trim();
    const normalized = normalizeHelpRpcError({
      message: applicationCode || publicMessage,
      code: String(
        structured.db_code ||
        (edgeBody && edgeBody.db_code) ||
        (error && error.code) ||
        ''
      ).trim(),
      details,
    });
    normalized.idempotency.safe_to_replace = Boolean(
      edgeBody &&
      edgeBody.ok === false &&
      nestedError &&
      nestedError.idempotency &&
      typeof nestedError.idempotency === 'object' &&
      !Array.isArray(nestedError.idempotency) &&
      nestedError.idempotency.safe_to_replace === true
    );
    if (
      normalized.code === 'HELP_REQUEST_FAILED' ||
      normalized.message === 'Edge Function returned a non-2xx status code'
    ) {
      normalized.message =
        'Não foi possível validar e enviar o pedido visitante. Faça uma nova verificação ou entre na sua conta.';
    }
    return normalized;
  }

  function validatePrivacyHelpRpcEnvelope(row, expectedAuthState) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return false;
    }
    const id = String(row.out_id || '').trim();
    const createdAt = String(row.out_created_at || '').trim();
    if (
      !UUID_RE.test(id) ||
      !createdAt ||
      !Number.isFinite(Date.parse(createdAt)) ||
      typeof row.out_idempotency_replayed !== 'boolean' ||
      typeof row.out_reused_existing !== 'boolean' ||
      row.out_notification_claim != null ||
      row.out_notification_claim_expires_at != null
    ) {
      return false;
    }
    const protocol = String(row.out_protocol || '').trim();
    const dsr = row.out_data_subject_request;
    if (expectedAuthState === 'authenticated') {
      return Boolean(
        /^KC-DSR-[0-9]{8}-[A-F0-9]{16}$/.test(protocol) &&
        dsr &&
        typeof dsr === 'object' &&
        !Array.isArray(dsr) &&
        UUID_RE.test(String(dsr.id || '').trim()) &&
        String(dsr.protocol || '').trim() === protocol
      );
    }
    return !protocol && dsr == null;
  }

  function validatePrivacyHelpRecoveryEnvelope(row, sourceAuthState) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const recoveryState = String(row.out_recovery_state || '').trim();
    if (recoveryState === 'recovered') {
      return validatePrivacyHelpRpcEnvelope(row, sourceAuthState)
        && row.out_idempotency_replayed === true;
    }
    if (recoveryState !== 'retired' && recoveryState !== 'ambiguous') {
      return false;
    }
    return (
      row.out_id == null &&
      row.out_created_at == null &&
      row.out_notification_claim == null &&
      row.out_notification_claim_expires_at == null &&
      row.out_data_subject_request == null &&
      row.out_protocol == null &&
      row.out_reused_existing === false &&
      row.out_idempotency_replayed === false
    );
  }

  function mapPrivacyHelpReceipt(row) {
    return {
      id: row && row.out_id ? String(row.out_id) : null,
      created_at: row && row.out_created_at
        ? String(row.out_created_at)
        : null,
      data_subject_request:
        row &&
        row.out_data_subject_request &&
        typeof row.out_data_subject_request === 'object'
          ? row.out_data_subject_request
          : null,
      protocol: row && row.out_protocol
        ? String(row.out_protocol)
        : null,
      reused_existing_data_subject_request:
        Boolean(row && row.out_reused_existing === true),
      idempotency_replayed:
        Boolean(row && row.out_idempotency_replayed === true),
    };
  }

  async function notifyExternalHelpRequest(client, row, notificationClaim) {
    if (!client || !row || !row.id || !isExternalAccessHelpRequest(row)) return { ok: true, skipped: true };
    if (!client.functions || typeof client.functions.invoke !== 'function') {
      return { ok: false, skipped: true, error: { message: 'Edge Functions indisponíveis no cliente Supabase.' } };
    }
    try {
      const { data, error } = await client.functions.invoke('kc-help-request-notify', {
        body: {
          help_request_id: row.id,
          notification_claim: String(notificationClaim || ''),
        },
      });
      if (error) {
        console.warn('[KCAPI][help] kc-help-request-notify:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível notificar por e-mail.' } };
      }
      return { ok: true, data: data || null };
    } catch (e) {
      console.warn('[KCAPI][help] kc-help-request-notify exceção:', e);
      return { ok: false, error: { message: 'Não foi possível notificar por e-mail.' } };
    }
  }

  // ── API: Criar pedido de ajuda ─────────────────────────────────────────────

  async function createHelpRequest(payload = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const expectedUserId = String(
      (payload && (payload.expected_user_id || payload.user_id)) || ''
    ).trim();
    let expectedAuthState = String(
      (payload && payload.expected_auth_state) || ''
    ).trim().toLowerCase();
    if (!expectedAuthState) {
      expectedAuthState = expectedUserId ? 'authenticated' : 'anonymous';
    }
    if (expectedAuthState !== 'authenticated' && expectedAuthState !== 'anonymous') {
      return {
        ok: false,
        error: {
          code: 'AUTH_STATE_INVALID',
          message: 'O estado de autenticação do pedido é inválido. Atualize a página e tente novamente.',
        },
      };
    }
    const user = await getCurrentUser();
    const currentUserId = String((user && user.id) || '').trim();
    const currentAuthState = currentUserId && !isAnonymousAuthUser(user)
      ? 'authenticated'
      : 'anonymous';
    if (
      currentAuthState !== expectedAuthState
      || (
        expectedAuthState === 'authenticated'
        && (!expectedUserId || currentUserId !== expectedUserId)
      )
      || (expectedAuthState === 'anonymous' && expectedUserId)
    ) {
      return {
        ok: false,
        error: {
          code: 'ACCOUNT_CHANGED',
          message: 'A conta ativa mudou durante o envio. Revise o pedido antes de tentar novamente.',
        },
      };
    }
    const normalized = normalizeHelpPayload(payload, user);

    if (!normalized.subject || !normalized.message || !normalized.contact_email) {
      return { ok: false, error: { message: 'Preencha assunto, descrição e e-mail de retorno.' } };
    }

    // Payload base usado para fallback de notificação e como referência local
    const insertPayload = {
      user_id: currentAuthState === 'authenticated' ? currentUserId : null,
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

    // v9.3.5.3: usa RPC kc_create_help_request (SECURITY DEFINER) em vez de
    // .from('help_requests').insert(...) direto. O insert direto falhava com
    // erro 42501 ("new row violates row-level security policy") para callers
    // anon -- ate com WITH CHECK true. A RPC contorna o problema, valida o
    // payload no servidor e propaga auth.uid() para autenticados.
    const rpcPayload = {
      type: insertPayload.type,
      topic: insertPayload.topic,
      subtopic: insertPayload.subtopic,
      subject: insertPayload.subject,
      message: insertPayload.message,
      priority: insertPayload.priority,
      page_path: insertPayload.page_path,
      contact_email: insertPayload.contact_email,
      allow_contact: insertPayload.allow_contact,
      metadata: insertPayload.metadata,
      expected_user_id: expectedUserId || null,
      expected_auth_state: expectedAuthState,
    };
    const privacyRequestKind = getPrivacyHelpRequestKind(insertPayload);
    const privacyIdempotencyKey = String(
      (payload && payload.idempotency_key) || ''
    ).trim().toLowerCase();
    if (privacyRequestKind && !/^[a-f0-9]{64}$/.test(privacyIdempotencyKey)) {
      return {
        ok: false,
        error: {
          code: 'HELP_IDEMPOTENCY_KEY_REQUIRED',
          message: 'Não foi possível preparar uma chave segura para este pedido. Atualize a página e tente novamente.',
        },
      };
    }

    const isGuestPrivacyRequest =
      Boolean(privacyRequestKind) &&
      currentAuthState === 'anonymous';
    const turnstileToken = String(
      (payload && payload.turnstile_token) || ''
    ).trim();
    if (isGuestPrivacyRequest && !turnstileToken) {
      return {
        ok: false,
        error: normalizeHelpRpcError({
          message: 'HELP_TURNSTILE_TOKEN_REQUIRED',
        }),
      };
    }

    try {
      if (privacyRequestKind) {
        rpcPayload.idempotency_key = privacyIdempotencyKey;
      }
      let data;
      let error;
      if (isGuestPrivacyRequest) {
        if (
          !client.functions ||
          typeof client.functions.invoke !== 'function'
        ) {
          return {
            ok: false,
            error: {
              code: 'BACKEND_REQUIRED',
              message: 'O envio visitante de privacidade não está disponível neste ambiente. Entre na sua conta ou tente novamente mais tarde.',
            },
          };
        }
        try {
          const edgeResponse = await client.functions.invoke(
            'kc-create-privacy-help-guest',
            {
              body: {
                turnstile_token: turnstileToken,
                payload: rpcPayload,
              },
            }
          );
          data = edgeResponse && edgeResponse.data;
          error = edgeResponse && edgeResponse.error;
        } catch (edgeError) {
          return {
            ok: false,
            error: await normalizePrivacyGuestEdgeError(edgeError, null),
          };
        }
        if (error) {
          return {
            ok: false,
            error: await normalizePrivacyGuestEdgeError(error, data),
          };
        }
        if (!data || data.ok !== true) {
          return {
            ok: false,
            error: await normalizePrivacyGuestEdgeError(null, data),
          };
        }
        data = data.data;
      } else {
        const rpcName = privacyRequestKind
          ? 'kc_create_privacy_help_request_v1'
          : 'kc_create_help_request_with_notification_claim_v2';
        const rpcResponse = await client.rpc(rpcName, {
          p_payload: rpcPayload,
        });
        data = rpcResponse && rpcResponse.data;
        error = rpcResponse && rpcResponse.error;
        if (error) {
          console.error('[KCAPI][help] createHelpRequest:', error);
          return { ok: false, error: normalizeHelpRpcError(error) };
        }
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (
        privacyRequestKind &&
        !validatePrivacyHelpRpcEnvelope(row, expectedAuthState)
      ) {
        return {
          ok: false,
          error: {
            code: 'HELP_IDEMPOTENCY_RESPONSE_AMBIGUOUS',
            message: 'O servidor não confirmou uma resposta completa. Para evitar duplicidade, mantenha esta página e tente recuperar a mesma tentativa mais tarde.',
          },
        };
      }
      const notificationClaim = row && row.out_notification_claim
        ? String(row.out_notification_claim)
        : '';
      if (privacyRequestKind && notificationClaim) {
        return {
          ok: false,
          error: {
            code: 'HELP_IDEMPOTENCY_NOTIFICATION_CLAIM_UNEXPECTED',
            message: 'O servidor recusou uma resposta incompatível com este pedido de privacidade.',
          },
        };
      }
      const createdRow = Object.assign(
        {},
        insertPayload,
        mapPrivacyHelpReceipt(row)
      );

      const notification = await notifyExternalHelpRequest(client, createdRow, notificationClaim);
      return { ok: true, data: createdRow, notification };
    } catch (e) {
      if (isGuestPrivacyRequest) {
        return {
          ok: false,
          error: await normalizePrivacyGuestEdgeError(e, null),
        };
      }
      console.error('[KCAPI][help] createHelpRequest exceção:', e);
      return { ok: false, error: normalizeHelpRpcError(e) };
    }
  }

  // ── API: Acesso externo (admin) ─────────────────────────────────────────
  // v9.3.5.4: lista e decide solicitacoes de acesso externo

  async function listExternalAccessRequests(filters = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' }, items: [], total: 0 };
    const status = String(filters.status || 'pending').trim().toLowerCase();
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
    const offset = Math.max(0, Number(filters.offset) || 0);
    try {
      const { data, error } = await client.rpc('kc_admin_list_external_access', {
        p_status: status === 'all' ? null : status,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) {
        console.error('[KCAPI][external-access] list error:', error);
        return { ok: false, error: { message: error.message || 'Falha ao listar solicitações.' }, items: [], total: 0 };
      }
      const rows = Array.isArray(data) ? data : [];
      const total = rows.length ? Number(rows[0].out_total_count) || rows.length : 0;
      const items = rows.map((r) => ({
        id: r.out_id,
        created_at: r.out_created_at,
        admin_status: r.out_admin_status,
        admin_decided_at: r.out_admin_decided_at,
        admin_note: r.out_admin_note,
        subject: r.out_subject,
        message: r.out_message,
        contact_email: r.out_contact_email,
        requester_name: r.out_requester_name,
        affiliation_context: r.out_affiliation_context,
        metadata: r.out_metadata || {},
      }));
      return { ok: true, items, total, limit, offset };
    } catch (e) {
      console.error('[KCAPI][external-access] list exception:', e);
      return { ok: false, error: { message: 'Falha ao listar solicitações.' }, items: [], total: 0 };
    }
  }

  async function decideExternalAccessRequest(payload = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const helpRequestId = String(payload.help_request_id || '').toLowerCase().trim();
    const decision = String(payload.decision || '').toLowerCase().trim();
    const adminNote = String(payload.admin_note || '').trim() || null;
    if (!helpRequestId) return { ok: false, error: { message: 'ID da solicitação inválido.' } };
    if (decision !== 'approved' && decision !== 'rejected') {
      return { ok: false, error: { message: 'Decisão inválida (esperado approved ou rejected).' } };
    }
    if (!client.functions || typeof client.functions.invoke !== 'function') {
      return { ok: false, error: { message: 'Edge Functions indisponíveis.' } };
    }
    try {
      const { data, error } = await client.functions.invoke('kc-external-access-decide', {
        body: { help_request_id: helpRequestId, decision, admin_note: adminNote },
      });
      if (error) {
        console.error('[KCAPI][external-access] decide error:', error);
        let edgeBody = null;
        try {
          if (error.context && typeof error.context.json === 'function') {
            edgeBody = await error.context.json();
          }
        } catch (_) { /* ignore */ }
        const message = edgeBody && (edgeBody.detail || edgeBody.message || edgeBody.error)
          ? String(edgeBody.detail || edgeBody.message || edgeBody.error)
          : String((error && error.message) || 'Falha ao processar decisão.');
        return { ok: false, error: { message, body: edgeBody || null } };
      }
      return { ok: true, data: data || null };
    } catch (e) {
      console.error('[KCAPI][external-access] decide exception:', e);
      return { ok: false, error: { message: 'Falha ao processar decisão.' } };
    }
  }

  // ── API: Listar pedidos (admin) ────────────────────────────────────────────

  async function listAdminHelpRequests(filters = {}) {
    const client = getClient();
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 25));
    const offset = Math.max(0, Number(filters.offset) || 0);
    if (!client) return attachAdminHelpListMeta([], { totalCount: 0, limit, offset, hasMore: false });

    const requestId = String(filters.requestId || filters.request_id || '').trim().toLowerCase();
    const status = filters.status && filters.status !== 'all' ? String(filters.status).trim() : '';
    const type = filters.type && filters.type !== 'all' ? String(filters.type).trim() : '';
    const priority = filters.priority && filters.priority !== 'all' ? String(filters.priority).trim() : '';
    const searchQuery = buildAdminHelpSearchQuery(filters.query);

    try {
      if (requestId) {
        if (!UUID_RE.test(requestId)) {
          return attachAdminHelpListMeta([], {
            ok: false,
            error: { message: 'Pedido de ajuda inválido.' },
            totalCount: 0,
            limit: 1,
            offset: 0,
            hasMore: false,
          });
        }
        const { data, error } = await client
          .from('help_requests')
          .select('*')
          .eq('id', requestId)
          .limit(1);
        if (error) {
          console.error('[KCAPI][help] exact help request lookup:', error);
          return attachAdminHelpListMeta([], {
            ok: false,
            error: { message: 'Não foi possível confirmar o estado atual do pedido.' },
            totalCount: 0,
            limit: 1,
            offset: 0,
            hasMore: false,
          });
        }
        const rows = Array.isArray(data) ? data : [];
        return attachAdminHelpListMeta(rows, {
          totalCount: rows.length,
          limit: 1,
          offset: 0,
          hasMore: false,
        });
      }
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
        return attachAdminHelpListMeta([], {
          ok: false,
          error: { message: 'Não foi possível consultar a fila de solicitações.' },
          totalCount: 0,
          limit,
          offset,
          hasMore: false,
        });
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
      return attachAdminHelpListMeta([], {
        ok: false,
        error: { message: 'Não foi possível consultar a fila de solicitações.' },
        totalCount: 0,
        limit,
        offset,
        hasMore: false,
      });
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
      const current = await client
        .from('help_requests')
        .select('metadata')
        .eq('id', targetId)
        .maybeSingle();
      const currentMetadata = current && current.data && current.data.metadata && typeof current.data.metadata === 'object'
        ? current.data.metadata
        : {};
      updates.metadata = { ...currentMetadata, ...patch.metadata };
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

  async function processAccountErasure(payload = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    if (!client.functions || typeof client.functions.invoke !== 'function') {
      return { ok: false, error: { message: 'Edge Functions indisponíveis.' } };
    }
    const input = payload && typeof payload === 'object' ? payload : {};
    const action = String(input.action || '').trim();
    if (!action) return { ok: false, error: { message: 'Ação LGPD inválida.' } };
    try {
      const { data, error } = await client.functions.invoke('kc-account-erasure', {
        body: input,
      });
      if (error) {
        console.error('[KCAPI][lgpd] kc-account-erasure:', error);
        let edgeBody = null;
        try {
          if (error.context && typeof error.context.json === 'function') {
            edgeBody = await error.context.json();
          }
        } catch (_) { /* ignore */ }
        const message = edgeBody && (edgeBody.detail || edgeBody.message || edgeBody.error)
          ? String(edgeBody.detail || edgeBody.message || edgeBody.error)
          : String(error.message || 'Falha no fluxo LGPD.');
        return { ok: false, error: { message, body: edgeBody || null } };
      }
      return data || { ok: true };
    } catch (e) {
      console.error('[KCAPI][lgpd] kc-account-erasure exceção:', e);
      return { ok: false, error: { message: 'Falha no fluxo LGPD.' } };
    }
  }

  async function recoverPrivacyHelpRequest(input = {}) {
    const client = getClient();
    if (!client) {
      return {
        ok: false,
        error: {
          code: 'BACKEND_REQUIRED',
          message: 'Recuperação de pedidos indisponível neste ambiente.',
        },
      };
    }
    const idempotencyKey = String(
      (input && input.idempotency_key) || ''
    ).trim().toLowerCase();
    const requestKind = String(
      (input && input.request_kind) || ''
    ).trim().toLowerCase();
    const expectedUserId = String(
      (input && input.expected_user_id) || ''
    ).trim();
    const expectedAuthState = String(
      (input && input.expected_auth_state) ||
      (expectedUserId ? 'authenticated' : 'anonymous')
    ).trim().toLowerCase();
    const sourceAuthState = String(
      (input && input.source_auth_state) || expectedAuthState
    ).trim().toLowerCase();
    if (
      !/^[a-f0-9]{64}$/.test(idempotencyKey) ||
      ![
        'data_access_copy',
        'data_portability',
        'account_erasure',
      ].includes(requestKind) ||
      !['anonymous', 'authenticated'].includes(expectedAuthState) ||
      !['anonymous', 'authenticated'].includes(sourceAuthState)
    ) {
      return {
        ok: false,
        error: {
          code: 'HELP_IDEMPOTENCY_RECOVERY_INVALID',
          message: 'A tentativa salva não contém dados técnicos válidos para recuperação.',
          idempotency: {
            safe_to_replace: false,
            response_confirmed: false,
          },
        },
      };
    }

    const user = await getCurrentUser();
    const currentUserId = String((user && user.id) || '').trim();
    const currentAuthState = currentUserId && !isAnonymousAuthUser(user)
      ? 'authenticated'
      : 'anonymous';
    const isSameUidAnonymousUpgrade = (
      currentAuthState === 'authenticated' &&
      sourceAuthState === 'anonymous' &&
      Boolean(currentUserId) &&
      currentUserId === expectedUserId
    );
    if (
      currentAuthState !== expectedAuthState ||
      (
        expectedAuthState === 'authenticated' &&
        (!expectedUserId || currentUserId !== expectedUserId)
      ) ||
      (expectedAuthState === 'anonymous' && expectedUserId) ||
      (
        sourceAuthState !== expectedAuthState &&
        !isSameUidAnonymousUpgrade
      )
    ) {
      return {
        ok: false,
        error: {
          code: 'ACCOUNT_CHANGED',
          message: 'A conta ativa não corresponde à tentativa salva.',
          idempotency: {
            safe_to_replace: false,
            response_confirmed: false,
          },
        },
      };
    }

    try {
      const { data, error } = await client.rpc(
        'kc_recover_privacy_help_request_v1',
        {
          p_payload: {
            idempotency_key: idempotencyKey,
            request_kind: requestKind,
            expected_auth_state: expectedAuthState,
            expected_user_id: expectedUserId || null,
            source_auth_state: sourceAuthState,
          },
        }
      );
      if (error) {
        return { ok: false, error: normalizeHelpRpcError(error) };
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!validatePrivacyHelpRecoveryEnvelope(row, sourceAuthState)) {
        return {
          ok: false,
          error: {
            code: 'HELP_IDEMPOTENCY_RESPONSE_AMBIGUOUS',
            message: 'O servidor não confirmou o estado da tentativa salva. A chave foi mantida para evitar duplicidade.',
            idempotency: {
              safe_to_replace: false,
              response_confirmed: false,
            },
          },
        };
      }
      const recoveryState = String(row.out_recovery_state || '').trim();
      if (recoveryState === 'recovered') {
        return {
          ok: true,
          data: mapPrivacyHelpReceipt(row),
          recovery: {
            state: 'recovered',
            safe_to_replace: false,
          },
        };
      }
      if (recoveryState === 'retired') {
        return {
          ok: false,
          error: {
            code: 'HELP_IDEMPOTENCY_RECOVERY_RETIRED',
            message: 'A tentativa sem recibo foi encerrada com segurança. Revise o formulário antes de um novo envio.',
            idempotency: {
              safe_to_replace: true,
              response_confirmed: true,
            },
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'HELP_IDEMPOTENCY_RECOVERY_AMBIGUOUS',
          message: 'Ainda não foi possível confirmar se a tentativa visitante chegou ao servidor. A chave foi mantida; aguarde e tente recuperar novamente.',
          idempotency: {
            safe_to_replace: false,
            response_confirmed: false,
          },
        },
      };
    } catch (error) {
      return { ok: false, error: normalizeHelpRpcError(error) };
    }
  }

  async function processDataExportSupplement(payload = {}) {
    const client = getClient();
    if (!client || !client.functions || typeof client.functions.invoke !== 'function') {
      return { ok: false, error: { message: 'Serviço de suplemento indisponível.' } };
    }
    try {
      const { data, error } = await client.functions.invoke('kc-data-export-admin', {
        body: payload && typeof payload === 'object' ? payload : {},
      });
      if (error) {
        let edgeBody = null;
        try {
          if (error.context && typeof error.context.json === 'function') {
            edgeBody = await error.context.json();
          }
        } catch (_) { /* ignore */ }
        const structured = edgeBody && edgeBody.error && typeof edgeBody.error === 'object'
          ? edgeBody.error
          : {};
        return {
          ok: false,
          error: {
            code: String(structured.code || 'DATA_EXPORT_SUPPLEMENT_FAILED'),
            message: String(structured.message || error.message || 'Falha no suplemento.'),
          },
        };
      }
      return data || { ok: true };
    } catch (_) {
      return { ok: false, error: { message: 'Falha no suplemento de exportação.' } };
    }
  }

  // ── Direitos do titular / exportacao autenticada ──────────────────────────

  const DATA_SUBJECT_REQUEST_KINDS = new Set([
    'data_access_copy',
    'data_portability',
    'account_erasure',
  ]);

  function buildDataSubjectIdempotencyKey(requestKind) {
    var prefix = 'dsr_' + String(requestKind || 'request') + '_';
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return prefix + window.crypto.randomUUID();
      }
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return prefix + Array.from(bytes).map(function (value) {
          return value.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (_) { /* fallback abaixo */ }
    return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14);
  }

  async function extractDataSubjectEdgeError(error, fallbackMessage) {
    var edgeBody = null;
    try {
      if (error && error.context && typeof error.context.json === 'function') {
        edgeBody = await error.context.json();
      }
    } catch (_) { /* ignore corpo invalido */ }
    var structured = edgeBody && edgeBody.error && typeof edgeBody.error === 'object'
      ? edgeBody.error
      : {};
    return {
      code: String(structured.code || 'DATA_SUBJECT_REQUEST_FAILED'),
      message: String(structured.message || (error && error.message) || fallbackMessage),
      body: edgeBody || null,
    };
  }

  async function invokeDataSubjectRequest(action, payload) {
    const client = getClient();
    if (!client) {
      return {
        ok: false,
        data: null,
        error: { code: 'SUPABASE_NOT_READY', message: 'Supabase n\u00E3o inicializado.' },
      };
    }
    const expectedUserId = String(
      (payload && typeof payload === 'object' && payload.expected_user_id) || ''
    ).trim();
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return {
        ok: false,
        data: null,
        error: { code: 'AUTH_REQUIRED', message: 'Entre na sua conta para continuar.' },
      };
    }
    if (expectedUserId && String(user.id || '').trim() !== expectedUserId) {
      return {
        ok: false,
        data: null,
        error: {
          code: 'ACCOUNT_CHANGED',
          message: 'A conta ativa mudou durante a operação. Revise o pedido antes de tentar novamente.',
        },
      };
    }
    if (!client.functions || typeof client.functions.invoke !== 'function') {
      return {
        ok: false,
        data: null,
        error: { code: 'EDGE_FUNCTIONS_UNAVAILABLE', message: 'Servi\u00E7o de privacidade indispon\u00EDvel.' },
      };
    }
    try {
      const { data, error } = await client.functions.invoke('kc-data-subject-request', {
        body: {
          action: String(action || '').trim(),
          ...((payload && typeof payload === 'object') ? payload : {}),
        },
      });
      if (error) {
        return {
          ok: false,
          data: null,
          error: await extractDataSubjectEdgeError(
            error,
            'N\u00E3o foi poss\u00EDvel processar a solicita\u00E7\u00E3o.',
          ),
        };
      }
      if (!data || data.ok !== true) {
        var responseError = data && data.error && typeof data.error === 'object'
          ? data.error
          : {};
        return {
          ok: false,
          data: null,
          error: {
            code: String(responseError.code || 'INVALID_EDGE_RESPONSE'),
            message: String(responseError.message || 'Resposta inv\u00E1lida do servi\u00E7o de privacidade.'),
            body: data || null,
          },
        };
      }
      var normalized = { ...data };
      delete normalized.ok;
      return { ok: true, data: normalized, error: null };
    } catch (error) {
      console.error('[KCAPI][data-subject] Edge Function:', error);
      return {
        ok: false,
        data: null,
        error: {
          code: 'DATA_SUBJECT_REQUEST_FAILED',
          message: 'N\u00E3o foi poss\u00EDvel processar a solicita\u00E7\u00E3o.',
        },
      };
    }
  }

  async function createDataSubjectRequest(payload = {}) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const requestKind = String(input.request_kind || '').trim().toLowerCase();
    if (!DATA_SUBJECT_REQUEST_KINDS.has(requestKind)) {
      return {
        ok: false,
        data: null,
        error: { code: 'INVALID_REQUEST_KIND', message: 'Tipo de solicita\u00E7\u00E3o inv\u00E1lido.' },
      };
    }
    return invokeDataSubjectRequest('create', {
      request_kind: requestKind,
      requested_format: 'json',
      request_source: String(input.request_source || 'settings').trim().toLowerCase(),
      idempotency_key: String(
        input.idempotency_key || buildDataSubjectIdempotencyKey(requestKind),
      ).trim(),
      expected_user_id: String(input.expected_user_id || '').trim(),
    });
  }

  async function listDataSubjectRequests(options = {}) {
    const input = options && typeof options === 'object' ? options : {};
    return invokeDataSubjectRequest('list', {
      limit: Math.max(1, Math.min(100, Number(input.limit) || 50)),
      expected_user_id: String(input.expected_user_id || '').trim(),
    });
  }

  async function getDataSubjectRequest(protocol, options = {}) {
    const input = options && typeof options === 'object' ? options : {};
    return invokeDataSubjectRequest('get', {
      protocol: String(protocol || '').trim().toUpperCase(),
      expected_user_id: String(input.expected_user_id || '').trim(),
    });
  }

  async function downloadDataSubjectExport(protocol, options = {}) {
    const input = options && typeof options === 'object' ? options : {};
    return invokeDataSubjectRequest('download', {
      protocol: String(protocol || '').trim().toUpperCase(),
      expected_user_id: String(input.expected_user_id || '').trim(),
    });
  }

  async function downloadDataSubjectSupplement(protocol, artifactRef, options = {}) {
    const input = options && typeof options === 'object' ? options : {};
    return invokeDataSubjectRequest('download_supplement', {
      protocol: String(protocol || '').trim().toUpperCase(),
      artifact_ref: String(artifactRef || '').trim().toUpperCase(),
      expected_user_id: String(input.expected_user_id || '').trim(),
    });
  }

  async function cancelDataSubjectRequest(protocol, options = {}) {
    const input = options && typeof options === 'object' ? options : {};
    return invokeDataSubjectRequest('cancel', {
      protocol: String(protocol || '').trim().toUpperCase(),
      expected_user_id: String(input.expected_user_id || '').trim(),
    });
  }

  window._KCSA.admin = {
    createHelpRequest,
    recoverPrivacyHelpRequest,
    listAdminHelpRequests,
    updateAdminHelpRequest,
    processAccountErasure,
    processDataExportSupplement,
    createDataSubjectRequest,
    listDataSubjectRequests,
    getDataSubjectRequest,
    downloadDataSubjectExport,
    downloadDataSubjectSupplement,
    cancelDataSubjectRequest,
    listExternalAccessRequests,
    decideExternalAccessRequest,
  };
})();
