/*
  KinoCampus - Admin Feed Ads (v9.3.6.1)
  Gerencia campanhas contextuais exibidas nos feeds.
*/
(function () {
  'use strict';

  const METRIC_EVENTS = ['ad_impression', 'ad_click'];
  const METRIC_LIMIT = 5000;
  let campaigns = [];
  let filteredCampaigns = [];
  let metrics = new Map();

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
      const result = await Promise.all([fetchCampaigns(), fetchMetrics()]);
      campaigns = result[0];
      metrics = result[1];
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
      },
      sections: [
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
    setTimeout(loadAll, 700);
  });
}());
