/*
  KinoCampus - Admin Feed Ads (v9.3.6.1)
  Gerencia campanhas contextuais exibidas nos feeds.
*/
(function () {
  'use strict';

  const METRIC_EVENTS = ['ad_impression', 'ad_click'];
  const METRIC_LIMIT = 5000;
  const ADSENSE_CLIENT_ID = 'ca-pub-2776499020194231';
  const PROVIDER_MODES = ['direct_only', 'adsense_fallback', 'adsense_only', 'off'];
  let campaigns = [];
  let filteredCampaigns = [];
  let metrics = new Map();
  let adNetworkSettings = defaultAdNetworkSettings();

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getClient() {
    return window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
  }

  function toast(message, type) {
    const el = $('kc-banners-toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'show ' + (type || 'success');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.className = ''; }, 3200);
  }

  function showError(message) {
    const el = $('feed-ads-error');
    if (!el) return;
    el.style.display = message ? 'block' : 'none';
    el.textContent = message || '';
  }

  function splitList(value) {
    return String(value || '')
      .split(',')
      .map(function (item) { return item.trim().toLowerCase(); })
      .filter(Boolean);
  }

  function checkedValues(name) {
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (input) { return input.value; });
  }

  function setCheckedValues(name, values) {
    const set = new Set(Array.isArray(values) ? values.map(String) : []);
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (input) {
      input.checked = set.has(input.value);
    });
  }

  function toLocalInputValue(iso) {
    if (!iso) return '';
    try {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    } catch (_) {
      return '';
    }
  }

  function toIsoOrNull(value) {
    if (!value) return '';
    try {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    } catch (_) {
      return '';
    }
  }

  function formatDate(value) {
    if (!value) return '-';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    } catch (_) {
      return String(value);
    }
  }

  function formatPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0,00%';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }

  function formatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR') : '0';
  }

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function getMetricWindowDays() {
    const value = Number(($('feed-ads-metric-window') || {}).value || 30);
    return [7, 30, 90, 365].indexOf(value) >= 0 ? value : 30;
  }

  function normalizeMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return PROVIDER_MODES.indexOf(mode) >= 0 ? mode : 'direct_only';
  }

  function defaultAdNetworkSettings() {
    return {
      provider: 'direct',
      status: 'disabled',
      adsense_client_id: ADSENSE_CLIENT_ID,
      auto_ads_enabled: false,
      placement_modes: {
        feed_inline: 'direct_only',
        feed_aside_top: 'direct_only',
        feed_aside_sticky: 'direct_only',
      },
      adsense_slots: {
        feed_inline: '',
        feed_aside_top: '',
        feed_aside_sticky: '',
      },
      notes: '',
    };
  }

  function normalizeAdNetworkSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const row = source.settings && typeof source.settings === 'object' ? source.settings : source;
    const defaults = defaultAdNetworkSettings();
    const modes = row.placement_modes && typeof row.placement_modes === 'object' ? row.placement_modes : {};
    const slots = row.adsense_slots && typeof row.adsense_slots === 'object' ? row.adsense_slots : {};
    return {
      provider: ['direct', 'adsense', 'hybrid'].indexOf(String(row.provider || '')) >= 0 ? String(row.provider) : defaults.provider,
      status: ['disabled', 'testing', 'active'].indexOf(String(row.status || '')) >= 0 ? String(row.status) : defaults.status,
      adsense_client_id: String(row.adsense_client_id || defaults.adsense_client_id).trim(),
      auto_ads_enabled: row.auto_ads_enabled === true,
      placement_modes: {
        feed_inline: normalizeMode(modes.feed_inline),
        feed_aside_top: normalizeMode(modes.feed_aside_top),
        feed_aside_sticky: normalizeMode(modes.feed_aside_sticky),
      },
      adsense_slots: {
        feed_inline: String(slots.feed_inline || '').trim(),
        feed_aside_top: String(slots.feed_aside_top || '').trim(),
        feed_aside_sticky: String(slots.feed_aside_sticky || '').trim(),
      },
      notes: String(row.notes || ''),
      updated_at: row.updated_at || '',
    };
  }

  function modeLabel(value) {
    return ({
      direct_only: 'Somente anúncios próprios',
      adsense_fallback: 'AdSense como fallback',
      adsense_only: 'Somente AdSense',
      off: 'Desligado',
    })[normalizeMode(value)] || 'Somente anúncios próprios';
  }

  function providerLabel(value) {
    return ({
      direct: 'Anúncios próprios',
      adsense: 'Google AdSense',
      hybrid: 'Híbrido',
    })[String(value || '')] || 'Anúncios próprios';
  }

  function statusLabelNetwork(value) {
    return ({
      disabled: 'Desativado',
      testing: 'Em teste',
      active: 'Ativo',
    })[String(value || '')] || 'Desativado';
  }

  function setFieldValue(id, value) {
    const el = $(id);
    if (el) el.value = value == null ? '' : String(value);
  }

  function collectAdNetworkPayload() {
    return normalizeAdNetworkSettings({
      provider: ($('ad-network-provider') || {}).value || 'direct',
      status: ($('ad-network-status') || {}).value || 'disabled',
      adsense_client_id: ($('ad-network-client-id') || {}).value || ADSENSE_CLIENT_ID,
      auto_ads_enabled: !!(($('ad-network-auto-ads') || {}).checked),
      placement_modes: {
        feed_inline: ($('ad-mode-feed-inline') || {}).value || 'direct_only',
        feed_aside_top: ($('ad-mode-feed-aside-top') || {}).value || 'direct_only',
        feed_aside_sticky: ($('ad-mode-feed-aside-sticky') || {}).value || 'direct_only',
      },
      adsense_slots: {
        feed_inline: ($('ad-slot-feed-inline') || {}).value || '',
        feed_aside_top: ($('ad-slot-feed-aside-top') || {}).value || '',
        feed_aside_sticky: ($('ad-slot-feed-aside-sticky') || {}).value || '',
      },
      notes: ($('ad-network-notes') || {}).value || '',
    });
  }

  function renderAdNetworkStatus(source) {
    const settings = normalizeAdNetworkSettings(source || collectAdNetworkPayload());
    const label = $('ad-network-status-label');
    const checklist = $('ad-network-checklist');
    const adsensePlacements = Object.keys(settings.placement_modes).filter(function (key) {
      return ['adsense_fallback', 'adsense_only'].indexOf(settings.placement_modes[key]) >= 0;
    });
    const configuredSlots = adsensePlacements.filter(function (key) { return settings.adsense_slots[key]; });
    if (label) {
      label.textContent = statusLabelNetwork(settings.status) + ' · ' + providerLabel(settings.provider);
      label.style.borderColor = settings.status === 'active' ? 'rgba(34,197,94,.45)' : 'rgba(255,255,255,.16)';
      label.style.color = settings.status === 'active' ? '#86efac' : '';
    }
    if (!checklist) return;
    const rows = [
      {
        title: 'Consentimento',
        body: 'AdSense só carrega quando o visitante aceita publicidade nas preferências.',
        ok: true,
      },
      {
        title: 'Slots manuais',
        body: adsensePlacements.length
          ? configuredSlots.length + ' de ' + adsensePlacements.length + ' placement(s) com slot configurado.'
          : 'Nenhum placement depende de AdSense no modo atual.',
        ok: !adsensePlacements.length || configuredSlots.length === adsensePlacements.length,
      },
      {
        title: 'Auto ads',
        body: settings.auto_ads_enabled
          ? 'Auto ads está marcado. Use exclusões no AdSense para produto, admin e páginas privadas.'
          : 'Auto ads desligado. O KinoCampus controla os slots de feed manualmente.',
        ok: !settings.auto_ads_enabled,
      },
      {
        title: 'ads.txt',
        body: 'Arquivo público ads.txt aponta para o publisher ca-pub-2776499020194231.',
        ok: true,
      },
      {
        title: 'Páginas bloqueadas',
        body: 'Produto, admin, autenticação, perfil, mensagens, termos, privacidade e ajuda não carregam AdSense.',
        ok: true,
      },
    ];
    checklist.innerHTML = rows.map(function (item) {
      return '<div class="kc-ad-network-check" data-ok="' + (item.ok ? 'true' : 'false') + '">'
        + '<strong><i class="fas fa-' + (item.ok ? 'check-circle' : 'triangle-exclamation') + '"></i> ' + esc(item.title) + '</strong>'
        + esc(item.body)
        + '</div>';
    }).join('');
  }

  function applyAdNetworkSettings(settings) {
    adNetworkSettings = normalizeAdNetworkSettings(settings);
    setFieldValue('ad-network-status', adNetworkSettings.status);
    setFieldValue('ad-network-provider', adNetworkSettings.provider);
    setFieldValue('ad-network-client-id', adNetworkSettings.adsense_client_id);
    setFieldValue('ad-mode-feed-inline', adNetworkSettings.placement_modes.feed_inline);
    setFieldValue('ad-mode-feed-aside-top', adNetworkSettings.placement_modes.feed_aside_top);
    setFieldValue('ad-mode-feed-aside-sticky', adNetworkSettings.placement_modes.feed_aside_sticky);
    setFieldValue('ad-slot-feed-inline', adNetworkSettings.adsense_slots.feed_inline);
    setFieldValue('ad-slot-feed-aside-top', adNetworkSettings.adsense_slots.feed_aside_top);
    setFieldValue('ad-slot-feed-aside-sticky', adNetworkSettings.adsense_slots.feed_aside_sticky);
    setFieldValue('ad-network-notes', adNetworkSettings.notes);
    if ($('ad-network-auto-ads')) $('ad-network-auto-ads').checked = !!adNetworkSettings.auto_ads_enabled;
    renderAdNetworkStatus(adNetworkSettings);
  }

  function getFilters() {
    return {
      query: normalizeKey(($('feed-ads-filter-query') || {}).value || ''),
      status: String(($('feed-ads-filter-status') || {}).value || ''),
      module: String(($('feed-ads-filter-module') || {}).value || ''),
    };
  }

  function campaignSearchText(campaign) {
    return normalizeKey([
      campaign.name,
      campaign.title,
      campaign.advertiser_name,
      campaign.target_url,
      (campaign.tags || []).join(' '),
      (campaign.module_keys || []).join(' '),
    ].join(' '));
  }

  function campaignMatchesFilters(campaign) {
    const filters = getFilters();
    if (filters.status && campaign.status !== filters.status) return false;
    if (filters.module) {
      const modules = Array.isArray(campaign.module_keys) ? campaign.module_keys : [];
      if (modules.length && modules.indexOf(filters.module) < 0) return false;
    }
    if (filters.query && campaignSearchText(campaign).indexOf(filters.query) < 0) return false;
    return true;
  }

  function getFilteredCampaigns() {
    filteredCampaigns = campaigns.filter(campaignMatchesFilters);
    return filteredCampaigns;
  }

  function getMetric(id) {
    const key = String(id || '');
    if (!metrics.has(key)) metrics.set(key, { impressions: 0, clicks: 0 });
    return metrics.get(key);
  }

  async function fetchCampaigns() {
    const client = getClient();
    if (!client) throw new Error('Cliente Supabase indisponível.');
    const response = await client.rpc('kc_admin_list_ad_campaigns');
    if (response && response.error) {
      const message = String(response.error.message || '');
      if (message.includes('kc_admin_list_ad_campaigns') || message.includes('schema cache')) {
        throw new Error('Migração de anúncios ainda não aplicada no Supabase.');
      }
      throw response.error;
    }
    return Array.isArray(response && response.data) ? response.data : [];
  }

  async function fetchMetrics() {
    const client = getClient();
    const next = new Map();
    if (!client) return next;
    try {
      const since = new Date(Date.now() - getMetricWindowDays() * 24 * 60 * 60 * 1000).toISOString();
      const response = await client
        .from('privacy_analytics_events')
        .select('event_name, entity_id, created_at')
        .eq('entity_type', 'ad_campaign')
        .in('event_name', METRIC_EVENTS)
        .gte('created_at', since)
        .range(0, METRIC_LIMIT - 1);
      if (response && response.error) throw response.error;
      (response.data || []).forEach(function (row) {
        const key = String(row.entity_id || '');
        if (!key) return;
        if (!next.has(key)) next.set(key, { impressions: 0, clicks: 0 });
        const item = next.get(key);
        if (row.event_name === 'ad_impression') item.impressions += 1;
        if (row.event_name === 'ad_click') item.clicks += 1;
      });
    } catch (_) { }
    return next;
  }

  async function fetchAdNetworkSettings() {
    const client = getClient();
    if (!client) return defaultAdNetworkSettings();
    try {
      const response = await client.rpc('kc_admin_get_ad_network_settings');
      if (response && response.error) throw response.error;
      if (response && response.data && response.data.ok === false) throw new Error(response.data.code || 'FORBIDDEN');
      return normalizeAdNetworkSettings(response && response.data);
    } catch (error) {
      console.warn('[Feed ads] Configuração AdSense indisponível:', error && (error.message || error));
      return defaultAdNetworkSettings();
    }
  }

  async function saveAdNetworkSettings(payload) {
    const client = getClient();
    if (!client) throw new Error('Cliente Supabase indisponível.');
    const response = await client.rpc('kc_admin_save_ad_network_settings', { p_data: payload });
    if (response && response.error) throw response.error;
    if (response && response.data && response.data.ok === false) throw new Error(response.data.code || 'Falha ao salvar configuração.');
    return normalizeAdNetworkSettings(response && response.data);
  }

  async function saveCampaign(payload) {
    const client = getClient();
    if (!client) throw new Error('Cliente Supabase indisponível.');
    const response = await client.rpc('kc_admin_save_ad_campaign', { p_data: payload });
    if (response && response.error) throw response.error;
    return response.data;
  }

  async function archiveCampaign(id) {
    const client = getClient();
    if (!client) throw new Error('Cliente Supabase indisponível.');
    const response = await client.rpc('kc_admin_archive_ad_campaign', { p_campaign_id: id });
    if (response && response.error) throw response.error;
    return response.data;
  }

  function collectPayload() {
    return {
      id: $('ad-id').value || undefined,
      name: $('ad-name').value.trim(),
      advertiser_name: $('ad-advertiser').value.trim(),
      sponsor_label: 'Publicidade',
      title: $('ad-title').value.trim(),
      description: $('ad-description').value.trim(),
      image_url: $('ad-image-url').value.trim(),
      target_url: $('ad-target-url').value.trim(),
      cta_label: $('ad-cta-label').value.trim() || 'Saiba mais',
      status: $('ad-status').value || 'draft',
      campaign_type: 'direct',
      placements: checkedValues('ad-placement').length ? checkedValues('ad-placement') : ['feed_inline'],
      module_keys: checkedValues('ad-module'),
      tags: splitList($('ad-tags').value),
      priority: Number($('ad-priority').value) || 0,
      starts_at: toIsoOrNull($('ad-starts-at').value),
      ends_at: toIsoOrNull($('ad-ends-at').value),
      frequency_cap_per_session: Number($('ad-frequency-cap').value) || 0,
      billing_model: 'sponsorship',
      notes: $('ad-notes').value.trim(),
    };
  }

  function safeFileName(name) {
    const raw = String(name || 'imagem-anuncio').split(/[\\/]/).pop();
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'imagem-anuncio';
  }

  function setUploadStatus(message, type) {
    const el = $('ad-image-upload-status');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = type === 'error' ? '#f87171' : (type === 'success' ? '#22c55e' : '');
  }

  async function uploadAdImage() {
    const input = $('ad-image-file');
    const file = input && input.files && input.files[0];
    if (!file) {
      setUploadStatus('Selecione uma imagem antes de enviar.', 'error');
      return;
    }
    if (!/^image\//i.test(file.type || '')) {
      setUploadStatus('Envie apenas arquivos de imagem.', 'error');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setUploadStatus('A imagem deve ter até 4 MB.', 'error');
      return;
    }
    const client = getClient();
    if (!client || !client.storage || typeof client.storage.from !== 'function') {
      setUploadStatus('Storage Supabase indisponível. Use uma URL externa.', 'error');
      return;
    }
    const folder = 'ad-campaigns';
    const suffix = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : String(Date.now());
    const path = folder + '/' + suffix + '-' + safeFileName(file.name);
    setUploadStatus('Enviando imagem...', '');
    const response = await client.storage.from('kino-media').upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type || undefined,
      upsert: false,
    });
    if (response && response.error) throw response.error;
    const publicResponse = client.storage.from('kino-media').getPublicUrl(path);
    const publicUrl = publicResponse && publicResponse.data && publicResponse.data.publicUrl;
    if (!publicUrl) throw new Error('URL pública da imagem não foi retornada.');
    $('ad-image-url').value = publicUrl;
    setUploadStatus('Imagem enviada e aplicada ao anúncio.', 'success');
    updatePreview();
  }

  function buildTrackedPreviewUrl(payload) {
    if (window.KCAds && typeof window.KCAds.buildTrackedTargetUrl === 'function') {
      return window.KCAds.buildTrackedTargetUrl(payload || collectPayload(), 'feed_inline');
    }
    return payload && payload.target_url ? payload.target_url : '';
  }

  function updateTrackingPreview(payload) {
    const target = $('ad-tracking-preview');
    if (!target) return;
    const data = payload || collectPayload();
    if (!data.target_url) {
      target.textContent = 'Links externos receberão UTMs para acompanhamento pelo anunciante.';
      return;
    }
    const tracked = buildTrackedPreviewUrl(data);
    target.innerHTML = [
      '<strong>URL rastreável:</strong> ',
      esc(tracked || data.target_url),
      '<br><span>UTMs ajudam o anunciante a cruzar cliques do KinoCampus com Analytics próprio.</span>',
    ].join('');
  }

  function resetForm() {
    const form = $('feed-ad-form');
    if (form) form.reset();
    $('ad-id').value = '';
    $('ad-cta-label').value = 'Saiba mais';
    $('ad-priority').value = '0';
    $('ad-frequency-cap').value = '4';
    setCheckedValues('ad-placement', ['feed_inline']);
    setCheckedValues('ad-module', []);
    setUploadStatus('Cole uma URL ou envie uma imagem para o storage.', '');
    updatePreview();
  }

  function editCampaign(campaign) {
    $('ad-id').value = campaign.id || '';
    $('ad-name').value = campaign.name || '';
    $('ad-advertiser').value = campaign.advertiser_name || '';
    $('ad-title').value = campaign.title || '';
    $('ad-description').value = campaign.description || '';
    $('ad-image-url').value = campaign.image_url || '';
    $('ad-target-url').value = campaign.target_url || '';
    $('ad-cta-label').value = campaign.cta_label || 'Saiba mais';
    $('ad-status').value = campaign.status || 'draft';
    setCheckedValues('ad-placement', campaign.placements || ['feed_inline']);
    setCheckedValues('ad-module', campaign.module_keys || []);
    $('ad-tags').value = Array.isArray(campaign.tags) ? campaign.tags.join(', ') : '';
    $('ad-priority').value = campaign.priority || 0;
    $('ad-frequency-cap').value = campaign.frequency_cap_per_session || 4;
    $('ad-starts-at').value = toLocalInputValue(campaign.starts_at);
    $('ad-ends-at').value = toLocalInputValue(campaign.ends_at);
    $('ad-notes').value = campaign.notes || '';
    updatePreview();
    $('feed-ad-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function statusLabel(status) {
    return ({
      active: 'Ativo',
      paused: 'Pausado',
      draft: 'Rascunho',
      archived: 'Arquivado',
    })[status] || status || 'Rascunho';
  }

  function renderCampaignItem(campaign) {
    const metric = getMetric(campaign.id);
    const impressions = metric.impressions || 0;
    const clicks = metric.clicks || 0;
    const ctr = impressions ? (clicks / impressions) * 100 : 0;
    const modules = Array.isArray(campaign.module_keys) && campaign.module_keys.length ? campaign.module_keys.join(', ') : 'todos os módulos';
    const placements = Array.isArray(campaign.placements) ? campaign.placements.join(', ') : 'feed_inline';
    return [
      `<article class="kc-feed-ad-item" data-ad-id="${esc(campaign.id)}">`,
      '<div class="kc-feed-ad-item__top">',
      '<div>',
      `<strong>${esc(campaign.title || campaign.name)}</strong>`,
      `<small>${esc(campaign.advertiser_name || 'Sem anunciante informado')} · ${esc(modules)}</small>`,
      `<small>${esc(campaign.target_url || '')}</small>`,
      '</div>',
      '<div class="kc-feed-ad-actions">',
      `<button type="button" data-feed-ad-action="edit" data-id="${esc(campaign.id)}" title="Editar"><i class="fas fa-pen" aria-hidden="true"></i></button>`,
      `<button type="button" data-feed-ad-action="toggle" data-id="${esc(campaign.id)}" title="${campaign.status === 'active' ? 'Pausar' : 'Ativar'}"><i class="fas fa-${campaign.status === 'active' ? 'pause' : 'play'}" aria-hidden="true"></i></button>`,
      `<button type="button" data-feed-ad-action="archive" data-id="${esc(campaign.id)}" title="Arquivar"><i class="fas fa-box-archive" aria-hidden="true"></i></button>`,
      '</div>',
      '</div>',
      '<div class="kc-feed-ad-badges">',
      `<span class="kc-feed-ad-status ${esc(campaign.status)}">${esc(statusLabel(campaign.status))}</span>`,
      `<span>${esc(placements)}</span>`,
      `<span>${impressions} impressões</span>`,
      `<span>${clicks} cliques</span>`,
      `<span>CTR ${formatPercent(ctr)}</span>`,
      campaign.ends_at ? `<span>Até ${esc(formatDate(campaign.ends_at))}</span>` : '',
      '</div>',
      `<div class="kc-feed-ad-tracking"><strong>URL rastreável:</strong> ${esc(buildTrackedPreviewUrl(campaign) || campaign.target_url || '')}</div>`,
      '</article>',
    ].join('');
  }

  function renderSummary(rows) {
    const target = $('feed-ads-summary');
    if (!target) return;
    const list = rows || getFilteredCampaigns();
    const active = list.filter(function (campaign) { return campaign.status === 'active'; }).length;
    const impressions = list.reduce(function (sum, campaign) { return sum + (getMetric(campaign.id).impressions || 0); }, 0);
    const clicks = list.reduce(function (sum, campaign) { return sum + (getMetric(campaign.id).clicks || 0); }, 0);
    const ctr = impressions ? (clicks / impressions) * 100 : 0;
    const windowDays = getMetricWindowDays();
    target.innerHTML = [
      '<div class="kc-feed-ads-kpi"><span>Campanhas</span><strong>' + formatNumber(list.length) + '</strong><small>' + formatNumber(campaigns.length) + ' no total</small></div>',
      '<div class="kc-feed-ads-kpi"><span>Ativas</span><strong>' + formatNumber(active) + '</strong><small>Prontas para exibição</small></div>',
      '<div class="kc-feed-ads-kpi"><span>Cliques</span><strong>' + formatNumber(clicks) + '</strong><small>' + formatNumber(impressions) + ' impressões em ' + windowDays + ' dias</small></div>',
      '<div class="kc-feed-ads-kpi"><span>CTR</span><strong>' + formatPercent(ctr) + '</strong><small>Cliques / impressões</small></div>',
    ].join('');
  }

  function renderList() {
    const list = $('feed-ads-list');
    if (!list) return;
    const rows = getFilteredCampaigns();
    renderSummary(rows);
    if (!campaigns.length) {
      list.innerHTML = '<div style="color:var(--kc-text-dark-secondary);padding:18px;text-align:center;">Nenhuma campanha de anúncio cadastrada.</div>';
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<div style="color:var(--kc-text-dark-secondary);padding:18px;text-align:center;">Nenhuma campanha corresponde aos filtros atuais.</div>';
      return;
    }
    list.innerHTML = rows.map(renderCampaignItem).join('');
  }

  function updatePreview() {
    const target = $('feed-ad-preview');
    if (!target) return;
    const payload = collectPayload();
    updateTrackingPreview(payload);
    payload.id = payload.id || 'preview';
    if (!payload.title || !payload.target_url) {
      target.innerHTML = '<div style="color:var(--kc-text-dark-secondary);font-size:.9rem;">Preencha título e URL para visualizar o anúncio.</div>';
      return;
    }
    target.innerHTML = window.KCAds && typeof window.KCAds.buildAdHTML === 'function'
      ? window.KCAds.buildAdHTML(payload, 'feed_inline')
      : '';
  }

  async function loadAll() {
    showError('');
    try {
      const result = await Promise.all([fetchCampaigns(), fetchMetrics(), fetchAdNetworkSettings()]);
      campaigns = result[0];
      metrics = result[1];
      applyAdNetworkSettings(result[2]);
      renderList();
    } catch (error) {
      campaigns = [];
      renderList();
      showError(error && error.message ? error.message : 'Não foi possível carregar anúncios de feed.');
    }
  }

  function buildExportReport() {
    const visibleCampaigns = filteredCampaigns.length ? filteredCampaigns : getFilteredCampaigns();
    const filters = getFilters();
    const rows = visibleCampaigns.map(function (campaign) {
      const metric = getMetric(campaign.id);
      const impressions = metric.impressions || 0;
      const clicks = metric.clicks || 0;
      return {
        id: campaign.id,
        titulo: campaign.title,
        anunciante: campaign.advertiser_name,
        status: statusLabel(campaign.status),
        posicoes: (campaign.placements || []).join(', '),
        modulos: (campaign.module_keys || []).join(', ') || 'todos',
        tags: (campaign.tags || []).join(', '),
        prioridade: campaign.priority || 0,
        impressoes: impressions,
        cliques: clicks,
        ctr: formatPercent(impressions ? (clicks / impressions) * 100 : 0),
        inicio: formatDate(campaign.starts_at),
        fim: formatDate(campaign.ends_at),
        url: campaign.target_url,
        url_rastreavel: buildTrackedPreviewUrl(campaign),
        observacoes: campaign.notes || '',
      };
    });
    const active = visibleCampaigns.filter(function (campaign) { return campaign.status === 'active'; }).length;
    const impressions = rows.reduce(function (sum, row) { return sum + (Number(row.impressoes) || 0); }, 0);
    const clicks = rows.reduce(function (sum, row) { return sum + (Number(row.cliques) || 0); }, 0);
    const network = normalizeAdNetworkSettings(adNetworkSettings);
    const networkRows = [
      { campo: 'Status', valor: statusLabelNetwork(network.status), contexto: providerLabel(network.provider) },
      { campo: 'Client ID AdSense', valor: network.adsense_client_id || '-', contexto: 'Publisher público' },
      { campo: 'Auto ads', valor: network.auto_ads_enabled ? 'Ativado' : 'Desativado', contexto: 'Padrão recomendado: desativado' },
      { campo: 'Feed inline', valor: modeLabel(network.placement_modes.feed_inline), contexto: network.adsense_slots.feed_inline || 'sem slot' },
      { campo: 'Lateral superior', valor: modeLabel(network.placement_modes.feed_aside_top), contexto: network.adsense_slots.feed_aside_top || 'sem slot' },
      { campo: 'Lateral sticky', valor: modeLabel(network.placement_modes.feed_aside_sticky), contexto: network.adsense_slots.feed_aside_sticky || 'sem slot' },
    ];
    return {
      title: 'KinoCampus - Anúncios de feed',
      subtitle: 'Campanhas contextuais, status e desempenho agregado',
      source: 'admin/banners.html - seção Anúncios de feed',
      filters: {
        periodo_metricas: getMetricWindowDays() + ' dias',
        tipo: 'campanhas contextuais próprias',
        busca: filters.query || 'sem filtro',
        status: filters.status || 'todos',
        modulo: filters.module || 'todos',
      },
      kpis: {
        campanhas_total: visibleCampaigns.length,
        campanhas_cadastradas: campaigns.length,
        campanhas_ativas: active,
        impressoes_registradas: impressions,
        cliques_registrados: clicks,
        ctr_percentual: formatPercent(impressions ? (clicks / impressions) * 100 : 0),
        modo_adsense: statusLabelNetwork(network.status),
      },
      sections: [
        {
          title: 'Configuração AdSense',
          note: 'Resumo administrativo dos modos por placement. Slots reais podem ficar vazios enquanto a conta aguarda aprovação.',
          rows: networkRows,
          columns: ['campo', 'valor', 'contexto'],
          maxPdfRows: 8,
        },
        {
          title: 'Campanhas',
          rows,
          pdfColumns: ['titulo', 'anunciante', 'status', 'cliques', 'ctr'],
          xlsxColumns: ['id', 'titulo', 'anunciante', 'status', 'posicoes', 'modulos', 'tags', 'prioridade', 'impressoes', 'cliques', 'ctr', 'inicio', 'fim', 'url', 'url_rastreavel', 'observacoes'],
          maxPdfRows: 30,
        },
      ],
    };
  }

  async function exportReport(kind) {
    if (!window.KCAdminExport) {
      toast('Exportador admin indisponível.', 'error');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const report = buildExportReport();
    if (kind === 'pdf') await window.KCAdminExport.exportReportPDF('kc-admin-anuncios-feed-' + date + '.pdf', report);
    else await window.KCAdminExport.exportReportXLSX('kc-admin-anuncios-feed-' + date + '.xlsx', report);
  }

  function bindEvents() {
    const form = $('feed-ad-form');
    if (!form || form.__kcFeedAdsBound) return;
    form.__kcFeedAdsBound = true;
    form.addEventListener('input', updatePreview);
    form.addEventListener('change', updatePreview);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const payload = collectPayload();
      if (!payload.name || !payload.title || !payload.target_url) {
        toast('Preencha nome, título e URL.', 'error');
        return;
      }
      try {
        await saveCampaign(payload);
        toast('Anúncio salvo.', 'success');
        resetForm();
        await loadAll();
      } catch (error) {
        toast('Erro ao salvar anúncio: ' + (error.message || error), 'error');
      }
    });
    $('feed-ad-reset').addEventListener('click', resetForm);
    $('feed-ads-refresh').addEventListener('click', loadAll);
    $('feed-ads-metric-window').addEventListener('change', loadAll);
    $('feed-ads-export-xlsx').addEventListener('click', function () { exportReport('xlsx').catch(console.error); });
    $('feed-ads-export-pdf').addEventListener('click', function () { exportReport('pdf').catch(console.error); });
    const networkSave = $('ad-network-save');
    if (networkSave) {
      networkSave.addEventListener('click', async function () {
        try {
          const saved = await saveAdNetworkSettings(collectAdNetworkPayload());
          applyAdNetworkSettings(saved);
          toast('Configuração de AdSense salva.', 'success');
        } catch (error) {
          toast('Erro ao salvar AdSense: ' + (error.message || error), 'error');
        }
      });
    }
    const networkReset = $('ad-network-reset');
    if (networkReset) {
      networkReset.addEventListener('click', function () {
        applyAdNetworkSettings(defaultAdNetworkSettings());
        toast('Configuração local restaurada. Clique em Salvar para persistir.', 'success');
      });
    }
    [
      'ad-network-status',
      'ad-network-provider',
      'ad-network-client-id',
      'ad-mode-feed-inline',
      'ad-mode-feed-aside-top',
      'ad-mode-feed-aside-sticky',
      'ad-slot-feed-inline',
      'ad-slot-feed-aside-top',
      'ad-slot-feed-aside-sticky',
      'ad-network-notes',
      'ad-network-auto-ads',
    ].forEach(function (id) {
      const field = $(id);
      if (!field) return;
      const eventName = id === 'ad-network-notes' || id === 'ad-network-client-id' || id.indexOf('ad-slot-') === 0 ? 'input' : 'change';
      field.addEventListener(eventName, function () { renderAdNetworkStatus(); });
    });
    ['feed-ads-filter-query', 'feed-ads-filter-status', 'feed-ads-filter-module'].forEach(function (id) {
      const field = $(id);
      if (!field) return;
      field.addEventListener(id === 'feed-ads-filter-query' ? 'input' : 'change', renderList);
    });
    const uploadButton = $('ad-image-upload');
    if (uploadButton) {
      uploadButton.addEventListener('click', function () {
        uploadAdImage().catch(function (error) {
          setUploadStatus('Erro ao enviar imagem: ' + (error.message || error), 'error');
        });
      });
    }
    $('feed-ads-list').addEventListener('click', async function (event) {
      const btn = event.target.closest('[data-feed-ad-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const campaign = campaigns.find(function (item) { return item.id === id; });
      if (!campaign) return;
      const action = btn.getAttribute('data-feed-ad-action');
      if (action === 'edit') {
        editCampaign(campaign);
        return;
      }
      if (action === 'toggle') {
        try {
          await saveCampaign({ ...campaign, status: campaign.status === 'active' ? 'paused' : 'active' });
          toast(campaign.status === 'active' ? 'Anúncio pausado.' : 'Anúncio ativado.', 'success');
          await loadAll();
        } catch (error) {
          toast('Erro ao alterar status: ' + (error.message || error), 'error');
        }
        return;
      }
      if (action === 'archive') {
        if (!confirm('Arquivar esta campanha? Ela deixará de aparecer nos feeds.')) return;
        try {
          await archiveCampaign(id);
          toast('Campanha arquivada.', 'success');
          await loadAll();
        } catch (error) {
          toast('Erro ao arquivar: ' + (error.message || error), 'error');
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('feed-ads-admin')) return;
    bindEvents();
    resetForm();
    applyAdNetworkSettings(defaultAdNetworkSettings());
    setTimeout(loadAll, 700);
  });
}());
