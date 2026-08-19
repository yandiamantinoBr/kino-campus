
(function () {
  'use strict';
  // Sub-adapter de analytics — registrado em window._KCSA.analytics (v11.30.1)
  // Dependências resolvidas lazily via window._KCSA.getClient (setado pelo adapter principal)
  window._KCSA = window._KCSA || {};

  function getClient() {
    return (window._KCSA && typeof window._KCSA.getClient === 'function')
      ? window._KCSA.getClient() : null;
  }

  function getCurrentUser() {
    return (window._KCSA && typeof window._KCSA.getCurrentUser === 'function')
      ? window._KCSA.getCurrentUser() : Promise.resolve(null);
  }

  // ── Top Contribuidores (ranking de engajamento) ────────────────────────────
  async function getTopContributors(period, module, limit) {
    const client = getClient();
    if (!client) return [];
    try {
      const params = { p_period: period || 'month', p_limit: limit || 10 };
      if (module) params.p_module = module;
      const { data, error } = await client.rpc('kc_get_top_contributors', params);
      if (error) {
        console.error('[KCAPI] Top contributors error:', error);
        throw error;
      }
      return Array.isArray(data) ? data : [];
    } catch (error) {
      throw error;
    }
  }

  // ── Rastrear clique em cupom ───────────────────────────────────────────────
  async function trackCouponClick(postId) {
    const client = getClient();
    if (!client) return { ok: false };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false };
    try {
      const { data, error } = await client.rpc('kc_track_coupon_click', { p_post_id: uuid });
      if (error) return { ok: false, error };
      return data || { ok: false };
    } catch (_) { return { ok: false }; }
  }

  // ── Rastrear compartilhamento ──────────────────────────────────────────────
  async function trackShare(postId, shareMethod) {
    const client = getClient();
    if (!client) return { ok: false };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false };
    try {
      const { data, error } = await client.rpc('kc_track_share', { p_post_id: uuid });
      if (error) return { ok: false, error };
      return data || { ok: false };
    } catch (_) { return { ok: false }; }
  }

  // ── Rastrear visualização (v9.3.1) ──────────────────────────────────────────
  async function trackView(postId) {
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false };
    try {
      // kc_track_view is intentionally authenticated-only. Keep this guard in
      // the adapter as a final boundary so any future caller cannot turn an
      // anonymous product visit into a noisy Postgres 42501.
      const user = await getCurrentUser();
      if (!user || !user.id) return { ok: false };
      const client = getClient();
      if (!client) return { ok: false };
      const { data, error } = await client.rpc('kc_track_view', { p_post_id: uuid });
      if (error) return { ok: false, error };
      return data || { ok: false };
    } catch (_) { return { ok: false }; }
  }

  // ── Analytics de post para autores (v9.3.1) ───────────────────────────────
  async function getPostAnalytics(postId) {
    const client = getClient();
    if (!client) return { ok: false };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false };
    try {
      const { data, error } = await client.rpc('kc_get_post_analytics', { p_post_id: uuid });
      if (error) return { ok: false, error };
      return data || { ok: false };
    } catch (_) { return { ok: false }; }
  }

  // ── Verificar publicações duplicadas ──────────────────────────────────────
  async function checkDuplicatePost(userId, module, title) {
    const client = getClient();
    if (!client) return { ok: false, candidates: [] };
    try {
      const { data, error } = await client.rpc('kc_check_duplicate_post', {
        p_user_id: userId,
        p_module: module || null,
        p_title: title || '',
        p_threshold: 0.45,
      });
      if (error) return { ok: false, candidates: [] };
      const candidates = (data && data.candidates) ? data.candidates : [];
      return { ok: true, candidates };
    } catch (_) { return { ok: false, candidates: [] }; }
  }

  window._KCSA.analytics = {
    getTopContributors,
    trackCouponClick,
    trackShare,
    trackView,
    getPostAnalytics,
    checkDuplicatePost,
  };
})();
