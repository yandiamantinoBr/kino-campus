(function () {
  'use strict';

  function $(selector) {
    return document.querySelector(selector);
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function card(icon, label, value, subtitle, href) {
    return [
      '<article class="kc-admin-card">',
      '<div class="kc-admin-card__label"><i class="' + esc(icon) + '"></i> ' + esc(label) + '</div>',
      '<strong>' + number(value).toLocaleString('pt-BR') + '</strong>',
      subtitle ? '<div style="font-size:.75rem;color:var(--kc-text-dark-secondary);margin-top:4px;">' + esc(subtitle) + '</div>' : '',
      href ? '<div style="margin-top:8px;"><a href="' + esc(href) + '" style="font-size:.78rem;color:var(--kc-primary-brand);text-decoration:none;">Ver detalhes &rarr;</a></div>' : '',
      '</article>',
    ].join('');
  }

  function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  async function countRows(client, table, since) {
    try {
      const result = await client.from(table)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (result && !result.error) return result.count || 0;
    } catch (_) { }

    try {
      const fallback = await client.from(table)
        .select('id')
        .gte('created_at', since)
        .limit(5000);
      if (fallback && !fallback.error && Array.isArray(fallback.data)) return fallback.data.length;
    } catch (_) { }

    return 0;
  }

  async function loadFallbackSummary(client, since) {
    const searches = await countRows(client, 'search_queries', since);
    const postViews = await countRows(client, 'post_view_events', since);
    let banners = 0;
    try {
      const result = await client.from('hero_banners')
        .select('id', { count: 'exact', head: true });
      if (result && !result.error) banners = result.count || 0;
    } catch (_) { }
    return { searches, postViews, banners, total: searches + postViews };
  }

  async function loadPrivacySummary() {
    const target = $('#admin-privacy-metrics');
    if (!target) return;
    try {
      const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient()
        : null;
      if (!client || typeof client.rpc !== 'function') throw new Error('no-client');

      const response = await client.rpc('kc_admin_privacy_analytics', {
        p_since: daysAgo(30),
        p_event_name: 'all',
        p_page_path: 'all',
        p_module_key: 'all',
        p_limit: 1,
        p_offset: 0,
      });
      if (response && response.error) throw response.error;
      const data = response && response.data ? response.data : null;
      if (!data || data.ok === false) throw new Error(data && data.code || 'rpc-unavailable');

      const totals = data.totals || {};
      const consent = data.consent || {};
      target.innerHTML = [
        card('fas fa-chart-simple', 'Eventos opcionais', totals.events, 'últimos 30 dias', 'privacy-analytics.html'),
        card('fas fa-users-viewfinder', 'Sessões agregadas', totals.sessions, 'sem perfil individual', 'privacy-analytics.html'),
        card('fas fa-check-circle', 'Aceites analytics', consent.analytics_accepted, 'histórico agregado', 'privacy-analytics.html'),
        card('fas fa-images', 'Cliques em banners', totals.banner_clicks, 'métricas com consentimento', 'privacy-analytics.html'),
      ].join('');
    } catch (error) {
      const fallbackClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient()
        : null;
      if (fallbackClient) {
        try {
          const fallback = await loadFallbackSummary(fallbackClient, daysAgo(30));
          target.innerHTML = [
            card('fas fa-chart-simple', 'Eventos operacionais', fallback.total, 'compatibilidade sem RPC', 'privacy-analytics.html'),
            card('fas fa-magnifying-glass', 'Buscas', fallback.searches, 'search_queries', 'privacy-analytics.html'),
            card('fas fa-eye', 'Views de posts', fallback.postViews, 'post_view_events', 'privacy-analytics.html'),
            card('fas fa-images', 'Banners cadastrados', fallback.banners, 'hero_banners', 'privacy-analytics.html'),
          ].join('');
          return;
        } catch (_) { }
      }
      target.innerHTML = [
        '<article class="kc-admin-card" style="border-color:rgba(255,107,0,.35);">',
        '<div class="kc-admin-card__label"><i class="fas fa-triangle-exclamation"></i> Privacidade</div>',
        '<strong>--</strong>',
        '<div style="font-size:.75rem;color:var(--kc-text-dark-secondary);margin-top:4px;">A migration de privacidade ainda não respondeu.</div>',
        '<div style="margin-top:8px;"><a href="privacy-analytics.html" style="font-size:.78rem;color:var(--kc-primary-brand);text-decoration:none;">Abrir painel &rarr;</a></div>',
        '</article>',
      ].join('');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(loadPrivacySummary, 700);
    }, { once: true });
  } else {
    setTimeout(loadPrivacySummary, 700);
  }
}());
