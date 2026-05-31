/*
  KinoCampus — Admin Banners Controller (v8.3.2.0)
  Gerencia CRUD + reordenação drag-and-drop + preview ao vivo
  dos banners do carrossel da página inicial.
  Depende de: window.KCSupabase (kc-supabase.client.js)
*/
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Ícones sugeridos para facilitar escolha
  // ─────────────────────────────────────────────────────────────
  const ICON_SUGGESTIONS = [
    'fas fa-calendar-alt',
    'fas fa-exchange-alt',
    'fas fa-campground',
    'fas fa-star',
    'fas fa-leaf',
    'fas fa-bolt',
    'fas fa-trophy',
    'fas fa-book',
    'fas fa-graduation-cap',
    'fas fa-home',
    'fas fa-car',
    'fas fa-briefcase',
  ];

  // ─────────────────────────────────────────────────────────────
  // Estado
  // ─────────────────────────────────────────────────────────────
  let banners    = [];     // array de hero_banner rows
  let dragSrcIdx = null;   // índice do item sendo arrastado
  const BANNER_ANALYTICS_LIMIT = 5000;
  const BANNER_AUDIT_EXPORT_LIMIT = 800;
  const BANNER_METRIC_EVENTS = ['banner_impression', 'banner_click'];

  // ─────────────────────────────────────────────────────────────
  // Utilitários
  // ─────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  const PREVIEW_DEBOUNCE_MS = 200;
  let previewTimer = null;
  let dragBindingsReady = false;

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(iso));
    } catch (_) { return iso; }
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0,00%';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }

  function getMetricsPeriodDays() {
    const select = document.getElementById('banners-metrics-period');
    const value = select ? Number(select.value) : 30;
    return [7, 30, 90, 365].includes(value) ? value : 30;
  }

  let toastTimer = null;
  function toast(msg, type) {
    const el = document.getElementById('kc-banners-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'show ' + (type || 'success');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3200);
  }

  function showError(msg) {
    const el = document.getElementById('banners-error');
    if (!el) return;
    el.style.display = 'block';
    el.textContent   = msg;
  }

  function hideError() {
    const el = document.getElementById('banners-error');
    if (el) el.style.display = 'none';
  }

  function setLoadedState(isLoaded) {
    const loading = document.getElementById('banners-loading');
    const content = document.getElementById('banners-content');
    if (loading) loading.style.display = isLoaded ? 'none' : 'flex';
    if (content) content.style.display = isLoaded ? 'block' : 'none';
  }

  function getClient() {
    return window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
  }

  // ─────────────────────────────────────────────────────────────
  // Verificação de admin
  // ─────────────────────────────────────────────────────────────
  function getErrorMessage(error, fallback) {
    if (!error) return fallback;
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (error.message) return String(error.message);
    return fallback;
  }

  async function resolveCurrentUser() {
    if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
      try {
        const user = await window.KCAPI.getCurrentUser();
        if (user) return user;
      } catch (_) { }
    }

    if (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') {
      try {
        const user = window.KCSupabase.getUser();
        if (user) return user;
      } catch (_) { }
    }

    return null;
  }

  async function waitForAuthenticatedUser(timeoutMs) {
    const user = await resolveCurrentUser();
    if (user) return user;

    const timeout = Number.isFinite(timeoutMs) ? timeoutMs : 2200;
    return new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        document.removeEventListener('kc:authchange', onAuthChange);
        clearTimeout(timer);
      };

      const settle = async (nextUser) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(nextUser || await resolveCurrentUser());
      };

      const onAuthChange = (event) => {
        const nextUser = event && event.detail ? event.detail.user : null;
        settle(nextUser || null);
      };

      const timer = setTimeout(() => settle(null), timeout);
      document.addEventListener('kc:authchange', onAuthChange, { once: true });
    });
  }

  async function checkAdminAccess() {
    const drv = window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver;
    if (drv !== 'supabase') {
      showError('Esta página requer driver=supabase. Verifique o kc-env.js e recarregue.');
      return false;
    }

    const user = await waitForAuthenticatedUser();
    if (!user) {
      showError('Sessão expirada ou não autenticado. Faça login novamente.');
      return false;
    }

    const client = getClient();
    if (!client) {
      showError('Supabase client não disponível.');
      return false;
    }

    const { data: profile, error } = await client
      .from('profiles')
      .select('is_admin, display_name, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile) {
      showError(getErrorMessage(error, 'Não foi possível carregar seu perfil.'));
      return false;
    }

    if (!profile.is_admin) {
      showError('Acesso negado. Apenas administradores podem acessar este painel.');
      return false;
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // API — carrega todos os banners (via RPC admin)
  // ─────────────────────────────────────────────────────────────
  async function fetchBanners() {
    const client = getClient();
    if (!client) throw new Error('Cliente Supabase não disponível.');

    const { data, error } = await client.rpc('kc_admin_list_banners');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  // ─────────────────────────────────────────────────────────────
  // API — salvar (create / update)
  // ─────────────────────────────────────────────────────────────
  async function saveBanner(payload) {
    const client = getClient();
    if (!client) throw new Error('Cliente Supabase não disponível.');
    const { data, error } = await client.rpc('kc_admin_save_banner', { p_data: payload });
    if (error) throw error;
    return data;
  }

  // ─────────────────────────────────────────────────────────────
  // API — deletar
  // ─────────────────────────────────────────────────────────────
  async function deleteBanner(id) {
    const client = getClient();
    if (!client) throw new Error('Cliente Supabase não disponível.');
    const { error } = await client.rpc('kc_admin_delete_banner', { p_id: id });
    if (error) throw error;
  }

  // ─────────────────────────────────────────────────────────────
  // API — reordenar
  // ─────────────────────────────────────────────────────────────
  async function reorderBanners(items) {
    const client = getClient();
    if (!client) return;
    const payload = items.map((b, i) => ({ id: b.id, sort_order: i }));
    const { error } = await client.rpc('kc_admin_reorder_banners', { p_items: payload });
    if (error) throw error;
  }

  // ─────────────────────────────────────────────────────────────
  // API — histórico de auditoria de um banner
  // ─────────────────────────────────────────────────────────────
  async function fetchAudit(bannerId) {
    const client = getClient();
    if (!client) return [];
    const { data, error } = await client.rpc('kc_admin_banner_audit', { p_banner_id: bannerId });
    if (error) { console.warn('audit error', error); return []; }
    return Array.isArray(data) ? data : [];
  }

  // ─────────────────────────────────────────────────────────────
  // Render — HTML de um banner item
  // ─────────────────────────────────────────────────────────────
  function renderBannerItem(banner, idx) {
    const gradStyle = `background: linear-gradient(90deg, ${esc(banner.gradient_from)}, ${esc(banner.gradient_to)})`;
    const statusCls = banner.is_active ? 'active' : 'inactive';
    const statusTxt = banner.is_active ? 'Ativo'   : 'Inativo';
    const itemCls   = banner.is_active ? '' : 'is-inactive';

    return `
    <div class="kc-banner-item ${itemCls}" data-id="${esc(banner.id)}" data-idx="${idx}"
         draggable="true">
      <div class="kc-banner-item-header" data-action="toggle-audit">
        <span class="kc-banner-drag-handle" title="Arraste para reordenar">
          <i class="fas fa-grip-vertical" aria-hidden="true"></i>
        </span>
        <div class="kc-banner-preview-mini" style="${gradStyle}" aria-hidden="true">
          <i class="${esc(banner.icon_class)}"></i>
        </div>
        <div class="kc-banner-meta">
          <strong>${esc(banner.title)}</strong>
          <small>${esc(banner.pill_text)} · Posição ${banner.sort_order}</small>
        </div>
        <span class="kc-banner-status ${statusCls}">${statusTxt}</span>
        <div class="kc-banner-actions">
          <button type="button" data-action="edit"   data-id="${esc(banner.id)}" title="Editar">
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>
          <button type="button" data-action="toggle" data-id="${esc(banner.id)}"
                  title="${banner.is_active ? 'Desativar' : 'Ativar'}">
            <i class="fas fa-${banner.is_active ? 'eye-slash' : 'eye'}" aria-hidden="true"></i>
          </button>
          <button type="button" class="btn-delete" data-action="delete" data-id="${esc(banner.id)}" title="Excluir">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="kc-banner-audit" id="audit-${esc(banner.id)}">
        <h4><i class="fas fa-clock-rotate-left" aria-hidden="true"></i> Histórico de alterações</h4>
        <div class="kc-audit-rows" id="audit-rows-${esc(banner.id)}">
          <span style="color:var(--kc-text-dark-secondary);font-size:.85rem;">Carregando…</span>
        </div>
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────────────────────
  // Render — renderiza o histórico expandido
  // ─────────────────────────────────────────────────────────────
  function renderAuditRows(rows) {
    if (!rows || !rows.length) {
      return '<span style="color:var(--kc-text-dark-secondary);font-size:.85rem;">Sem histórico disponível.</span>';
    }
    return rows.map(r => `
      <div class="kc-audit-row">
        <span class="kc-audit-badge ${esc(r.action)}">${esc(r.action)}</span>
        <span>${esc(r.editor_name)}</span>
        <span class="kc-audit-meta">${fmtDate(r.changed_at)}</span>
      </div>
    `).join('');
  }

  // ─────────────────────────────────────────────────────────────
  // Render — atualiza a lista inteira no DOM
  // ─────────────────────────────────────────────────────────────
  function renderList() {
    const list  = document.getElementById('banners-list');
    const empty = document.getElementById('banners-empty');
    if (!list || !empty) return;

    if (!banners.length) {
      list.innerHTML  = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = banners.map(renderBannerItem).join('');
    requestAnimationFrame(() => bindDragDrop());
  }

  // ─────────────────────────────────────────────────────────────
  // Drag and Drop — reordenação
  // ─────────────────────────────────────────────────────────────
  function bindDragDrop() {
    const list = document.getElementById('banners-list');
    if (!list || dragBindingsReady) return;

    const getItem = (target) => target && target.closest
      ? target.closest('.kc-banner-item[draggable="true"]')
      : null;

    const clearDragState = () => {
      dragSrcIdx = null;
      list.querySelectorAll('.kc-banner-item').forEach((item) => {
        item.classList.remove('dragging', 'drag-over');
      });
    };

    list.addEventListener('dragstart', (e) => {
      const item = getItem(e.target);
      if (!item) return;
      dragSrcIdx = Number(item.dataset.idx);
      item.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.dropEffect = 'move';
      }
    });

    list.addEventListener('dragend', () => {
      clearDragState();
    });

    list.addEventListener('dragover', (e) => {
      const item = getItem(e.target);
      if (!item) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.kc-banner-item.drag-over').forEach((node) => {
        if (node !== item) node.classList.remove('drag-over');
      });
      if (Number(item.dataset.idx) !== dragSrcIdx) {
        item.classList.add('drag-over');
      }
    });

    list.addEventListener('dragleave', (e) => {
      const item = getItem(e.target);
      if (!item) return;
      const related = getItem(e.relatedTarget);
      if (related !== item) item.classList.remove('drag-over');
    });

    list.addEventListener('drop', async (e) => {
      const item = getItem(e.target);
      if (!item) return;
      e.preventDefault();

      const targetIdx = Number(item.dataset.idx);
      item.classList.remove('drag-over');
      if (dragSrcIdx === null || Number.isNaN(targetIdx) || dragSrcIdx === targetIdx) {
        clearDragState();
        return;
      }

      const moved = banners.splice(dragSrcIdx, 1)[0];
      banners.splice(targetIdx, 0, moved);
      clearDragState();

      renderList();

      try {
        await reorderBanners(banners);
        toast('Ordem salva com sucesso!', 'success');
      } catch (err) {
        toast('Erro ao salvar ordem: ' + (err.message || err), 'error');
      }
    });

    dragBindingsReady = true;
  }

  // ─────────────────────────────────────────────────────────────
  // Modal — abre para criar / editar
  // ─────────────────────────────────────────────────────────────
  function openModal(banner) {
    const modal = document.getElementById('banner-modal');
    if (!modal) return;

    const isEdit = !!banner;
    document.getElementById('modal-title').textContent = isEdit ? 'Editar Banner' : 'Novo Banner';

    // Preenche campos
    document.getElementById('f-id').value       = isEdit ? banner.id : '';
    document.getElementById('f-pill').value     = isEdit ? (banner.pill_text  || '') : 'Destaque';
    document.getElementById('f-title').value    = isEdit ? (banner.title      || '') : '';
    document.getElementById('f-subtitle').value = isEdit ? (banner.subtitle   || '') : '';
    document.getElementById('f-btn-text').value = isEdit ? (banner.button_text|| '') : 'Ver mais';
    document.getElementById('f-btn-url').value  = isEdit ? (banner.button_url || '') : '#';
    document.getElementById('f-icon').value     = isEdit ? (banner.icon_class || 'fas fa-star') : 'fas fa-star';
    document.getElementById('f-grad-from').value= isEdit ? (banner.gradient_from||'#4F46E5') : '#4F46E5';
    document.getElementById('f-grad-to').value  = isEdit ? (banner.gradient_to  ||'#7C3AED') : '#7C3AED';
    document.getElementById('f-order').value    = isEdit ? (banner.sort_order ?? banners.length) : banners.length;

    const activeToggle = document.getElementById('f-active-toggle');
    const active = isEdit ? !!banner.is_active : true;
    activeToggle.classList.toggle('on', active);
    activeToggle.setAttribute('aria-checked', String(active));
    document.getElementById('f-active-label').textContent = active ? 'Ativo' : 'Inativo';

    // Color pickers sincronizados
    document.getElementById('f-grad-from-picker').value = isEdit ? (banner.gradient_from||'#4F46E5') : '#4F46E5';
    document.getElementById('f-grad-to-picker').value   = isEdit ? (banner.gradient_to  ||'#7C3AED') : '#7C3AED';

    // Sugestões de ícone
    renderIconSuggestions(document.getElementById('f-icon').value);

    updatePreview();
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-admin-modal-open');
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(true);
    }
    document.getElementById('f-title').focus();
  }

  function closeModal() {
    const modal = document.getElementById('banner-modal');
    clearTimeout(previewTimer);
    previewTimer = null;
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('kc-admin-modal-open');
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Modal — preview ao vivo
  // ─────────────────────────────────────────────────────────────
  function updatePreview() {
    const from = document.getElementById('f-grad-from').value || '#4F46E5';
    const to   = document.getElementById('f-grad-to').value   || '#7C3AED';
    const icon = document.getElementById('f-icon').value      || 'fas fa-star';

    const preview = document.getElementById('banner-preview');
    if (preview) preview.style.background = `linear-gradient(90deg, ${from}, ${to})`;

    const prevIcon = document.getElementById('prev-icon');
    if (prevIcon) prevIcon.className = icon + ' preview-icon';

    const fields = {
      'prev-pill':  document.getElementById('f-pill').value    || 'Destaque',
      'prev-title': document.getElementById('f-title').value   || 'Título do Banner',
      'prev-sub':   document.getElementById('f-subtitle').value|| 'Subtítulo do banner.',
      'prev-btn':   document.getElementById('f-btn-text').value|| 'Ver mais',
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    const btnEl = document.getElementById('prev-btn');
    if (btnEl) btnEl.href = document.getElementById('f-btn-url').value || '#';
  }

  function schedulePreviewUpdate() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      updatePreview();
    }, PREVIEW_DEBOUNCE_MS);
  }

  function bindPreviewListeners() {
    ['f-pill','f-title','f-subtitle','f-btn-text','f-btn-url','f-icon','f-grad-from','f-grad-to']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', schedulePreviewUpdate);
      });

    // Color pickers → campos texto
    const fromPicker = document.getElementById('f-grad-from-picker');
    const toPicker   = document.getElementById('f-grad-to-picker');
    if (fromPicker) fromPicker.addEventListener('input', () => {
      document.getElementById('f-grad-from').value = fromPicker.value;
      schedulePreviewUpdate();
    });
    if (toPicker) toPicker.addEventListener('input', () => {
      document.getElementById('f-grad-to').value = toPicker.value;
      schedulePreviewUpdate();
    });

    // Campos texto → pickers
    const fromText = document.getElementById('f-grad-from');
    const toText   = document.getElementById('f-grad-to');
    if (fromText) fromText.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(fromText.value) && fromPicker) fromPicker.value = fromText.value;
      schedulePreviewUpdate();
    });
    if (toText) toText.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(toText.value) && toPicker) toPicker.value = toText.value;
      schedulePreviewUpdate();
    });

    // Toggle ativo/inativo
    const toggle = document.getElementById('f-active-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = !toggle.classList.contains('on');
        toggle.classList.toggle('on', next);
        toggle.setAttribute('aria-checked', String(next));
        document.getElementById('f-active-label').textContent = next ? 'Ativo' : 'Inativo';
      });
      toggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle.click(); }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Sugestões de ícone
  // ─────────────────────────────────────────────────────────────
  function renderIconSuggestions(current) {
    const wrap = document.getElementById('icon-suggestions');
    if (!wrap) return;
    wrap.innerHTML = ICON_SUGGESTIONS.map(ic => `
      <button type="button" class="kc-icon-sug-btn${ic === current ? ' selected' : ''}"
              data-icon="${esc(ic)}" title="${esc(ic)}">
        <i class="${esc(ic)}"></i>
      </button>
    `).join('');

    wrap.querySelectorAll('.kc-icon-sug-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const iconField = document.getElementById('f-icon');
        if (iconField) { iconField.value = btn.dataset.icon; updatePreview(); }
        wrap.querySelectorAll('.kc-icon-sug-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Modal — salvar
  // ─────────────────────────────────────────────────────────────
  async function onSave() {
    const title = document.getElementById('f-title').value.trim();
    if (!title) { toast('O título é obrigatório.', 'error'); return; }

    const saveBtn = document.getElementById('modal-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando…'; }

    const payload = {
      id:            document.getElementById('f-id').value     || null,
      pill_text:     document.getElementById('f-pill').value   || 'Destaque',
      title,
      subtitle:      document.getElementById('f-subtitle').value || '',
      button_text:   document.getElementById('f-btn-text').value || 'Ver mais',
      button_url:    document.getElementById('f-btn-url').value  || '#',
      icon_class:    document.getElementById('f-icon').value     || 'fas fa-star',
      gradient_from: document.getElementById('f-grad-from').value|| '#4F46E5',
      gradient_to:   document.getElementById('f-grad-to').value  || '#7C3AED',
      sort_order:    Number(document.getElementById('f-order').value) || 0,
      is_active:     document.getElementById('f-active-toggle').classList.contains('on'),
    };
    if (!payload.id) delete payload.id;

    try {
      await saveBanner(payload);
      toast(payload.id ? 'Banner atualizado!' : 'Banner criado!', 'success');
      closeModal();
      await loadBanners();
    } catch (err) {
      toast('Erro ao salvar: ' + (err.message || String(err)), 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-floppy-disk" aria-hidden="true"></i> Salvar'; }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Toggle ativo/inativo
  // ─────────────────────────────────────────────────────────────
  async function onToggle(id) {
    const banner = banners.find(b => b.id === id);
    if (!banner) return;
    try {
      await saveBanner({ id, is_active: !banner.is_active });
      toast(banner.is_active ? 'Banner desativado.' : 'Banner ativado!', 'success');
      await loadBanners();
    } catch (err) {
      toast('Erro: ' + (err.message || err), 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Excluir
  // ─────────────────────────────────────────────────────────────
  async function onDelete(id) {
    const banner = banners.find(b => b.id === id);
    const name   = banner ? `"${banner.title}"` : 'este banner';
    if (!confirm(`Excluir ${name}? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteBanner(id);
      toast('Banner excluído.', 'success');
      await loadBanners();
    } catch (err) {
      toast('Erro ao excluir: ' + (err.message || err), 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Expandir/recolher histórico de auditoria
  // ─────────────────────────────────────────────────────────────
  async function onToggleAudit(id) {
    const auditDiv = document.getElementById('audit-' + id);
    if (!auditDiv) return;

    const isOpen = auditDiv.classList.contains('open');
    auditDiv.classList.toggle('open', !isOpen);

    if (!isOpen) {
      // Precisa carregar?
      const rowsDiv = document.getElementById('audit-rows-' + id);
      if (rowsDiv && rowsDiv.querySelector('span')) {
        const rows = await fetchAudit(id);
        rowsDiv.innerHTML = renderAuditRows(rows);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Carga inicial
  // ─────────────────────────────────────────────────────────────
  async function loadBanners() {
    hideError();
    try {
      banners = await fetchBanners();
      renderList();
    } catch (err) {
      showError('Não foi possível carregar os banners: ' + (err.message || String(err)));
    } finally {
      setLoadedState(true);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Delegação de eventos na lista
  // ─────────────────────────────────────────────────────────────
  function bindListEvents() {
    const list = document.getElementById('banners-list');
    if (!list) return;

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = btn.dataset.id;
      if (btn.closest('.kc-banner-actions')) {
        e.stopPropagation();
      }

      if (action === 'edit') {
        const b = banners.find(x => x.id === id);
        if (b) openModal(b);
        return;
      }

      if (action === 'toggle') {
        await onToggle(id);
        return;
      }

      if (action === 'delete') {
        await onDelete(id);
        return;
      }

      if (action === 'toggle-audit') {
        // Clique no header do item (não nos botões)
        const item   = e.target.closest('.kc-banner-item');
        const itemId = item && item.dataset.id;
        if (itemId && !e.target.closest('.kc-banner-actions')) {
          await onToggleAudit(itemId);
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  async function fetchBannerMetrics(periodDays, warnings) {
    const client = getClient();
    const metrics = new Map();
    const rows = Array.isArray(banners) ? banners : [];

    function ensureMetric(key, banner) {
      const safeKey = String(key || (banner && banner.id) || (banner && banner.title) || 'banner');
      if (!metrics.has(safeKey)) {
        metrics.set(safeKey, {
          banner_id: banner && banner.id ? banner.id : safeKey,
          titulo: banner && banner.title ? banner.title : safeKey,
          impressoes: 0,
          cliques: 0,
          origem_metricas: 'privacy_analytics_events',
        });
      }
      return metrics.get(safeKey);
    }

    const byId = new Map();
    const byTitle = new Map();
    rows.forEach((banner) => {
      if (!banner) return;
      byId.set(String(banner.id || ''), banner);
      byTitle.set(String(banner.title || '').trim().toLowerCase(), banner);
    });

    if (client) {
      try {
        const since = new Date(Date.now() - (periodDays * 24 * 60 * 60 * 1000)).toISOString();
        const { data, error } = await client
          .from('privacy_analytics_events')
          .select('event_name, entity_id, metadata, created_at')
          .eq('entity_type', 'banner')
          .in('event_name', BANNER_METRIC_EVENTS)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(0, BANNER_ANALYTICS_LIMIT - 1);

        if (error) throw error;
        const eventRows = Array.isArray(data) ? data : [];
        eventRows.forEach((event) => {
          const metadata = event && event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
          const entityId = String(event && event.entity_id || metadata.entity_id || metadata.banner_id || '').trim();
          const label = String(metadata.entity_label || '').trim();
          const banner = byId.get(entityId) || byTitle.get(label.toLowerCase()) || null;
          const metric = ensureMetric(banner ? banner.id : (entityId || label), banner || { id: entityId || label, title: label || entityId || 'Banner sem identificação' });
          if (event.event_name === 'banner_impression') metric.impressoes += 1;
          if (event.event_name === 'banner_click') metric.cliques += 1;
        });
        if (eventRows.length >= BANNER_ANALYTICS_LIMIT) warnings.push(`Métricas de banners limitadas aos ${BANNER_ANALYTICS_LIMIT} eventos mais recentes do período.`);
        if (eventRows.length) return metrics;
      } catch (error) {
        warnings.push('Não foi possível carregar métricas de privacidade dos banners; usando contadores salvos no cadastro quando existirem.');
      }
    } else {
      warnings.push('Supabase client indisponível; métricas de banners usam apenas contadores carregados na tela.');
    }

    rows.forEach((banner) => {
      const metric = ensureMetric(banner && banner.id, banner);
      metric.impressoes = toNumber(banner && (banner.impressions || banner.impression_count));
      metric.cliques = toNumber(banner && (banner.clicks || banner.click_count));
      metric.origem_metricas = 'hero_banners';
    });
    return metrics;
  }

  async function fetchBannerAuditForExport(warnings) {
    const rows = [];
    const bannerRows = Array.isArray(banners) ? banners : [];
    for (const banner of bannerRows) {
      if (!banner || !banner.id || rows.length >= BANNER_AUDIT_EXPORT_LIMIT) break;
      try {
        const auditRows = await fetchAudit(banner.id);
        (auditRows || []).forEach((row) => {
          if (rows.length >= BANNER_AUDIT_EXPORT_LIMIT) return;
          rows.push({
            banner_id: banner.id,
            titulo: banner.title || '',
            acao: row.action || '',
            editor: row.editor_name || '',
            data: fmtDate(row.changed_at),
            snapshot: row.snapshot || {},
          });
        });
      } catch (_) {
        warnings.push('Não foi possível carregar auditoria de um ou mais banners.');
      }
    }
    if (rows.length >= BANNER_AUDIT_EXPORT_LIMIT) warnings.push(`Auditoria de banners limitada aos ${BANNER_AUDIT_EXPORT_LIMIT} eventos mais recentes carregáveis.`);
    return rows;
  }

  async function collectBannersExportData() {
    const warnings = [];
    const periodDays = getMetricsPeriodDays();
    const [metricMap, auditRows] = await Promise.all([
      fetchBannerMetrics(periodDays, warnings),
      fetchBannerAuditForExport(warnings),
    ]);
    return { periodDays, metricMap, auditRows, warnings };
  }

  function buildBannersExportReport(exportData) {
    exportData = exportData || {};
    const rows = Array.isArray(banners) ? banners : [];
    const periodDays = exportData.periodDays || getMetricsPeriodDays();
    const metricMap = exportData.metricMap || new Map();
    const auditRows = Array.isArray(exportData.auditRows) ? exportData.auditRows : [];
    const warnings = Array.isArray(exportData.warnings) ? exportData.warnings : [];
    const active = rows.filter((banner) => banner && banner.is_active).length;
    const inactive = rows.length - active;
    const metricRows = rows.map((banner) => {
      const metric = metricMap.get(String(banner && banner.id || '')) || {};
      const impressions = toNumber(metric.impressoes);
      const clicks = toNumber(metric.cliques);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      return {
        banner_id: banner.id,
        titulo: banner.title || '',
        status: banner.is_active ? 'Ativo' : 'Inativo',
        ordem: banner.sort_order,
        impressoes: impressions,
        cliques: clicks,
        ctr: formatPercent(ctr),
        origem_metricas: metric.origem_metricas || 'sem dados',
      };
    });
    const impressions = metricRows.reduce((sum, row) => sum + toNumber(row.impressoes), 0);
    const clicks = metricRows.reduce((sum, row) => sum + toNumber(row.cliques), 0);
    const ctr = impressions ? ((clicks / impressions) * 100) : 0;
    const configRows = rows.map((banner) => ({
      id: banner.id,
      titulo: banner.title || '',
      subtitulo: banner.subtitle || '',
      status: banner.is_active ? 'Ativo' : 'Inativo',
      ordem: banner.sort_order,
      botao: banner.button_text || '',
      url: banner.button_url || '',
      icone: banner.icon_class || '',
      gradiente: [banner.gradient_from, banner.gradient_to].filter(Boolean).join(' → '),
      atualizado_em: fmtDate(banner.updated_at || banner.created_at),
    }));
    const validationRows = rows.map((banner) => ({
      banner_id: banner.id,
      titulo: banner.title || '',
      status: banner.is_active ? 'Ativo' : 'Inativo',
      tem_titulo: banner.title ? 'sim' : 'não',
      tem_cta: banner.button_text && banner.button_url ? 'sim' : 'não',
      tem_gradiente: banner.gradient_from && banner.gradient_to ? 'sim' : 'não',
      observacao: !banner.button_url ? 'Sem URL de CTA' : '',
    }));
    const sections = [
      {
        title: 'Métricas por banner',
        note: `Métricas opcionais coletadas no período selecionado: ${periodDays} dias.`,
        rows: metricRows.slice().sort((left, right) => toNumber(right.cliques) - toNumber(left.cliques) || toNumber(right.impressoes) - toNumber(left.impressoes)),
        pdfColumns: ['titulo', 'status', 'cliques', 'ctr'],
        xlsxColumns: ['banner_id', 'titulo', 'status', 'ordem', 'impressoes', 'cliques', 'ctr', 'origem_metricas'],
        maxPdfRows: 25,
      },
      {
        title: 'Configuração dos banners',
        rows: configRows,
        pdfColumns: ['titulo', 'status', 'ordem', 'botao'],
        xlsxColumns: ['id', 'titulo', 'subtitulo', 'status', 'ordem', 'botao', 'url', 'icone', 'gradiente', 'atualizado_em'],
        maxPdfRows: 25,
      },
      {
        title: 'Validações',
        rows: validationRows,
        pdfColumns: ['titulo', 'status', 'tem_cta', 'observacao'],
        xlsxColumns: ['banner_id', 'titulo', 'status', 'tem_titulo', 'tem_cta', 'tem_gradiente', 'observacao'],
        maxPdfRows: 25,
      },
      {
        title: 'Auditoria',
        rows: auditRows.map((row) => ({
          banner_id: row.banner_id,
          titulo: row.titulo,
          acao: row.acao,
          editor: row.editor,
          data: row.data,
          snapshot: row.snapshot,
        })),
        pdfColumns: ['data', 'acao', 'titulo', 'editor'],
        xlsxColumns: ['banner_id', 'titulo', 'acao', 'editor', 'data', 'snapshot'],
        maxPdfRows: 30,
      },
    ];
    if (warnings.length) {
      sections.push({
        title: 'Avisos de exportação',
        rows: warnings.map((warning, index) => ({ item: index + 1, aviso: warning })),
        columns: [{ key: 'item', label: '#' }, { key: 'aviso', label: 'Aviso' }],
        maxPdfRows: 20,
      });
    }
    return {
      title: 'KinoCampus - Banners Admin',
      subtitle: 'Banners configurados, status, ordem e métricas disponíveis',
      source: 'admin/banners.html — configuração, desempenho e auditoria',
      filters: { status: 'todos', ordenacao: 'sort_order', periodo_metricas: `${periodDays} dias` },
      kpis: {
        banners_total: rows.length,
        banners_ativos: active,
        banners_inativos: inactive,
        impressoes_registradas: impressions,
        cliques_registrados: clicks,
        ctr_percentual: formatPercent(ctr),
      },
      sections,
    };
  }

  async function handleBannersExport(kind) {
    if (!window.KCAdminExport) {
      toast('Exportador admin indisponível.', 'error');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const btn = kind === 'pdf' ? document.getElementById('banners-export-pdf') : document.getElementById('banners-export-xlsx');
    const original = btn ? btn.innerHTML : '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Exportando...';
      }
      toast('Preparando relatório de banners...', 'success');
      const exportData = await collectBannersExportData();
      const report = buildBannersExportReport(exportData);
      if (kind === 'pdf') {
        await window.KCAdminExport.exportReportPDF('kc-admin-banners-' + date + '.pdf', report);
      } else {
        await window.KCAdminExport.exportReportXLSX('kc-admin-banners-' + date + '.xlsx', report);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  }

  function showLoadingSkeletons() {
    const list = document.getElementById('banners-list');
    if (list && !list.children.length) {
      list.innerHTML = '<div class="kc-skeleton" style="height:84px;border-radius:14px;margin-bottom:12px;"></div>'.repeat(4);
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const env = window.KC_ENV || {};
    if (String(env.DATA_DRIVER || env.driver || 'local').toLowerCase() !== 'supabase') {
      setLoadedState(true);
      showError('Esta página requer o modo Supabase (DATA_DRIVER=supabase). Verifique o kc-env.js.');
      return;
    }

    const hasAccess = await checkAdminAccess();
    if (!hasAccess) {
      setLoadedState(true);
      return;
    }
    showLoadingSkeletons();

    const modalBackdrop = document.getElementById('banner-modal');
    const modalCard = modalBackdrop ? modalBackdrop.querySelector('.kc-modal') : null;
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    const modalSave = document.getElementById('modal-save');

    document.getElementById('btn-add-banner').addEventListener('click', () => openModal(null));
    document.getElementById('btn-refresh').addEventListener('click', loadBanners);
    const exportXlsx = document.getElementById('banners-export-xlsx');
    if (exportXlsx) exportXlsx.addEventListener('click', () => handleBannersExport('xlsx').catch(console.error));
    const exportPdf = document.getElementById('banners-export-pdf');
    if (exportPdf) exportPdf.addEventListener('click', () => handleBannersExport('pdf').catch(console.error));
    if (modalClose) modalClose.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });
    if (modalCancel) modalCancel.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });
    if (modalSave) modalSave.addEventListener('click', (e) => { e.stopPropagation(); onSave(); });

    // Fechar modal ao clicar no backdrop
    if (modalCard) {
      modalCard.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop && modalBackdrop.style.display !== 'none') {
        e.preventDefault();
        closeModal();
      }
    }, true);

    bindPreviewListeners();
    bindListEvents();
    await loadBanners();
  });
})();
