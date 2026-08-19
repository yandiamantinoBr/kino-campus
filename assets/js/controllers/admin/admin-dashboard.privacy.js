(function () {
  'use strict';

  let refreshGeneration = 0;

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

  function formatMetric(value) {
    if (value === null || typeof value === 'undefined') return '--';
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString('pt-BR') : '--';
  }

  function card(icon, label, value, subtitle, href) {
    return [
      '<article class="kc-admin-card">',
      '<div class="kc-admin-card__label"><i class="' + esc(icon) + '" aria-hidden="true"></i> ' + esc(label) + '</div>',
      '<strong>' + formatMetric(value) + '</strong>',
      subtitle ? '<div style="font-size:.75rem;color:var(--kc-text-dark-secondary);margin-top:4px;">' + esc(subtitle) + '</div>' : '',
      href ? '<div style="margin-top:8px;"><a href="' + esc(href) + '" style="font-size:.78rem;color:var(--kc-primary-brand);text-decoration:none;">Ver detalhes &rarr;</a></div>' : '',
      '</article>',
    ].join('');
  }

  function renderAdminHealth(items) {
    const target = $('#admin-health-list');
    if (!target) return;
    const list = Array.isArray(items) && items.length ? items : [];
    target.innerHTML = list.map(function (item) {
      const tone = item && item.tone === 'warn' ? '#ff9800' : item && item.tone === 'error' ? '#ef4444' : '#22c55e';
      return [
        '<div class="kc-admin-card" style="min-height:112px;">',
        '<div class="kc-admin-card__label"><i class="' + esc(item.icon || 'fas fa-circle-check') + '" style="color:' + tone + ';" aria-hidden="true"></i> ' + esc(item.label || 'Status') + '</div>',
        '<strong style="font-size:1.05rem;line-height:1.25;">' + esc(item.value === null || typeof item.value === 'undefined' || item.value === '' ? 'Indisponível' : item.value) + '</strong>',
        '<div style="font-size:.75rem;color:var(--kc-text-dark-secondary);margin-top:6px;">' + esc(item.note || '') + '</div>',
        '</div>',
      ].join('');
    }).join('');
  }

  function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  async function countRows(client, table, since) {
    try {
      let query = client.from(table)
        .select('id', { count: 'exact', head: true });
      if (since) query = query.gte('created_at', since);
      const result = await query;
      if (result && !result.error && typeof result.count === 'number') {
        return { available: true, value: result.count, source: 'count' };
      }
    } catch (_) { }

    try {
      let query = client.from(table).select('id', { count: 'exact' });
      if (since) query = query.gte('created_at', since);
      const fallback = await query.limit(5000);
      if (fallback && !fallback.error && typeof fallback.count === 'number') {
        return { available: true, value: fallback.count, source: 'rows_with_exact_count' };
      }
    } catch (_) { }

    return { available: false, value: null, source: 'unavailable' };
  }

  async function loadFallbackSummary(client, since) {
    const results = await Promise.all([
      countRows(client, 'search_queries', since),
      countRows(client, 'post_view_events', since),
      countRows(client, 'hero_banners', null)
    ]);
    const searches = results[0];
    const postViews = results[1];
    const banners = results[2];
    const anyAvailable = results.some(function (result) { return result.available; });
    const complete = results.every(function (result) { return result.available; });
    if (!anyAvailable) throw new Error('fallback-unavailable');
    return {
      searches: searches.value,
      postViews: postViews.value,
      banners: banners.value,
      total: searches.available && postViews.available ? searches.value + postViews.value : null,
      available: true,
      complete: complete,
      availability: {
        searches: searches.available,
        postViews: postViews.available,
        banners: banners.available
      }
    };
  }

  function isCurrentGeneration(generation) {
    return generation === refreshGeneration;
  }

  function isMissingPrivacyRpcError(error) {
    const code = String(error && error.code || '').toUpperCase();
    return code === '42883' || code === 'PGRST202';
  }

  async function loadPrivacySummary(options) {
    options = options || {};
    const generation = Number(options.generation) || ++refreshGeneration;
    const periodDays = Math.max(1, Number(options.periodDays) || 30);
    const periodLabel = options.periodLabel || (periodDays === 1 ? 'hoje' : ('últimos ' + periodDays + ' dias'));
    const since = options.since || daysAgo(periodDays);
    const target = $('#admin-privacy-metrics');
    if (!target) return;
    try {
      const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient()
        : null;
      if (!client || typeof client.rpc !== 'function') throw new Error('no-client');

      const response = await client.rpc('kc_admin_privacy_analytics', {
        p_since: since,
        p_event_name: 'all',
        p_page_path: 'all',
        p_module_key: 'all',
        p_limit: 1,
        p_offset: 0,
      });
      if (response && response.error) throw response.error;
      const data = response && response.data ? response.data : null;
      if (!data || data.ok === false) throw new Error(data && data.code || 'rpc-unavailable');
      if (!isCurrentGeneration(generation)) return;

      const totals = data.totals || {};
      const consent = data.consent || {};
      target.innerHTML = [
        card('fas fa-chart-simple', 'Eventos opcionais', totals.events, periodLabel, 'privacy-analytics.html'),
        card('fas fa-users-viewfinder', 'Atividade distinta', totals.sessions, 'identificadores agregados, sem perfil individual', 'privacy-analytics.html'),
        card('fas fa-check-circle', 'Aceites analytics', consent.analytics_accepted, 'histórico agregado', 'privacy-analytics.html'),
        card('fas fa-images', 'Cliques em banners', totals.banner_clicks, 'métricas com consentimento', 'privacy-analytics.html'),
      ].join('');
      renderAdminHealth([
        { label: 'Privacidade', value: 'RPC ativa', note: 'kc_admin_privacy_analytics respondeu.' },
      ]);
    } catch (error) {
      if (!isCurrentGeneration(generation)) return;
      // A direct-table fallback is only a compatibility path for a genuinely
      // absent RPC. Authorization/session failures must remain fail-closed;
      // retrying three protected tables only multiplies expected 401/42501 logs.
      const fallbackClient = isMissingPrivacyRpcError(error)
        && window.KCSupabase
        && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient()
        : null;
      if (fallbackClient) {
        try {
          const fallback = await loadFallbackSummary(fallbackClient, since);
          if (!isCurrentGeneration(generation)) return;
          target.innerHTML = [
            card('fas fa-chart-simple', 'Eventos operacionais', fallback.total, 'compatibilidade sem RPC', 'privacy-analytics.html'),
            card('fas fa-magnifying-glass', 'Buscas', fallback.searches, 'search_queries', 'privacy-analytics.html'),
            card('fas fa-eye', 'Views de posts', fallback.postViews, 'post_view_events', 'privacy-analytics.html'),
            card('fas fa-images', 'Banners cadastrados', fallback.banners, 'hero_banners', 'privacy-analytics.html'),
          ].join('');
          renderAdminHealth([
            {
              label: 'Privacidade',
              value: fallback.complete ? 'Fallback ativo' : 'Fallback parcial',
              tone: 'warn',
              note: fallback.complete
                ? 'As três fontes de compatibilidade responderam.'
                : 'Somente fontes confirmadas são exibidas; as demais usam “--”.'
            },
          ]);
          return;
        } catch (_) { }
      }
      if (!isCurrentGeneration(generation)) return;
      target.innerHTML = [
        '<article class="kc-admin-card" style="border-color:rgba(255,107,0,.35);">',
        '<div class="kc-admin-card__label"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Privacidade</div>',
        '<strong>--</strong>',
        '<div style="font-size:.75rem;color:var(--kc-text-dark-secondary);margin-top:4px;">A migration de privacidade ainda não respondeu.</div>',
        '<div style="margin-top:8px;"><a href="privacy-analytics.html" style="font-size:.78rem;color:var(--kc-primary-brand);text-decoration:none;">Abrir painel &rarr;</a></div>',
        '</article>',
      ].join('');
      renderAdminHealth([
        { label: 'Privacidade', value: 'Indisponível', tone: 'error', note: 'Sem RPC e sem fallback Supabase neste carregamento.' },
      ]);
    }
  }

  // Render period-aware a partir do bloco "privacy" da RPC agregada (overview),
  // chamado pelo controller no fluxo de refresh (segue o filtro de período).
  function renderFromOverview(privacyBlock, periodLabel, periodDays) {
    const target = $('#admin-privacy-metrics');
    if (!target || !privacyBlock) return;
    const label = periodLabel ? ('no período: ' + periodLabel) : 'no período';
    const operationalLabel = Number(periodDays) > 183
      ? 'retenção disponível: até 6 meses'
      : label;
    target.innerHTML = [
      card('fas fa-chart-simple', 'Eventos operacionais', privacyBlock.events, operationalLabel, 'privacy-analytics.html'),
      card('fas fa-users-viewfinder', 'Atividade distinta', privacyBlock.sessions, 'identificadores agregados, sem perfil individual', 'privacy-analytics.html'),
      card('fas fa-magnifying-glass', 'Buscas', privacyBlock.searches, operationalLabel, 'privacy-analytics.html'),
      card('fas fa-eye', 'Views de posts', privacyBlock.post_views, operationalLabel, 'privacy-analytics.html'),
    ].join('');
  }

  function refresh(opts) {
    opts = opts || {};
    window._KCAD = window._KCAD || {};
    window._KCAD.__privacyDriven = true;
    const generation = ++refreshGeneration;
    if (opts.overview) {
      renderFromOverview(opts.overview, opts.periodLabel, opts.periodDays);
      renderAdminHealth(Array.isArray(opts.health) && opts.health.length
        ? opts.health
        : [{ label: 'Privacidade', value: 'Fonte não informada', tone: 'warn', note: 'Eventos e identificadores agregados (sem perfil).' }]);
      return;
    }
    loadPrivacySummary({
      generation: generation,
      periodDays: opts.periodDays,
      periodLabel: opts.periodLabel,
      since: opts.since
    });
  }

  window._KCAD = window._KCAD || {};
  window._KCAD.privacy = { refresh: refresh, loadPrivacySummary: loadPrivacySummary };

  // Primeira pintura (fallback): só roda se o controller ainda não tiver assumido.
  function autoFallback() {
    if (window._KCAD && window._KCAD.__privacyDriven) return;
    const generation = ++refreshGeneration;
    loadPrivacySummary({ generation: generation, periodDays: 30, periodLabel: 'últimos 30 dias' });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(autoFallback, 700);
    }, { once: true });
  } else {
    setTimeout(autoFallback, 700);
  }
}());
