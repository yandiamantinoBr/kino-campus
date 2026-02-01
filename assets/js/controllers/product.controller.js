/*
  KinoCampus - Product (Detalhes) Controller (V8.1.2.4.5)
  - Carrega post por ID usando KCAPI + KCPostModel
  - Aplica regras centrais (KCUtils.applyPresentationRules)
  - Mantém comentários e UI existente (sem regressão visual)
*/

(function () {
  'use strict';

  function getParam(name) {
    const params = new URLSearchParams(window.location.search || '');
    return params.get(name);
  }

  function esc(str) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') return window.KCUtils.escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  function moduleLabel(key) {
    if (window.KCUtils && typeof window.KCUtils.getModuleLabel === 'function') return window.KCUtils.getModuleLabel(key);
    return String(key || '');
  }

  function formatCurrency(n) {
    if (window.KCUtils && typeof window.KCUtils.formatCurrencyBRL === 'function') return window.KCUtils.formatCurrencyBRL(n);
    try { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (_) { return String(n); }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html || '';
  }

  function show(id, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = display || '';
  }

  function hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function showNotFound() {
    show('notFound', 'block');
    hide('relatedSection');
    hide('sellerCard');
    setText('postTitle', 'Anúncio não encontrado ou removido');
    setHTML('postDescription', '');
    setHTML('badges', '');
    hide('priceBlock');
    hide('specsBlock');
    const emojiCover = document.getElementById('emojiCover');
    if (emojiCover) { emojiCover.textContent = '❓'; emojiCover.style.display = 'flex'; }
    hide('mainImage');
    hide('thumbnails');
  }

  function setBreadcrumb(post) {
    const bc = document.getElementById('breadcrumb');
    if (!bc) return;

    const modKey = String(post.modulo || '');
    const modLbl = moduleLabel(modKey);
    const catLbl = post.categoriaLabel || post.categoria || '';
    const subLbl = post.subcategoriaLabel || post.subcategoria || '';

    const parts = [];
    parts.push(`<a href="index.html"><i class="fas fa-home"></i> KinoCampus</a>`);
    if (modKey) parts.push(`<i class="fas fa-chevron-right"></i><a href="${esc((post._kcModulePage || '') || 'index.html')}">${esc(modLbl)}</a>`);
    parts.push(`<i class="fas fa-chevron-right"></i><span>${esc(catLbl || 'Detalhes')}</span>`);
    if (subLbl) parts.push(`<i class="fas fa-chevron-right"></i><span>${esc(subLbl)}</span>`);

    bc.innerHTML = parts.join(' ');
  }

  function setBadges(post) {
    const el = document.getElementById('badges');
    if (!el) return;

    const badges = [];
    // Módulo
    if (post.modulo) {
      const icon = (window.KCUtils && typeof window.KCUtils.getModuleIconClass === 'function')
        ? window.KCUtils.getModuleIconClass(post.modulo)
        : 'fas fa-layer-group';
      badges.push(`<span class="kc-badge"><i class="${esc(icon)}"></i> ${esc(moduleLabel(post.modulo))}</span>`);
    }

    // Status (Achados/Perdidos)
    if (post._kcStatusBadgeHtml) badges.push(post._kcStatusBadgeHtml);

    // Verificado
    if (post.verificado) badges.push(post._kcVerifiedTag || `<span class="kc-badge kc-badge--verified"><i class="fas fa-check-circle"></i> Verificado</span>`);

    // Condição
    if (post.condicao) badges.push(`<span class="kc-badge"><i class="fas fa-star"></i> ${esc(post.condicao)}</span>`);

    // Tempo relativo
    const relTime = post._kcRelativeTime || post.timestamp;
    if (relTime) badges.push(`<span class="kc-badge"><i class="fas fa-clock"></i> ${esc(relTime)}</span>`);

    el.innerHTML = badges.join(' ');
  }

  function setGallery(post) {
    const mainImg = document.getElementById('mainImage');
    const emojiCover = document.getElementById('emojiCover');
    const thumbs = document.getElementById('thumbnails');

    const images = Array.isArray(post.imagens) ? post.imagens : (Array.isArray(post.images) ? post.images : []);
    const emoji = post.emoji || '✨';

    if (images && images.length) {
      if (mainImg) {
        mainImg.src = images[0];
        mainImg.style.display = 'block';
      }
      if (emojiCover) emojiCover.style.display = 'none';

      if (thumbs) {
        thumbs.innerHTML = '';
        images.forEach((src, idx) => {
          const img = document.createElement('img');
          img.src = src;
          img.alt = 'Miniatura ' + (idx + 1);
          img.className = 'kc-thumbnail' + (idx === 0 ? ' active' : '');
          img.setAttribute('data-full-src', src);
          img.addEventListener('click', () => {
            const all = thumbs.querySelectorAll('.kc-thumbnail');
            all.forEach(t => t.classList.remove('active'));
            img.classList.add('active');
            if (mainImg) mainImg.src = src;
          });
          thumbs.appendChild(img);
        });

        thumbs.style.display = images.length > 1 ? 'flex' : 'none';
      }
    } else {
      if (mainImg) mainImg.style.display = 'none';
      if (emojiCover) { emojiCover.style.display = 'flex'; emojiCover.textContent = emoji; }
      if (thumbs) thumbs.style.display = 'none';
    }
  }

  function setPrice(post) {
    const block = document.getElementById('priceBlock');
    if (!block) return;

    if (post._kcHidePrice) {
      block.style.display = 'none';
      return;
    }

    const iconEl = document.getElementById('priceIcon');
    const valueEl = document.getElementById('priceValue');
    const smallEl = document.getElementById('priceSmall');
    const origEl = document.getElementById('priceOriginal');
    const discEl = document.getElementById('priceDiscount');

    const iconClass = post._kcPriceIconClass || 'fas fa-money-bill-wave';
    if (iconEl) iconEl.className = iconClass;

    const main = post._kcPriceTextMain || (typeof post.preco === 'number' ? (post.preco === 0 ? 'Gratuito' : formatCurrency(post.preco)) : '');
    const small = post._kcPriceTextSmall || '';

    if (valueEl) valueEl.textContent = main;
    if (smallEl) smallEl.textContent = small;

    // Original/Desconto (se existirem)
    const showOriginal = !!post._kcShowOriginalPrice;
    const showDiscount = !!post._kcShowDiscount;

    if (origEl) {
      if (showOriginal && typeof post.precoOriginal === 'number') {
        origEl.textContent = formatCurrency(post.precoOriginal);
        origEl.style.display = '';
      } else origEl.style.display = 'none';
    }

    if (discEl) {
      if (showDiscount && typeof post.descontoPercentual === 'number') {
        discEl.textContent = '-' + String(post.descontoPercentual) + '%';
        discEl.style.display = '';
      } else discEl.style.display = 'none';
    }

    // Estilo (p/ ícones e cores existentes)
    if (post._kcPriceStyle && typeof post._kcPriceStyle === 'object') {
      try {
        Object.entries(post._kcPriceStyle).forEach(([k, v]) => block.style.setProperty(k, v));
      } catch (_) {}
    }

    block.style.display = 'flex';
  }

  function setDescription(post) {
    const desc = esc(post.descricao || post.description || '');
    const tags = Array.isArray(post.tags) ? post.tags.slice(0, 10) : [];

    let html = '';
    if (desc) {
      html += `<h3><i class="fas fa-align-left"></i> Descrição</h3><p>${desc}</p>`;
    }
    if (tags.length) {
      html += `<div style="margin-top: 12px; display:flex; flex-wrap: wrap; gap: 8px;">` +
        tags.map(t => `<span class="kc-tag">${esc(t)}</span>`).join('') +
        `</div>`;
    }

    setHTML('postDescription', html);
  }

  function addSpec(grid, iconClass, label, value) {
    const item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = `
      <i class="${esc(iconClass)}"></i>
      <div>
        <strong>${esc(label)}</strong>
        <span>${esc(value)}</span>
      </div>
    `;
    grid.appendChild(item);
  }

  function setSpecs(post) {
    const block = document.getElementById('specsBlock');
    const grid = document.getElementById('specsGrid');
    if (!block || !grid) return;

    grid.innerHTML = '';

    const pairs = [];
    if (Array.isArray(post.tags) && post.tags.length) pairs.push(['fas fa-hashtag', 'Tags', post.tags.slice(0, 8).join(', ')]);
    if (post.modulo) pairs.push(['fas fa-layer-group', 'Módulo', moduleLabel(post.modulo)]);
    if (post.categoriaLabel || post.categoria) pairs.push(['fas fa-tag', 'Categoria', post.categoriaLabel || post.categoria]);
    if (post.subcategoriaLabel || post.subcategoria) pairs.push(['fas fa-hashtag', 'Subcategoria', post.subcategoriaLabel || post.subcategoria]);
    if (post.verificado != null) pairs.push(['fas fa-check-circle', 'Verificação', post.verificado ? 'Sim' : 'Não']);
    if (post.condicao) pairs.push(['fas fa-star', 'Condição', post.condicao]);

    if (!pairs.length) {
      block.style.display = 'none';
      return;
    }

    pairs.forEach(p => addSpec(grid, p[0], p[1], p[2]));
    block.style.display = 'block';
  }

  function setSeller(post) {
    const card = document.getElementById('sellerCard');
    const avatar = document.getElementById('sellerAvatar');
    const name = document.getElementById('sellerName');
    const stats = document.getElementById('sellerStats');
    if (!card || !avatar || !name || !stats) return;

    const author = post.autor || 'Autor';
    const avatarUrl = post.autorAvatar || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(author));

    avatar.src = avatarUrl;
    name.innerHTML = esc(author) + (post.verificado ? ' <i class="fas fa-check-circle" style="color: var(--kc-green-check);" title="Verificado"></i>' : '');

    const items = [];
    if (typeof post.rating === 'number') items.push('<span><i class="fas fa-star" style="color: var(--kc-yellow-badge);"></i> ' + post.rating.toFixed(1) + '</span>');
    if (typeof post.votos === 'number') items.push('<span><i class="fas fa-fire"></i> ' + post.votos + '</span>');
    if (typeof post.comentarios === 'number') items.push('<span><i class="fas fa-comments"></i> ' + post.comentarios + '</span>');

    stats.innerHTML = items.join('');
    card.style.display = 'block';
  }

  function setCTA(post) {
    const btn = document.getElementById('primaryCta');
    if (!btn) return;

    const cta = post._kcCTA || { label: 'Entrar em contato', iconClass: 'fas fa-paper-plane' };
    const label = cta.label || 'Entrar em contato';
    const icon = cta.iconClass || 'fas fa-paper-plane';

    btn.innerHTML = `<i class="${esc(icon)}"></i> ${esc(label)}`;
    btn.onclick = () => {
      if (typeof window.showToast === 'function') {
        window.showToast('Simulação: ação "' + label + '"', 'info', 2200);
      }
    };
  }

  function setRelated(db, post) {
    const section = document.getElementById('relatedSection');
    const grid = document.getElementById('relatedGrid');
    if (!section || !grid) return;

    grid.innerHTML = '';

    const dbItems = (db && Array.isArray(db.posts)) ? db.posts : ((db && Array.isArray(db.anuncios)) ? db.anuncios : []);
    const userItems = (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') ? window.kcUserPosts.list() : [];
    const allItems = [...dbItems, ...userItems];

    const currentId = String(post.id);
    const moduleKey = String(post.modulo || '');

    const related = allItems
      .filter(a => String(a && a.id) !== currentId && String(a && a.modulo || '') === moduleKey)
      .slice(0, 6);

    if (!related.length) {
      section.style.display = 'none';
      return;
    }

    related.slice(0, 4).forEach(a => {
      const card = document.createElement('div');
      card.className = 'kc-related-card';
      card.onclick = () => window.location.href = 'product.html?id=' + encodeURIComponent(a.id);

      const price = (typeof a.preco === 'number')
        ? (a.preco === 0 ? 'Gratuito' : formatCurrency(a.preco))
        : '';

      card.innerHTML = `
        <h4>${esc(a.titulo || 'Publicação')}</h4>
        <div class="kc-related-meta">
          <span><i class="fas fa-user"></i> ${esc(a.autor || 'Autor')}</span>
          ${price ? `<span><i class="fas fa-tag"></i> ${esc(price)}</span>` : ''}
        </div>
      `;
      grid.appendChild(card);
    });

    section.style.display = 'block';
  }

  async function loadPost() {
    const id = getParam('id');
    if (!id) { showNotFound(); return; }

    window.kcCurrentPostId = id;
    document.body.setAttribute('data-post-id', id);

    // Bind comment inputs to this post id (script.js procura por data-post-id)
    const author = document.getElementById('commentAuthor');
    const text = document.getElementById('commentText');
    if (author) author.setAttribute('data-post-id', id);
    if (text) text.setAttribute('data-post-id', id);

    let db = null;
    try {
      if (window.KCAPI && typeof window.KCAPI.getDatabaseNormalized === 'function') {
        db = await window.KCAPI.getDatabaseNormalized();
      }
    } catch (_) {}

    let raw = null;

    // Preferir driver unificado (V8.1.2.4.5): localStorage + seed JSON (+ futuro UUID/backend)
    try {
      if (window.KCAPI && typeof window.KCAPI.getPostById === 'function') {
        raw = await window.KCAPI.getPostById(id);
      }
    } catch (_) {}


    if (!raw) { showNotFound(); return; }

    // Contrato único (Model) + regras centrais
    const post = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(raw, { pageModule: (raw && raw.modulo) || '', view: 'product' })
      : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : raw);

    // V8.1.6.2: Denúncia requer UUID real do post (Supabase). Guardar para o botão/modal.
    const postUuid = (post && post.uuid) ? String(post.uuid)
      : ((raw && raw.uuid) ? String(raw.uuid) : null);
    window.kcCurrentPostUuid = postUuid;
    if (postUuid) document.body.setAttribute('data-post-uuid', postUuid);

    // Render
    hide('notFound');
    setText('postTitle', post.titulo || 'Detalhes');
    setBreadcrumb(post);
    setBadges(post);
    setGallery(post);
    setPrice(post);
    setDescription(post);
    setSpecs(post);
    setSeller(post);
    setCTA(post);
    setRelated(db, post);

    // V8.1.6.2: wire botão Denunciar (gated por driver + auth)
    wireReportButton({ postId: postUuid || id, postTitle: post.titulo || post.title || 'Publicação' });

    // Comments
    if (typeof window.renderComments === 'function') {
      window.renderComments(id, 'commentsContainer');
    }
  }

  // ---------------- Reports UI (V8.1.6.2) ----------------
  // UI mínima: botão “Denunciar” (product.html) + modal com motivo/detalhes.
  // Segurança: nenhuma injeção de HTML com dados do usuário (textContent apenas).
  let _reportUI = null;

  function wireReportButton(ctx) {
    const btn = document.getElementById('reportButton');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const driver = (window.KC_ENV && window.KC_ENV.driver) ? window.KC_ENV.driver : 'local';
      if (driver !== 'supabase') {
        try { showToast('Denúncias disponíveis apenas no modo Supabase.', 'info', 2200); } catch (_) {}
        return;
      }

      // Requer login
      let user = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
          user = await window.KCAPI.getCurrentUser();
        }
      } catch (_) {}

      if (!user) {
        try { showToast('Faça login para denunciar.', 'info', 2200); } catch (_) {}
        try { if (typeof window.kcOpenAuthModal === 'function') window.kcOpenAuthModal(); } catch (_) {}
        return;
      }

      if (!_reportUI) _reportUI = buildReportUI();
      _reportUI.open({ postId: ctx.postId, postTitle: ctx.postTitle });
    });
  }

  function buildReportUI() {
    // overlay
    const overlay = document.createElement('div');
    overlay.id = 'kcReportOverlay';
    overlay.className = 'kc-modal-overlay';
    overlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'kc-create-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    // header
    const header = document.createElement('div');
    header.className = 'kc-create-modal-header';

    const h2 = document.createElement('h2');
    h2.className = 'kc-create-modal-title';
    h2.textContent = 'Denunciar publicação';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'kc-modal-close';
    close.setAttribute('aria-label', 'Fechar');
    close.textContent = '×';

    header.appendChild(h2);
    header.appendChild(close);

    const body = document.createElement('div');
    body.className = 'kc-create-modal-body';

    const subtitle = document.createElement('p');
    subtitle.style.margin = '0 0 10px 0';
    subtitle.style.color = 'var(--text-muted, #64748b)';
    subtitle.style.fontSize = '0.95rem';
    subtitle.textContent = 'Ajude a manter a comunidade segura. Escolha um motivo e descreva, se quiser.';

    const postLine = document.createElement('div');
    postLine.style.margin = '0 0 14px 0';
    postLine.style.fontSize = '0.95rem';
    const postLabel = document.createElement('span');
    postLabel.textContent = 'Post: ';
    const postTitle = document.createElement('strong');
    postTitle.textContent = '';
    postLine.appendChild(postLabel);
    postLine.appendChild(postTitle);

    const reasonWrap = document.createElement('div');
    reasonWrap.className = 'kc-form-group';
    const reasonLabel = document.createElement('label');
    reasonLabel.textContent = 'Motivo (obrigatório)';
    const reasonSel = document.createElement('select');
    reasonSel.className = 'kc-input';
    reasonSel.style.width = '100%';
    const reasons = [
      { v: '', t: 'Selecione…' },
      { v: 'spam', t: 'Spam / conteúdo repetitivo' },
      { v: 'scam', t: 'Golpe / fraude' },
      { v: 'inappropriate', t: 'Conteúdo impróprio' },
      { v: 'hate', t: 'Ódio / assédio' },
      { v: 'illegal', t: 'Ilegal / proibido' },
      { v: 'duplicate', t: 'Duplicado' },
      { v: 'other', t: 'Outro' },
    ];
    reasons.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.v;
      opt.textContent = r.t;
      reasonSel.appendChild(opt);
    });
    reasonWrap.appendChild(reasonLabel);
    reasonWrap.appendChild(reasonSel);

    const detailsWrap = document.createElement('div');
    detailsWrap.className = 'kc-form-group';
    const detailsLabel = document.createElement('label');
    detailsLabel.textContent = 'Detalhes (opcional)';
    const details = document.createElement('textarea');
    details.className = 'kc-input';
    details.rows = 4;
    details.maxLength = 1000;
    details.placeholder = 'Conte o que aconteceu (máx. 1000 caracteres).';
    details.style.width = '100%';
    detailsWrap.appendChild(detailsLabel);
    detailsWrap.appendChild(details);

    const status = document.createElement('div');
    status.style.marginTop = '8px';
    status.style.fontSize = '0.95rem';
    status.style.color = 'var(--text-muted, #64748b)';
    status.textContent = '';

    const actions = document.createElement('div');
    actions.className = 'kc-create-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'kc-btn-secondary';
    cancel.textContent = 'Cancelar';

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'kc-btn-primary';
    submit.textContent = 'Enviar denúncia';

    actions.appendChild(cancel);
    actions.appendChild(submit);

    body.appendChild(subtitle);
    body.appendChild(postLine);
    body.appendChild(reasonWrap);
    body.appendChild(detailsWrap);
    body.appendChild(status);
    body.appendChild(actions);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let currentPostId = null;

    function closeModal() {
      overlay.style.display = 'none';
      reasonSel.value = '';
      details.value = '';
      status.textContent = '';
      submit.disabled = false;
      cancel.disabled = false;
    }

    function open(ctx) {
      currentPostId = ctx.postId;
      postTitle.textContent = String(ctx.postTitle || 'Publicação');
      overlay.style.display = 'flex';
      // foco inicial
      try { reasonSel.focus(); } catch (_) {}
    }

    async function submitReport() {
      const reason = String(reasonSel.value || '').trim();
      if (!reason) {
        status.textContent = 'Selecione um motivo.';
        return;
      }
      submit.disabled = true;
      cancel.disabled = true;
      status.textContent = 'Enviando…';

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.reportPost === 'function') {
          res = await window.KCAPI.reportPost(currentPostId, { reason, details: details.value });
        }
      } catch (e) {
        res = { ok: false, error: { message: 'Falha ao enviar.' } };
      }

      if (res && res.ok) {
        status.textContent = 'Obrigado! Sua denúncia foi registrada.';
        try { showToast('Denúncia registrada. Obrigado!', 'success', 2200); } catch (_) {}
        setTimeout(closeModal, 650);
        return;
      }

      const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível registrar a denúncia.';
      status.textContent = msg;
      try { showToast(msg, 'error', 2600); } catch (_) {}
      submit.disabled = false;
      cancel.disabled = false;
    }

    // wire
    close.addEventListener('click', closeModal);
    cancel.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    submit.addEventListener('click', submitReport);

    return { open, close: closeModal };
  }

  document.addEventListener('DOMContentLoaded', loadPost);
})();
