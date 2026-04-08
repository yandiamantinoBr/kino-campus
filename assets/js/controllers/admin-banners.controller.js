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

  function getClient() {
    return window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
  }

  // ─────────────────────────────────────────────────────────────
  // Verificação de admin
  // ─────────────────────────────────────────────────────────────
  function isAdmin() {
    const user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!user) return false;
    // Verifica perfil cacheado
    if (window.__kcCurrentProfile) return !!window.__kcCurrentProfile.is_admin;
    return false;
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
          <i class="fas fa-grip-vertical"></i>
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
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" data-action="toggle" data-id="${esc(banner.id)}"
                  title="${banner.is_active ? 'Desativar' : 'Ativar'}">
            <i class="fas fa-${banner.is_active ? 'eye-slash' : 'eye'}"></i>
          </button>
          <button type="button" class="btn-delete" data-action="delete" data-id="${esc(banner.id)}" title="Excluir">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="kc-banner-audit" id="audit-${esc(banner.id)}">
        <h4><i class="fas fa-clock-rotate-left"></i> Histórico de alterações</h4>
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
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando…'; }

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
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-floppy-disk"></i> Salvar'; }
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

      document.getElementById('banners-loading').style.display = 'none';
      document.getElementById('banners-content').style.display = 'block';
    } catch (err) {
      document.getElementById('banners-loading').style.display = 'none';
      document.getElementById('banners-content').style.display = 'block';
      showError('Não foi possível carregar os banners: ' + (err.message || String(err)));
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
  document.addEventListener('DOMContentLoaded', function () {
    // Verifica se há cliente Supabase
    const env = window.KC_ENV || {};
    if (String(env.DATA_DRIVER || env.driver || 'local').toLowerCase() !== 'supabase') {
      document.getElementById('banners-loading').style.display = 'none';
      document.getElementById('banners-content').style.display = 'block';
      showError('Esta página requer o modo Supabase (DATA_DRIVER=supabase). Verifique o kc-env.js.');
      return;
    }

    // Botões globais
    const modalBackdrop = document.getElementById('banner-modal');
    const modalCard = modalBackdrop ? modalBackdrop.querySelector('.kc-modal') : null;
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    const modalSave = document.getElementById('modal-save');

    document.getElementById('btn-add-banner').addEventListener('click', () => openModal(null));
    document.getElementById('btn-refresh').addEventListener('click', loadBanners);
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

    // Listeners do preview e do form
    bindPreviewListeners();
    bindListEvents();

    // Aguarda auth para carregar (ou carrega diretamente se já autenticado)
    const tryLoad = () => {
      const user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
        ? window.KCSupabase.getUser()
        : null;
      if (user) {
        loadBanners();
      } else {
        // Espera evento de auth
        document.addEventListener('kc:authchange', function onAuth(e) {
          if (e.detail && e.detail.user) {
            document.removeEventListener('kc:authchange', onAuth);
            loadBanners();
          }
        });
        // Timeout de segurança: carrega mesmo sem login (RLS vai barrar dados se não for admin)
        setTimeout(() => {
          if (!banners.length) loadBanners();
        }, 2000);
      }
    };

    if (window.KCSupabase && window.KCSupabase.getUser) {
      tryLoad();
    } else {
      document.addEventListener('kc:authchange', function onFirst() {
        document.removeEventListener('kc:authchange', onFirst);
        tryLoad();
      });
    }
  });
})();
