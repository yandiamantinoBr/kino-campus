
(function () {
  'use strict';
  // Sub-adapter de notificações — registrado em window._KCSA.notifications (v11.30.1)
  // Dependências resolvidas lazily via window._KCSA.getClient / getCurrentUser (setados pelo adapter principal)
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

  function buildDefaultNotificationPreferences() {
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationPreferences === 'function') {
      return window.KCAccountProfileUtils.buildDefaultNotificationPreferences();
    }
    return {
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    };
  }

  function normalizeNotificationPreferences(value) {
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.normalizeNotificationPreferences === 'function') {
      return window.KCAccountProfileUtils.normalizeNotificationPreferences(value);
    }
    const defaults = buildDefaultNotificationPreferences();
    const source = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
    const normalized = {};
    Object.keys(defaults).forEach((eventKey) => {
      const sourceEvent = (source[eventKey] && typeof source[eventKey] === 'object' && !Array.isArray(source[eventKey]))
        ? source[eventKey]
        : {};
      normalized[eventKey] = {
        in_app: sourceEvent.in_app !== false,
        email: sourceEvent.email === true,
        whatsapp: sourceEvent.whatsapp === true,
      };
    });
    return normalized;
  }

  function buildDefaultNotificationChannelTargets() {
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets === 'function') {
      return window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets();
    }
    return {
      whatsapp: {
        channel: 'whatsapp',
        destination: '',
        country_code: '55',
        local_number: '',
        consent_granted: false,
        consent_at: null,
        configured: false,
        ready: false,
        display: '',
        metadata: { country_code: '55' },
      },
    };
  }

  function normalizeChannelTargetDigits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function formatChannelTarget(value) {
    const digits = normalizeChannelTargetDigits(value);
    if (!digits) return '';
    if (digits.indexOf('55') === 0 && digits.length >= 12) {
      const ddd = digits.slice(2, 4);
      const body = digits.slice(4);
      if (body.length === 9) return `+55 (${ddd}) ${body.slice(0, 5)}-${body.slice(5)}`;
      if (body.length === 8) return `+55 (${ddd}) ${body.slice(0, 4)}-${body.slice(4)}`;
    }
    return `+${digits}`;
  }

  function normalizeNotificationChannelTargets(value) {
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.normalizeNotificationChannelTargets === 'function') {
      return window.KCAccountProfileUtils.normalizeNotificationChannelTargets(value);
    }
    const defaults = buildDefaultNotificationChannelTargets();
    const source = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
    const whatsapp = (source.whatsapp && typeof source.whatsapp === 'object' && !Array.isArray(source.whatsapp))
      ? source.whatsapp
      : {};
    const metadata = (whatsapp.metadata && typeof whatsapp.metadata === 'object' && !Array.isArray(whatsapp.metadata))
      ? whatsapp.metadata
      : {};
    const countryCode = normalizeChannelTargetDigits(whatsapp.country_code || whatsapp.countryCode || metadata.country_code || '55') || '55';
    const explicitDestinationDigits = normalizeChannelTargetDigits(whatsapp.destination || whatsapp.destination_normalized || whatsapp.destinationNormalized || '');
    const localNumberDigits = normalizeChannelTargetDigits(whatsapp.local_number || whatsapp.localNumber || '');
    const destination = explicitDestinationDigits
      ? `+${explicitDestinationDigits}`
      : (localNumberDigits ? `+${countryCode}${localNumberDigits}` : '');
    const normalizedLocalNumber = destination && destination.indexOf(`+${countryCode}`) === 0
      ? normalizeChannelTargetDigits(destination.slice(countryCode.length + 1))
      : localNumberDigits;
    const consentGranted = whatsapp.consent_granted === true || whatsapp.consentGranted === true;
    return {
      whatsapp: {
        channel: 'whatsapp',
        destination,
        country_code: countryCode,
        local_number: normalizedLocalNumber,
        consent_granted: consentGranted,
        consent_at: whatsapp.consent_at || whatsapp.consentAt || null,
        configured: !!destination,
        ready: !!destination && consentGranted,
        display: formatChannelTarget(destination),
        metadata: { country_code: countryCode },
      },
    };
  }

  // ── API: Preferências ──────────────────────────────────────────────────────

  async function getNotificationPreferences() {
    const client = getClient();
    if (!client) return buildDefaultNotificationPreferences();
    const user = await getCurrentUser();
    if (!user || !user.id) return buildDefaultNotificationPreferences();
    try {
      const { data, error } = await client
        .from('notification_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.error('[KCAPI][notifications] getNotificationPreferences:', error);
        return buildDefaultNotificationPreferences();
      }
      return normalizeNotificationPreferences(data && data.preferences ? data.preferences : null);
    } catch (e) {
      console.error('[KCAPI][notifications] getNotificationPreferences excecao:', e);
      return buildDefaultNotificationPreferences();
    }
  }

  async function updateNotificationPreferences(preferences = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await getCurrentUser();
    if (!user || !user.id) return { ok: false, error: { message: 'Faça login para editar suas notificações.' } };
    const normalized = normalizeNotificationPreferences(preferences);
    try {
      const { data, error } = await client
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          preferences: normalized,
        }, { onConflict: 'user_id' })
        .select('preferences')
        .maybeSingle();
      if (error) {
        console.error('[KCAPI][notifications] updateNotificationPreferences:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível atualizar as preferências.' } };
      }
      return {
        ok: true,
        data: {
          preferences: normalizeNotificationPreferences(data && data.preferences ? data.preferences : normalized),
        },
      };
    } catch (e) {
      console.error('[KCAPI][notifications] updateNotificationPreferences excecao:', e);
      return { ok: false, error: { message: 'Não foi possível atualizar as preferências.' } };
    }
  }

  // ── API: Destinos de canal ─────────────────────────────────────────────────

  async function getNotificationChannelTargets() {
    const client = getClient();
    if (!client) return buildDefaultNotificationChannelTargets();
    const user = await getCurrentUser();
    if (!user || !user.id) return buildDefaultNotificationChannelTargets();
    try {
      const { data, error } = await client
        .from('notification_channel_targets')
        .select('channel, destination, consent_granted, consent_at, metadata')
        .eq('user_id', user.id);
      if (error) {
        console.error('[KCAPI][notifications] getNotificationChannelTargets:', error);
        return buildDefaultNotificationChannelTargets();
      }
      const source = {};
      (Array.isArray(data) ? data : []).forEach((row) => {
        if (!row || !row.channel) return;
        source[String(row.channel).trim()] = row;
      });
      return normalizeNotificationChannelTargets(source);
    } catch (e) {
      console.error('[KCAPI][notifications] getNotificationChannelTargets excecao:', e);
      return buildDefaultNotificationChannelTargets();
    }
  }

  async function updateNotificationChannelTargets(targets = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase nao inicializado.' } };
    const user = await getCurrentUser();
    if (!user || !user.id) return { ok: false, error: { message: 'Faca login para editar os destinos privados.' } };
    const normalized = normalizeNotificationChannelTargets(targets);
    const whatsapp = normalized && normalized.whatsapp ? normalized.whatsapp : buildDefaultNotificationChannelTargets().whatsapp;
    try {
      if (whatsapp.destination) {
        const { error: upsertError } = await client
          .from('notification_channel_targets')
          .upsert({
            user_id: user.id,
            channel: 'whatsapp',
            destination: whatsapp.destination,
            consent_granted: whatsapp.consent_granted === true,
            metadata: whatsapp.metadata || { country_code: whatsapp.country_code || '55' },
          }, { onConflict: 'user_id,channel' });
        if (upsertError) {
          console.error('[KCAPI][notifications] updateNotificationChannelTargets upsert:', upsertError);
          return { ok: false, error: { message: upsertError.message || 'Nao foi possivel salvar o WhatsApp privado.' } };
        }
      } else {
        const { error: deleteError } = await client
          .from('notification_channel_targets')
          .delete()
          .eq('user_id', user.id)
          .eq('channel', 'whatsapp');
        if (deleteError) {
          console.error('[KCAPI][notifications] updateNotificationChannelTargets delete:', deleteError);
          return { ok: false, error: { message: deleteError.message || 'Nao foi possivel limpar o WhatsApp privado.' } };
        }
      }
      return {
        ok: true,
        data: {
          targets: await getNotificationChannelTargets(),
        },
      };
    } catch (e) {
      console.error('[KCAPI][notifications] updateNotificationChannelTargets excecao:', e);
      return { ok: false, error: { message: 'Nao foi possivel atualizar os destinos privados.' } };
    }
  }

  // ── API: Listagem e operações ──────────────────────────────────────────────

  async function getNotifications(limit, offset) {
    const client = getClient();
    if (!client) return { ok: false, error: 'NO_CLIENT' };
    const { data, error } = await client.rpc('kc_get_notifications', {
      p_limit: limit || 20,
      p_offset: offset || 0,
    });
    if (error) return { ok: false, error: error.message };
    return data;
  }

  async function markNotificationsRead(ids) {
    const client = getClient();
    if (!client) return { ok: false, error: 'NO_CLIENT' };
    const { data, error } = await client.rpc('kc_mark_notifications_read', { p_ids: ids });
    if (error) return { ok: false, error: error.message };
    return data;
  }

  async function markAllNotificationsRead() {
    const client = getClient();
    if (!client) return { ok: false, error: 'NO_CLIENT' };
    const { data, error } = await client.rpc('kc_mark_all_notifications_read');
    if (error) return { ok: false, error: error.message };
    return data;
  }

  async function clearNotifications() {
    const client = getClient();
    if (!client) return { ok: false, error: 'NO_CLIENT' };
    const user = await getCurrentUser();
    if (!user || !user.id) return { ok: false, error: 'NOT_AUTHENTICATED' };
    const { data, error } = await client
      .from('notifications')
      .delete()
      .eq('user_id', user.id)
      .select('id');
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      deleted: Array.isArray(data) ? data.length : 0,
    };
  }

  async function getUnreadNotificationCount() {
    const client = getClient();
    if (!client) return 0;
    const { data, error } = await client.rpc('kc_unread_notification_count');
    if (error) return 0;
    return data || 0;
  }

  // ── API: Realtime ──────────────────────────────────────────────────────────

  function subscribeNotifications(userId, callback) {
    const client = getClient();
    if (!client || !userId) return null;
    const channel = client
      .channel('notifications:' + userId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: 'user_id=eq.' + userId,
        },
        function (payload) {
          if (typeof callback === 'function') {
            callback({
              eventType: String(payload && payload.eventType ? payload.eventType : 'INSERT').toUpperCase(),
              new: payload && payload.new ? payload.new : null,
              old: payload && payload.old ? payload.old : null,
            });
          }
        }
      )
      .subscribe();
    return channel;
  }

  function unsubscribeNotifications(channel) {
    const client = getClient();
    if (!client || !channel) return;
    client.removeChannel(channel);
  }

  window._KCSA.notifications = {
    getNotificationPreferences,
    updateNotificationPreferences,
    getNotificationChannelTargets,
    updateNotificationChannelTargets,
    getNotifications,
    markNotificationsRead,
    markAllNotificationsRead,
    clearNotifications,
    getUnreadNotificationCount,
    subscribeNotifications,
    unsubscribeNotifications,
  };
})();
