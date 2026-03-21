(function () {
  'use strict';

  /* Armazena os dados carregados para uso no export */
  let _data = null;
  let _auditOffset = 0;
  var AUDIT_PAGE_SIZE = 20;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
  }

  function isPermissionError(error) {
    if (!error) return false;
    const message = String(error.message || error.details || error.hint || '').toLowerCase();
    return message.includes('permission') || message.includes('row-level security') || message.includes('rls');
  }

  function showError(message) {
    const el = $('#admin-error');
    if (!el) return;
    el.textContent = String(message || 'Falha ao carregar dashboard.');
    el.style.display = 'block';
  }

  function clearError() {
    const el = $('#admin-error');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }

  function setLoading(isLoading) {
    const loading = $('#admin-loading');
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
  }

  function setLastSync() {
    const el = $('#admin-last-sync');
    if (!el) return;
    el.textContent = `Atualizado em ${new Date().toLocaleString('pt-BR')}`;
  }

  async function checkAccess() {
    const user = await window.KCAPI.getCurrentUser();
    if (!user) return { ok: false, message: 'Faça login para acessar o dashboard administrativo.' };

    const client = getClient();
    if (!client) return { ok: false, message: 'Supabase client não disponível.' };

    const { data: profile, error } = await client
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile || !profile.is_admin) {
      return { ok: false, message: 'Acesso restrito a moderadores/administradores.' };
    }

    return { ok: true };
  }

  function metricCard(icon, label, value) {
    return `
      <article class="kc-admin-card">
        <div class="kc-admin-card__label"><i class="${icon}"></i> ${label}</div>
        <strong>${Number(value || 0)}</strong>
      </article>
    `;
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  // ── Moderação: Denúncias ────────────────────────────────────────────────────
  async function loadReportMetrics(client) {
    try {
      const rpc = await client.rpc('kc_admin_list_reports', { p_status: 'all', p_reason: 'all', p_limit: 2000 });
      if (!rpc.error && Array.isArray(rpc.data)) {
        const total = rpc.data.length;
        const open  = rpc.data.filter(r => String(r.status || '').toLowerCase() === 'open').length;
        return { open, total };
      }
    } catch (_) {}

    let open = 0, total = 0;
    try {
      const [openRes, totalRes] = await Promise.all([
        client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        client.from('reports').select('id', { count: 'exact', head: true }),
      ]);
      open  = openRes.count  || 0;
      total = totalRes.count || 0;
    } catch (_) {}
    return { open, total };
  }

  // ── Moderação: Posts ocultos/deletados ──────────────────────────────────────
  async function loadPostStatusMetrics(client) {
    let hidden = 0, deleted = 0;
    try {
      const [hiddenRes, deletedRes] = await Promise.all([
        client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'hidden'),
        client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'deleted'),
      ]);

      if ((hiddenRes.error || deletedRes.error) &&
          (isPermissionError(hiddenRes.error) || isPermissionError(deletedRes.error))) {
        const fallback = await client.from('posts').select('status').in('status', ['hidden', 'deleted']).limit(2000);
        if (!fallback.error && Array.isArray(fallback.data)) {
          hidden  = fallback.data.filter(r => r.status === 'hidden').length;
          deleted = fallback.data.filter(r => r.status === 'deleted').length;
          return { hidden, deleted };
        }
      }

      hidden  = hiddenRes.count  || 0;
      deleted = deletedRes.count || 0;
    } catch (_) {}
    return { hidden, deleted };
  }

  // ── Atividade: Posts publicados (criados nos últimos 30d) ───────────────────
  async function loadPostsCreated(client, since30) {
    try {
      const res = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30);
      if (!res.error) return res.count || 0;
      const fb = await client.from('posts').select('id').gte('created_at', since30).limit(2000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Posts editados nos últimos 30d ───────────────────────────────
  async function loadPostsEdited(client, since30) {
    try {
      const res = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since30)
        .lt('created_at', since30);
      if (!res.error) return res.count || 0;
      const fb = await client.from('posts')
        .select('id')
        .gte('updated_at', since30)
        .lt('created_at', since30)
        .limit(2000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Comentários (últimos 30d) ─────────────────────────────────────
  async function loadCommentsCount(client, since30) {
    try {
      const res = await client.from('comments')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30);
      if (!res.error) return res.count || 0;
      const fb = await client.from('comments').select('id').gte('created_at', since30).limit(5000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Buscas (últimos 30d) ─────────────────────────────────────────
  async function loadSearchCount(client, since30) {
    try {
      const res = await client.from('search_queries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30);
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Total de posts ──────────────────────────────────────────────
  async function loadPostsTotal(client) {
    try {
      const res = await client.from('posts')
        .select('id', { count: 'exact', head: true });
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Comunidade: Total de usuários ──────────────────────────────────────────
  async function loadUsersTotal(client) {
    try {
      const res = await client.from('profiles')
        .select('id', { count: 'exact', head: true });
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Comunidade: Novos usuários (30d) ──────────────────────────────────────
  async function loadUsersNew(client, since30) {
    try {
      const res = await client.from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30);
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Comunidade: Votos (30d) ───────────────────────────────────────────────
  async function loadVotesCount(client, since30) {
    try {
      const res = await client.from('post_votes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30);
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Comunidade: Posts salvos ──────────────────────────────────────────────
  async function loadSavedPostsCount(client) {
    try {
      const res = await client.from('saved_posts')
        .select('id', { count: 'exact', head: true });
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  async function loadAuditLog(client, limit, offset, actionFilter) {
    limit  = limit  || AUDIT_PAGE_SIZE;
    offset = offset || 0;
    try {
      var query = client.from('audit_log')
        .select('created_at, action, entity_type, actor_id')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (actionFilter && actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const res = await query;
      if (!res.error) return Array.isArray(res.data) ? res.data : [];

      if (isPermissionError(res.error)) {
        const rpc = await client.rpc('kc_admin_list_audit_logs', {
          p_entity_type: 'all',
          p_action: actionFilter && actionFilter !== 'all' ? actionFilter : 'all',
          p_actor_query: null,
          p_limit: limit,
        });
        if (!rpc.error && Array.isArray(rpc.data)) return rpc.data;
      }
    } catch (_) {}
    return [];
  }

  // ── Tendências de busca ──────────────────────────────────────────────────────
  async function loadSearchTrendsData(client) {
    let trends = [];
    try {
      const res = await client.rpc('kc_admin_search_trends', { p_limit: 10 });
      if (!res.error && Array.isArray(res.data)) {
        trends = res.data;
      } else {
        const raw = await client.from('search_queries')
          .select('term')
          .order('created_at', { ascending: false })
          .limit(500);
        if (!raw.error && Array.isArray(raw.data)) {
          const freq = {};
          raw.data.forEach(r => {
            const t = String(r.term || '').trim().toLowerCase();
            if (t) freq[t] = (freq[t] || 0) + 1;
          });
          trends = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([term, count]) => ({ term, count }));
        }
      }
    } catch (_) { trends = []; }
    return trends;
  }

  function renderSearchTrends(trends) {
    const trendsList = $('#admin-trends-list');
    if (!trendsList) return;
    if (!trends.length) {
      trendsList.innerHTML = '<li class="kc-trend-empty">Nenhuma busca registrada ainda.</li>';
      return;
    }
    const max = Math.max(...trends.map(t => Number(t.count) || 1), 1);
    trendsList.innerHTML = trends.map(t => {
      const pct = Math.round(((Number(t.count) || 0) / max) * 100);
      return `
        <li class="kc-trend-item">
          <span class="kc-trend-term">${escHtmlAdmin(String(t.term || ''))}</span>
          <div class="kc-trend-bar-wrap"><div class="kc-trend-bar" style="width:${pct}%"></div></div>
          <span class="kc-trend-count">${Number(t.count) || 0}</span>
        </li>
      `;
    }).join('');
  }

  function renderAuditRows(rows, append) {
    const auditBody = $('#admin-audit-body');
    if (!auditBody) return;
    var html = rows.length
      ? rows.map(row => `
          <tr>
            <td data-label="Data">${new Date(row.created_at).toLocaleString('pt-BR')}</td>
            <td data-label="Ação"><code>${row.action || '—'}</code></td>
            <td data-label="Entidade"><code>${row.entity_type || '—'}</code></td>
            <td data-label="Autor"><code>${row.actor_id || 'system'}</code></td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="color:var(--kc-text-dark-secondary);">Nenhum evento encontrado.</td></tr>';

    if (append) {
      auditBody.insertAdjacentHTML('beforeend', html);
    } else {
      auditBody.innerHTML = html;
    }

    // Hide "load more" if fewer results than page size
    var loadMoreBtn = $('#admin-audit-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.style.display = rows.length < AUDIT_PAGE_SIZE ? 'none' : '';
    }
  }

  // ── Carregamento sob demanda de bibliotecas CDN (com fallback) ─────────────
  var XLSX_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
  ];
  var JSPDF_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  ];

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload  = resolve;
      s.onerror = function () { reject(new Error('Falha ao carregar: ' + url)); };
      document.head.appendChild(s);
    });
  }

  async function loadScriptWithFallback(urls) {
    var lastError;
    for (var i = 0; i < urls.length; i++) {
      try { await loadScript(urls[i]); return; }
      catch (e) { lastError = e; console.warn('[CDN fallback] ' + e.message); }
    }
    throw lastError || new Error('Todas as fontes CDN falharam.');
  }

  async function ensureXLSX() { if (!window.XLSX) await loadScriptWithFallback(XLSX_URLS); }
  async function ensureJsPDF() { if (!window.jspdf) await loadScriptWithFallback(JSPDF_URLS); }

  // ── Exportação XLSX ──────────────────────────────────────────────────────────
  async function exportXLSX(data) {
    await ensureXLSX();
    const wb = window.XLSX.utils.book_new();
    const date = new Date().toLocaleString('pt-BR');

    // Dashboard — métricas
    const metricsRows = [
      ['KinoCampus — Dashboard Administrativo'],
      ['Gerado em: ' + date],
      [],
      ['MODERAÇÃO', ''],
      ['Métrica', 'Valor'],
      ['Denúncias abertas',  data.reportMetrics.open],
      ['Total de denúncias', data.reportMetrics.total],
      ['Posts ocultos',      data.postStatusMetrics.hidden],
      ['Posts deletados',    data.postStatusMetrics.deleted],
      [],
      ['ATIVIDADE (últimos 30 dias)', ''],
      ['Métrica', 'Valor'],
      ['Total de posts',    data.postsTotal],
      ['Posts publicados',  data.postsCreated],
      ['Posts editados',    data.postsEdited],
      ['Comentários',       data.commentsCount],
      ['Buscas realizadas', data.searchCount],
      [],
      ['COMUNIDADE', ''],
      ['Métrica', 'Valor'],
      ['Total de usuários',     data.usersTotal],
      ['Novos usuários (30d)',  data.usersNew],
      ['Votos (30d)',           data.votesCount],
      ['Posts salvos',          data.savedPostsCount],
    ];
    const ws1 = window.XLSX.utils.aoa_to_sheet(metricsRows);
    ws1['!cols'] = [{ wch: 30 }, { wch: 12 }];
    window.XLSX.utils.book_append_sheet(wb, ws1, 'Dashboard');

    // Tendências de busca
    if (data.trends && data.trends.length) {
      const trendRows = [['Termo', 'Buscas'], ...data.trends.map(t => [t.term, Number(t.count) || 0])];
      const ws2 = window.XLSX.utils.aoa_to_sheet(trendRows);
      ws2['!cols'] = [{ wch: 24 }, { wch: 10 }];
      window.XLSX.utils.book_append_sheet(wb, ws2, 'Tendências');
    }

    // Audit log
    if (data.auditRows && data.auditRows.length) {
      const auditRows2 = [
        ['Data', 'Ação', 'Entidade', 'Autor'],
        ...data.auditRows.map(r => [
          new Date(r.created_at).toLocaleString('pt-BR'),
          r.action || '—',
          r.entity_type || '—',
          r.actor_id || 'system',
        ]),
      ];
      const ws3 = window.XLSX.utils.aoa_to_sheet(auditRows2);
      ws3['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 36 }];
      window.XLSX.utils.book_append_sheet(wb, ws3, 'Audit Log');
    }

    const filename = `kc-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`;
    window.XLSX.writeFile(wb, filename);
  }

  // ── Exportação PDF ───────────────────────────────────────────────────────────
  async function exportPDF(data) {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const date = new Date().toLocaleString('pt-BR');
    const marginL = 14;
    let y = 18;

    function checkPage() { if (y > 265) { doc.addPage(); y = 18; } }

    function renderSection(title, metrics) {
      checkPage();
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text(title, marginL, y); y += 5;
      doc.setDrawColor(220, 220, 220);
      doc.line(marginL, y, 196, y); y += 5;
      doc.setFontSize(10);
      metrics.forEach(function (m) {
        checkPage();
        doc.setTextColor(80, 80, 80);
        doc.text(m[0], marginL + 2, y);
        doc.setTextColor(30, 30, 30);
        doc.text(String(m[1]), 150, y, { align: 'right' });
        y += 6;
      });
      y += 4;
    }

    // Cabeçalho
    doc.setFontSize(16);
    doc.setTextColor(255, 107, 0);
    doc.text('KinoCampus — Dashboard Administrativo', marginL, y); y += 7;
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text('Gerado em: ' + date, marginL, y); y += 10;

    // Seção Moderação
    renderSection('MODERAÇÃO', [
      ['Denúncias abertas',  data.reportMetrics.open],
      ['Total de denúncias', data.reportMetrics.total],
      ['Posts ocultos',      data.postStatusMetrics.hidden],
      ['Posts deletados',    data.postStatusMetrics.deleted],
    ]);

    // Seção Atividade
    renderSection('ATIVIDADE (últimos 30 dias)', [
      ['Total de posts',    data.postsTotal],
      ['Posts publicados',  data.postsCreated],
      ['Posts editados',    data.postsEdited],
      ['Comentários',       data.commentsCount],
      ['Buscas realizadas', data.searchCount],
    ]);

    // Seção Comunidade
    renderSection('COMUNIDADE', [
      ['Total de usuários',     data.usersTotal],
      ['Novos usuários (30d)',  data.usersNew],
      ['Votos (30d)',           data.votesCount],
      ['Posts salvos',          data.savedPostsCount],
    ]);

    // Tendências de busca
    if (data.trends && data.trends.length) {
      checkPage();
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text('TENDÊNCIAS DE BUSCA (top 10)', marginL, y); y += 5;
      doc.line(marginL, y, 196, y); y += 5;
      doc.setFontSize(10);
      data.trends.forEach(function (t, i) {
        checkPage();
        doc.setTextColor(80, 80, 80);
        doc.text((i + 1) + '. ' + String(t.term || ''), marginL + 2, y);
        doc.setTextColor(30, 30, 30);
        doc.text(String(Number(t.count) || 0), 150, y, { align: 'right' });
        y += 6;
      });
      y += 4;
    }

    // Audit log
    if (data.auditRows && data.auditRows.length) {
      checkPage();
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text('AUDIT LOG', marginL, y); y += 5;
      doc.line(marginL, y, 196, y); y += 5;
      doc.setFontSize(8);
      data.auditRows.forEach(function (row) {
        checkPage();
        var dateStr = new Date(row.created_at).toLocaleString('pt-BR');
        var line = dateStr + '  |  ' + (row.action || '—') + '  |  ' + (row.entity_type || '—') + '  |  ' + String(row.actor_id || 'system').slice(0, 16);
        doc.setTextColor(70, 70, 70);
        doc.text(line, marginL + 2, y);
        y += 5;
      });
    }

    // Rodapé
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('KinoCampus — Pág. ' + p + ' / ' + totalPages, 196, 289, { align: 'right' });
    }

    doc.save('kc-dashboard-' + new Date().toISOString().slice(0, 10) + '.pdf');
  }

  // ── Habilita botões de exportação na toolbar ─────────────────────────────────
  function enableExport() {
    const xlsxBtn = $('#admin-export-xlsx');
    const pdfBtn  = $('#admin-export-pdf');

    if (xlsxBtn) {
      xlsxBtn.disabled = false;
      xlsxBtn.addEventListener('click', async () => {
        if (!_data) return;
        xlsxBtn.disabled = true;
        try { await exportXLSX(_data); }
        catch (e) { console.error('[Admin export XLSX]', e); showError('Falha ao gerar XLSX: ' + e.message); }
        finally { xlsxBtn.disabled = false; }
      });
    }

    if (pdfBtn) {
      pdfBtn.disabled = false;
      pdfBtn.addEventListener('click', async () => {
        if (!_data) return;
        pdfBtn.disabled = true;
        try { await exportPDF(_data); }
        catch (e) { console.error('[Admin export PDF]', e); showError('Falha ao gerar PDF: ' + e.message); }
        finally { pdfBtn.disabled = false; }
      });
    }
  }

  function escHtmlAdmin(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadMetrics() {
    const client = getClient();
    if (!client) { showError('Supabase client não disponível.'); return; }

    const since30 = daysAgo(30);

    // Carrega todas as métricas em paralelo para melhor performance
    const [
      reportMetrics,
      postStatusMetrics,
      postsCreated,
      postsEdited,
      commentsCount,
      searchCount,
      postsTotal,
      usersTotal,
      usersNew,
      votesCount,
      savedPostsCount,
      auditRows,
    ] = await Promise.all([
      loadReportMetrics(client),
      loadPostStatusMetrics(client),
      loadPostsCreated(client, since30),
      loadPostsEdited(client, since30),
      loadCommentsCount(client, since30),
      loadSearchCount(client, since30),
      loadPostsTotal(client),
      loadUsersTotal(client),
      loadUsersNew(client, since30),
      loadVotesCount(client, since30),
      loadSavedPostsCount(client),
      loadAuditLog(client, AUDIT_PAGE_SIZE, 0),
    ]);

    _auditOffset = auditRows.length;

    // ── Renderiza métricas de moderação ──
    const metrics = $('#admin-metrics');
    if (metrics) {
      metrics.innerHTML = [
        metricCard('fas fa-flag',      'Denúncias abertas',  reportMetrics.open),
        metricCard('fas fa-list',      'Total de denúncias', reportMetrics.total),
        metricCard('fas fa-eye-slash', 'Posts ocultos',      postStatusMetrics.hidden),
        metricCard('fas fa-trash',     'Posts deletados',    postStatusMetrics.deleted),
      ].join('');
    }

    // ── Renderiza métricas de atividade (30 dias) ──
    const activityMetrics = $('#admin-activity-metrics');
    if (activityMetrics) {
      activityMetrics.innerHTML = [
        metricCard('fas fa-layer-group',      'Total de posts',    postsTotal),
        metricCard('fas fa-plus-circle',      'Posts publicados',  postsCreated),
        metricCard('fas fa-pen-to-square',    'Posts editados',    postsEdited),
        metricCard('fas fa-comment',          'Comentários',       commentsCount),
        metricCard('fas fa-magnifying-glass', 'Buscas',            searchCount),
      ].join('');
    }

    // ── Renderiza métricas da comunidade ──
    const communityMetrics = $('#admin-community-metrics');
    if (communityMetrics) {
      communityMetrics.innerHTML = [
        metricCard('fas fa-users',       'Total de usuários',     usersTotal),
        metricCard('fas fa-user-plus',   'Novos usuários (30d)',  usersNew),
        metricCard('fas fa-thumbs-up',   'Votos (30d)',           votesCount),
        metricCard('fas fa-bookmark',    'Posts salvos',           savedPostsCount),
      ].join('');
    }

    // ── Renderiza audit log ──
    renderAuditRows(auditRows, false);

    // ── Coleta tendências e armazena tudo para export ──
    const trends = await loadSearchTrendsData(client);
    renderSearchTrends(trends);

    _data = {
      reportMetrics, postStatusMetrics,
      postsCreated, postsEdited, commentsCount, searchCount, postsTotal,
      usersTotal, usersNew, votesCount, savedPostsCount,
      auditRows, trends,
    };
    enableExport();

    setLastSync();
  }

  async function refreshDashboard() {
    clearError();
    setLoading(true);
    try {
      await loadMetrics();
    } catch (error) {
      console.error('[Admin dashboard] refreshDashboard:', error);
      showError('Não foi possível atualizar o dashboard no momento.');
    } finally {
      setLoading(false);
    }
  }

  // ── Audit log: carregar mais ──────────────────────────────────────────────
  async function loadMoreAudit() {
    var client = getClient();
    if (!client) return;
    var filterEl = $('#admin-audit-filter');
    var actionFilter = filterEl ? filterEl.value : 'all';
    var btn = $('#admin-audit-load-more');
    if (btn) btn.disabled = true;

    try {
      var rows = await loadAuditLog(client, AUDIT_PAGE_SIZE, _auditOffset, actionFilter);
      _auditOffset += rows.length;
      renderAuditRows(rows, true);
      // Append to _data for export
      if (_data && _data.auditRows) {
        _data.auditRows = _data.auditRows.concat(rows);
      }
    } catch (e) {
      console.error('[Admin audit] loadMore:', e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Audit log: filtrar por ação ───────────────────────────────────────────
  async function filterAudit() {
    var client = getClient();
    if (!client) return;
    var filterEl = $('#admin-audit-filter');
    var actionFilter = filterEl ? filterEl.value : 'all';
    _auditOffset = 0;

    try {
      var rows = await loadAuditLog(client, AUDIT_PAGE_SIZE, 0, actionFilter);
      _auditOffset = rows.length;
      renderAuditRows(rows, false);
      if (_data) _data.auditRows = rows;
    } catch (e) {
      console.error('[Admin audit] filter:', e);
    }
  }

  async function boot() {
    setLoading(true);
    const access = await checkAccess();
    if (!access.ok) {
      setLoading(false);
      showError(access.message);
      setTimeout(() => window.location.replace('../index.html'), 2500);
      return;
    }

    $('#admin-content').style.display = 'block';

    const refreshBtn = $('#admin-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshDashboard);

    var loadMoreBtn = $('#admin-audit-load-more');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreAudit);

    var auditFilter = $('#admin-audit-filter');
    if (auditFilter) auditFilter.addEventListener('change', filterAudit);

    await refreshDashboard();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
