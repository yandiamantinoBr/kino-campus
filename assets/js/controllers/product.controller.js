/*
  KinoCampus - Product (Detalhes) Controller (V8.1.2.4.5)
  - Carrega post por ID usando KCAPI + KCPostModel
  - Aplica regras centrais (KCUtils.applyPresentationRules)
  - Mantém comentários e UI existente (sem regressão visual)
*/

(function () {
  'use strict';

  let currentPost = null;
  let currentUser = null;
  let currentProfile = null;
  let editUI = null;
  let staticInteractionsBound = false;
  let savedPostState = { kinds: [], loaded: false, pending: false };
  const shared = window.KCAccountProfileUtils || {};
  let sellerStatsRequestToken = 0;
  let sellerRatingModal = null;

  // ── Share popover ────────────────────────────────────────
  function openSharePopover(btn) {
    const popover  = document.getElementById('sharePopover');
    const backdrop = document.getElementById('shareBackdrop');
    if (!popover) return;
    closeSavePopover();
    closeCalendarPopover();
    popover.classList.add('active');
    popover.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  function closeSharePopover() {
    const popover  = document.getElementById('sharePopover');
    const backdrop = document.getElementById('shareBackdrop');
    const btn      = document.getElementById('shareButton');
    if (popover)  { popover.classList.remove('active'); popover.setAttribute('aria-hidden', 'true'); }
    if (backdrop) backdrop.classList.remove('active');
    if (btn)      btn.setAttribute('aria-expanded', 'false');
  }
  function wireSharePopover() {
    const shareBtn = document.getElementById('shareButton');
    const backdrop = document.getElementById('shareBackdrop');
    const waBtn    = document.getElementById('shareWhatsApp');
    const copyBtn  = document.getElementById('shareCopyLink');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = document.getElementById('sharePopover');
      if (popover && popover.classList.contains('active')) {
        closeSharePopover();
      } else {
        openSharePopover(shareBtn);
      }
    });
    if (backdrop) backdrop.addEventListener('click', closeSharePopover);

    if (waBtn) {
      waBtn.addEventListener('click', () => {
        closeSharePopover();
        const title = (currentPost && (currentPost.titulo || currentPost.title)) || document.title;
        const url   = window.location.href;
        const text  = title + '\n' + url;
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
        // Tracking de compartilhamento (fire-and-forget)
        try {
          const pid = currentPost && (currentPost.uuid || currentPost.id);
          if (pid && window.KCAPI && typeof window.KCAPI.trackShare === 'function') {
            window.KCAPI.trackShare(pid).catch(() => {});
          }
        } catch (_) {}
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        closeSharePopover();
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(window.location.href);
            toast('Link copiado!', 'info', 1800);
          } else { throw new Error('no clipboard'); }
        } catch (_) {
          toast('Não foi possível copiar o link.', 'error', 2200);
        }
      });
    }
    // Fechar ao pressionar Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSharePopover();
    }, { passive: true });
  }

  function openSavePopover(btn) {
    const popover = document.getElementById('savePopover');
    const backdrop = document.getElementById('saveBackdrop');
    if (!popover) return;
    closeSharePopover();
    closeCalendarPopover();
    popover.classList.add('active');
    popover.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeSavePopover() {
    const popover = document.getElementById('savePopover');
    const backdrop = document.getElementById('saveBackdrop');
    const btn = document.getElementById('saveButton');
    if (popover) {
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.classList.remove('active');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function wireSavePopover() {
    const saveBtn = document.getElementById('saveButton');
    const backdrop = document.getElementById('saveBackdrop');
    const closeBtn = document.getElementById('savePopoverClose');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = document.getElementById('savePopover');
      if (popover && popover.classList.contains('active')) closeSavePopover();
      else openSavePopover(saveBtn);
    });

    if (backdrop) backdrop.addEventListener('click', closeSavePopover);
    if (closeBtn) closeBtn.addEventListener('click', closeSavePopover);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSavePopover();
    }, { passive: true });
  }

  // ── Badge "editado" ──────────────────────────────────────
  function markPostAsEdited() {
    // Adiciona indicador abaixo do título
    const titleEl = document.getElementById('postTitle');
    if (!titleEl) return;
    const existing = document.getElementById('kcEditedBadge');
    if (existing) return;
    const badge = document.createElement('div');
    badge.id = 'kcEditedBadge';
    badge.className = 'kc-post-edited-badge';
    badge.innerHTML = '<i class="fas fa-pen-to-square"></i> Editado';
    titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
  }

  function getParam(name) {
    const params = new URLSearchParams(window.location.search || '');
    return params.get(name);
  }

  function esc(str) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') return window.KCUtils.escapeHtml(str);
    console.error('[KC Product] KCUtils.escapeHtml indisponível.');
    return '';
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

  function toast(message, type, duration) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type, duration);
      }
    } catch (_) { }
  }

  function buildCurrentPagePath() {
    const path = String(window.location.pathname || '/product.html').trim() || '/product.html';
    return `${path}${window.location.search || ''}${window.location.hash || ''}`;
  }

  function buildPostContactIntent(post) {
    return {
      type: 'product_contact',
      path: buildCurrentPagePath(),
      postId: String((post && (post.id || post.uuid)) || '').trim(),
      postUuid: String((post && post.uuid) || '').trim(),
      createdAt: new Date().toISOString()
    };
  }

  function buildProfileHref(profileId) {
    const normalized = String(profileId || '').trim();
    return normalized ? `profile.html?id=${encodeURIComponent(normalized)}` : 'profile.html';
  }

  function isViewerAuthenticated() {
    return !!(currentUser && currentUser.id);
  }

  function resolveCurrentUserDisplayName(user, profile) {
    const normalizedProfile = (profile && typeof profile === 'object') ? profile : null;
    const normalizedUser = (user && typeof user === 'object') ? user : null;
    const userMetadata = (normalizedUser && normalizedUser.user_metadata && typeof normalizedUser.user_metadata === 'object')
      ? normalizedUser.user_metadata
      : null;

    const candidates = [
      normalizedProfile && normalizedProfile.display_name,
      normalizedProfile && normalizedProfile.full_name,
      userMetadata && userMetadata.full_name,
      normalizedUser && normalizedUser.display_name,
      normalizedUser && normalizedUser.full_name,
      normalizedUser && normalizedUser.email,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const value = String(candidates[i] || '').trim();
      if (value) return value;
    }
    return '';
  }

  function resolveCurrentUserAvatar(user, profile) {
    const normalizedProfile = (profile && typeof profile === 'object') ? profile : null;
    const normalizedUser = (user && typeof user === 'object') ? user : null;
    const userMetadata = (normalizedUser && normalizedUser.user_metadata && typeof normalizedUser.user_metadata === 'object')
      ? normalizedUser.user_metadata
      : null;
    const candidates = [
      normalizedProfile && normalizedProfile.avatar_url,
      normalizedProfile && normalizedProfile.avatarUrl,
      normalizedProfile && normalizedProfile.avatar,
      userMetadata && userMetadata.avatar_url,
      userMetadata && userMetadata.avatar,
      normalizedUser && normalizedUser.avatar_url,
      normalizedUser && normalizedUser.avatarUrl,
      normalizedUser && normalizedUser.avatar,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const value = String(candidates[i] || '').trim();
      if (value) return value;
    }

    return '';
  }

  function getContactActionPresentation(action, post) {
    const fallbackCta = post && post._kcCTA ? post._kcCTA : null;
    const iconMap = {
      whatsapp: 'fab fa-whatsapp',
      email_public: 'fas fa-envelope',
      instagram: 'fab fa-instagram',
      linkedin: 'fab fa-linkedin',
      facebook: 'fab fa-facebook',
      login_required: 'fas fa-right-to-bracket',
      view_profile: 'fas fa-id-badge',
      external_link: 'fas fa-arrow-up-right-from-square',
      real_form: 'fas fa-paper-plane',
      safe_fallback: 'fas fa-circle-info'
    };

    return {
      label: String((action && action.label) || (fallbackCta && fallbackCta.label) || 'Entrar em contato').trim(),
      iconClass: String((action && action.iconClass) || (fallbackCta && fallbackCta.iconClass) || iconMap[String((action && action.type) || '').trim()] || 'fas fa-paper-plane').trim()
    };
  }

  function executeContactAction(action, post) {
    if (!action) return false;

    if (action.type === 'login_required') {
      if (typeof window.kcQueueAuthIntent === 'function') {
        window.kcQueueAuthIntent(buildPostContactIntent(post));
      }
      if (typeof window.kcOpenAuthModal === 'function') {
        window.kcOpenAuthModal({ tab: 'login', nextPath: buildCurrentPagePath() });
      } else {
        window.location.href = 'index.html#login';
      }
      return true;
    }

    if (action.href) {
      if (action.target === '_blank') {
        window.open(action.href, '_blank', action.rel || 'noopener,noreferrer');
      } else {
        window.location.href = action.href;
      }
      return true;
    }

    if (typeof action.handler === 'function') {
      action.handler();
      return true;
    }

    return false;
  }

  function getPostContactAction(post) {
    const meta = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
    const moduleKey = String(post && (post.modulo || post.module) || '').trim().toLowerCase();
    const categoryKey = String(post && (post.categoria || post.category) || '').trim().toLowerCase();
    const authorId = getPostAuthorId(post);
    const viewProfileHref = buildProfileHref(authorId);
    const authorProfile = post && post.authorProfile && typeof post.authorProfile === 'object' ? post.authorProfile : null;

    // link_as_cta: o criador do post marcou o link para ser a ação principal
    if (meta.link_as_cta) {
      const ctaUrl = String(meta.link || post.link || post.externalUrl || '').trim();
      if (/^https?:\/\//i.test(ctaUrl)) {
        if (!isViewerAuthenticated()) {
          return { type: 'login_required', label: 'Entrar para acessar' };
        }
        return {
          type: 'external_link',
          label: 'Acessar link',
          href: ctaUrl,
          target: '_blank',
          rel: 'noopener noreferrer'
        };
      }
    }

    if (authorProfile && shared && typeof shared.buildContactAction === 'function') {
      const profileAction = shared.buildContactAction({
        profile: authorProfile,
        viewerAuthenticated: isViewerAuthenticated(),
        postTitle: post && (post.titulo || post.title) || '',
        postUrl: window.location.href,
        viewProfileHref
      });
      if (profileAction && profileAction.type && profileAction.type !== 'unavailable') {
        return profileAction;
      }
    }

    const whatsappRaw = post && (post.whatsapp || post.whatsappNumber || post.contatoWhatsapp) || meta.whatsapp;
    const whatsapp = normalizeWhatsAppPhone(whatsappRaw);
    if (whatsapp) {
      if (!isViewerAuthenticated()) {
        return { type: 'login_required', label: 'Entrar para contatar' };
      }
      const message = shared && typeof shared.buildContactMessage === 'function'
        ? shared.buildContactMessage(post && (post.titulo || post.title) || '', window.location.href)
        : `${post && (post.titulo || post.title) || 'KinoCampus'}\n${window.location.href}`;
      return {
        type: 'whatsapp',
        label: 'Falar no WhatsApp',
        href: 'https://wa.me/' + encodeURIComponent(whatsapp) + '?text=' + encodeURIComponent(message),
        target: '_blank',
        rel: 'noopener noreferrer'
      };
    }

    const externalUrl = String(post && (post.link || post.externalUrl || post.url || post.formUrl) || meta.formUrl || meta.externalUrl || '').trim();
    const isOpportunityForm = moduleKey === 'oportunidades' || categoryKey === 'estagio' || categoryKey === 'emprego';

    if (isOpportunityForm && typeof window.openFormModal === 'function') {
      if (!isViewerAuthenticated()) {
        return { type: 'login_required', label: 'Entrar para contatar' };
      }
      return {
        type: 'real_form',
        label: 'Enviar interesse',
        handler: () => window.openFormModal({ postId: post && (post.id || post.uuid) || null, post })
      };
    }

    if (/^https?:\/\//i.test(externalUrl)) {
      if (!isViewerAuthenticated()) {
        return { type: 'login_required', label: 'Entrar para contatar' };
      }
      return {
        type: 'external_link',
        label: 'Abrir canal de contato',
        href: externalUrl,
        target: '_blank',
        rel: 'noopener noreferrer'
      };
    }

    if (authorId) {
      return {
        type: 'view_profile',
        label: 'Ver perfil',
        href: viewProfileHref
      };
    }

    return {
      type: 'safe_fallback',
      label: 'Contato indisponivel',
      handler: () => {
        toast('Contato indisponivel para esta publicacao.', 'warn', 2400);
      }
    };
  }

  function setCTA(post) {
    const btn = document.getElementById('primaryCta');
    if (!btn) return;

    const action = getPostContactAction(post);
    const presentation = getContactActionPresentation(action, post);
    btn.innerHTML = `<i class="${esc(presentation.iconClass)}"></i> ${esc(presentation.label)}`;
    btn.dataset.kcCtaLabel = presentation.label;
    btn.dataset.kcCtaHref = String(action && action.href || '');
    btn.dataset.kcCtaTarget = String(action && action.target || '');
    btn.dataset.kcCtaRel = String(action && action.rel || '');
    btn.dataset.kcCtaActionType = String(action && action.type || 'safe_fallback');

    if (btn.tagName === 'A') {
      btn.setAttribute('href', action && action.href ? action.href : '#');
      if (action && action.target) btn.setAttribute('target', action.target);
      else btn.removeAttribute('target');
      if (action && action.rel) btn.setAttribute('rel', action.rel);
      else btn.removeAttribute('rel');
    }

    if (btn.dataset.kcCtaBound !== '1') {
      btn.dataset.kcCtaBound = '1';
      btn.addEventListener('click', (event) => {
        try {
          const liveAction = getPostContactAction(currentPost || post || {});
          if (executeContactAction(liveAction, currentPost || post || {})) {
            event.preventDefault();
            // Tracking de clique no CTA/cupom (fire-and-forget)
            try {
              const pid = (currentPost && (currentPost.uuid || currentPost.id)) || (post && (post.uuid || post.id));
              if (pid && window.KCAPI && typeof window.KCAPI.trackCouponClick === 'function') {
                window.KCAPI.trackCouponClick(pid).catch(() => {});
              }
            } catch (_) {}
            return;
          }

          throw new Error('cta_action_unresolved:' + String(btn.dataset.kcCtaActionType || 'unknown'));
        } catch (error) {
          event.preventDefault();
          reportCtaError('cta_click_failed', {
            message: error && error.message ? String(error.message) : 'unknown',
            postId: (currentPost && (currentPost.id || currentPost.uuid)) || (post && (post.id || post.uuid)) || null,
            module: (currentPost && (currentPost.modulo || currentPost.module)) || null,
            category: (currentPost && (currentPost.categoria || currentPost.category)) || null,
          });
          toast('Nao foi possivel executar esta acao agora.', 'error', 2400);
        }
      });
    }
  }

  function openCalendarPopover(btn) {
    const popover = document.getElementById('calendarPopover');
    const backdrop = document.getElementById('calendarBackdrop');
    if (!popover) return;
    closeSavePopover();
    closeSharePopover();
    popover.classList.add('active');
    popover.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeCalendarPopover() {
    const popover = document.getElementById('calendarPopover');
    const backdrop = document.getElementById('calendarBackdrop');
    const btn = document.getElementById('calendarButton');
    if (popover) { popover.classList.remove('active'); popover.setAttribute('aria-hidden', 'true'); }
    if (backdrop) backdrop.classList.remove('active');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function wireCalendarPopover() {
    const calBtn = document.getElementById('calendarButton');
    const backdrop = document.getElementById('calendarBackdrop');
    const closeBtn = document.getElementById('calendarPopoverClose');
    if (!calBtn) return;
    calBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = document.getElementById('calendarPopover');
      if (popover && popover.classList.contains('active')) closeCalendarPopover();
      else openCalendarPopover(calBtn);
    });
    if (backdrop) backdrop.addEventListener('click', closeCalendarPopover);
    if (closeBtn) closeBtn.addEventListener('click', closeCalendarPopover);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCalendarPopover();
    }, { passive: true });
  }

  function setEventCalendar(post) {
    const moduleKey = String(post && (post.modulo || post.module) || '').trim().toLowerCase();

    const prev = document.getElementById('kcEventCalendarWrap');
    if (prev) prev.remove();

    if (moduleKey !== 'eventos') return;

    const meta = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
    const dataEvento = String(meta.data_evento || '').trim();
    const horaEvento = String(meta.hora_evento || '').trim();
    const localizacao = String(meta.localizacao || '').trim();
    const titulo = String(post.titulo || post.title || '').trim();
    const descricao = String(post.descricao || post.description || '').trim().substring(0, 500);

    if (!dataEvento) return;

    const dateParts = dataEvento.split('-');
    if (dateParts.length !== 3) return;

    let startStr, endStr, startIso, endIso;
    const timeParts = horaEvento ? horaEvento.split(':') : null;
    const hasTime = timeParts && timeParts.length >= 2;

    if (hasTime) {
      const hh = String(timeParts[0]).padStart(2, '0');
      const mm = String(timeParts[1]).padStart(2, '0');
      startStr = `${dateParts[0]}${dateParts[1]}${dateParts[2]}T${hh}${mm}00`;
      startIso = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}T${hh}:${mm}:00`;
      let endHour = parseInt(hh, 10) + 1;
      let endYear = dateParts[0], endMonth = dateParts[1], endDay = dateParts[2];
      if (endHour >= 24) {
        endHour -= 24;
        const d = new Date(`${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`);
        d.setDate(d.getDate() + 1);
        endYear = String(d.getFullYear());
        endMonth = String(d.getMonth() + 1).padStart(2, '0');
        endDay = String(d.getDate()).padStart(2, '0');
      }
      const endHH = String(endHour).padStart(2, '0');
      endStr = `${endYear}${endMonth}${endDay}T${endHH}${mm}00`;
      endIso = `${endYear}-${endMonth}-${endDay}T${endHH}:${mm}:00`;
    } else {
      startStr = `${dateParts[0]}${dateParts[1]}${dateParts[2]}`;
      startIso = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
      const d = new Date(`${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`);
      d.setDate(d.getDate() + 1);
      endStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      endIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // Google Calendar
    const gParams = new URLSearchParams({ action: 'TEMPLATE', text: titulo, dates: `${startStr}/${endStr}` });
    if (localizacao) gParams.set('location', localizacao);
    if (descricao) gParams.set('details', descricao);
    const googleUrl = `https://calendar.google.com/calendar/render?${gParams.toString()}`;

    // Outlook Web
    const oParams = new URLSearchParams({ subject: titulo, startdt: startIso, enddt: endIso, path: '/calendar/action/compose', rru: 'addevent' });
    if (localizacao) oParams.set('location', localizacao);
    if (descricao) oParams.set('body', descricao);
    const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?${oParams.toString()}`;

    // Apple / iCal — .ics data URI
    const safeStr = (s) => String(s || '').replace(/\r\n|\r|\n/g, ' ').replace(/[,;\\]/g, (c) => '\\' + c);
    const icsLines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KinoCampus//PT',
      'BEGIN:VEVENT',
      `SUMMARY:${safeStr(titulo)}`,
      `DTSTART:${startStr}`, `DTEND:${endStr}`,
    ];
    if (localizacao) icsLines.push(`LOCATION:${safeStr(localizacao)}`);
    if (descricao) icsLines.push(`DESCRIPTION:${safeStr(descricao)}`);
    icsLines.push('END:VEVENT', 'END:VCALENDAR');
    const icsHref = 'data:text/calendar;charset=utf8,' + encodeURIComponent(icsLines.join('\r\n'));
    const icsFilename = (titulo.replace(/[^\w\u00C0-\u017E ]/g, '').trim().replace(/\s+/g, '-').substring(0, 50) || 'evento') + '.ics';

    const wrap = document.createElement('div');
    wrap.id = 'kcEventCalendarWrap';
    wrap.className = 'kc-calendar-wrap';
    wrap.innerHTML = `
      <button class="kc-btn-secondary" id="calendarButton" type="button" aria-haspopup="true" aria-expanded="false">
        <i class="fas fa-calendar-plus"></i> Marcar na Agenda
      </button>
      <div class="kc-save-popover" id="calendarPopover" role="menu" aria-hidden="true">
        <div class="kc-save-popover__header">
          <h3 class="kc-save-popover__title"><i class="fas fa-calendar-plus"></i> Adicionar ao calendário</h3>
          <button class="kc-save-popover__close" id="calendarPopoverClose" type="button" aria-label="Fechar"><i class="fas fa-times"></i></button>
        </div>
        <div class="kc-save-popover__body">
          <a class="kc-save-option" href="${esc(googleUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
            <i class="kc-save-option__icon fab fa-google" style="color:#4285F4;"></i>
            <span class="kc-save-option__body">
              <span class="kc-save-option__title">Google Agenda</span>
              <span class="kc-save-option__hint">Abre no Google Calendar no navegador.</span>
            </span>
            <i class="fas fa-external-link-alt" style="font-size:.75rem;opacity:.5;"></i>
          </a>
          <a class="kc-save-option" href="${esc(icsHref)}" download="${esc(icsFilename)}" style="text-decoration:none;">
            <i class="kc-save-option__icon fab fa-apple" style="color:#a2a2a7;"></i>
            <span class="kc-save-option__body">
              <span class="kc-save-option__title">Apple Calendário</span>
              <span class="kc-save-option__hint">Baixa o arquivo .ics (iPhone, Mac).</span>
            </span>
            <i class="fas fa-download" style="font-size:.75rem;opacity:.5;"></i>
          </a>
          <a class="kc-save-option" href="${esc(outlookUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
            <i class="kc-save-option__icon fab fa-microsoft" style="color:#0078d4;"></i>
            <span class="kc-save-option__body">
              <span class="kc-save-option__title">Outlook</span>
              <span class="kc-save-option__hint">Abre no Outlook Web no navegador.</span>
            </span>
            <i class="fas fa-external-link-alt" style="font-size:.75rem;opacity:.5;"></i>
          </a>
        </div>
      </div>
      <div class="kc-save-popover-backdrop" id="calendarBackdrop"></div>
    `;

    const primaryCta = document.getElementById('primaryCta');
    if (primaryCta && primaryCta.parentNode) {
      primaryCta.parentNode.insertBefore(wrap, primaryCta.nextSibling);
      wireCalendarPopover();
    }
  }

  function maybeResumeQueuedContact(post) {
    if (!post || !isViewerAuthenticated() || typeof window.kcConsumeAuthIntent !== 'function') return;

    const currentPath = buildCurrentPagePath();
    const identifiers = new Set([
      String(post.id || '').trim(),
      String(post.uuid || '').trim()
    ].filter(Boolean));

    const intent = window.kcConsumeAuthIntent((entry) => {
      if (!entry || entry.type !== 'product_contact') return false;
      const entryPath = String(entry.path || '').trim();
      const entryId = String(entry.postUuid || entry.postId || '').trim();
      return (entryPath && entryPath === currentPath) || (entryId && identifiers.has(entryId));
    });

    if (!intent) return;
    const action = getPostContactAction(post);
    if (action && action.type !== 'login_required') {
      executeContactAction(action, post);
    }
  }

  /**
   * Extrai o "login" do contexto autenticado do próprio usuário.
   * Sem e-mail da sessão, cai para um handle público derivado do nome.
   */
  function resolveCurrentUserLogin(user, profile) {
    const ownEmail = String((user && user.email) || '').trim();
    if (ownEmail.includes('@')) return ownEmail.split('@')[0];

    if (window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function') {
      const publicHandle = window.KCUtils.buildPublicHandle(profile && (profile.display_name || profile.full_name), { prefix: false });
      if (publicHandle) return publicHandle;
    }
    return '';
  }

  function applyCommentComposerSessionState(user, profile) {
    const commentAuthorInput = document.getElementById('commentAuthor');
    const commentAuthorHint = document.getElementById('commentAuthorHint');
    const composerAvatar = document.getElementById('commentComposerAvatar');
    if (!commentAuthorInput) return;

    const resolvedIdentity = resolveCurrentUserDisplayName(user, profile);
    const resolvedAvatar = resolveCurrentUserAvatar(user, profile);
    const resolvedLogin = resolveCurrentUserLogin(user, profile);
    const isAuthenticated = !!(user && user.id);

    if (resolvedIdentity) commentAuthorInput.value = resolvedIdentity;

    if (isAuthenticated) {
      commentAuthorInput.setAttribute('readonly', 'readonly');
      commentAuthorInput.setAttribute('aria-readonly', 'true');
      commentAuthorInput.removeAttribute('placeholder');
      if (!commentAuthorInput.value) commentAuthorInput.value = 'Conta autenticada';
      // Hint: mostra o login (@handle) abaixo do nome de exibição
      if (commentAuthorHint) {
        commentAuthorHint.textContent = resolvedLogin ? ('@' + resolvedLogin) : '';
        commentAuthorHint.style.display = resolvedLogin ? 'block' : 'none';
      }
    } else {
      commentAuthorInput.removeAttribute('readonly');
      commentAuthorInput.setAttribute('placeholder', 'Seu nome (opcional no modo local/dev)');
      if (commentAuthorHint) {
        commentAuthorHint.textContent = '';
        commentAuthorHint.style.display = 'none';
      }
    }

    if (composerAvatar) {
      if (resolvedAvatar) {
        composerAvatar.src = resolvedAvatar;
      } else {
        const seed = String((resolvedIdentity || (user && (user.email || user.id)) || 'commenter')).toLowerCase();
        composerAvatar.src = (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '';
      }
    }
  }

  // Mapa módulo → groupId da categoria principal (espelha KC_CREATE_SCHEMA.categoryGroupId)
  const CATEGORY_GROUP_MAP = {
    'compra-venda': 'categoria',
    'moradia': 'tipo',
    'eventos': 'topico',
    'achados-perdidos': 'status',
    'oportunidades': 'tipo',
    'caronas': 'tipo',
  };

  function wireCreateSimilarBtn() {
    const btn = document.getElementById('createSimilarBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const post = currentPost;
      if (!post) return;
      const moduleKey = String(post.modulo || post.module || '').trim().toLowerCase();
      if (!moduleKey) return;
      const groupId = CATEGORY_GROUP_MAP[moduleKey];
      const catKey = String(post.categoriaKey || post.categoria || '').trim().toLowerCase();
      const selections = {};
      if (groupId && catKey) selections[groupId] = catKey;
      if (typeof window.kcOpenCreatePostModalPrefilled === 'function') {
        window.kcOpenCreatePostModalPrefilled(moduleKey, selections);
      } else if (typeof window.kcOpenCreatePostModal === 'function') {
        window.kcOpenCreatePostModal(moduleKey);
      }
    });
  }

  function bindStaticInteractions() {
    if (staticInteractionsBound) return;
    staticInteractionsBound = true;

    document.body.addEventListener('click', async (event) => {
      const actionTrigger = event.target.closest('[data-action]');
      const action = actionTrigger
        ? String(actionTrigger.dataset.action || '').trim().toLowerCase()
        : '';

      if (action === 'share-post') {
        // handled by wireSharePopover() directly on the button
      } else if (action === 'report-post') {
        console.log('[RC-8220][L1] Botão clicado: report-post');
      } else if (action === 'submit-comment') {
        console.log('[RC-8220][L1] Botão clicado: submit-comment');
      }

      const commentLikeBtn = event.target.closest('.kc-like-comment-btn');
      if (commentLikeBtn) {
        console.log('[RC-8220][L1] Botão clicado: comment-like', {
          postId: String(commentLikeBtn.dataset.postId || ''),
          commentId: String(commentLikeBtn.dataset.commentId || ''),
        });
      }

      // [data-kc-share] is now handled by wireSharePopover() directly


      const viewProfileBtn = event.target.closest('[data-kc-view-profile]');
      if (viewProfileBtn) {
        event.preventDefault();
        const authorId = getPostAuthorId(currentPost);
        if (authorId) {
          window.location.href = 'profile.html?id=' + encodeURIComponent(authorId);
        } else {
          toast('Perfil indisponível para esta publicação.', 'warn', 2000);
        }
        return;
      }

      const formatBtn = event.target.closest('[data-kc-format]');
      if (formatBtn) {
        event.preventDefault();
        const fmt = String(formatBtn.dataset.kcFormat || '').trim();
        if (fmt && typeof window.formatText === 'function') {
          window.formatText(fmt);
        }
        return;
      }

      const submitCommentBtn = event.target.closest('[data-kc-submit-comment]');
      if (submitCommentBtn) {
        event.preventDefault();
        if (typeof window.submitComment === 'function') {
          window.submitComment();
        }
        return;
      }

      const mobileMenuBtn = event.target.closest('[data-kc-mobile-menu]');
      if (mobileMenuBtn) {
        const action = String(mobileMenuBtn.dataset.kcMobileMenu || '').trim().toLowerCase();
        if (action === 'open' && typeof window.openMobileMenu === 'function') {
          window.openMobileMenu();
          return;
        }
        if (action === 'close' && typeof window.closeMobileMenu === 'function') {
          window.closeMobileMenu();
        }
      }
    });
  }


  function getPostAuthorId(post) {
    const raw = post && (post.autorId || post.authorId || post.author_id);
    return String(raw || '').trim() || null;
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
    const rawModulePage = String((post._kcModulePage || '') || 'index.html').trim();
    const safeModulePage = /^[a-z0-9_-]+\.html(?:[?#].*)?$/i.test(rawModulePage) ? rawModulePage : 'index.html';

    if (modKey) parts.push(`<i class="fas fa-chevron-right"></i><a href="${esc(safeModulePage)}">${esc(modLbl)}</a>`);
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
    const relTime = post._kcRelativeTime || (window.KCUtils && window.KCUtils.timeAgo ? window.KCUtils.timeAgo(post.timestamp || post.created_at) : (post.timestamp || post.created_at));
    if (relTime) badges.push(`<span class="kc-badge"><i class="fas fa-clock"></i> ${esc(relTime)}</span>`);

    el.innerHTML = badges.join(' ');
  }

  function isLegacyExamplePost(post) {
    if (!post || typeof post !== 'object') return false;
    return !!String(post.legacyId || post.legacy_id || '').trim();
  }

  function isLegacyExampleProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return !!String(profile.legacyId || profile.legacy_id || '').trim();
  }

  function buildLegacyExampleBadgeHtml(label, extraClass) {
    const text = String(label || 'Exemplo').trim() || 'Exemplo';
    const className = ['kc-product-example-ribbon', extraClass || ''].filter(Boolean).join(' ');
    return '<span class="' + className + '" aria-label="' + esc(text) + '"><i class="fas fa-flask"></i><span>' + esc(text) + '</span></span>';
  }

  function syncLegacyExampleMarker(container, shouldShow, label, extraClass) {
    if (!container) return;
    const current = container.querySelector('.kc-product-example-ribbon');
    if (current) current.remove();
    if (!shouldShow) return;
    container.insertAdjacentHTML('afterbegin', buildLegacyExampleBadgeHtml(label, extraClass));
  }

  function setGallery(post) {
    const mainImg = document.getElementById('mainImage');
    const emojiCover = document.getElementById('emojiCover');
    const thumbs = document.getElementById('thumbnails');
    const galleryMain = document.querySelector('.kc-gallery-main');

    const images = Array.isArray(post.imagens) ? post.imagens : (Array.isArray(post.images) ? post.images : []);
    const isLegacyExample = isLegacyExamplePost(post);
    syncLegacyExampleMarker(galleryMain, isLegacyExample, 'Exemplo', 'kc-product-example-ribbon--gallery');
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
          img.loading = 'lazy';
          img.decoding = 'async';
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
      } catch (_) { }
    }

    block.style.display = 'flex';
  }

  function setDescription(post) {
    const rawDesc = post.descricao || post.description || '';
    const renderMd = (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function')
      ? window.KCUtils.renderMarkdownInline
      : esc;
    const descHtml = renderMd(rawDesc);
    const tags = Array.isArray(post.tags) ? post.tags.slice(0, 10) : [];
    const markerTags = (window.KCUtils && typeof window.KCUtils.getDisplayMarkerTags === 'function')
      ? window.KCUtils.getDisplayMarkerTags(post, { limit: 10 })
      : [];
    const normalize = (window.KCUtils && typeof window.KCUtils.normalizeText === 'function')
      ? window.KCUtils.normalizeText
      : ((value) => String(value || '').toLowerCase().trim());
    const markerLabels = new Set(markerTags.map((tag) => normalize(tag && tag.label)));
    const plainTags = tags
      .filter((tag) => !markerLabels.has(normalize(tag)))
      .map((tag) => ({ label: tag, emoji: '🏷️' }));

    let html = '';
    if (descHtml) {
      html += `<h3><i class="fas fa-align-left"></i> Descrição</h3><div class="kc-description-content">${descHtml}</div>`;
    }
    if (markerTags.length && window.KCUtils && typeof window.KCUtils.renderMarkerTags === 'function') {
      html += window.KCUtils.renderMarkerTags(markerTags, {
        containerClass: 'kc-tags-list kc-tags-list--markers',
        itemClass: 'kc-tag kc-tag--marker',
      });
    }
    if (plainTags.length && window.KCUtils && typeof window.KCUtils.renderMarkerTags === 'function') {
      html += window.KCUtils.renderMarkerTags(plainTags, {
        containerClass: 'kc-tags-list kc-tags-list--plain',
        itemClass: 'kc-tag',
      });
    } else if (plainTags.length) {
      html += `<div class="kc-tags-list kc-tags-list--plain">` +
        plainTags.map((tag) => `<span class="kc-tag"><span class="kc-tag__emoji">${esc(tag.emoji)}</span><span>${esc(tag.label)}</span></span>`).join('') +
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

  function buildTagEntries(post) {
    const tags = Array.isArray(post.tags) ? post.tags.slice(0, 14) : [];
    const markerTags = (window.KCUtils && typeof window.KCUtils.getDisplayMarkerTags === 'function')
      ? window.KCUtils.getDisplayMarkerTags(post, { limit: 14 })
      : [];
    const normalize = (window.KCUtils && typeof window.KCUtils.normalizeText === 'function')
      ? window.KCUtils.normalizeText
      : ((value) => String(value || '').toLowerCase().trim());
    const markerLabels = new Set(markerTags.map((tag) => normalize(tag && tag.label)));
    const plainTags = tags
      .filter((tag) => !markerLabels.has(normalize(tag)))
      .map((tag) => ({ label: tag, emoji: '🏷️' }));

    return { markerTags, plainTags };
  }

  function buildTagsSpecHtml(post) {
    const entries = buildTagEntries(post);
    if (!entries.markerTags.length && !entries.plainTags.length) return '';

    const renderTag = (tag, itemClass) => {
      const emoji = esc(String(tag && tag.emoji || '🏷️').trim());
      const label = esc(String(tag && tag.label || '').trim());
      return `<span class="${itemClass}">${emoji ? `<span class="kc-tag__emoji">${emoji}</span>` : ''}<span>${label}</span></span>`;
    };

    return '<div class="kc-tags-list kc-tags-list--specs">'
      + entries.markerTags.map((tag) => renderTag(tag, 'kc-tag kc-tag--marker')).join('')
      + entries.plainTags.map((tag) => renderTag(tag, 'kc-tag')).join('')
      + '</div>';
  }

  function setOpenGraphTags(post) {
    const title = (post.titulo || post.title || 'KinoCampus') + ' — KinoCampus';
    const desc = String(post.descricao || post.description || 'Anúncios, eventos e oportunidades da comunidade universitária UFG.').trim().substring(0, 200);
    const images = post.images || post.image_urls || [];
    const img = images.length ? String(images[0]) : '';
    const url = window.location.href;

    function setMeta(selector, attr, value) {
      const el = document.querySelector(selector);
      if (el && value) el.setAttribute(attr, value);
    }
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:image"]', 'content', img);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    setMeta('meta[name="twitter:image"]', 'content', img);
  }

  function setLegacyBanner(post) {
    const el = document.getElementById('legacyNotice');
    if (!el) return;
    if (isLegacyExamplePost(post)) {
      el.innerHTML = `<div class="kc-legacy-banner">
        <span class="kc-legacy-banner__icon"><i class="fas fa-flask"></i></span>
        <div><strong>Publicação de exemplo</strong>Este é um post fictício criado para demonstração da plataforma. Não representa um anúncio real.</div>
      </div>`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  }

  function setDescription(post) {
    const rawDesc = post.descricao || post.description || '';
    const renderMd = (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function')
      ? window.KCUtils.renderMarkdownInline
      : esc;
    const descHtml = renderMd(rawDesc);
    let html = '';
    if (descHtml) {
      html += `<h3><i class="fas fa-align-left"></i> Descrição</h3><div class="kc-description-content">${descHtml}</div>`;
    }
    setHTML('postDescription', html);
  }

  function addSpec(grid, iconClass, label, value) {
    const item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = `
      <i class="${esc(iconClass)}"></i>
      <div class="kc-spec-item__body">
        <strong>${esc(label)}</strong>
        <span>${esc(value)}</span>
      </div>
    `;
    grid.appendChild(item);
  }

  function addSpecHtml(grid, iconClass, label, html) {
    const item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = `
      <i class="${esc(iconClass)}"></i>
      <div class="kc-spec-item__body">
        <strong>${esc(label)}</strong>
        <div class="kc-spec-item__html">${html || ''}</div>
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
    const tagsHtml = buildTagsSpecHtml(post);
    if (tagsHtml) addSpecHtml(grid, 'fas fa-hashtag', 'Tags', tagsHtml);
    if (post.modulo) pairs.push(['fas fa-layer-group', 'Módulo', moduleLabel(post.modulo)]);
    if (post.categoriaLabel || post.categoria) pairs.push(['fas fa-tag', 'Categoria', post.categoriaLabel || post.categoria]);
    if (post.subcategoriaLabel || post.subcategoria) pairs.push(['fas fa-hashtag', 'Subcategoria', post.subcategoriaLabel || post.subcategoria]);
    if (post.verificado != null) pairs.push(['fas fa-check-circle', 'Verificação', post.verificado ? 'Sim' : 'Não']);
    if (post.condicao) pairs.push(['fas fa-star', 'Condição', post.condicao]);

    if (!pairs.length && !tagsHtml) {
      block.style.display = 'none';
      return;
    }

    pairs.forEach((pair) => addSpec(grid, pair[0], pair[1], pair[2]));
    block.style.display = 'block';
  }

  function normalizeSellerRatingSummary(raw) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const averageRaw = source.average != null ? source.average : (source.rating_avg != null ? source.rating_avg : source.rating);
    const average = (averageRaw != null && averageRaw !== '') ? Number(averageRaw) : null;
    const countRaw = source.count != null ? source.count : source.rating_count;
    const count = Math.max(0, parseInt(String(countRaw != null ? countRaw : 0), 10) || 0);
    return {
      userId: String(source.userId || source.user_id || '').trim() || null,
      average: Number.isFinite(average) ? Number(average.toFixed(2)) : null,
      count,
    };
  }

  function getSellerRatingSummaryFromPost(post) {
    const authorProfile = (post && post.authorProfile && typeof post.authorProfile === 'object') ? post.authorProfile : {};
    return normalizeSellerRatingSummary({
      userId: getPostAuthorId(post),
      average: authorProfile.ratingAvg != null ? authorProfile.ratingAvg : (authorProfile.rating_avg != null ? authorProfile.rating_avg : (post && post.rating)),
      count: authorProfile.ratingCount != null ? authorProfile.ratingCount : (authorProfile.rating_count != null ? authorProfile.rating_count : (post && (post.ratingCount != null ? post.ratingCount : post.rating_count))),
    });
  }

  function applySellerRatingSummaryToPost(post, summary) {
    if (!post || typeof post !== 'object') return post;
    const normalizedSummary = normalizeSellerRatingSummary(summary);
    const nextAuthorProfile = (post.authorProfile && typeof post.authorProfile === 'object')
      ? { ...post.authorProfile }
      : {};

    nextAuthorProfile.rating_avg = normalizedSummary.average;
    nextAuthorProfile.rating_count = normalizedSummary.count;
    nextAuthorProfile.ratingAvg = normalizedSummary.average;
    nextAuthorProfile.ratingCount = normalizedSummary.count;

    post.authorProfile = nextAuthorProfile;
    post.rating = normalizedSummary.count > 0 ? normalizedSummary.average : null;
    post.ratingCount = normalizedSummary.count;
    post.rating_count = normalizedSummary.count;
    return post;
  }

  function buildSellerRatingSummaryHtml(summary) {
    const normalizedSummary = normalizeSellerRatingSummary(summary);
    if (!normalizedSummary.count || !Number.isFinite(normalizedSummary.average)) {
      return [
        '<div class="kc-seller-rating-summary__empty">',
        '<i class="fas fa-star-half-stroke"></i>',
        '<span>Ainda sem avaliações públicas.</span>',
        '</div>',
      ].join('');
    }

    const averageText = normalizedSummary.average.toFixed(1);
    const countLabel = normalizedSummary.count === 1 ? '1 avaliação' : normalizedSummary.count + ' avaliações';
    return [
      '<div class="kc-seller-rating-summary__top">',
      '<span class="kc-seller-rating-summary__value"><i class="fas fa-star"></i> ' + esc(averageText) + '</span>',
      '<span class="kc-seller-rating-summary__count">' + esc(countLabel) + '</span>',
      '</div>',
      '<div class="kc-seller-rating-summary__caption">Baseada nas interações confirmadas da comunidade.</div>',
    ].join('');
  }

  function getUserRatingReasonMessage(reason) {
    const key = String(reason || '').trim().toUpperCase();
    if (key === 'SELF') return 'Você não pode avaliar o próprio perfil.';
    if (key === 'NO_INTERACTION') return 'Interaja com um post deste usuário antes de avaliá-lo.';
    if (key === 'AUTH_REQUIRED') return 'Faça login para avaliar membros da comunidade.';
    return 'A avaliação não está disponível neste contexto.';
  }

  function openAuthForUserRating() {
    if (typeof window.kcOpenAuthModal === 'function') {
      window.kcOpenAuthModal({ tab: 'login', nextPath: buildCurrentPagePath() });
      return;
    }
    window.location.href = 'index.html#login';
  }

  function ensureSellerRatingModal() {
    if (sellerRatingModal) return sellerRatingModal;

    const overlay = document.createElement('div');
    overlay.className = 'kc-modal-overlay';
    overlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'kc-user-rating-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'kcSellerRatingModalTitle');
    modal.innerHTML = [
      '<div class="kc-user-rating-modal__header">',
      '<div>',
      '<h2 class="kc-user-rating-modal__title" id="kcSellerRatingModalTitle">Avaliar usuário</h2>',
      '<p class="kc-user-rating-modal__subtitle" id="kcSellerRatingModalSubtitle">Compartilhe como foi sua interação com este membro.</p>',
      '</div>',
      '<button type="button" class="kc-user-rating-modal__close" aria-label="Fechar modal de avaliação"><i class="fas fa-times"></i></button>',
      '</div>',
      '<div class="kc-user-rating-modal__body">',
      '<div class="kc-user-rating-modal__section">',
      '<span class="kc-user-rating-modal__label">Sua nota</span>',
      '<div class="kc-user-rating-stars" role="radiogroup" aria-label="Selecione uma nota de 1 a 5 estrelas">',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="1" aria-label="1 estrela"><i class="fas fa-star"></i></button>',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="2" aria-label="2 estrelas"><i class="fas fa-star"></i></button>',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="3" aria-label="3 estrelas"><i class="fas fa-star"></i></button>',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="4" aria-label="4 estrelas"><i class="fas fa-star"></i></button>',
      '<button type="button" class="kc-user-rating-star" data-kc-rating-value="5" aria-label="5 estrelas"><i class="fas fa-star"></i></button>',
      '</div>',
      '</div>',
      '<div class="kc-user-rating-modal__section">',
      '<label class="kc-user-rating-modal__label" for="kcSellerRatingComment">Comentário opcional</label>',
      '<textarea id="kcSellerRatingComment" maxlength="280" placeholder="Conte, em poucas linhas, como foi sua experiência com este usuário."></textarea>',
      '<div class="kc-user-rating-modal__meta">',
      '<span>Seu comentário será exibido na lista pública de avaliações.</span>',
      '<span id="kcSellerRatingCounter">0/280</span>',
      '</div>',
      '</div>',
      '<div class="kc-user-rating-modal__status" id="kcSellerRatingStatus" aria-live="polite"></div>',
      '<div class="kc-user-rating-modal__actions">',
      '<button type="button" class="kc-btn-secondary" data-action="cancel">Cancelar</button>',
      '<button type="button" class="kc-btn-primary" data-action="submit"><i class="fas fa-star"></i> Salvar avaliação</button>',
      '</div>',
      '</div>',
    ].join('');

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtn = modal.querySelector('.kc-user-rating-modal__close');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    const submitBtn = modal.querySelector('[data-action="submit"]');
    const subtitle = modal.querySelector('#kcSellerRatingModalSubtitle');
    const status = modal.querySelector('#kcSellerRatingStatus');
    const textarea = modal.querySelector('#kcSellerRatingComment');
    const counter = modal.querySelector('#kcSellerRatingCounter');
    const stars = Array.from(modal.querySelectorAll('.kc-user-rating-star'));

    let submitHandler = null;
    let selectedRating = 0;

    function setStatus(message, tone) {
      if (!status) return;
      status.textContent = String(message || '').trim();
      status.className = 'kc-user-rating-modal__status' + (tone ? ' is-' + tone : '');
    }

    function updateCounter() {
      if (!counter || !textarea) return;
      counter.textContent = String(Math.min(280, String(textarea.value || '').length)) + '/280';
    }

    function updateStars() {
      stars.forEach((button) => {
        const value = parseInt(String(button.getAttribute('data-kc-rating-value') || '0'), 10) || 0;
        const active = value <= selectedRating;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    }

    function close() {
      overlay.classList.remove('active');
      window.setTimeout(() => {
        overlay.style.display = 'none';
      }, 180);
      document.body.classList.remove('kc-modal-open');
      setStatus('', '');
    }

    function open(payload) {
      const current = (payload && typeof payload === 'object') ? payload : {};
      submitHandler = typeof current.onSubmit === 'function' ? current.onSubmit : null;
      selectedRating = Math.max(0, Math.min(5, parseInt(String(current.rating != null ? current.rating : 0), 10) || 0));
      if (textarea) textarea.value = String(current.comment || '').trim().slice(0, 280);
      if (subtitle) {
        const targetName = String(current.targetName || 'este usuário').trim() || 'este usuário';
        subtitle.textContent = 'Compartilhe como foi sua interação com ' + targetName + '.';
      }
      updateCounter();
      updateStars();
      setStatus('', '');
      submitBtn.disabled = false;
      overlay.style.display = 'flex';
      document.body.classList.add('kc-modal-open');
      window.requestAnimationFrame(() => overlay.classList.add('active'));
    }

    stars.forEach((button) => {
      button.addEventListener('click', () => {
        selectedRating = Math.max(1, Math.min(5, parseInt(String(button.getAttribute('data-kc-rating-value') || '0'), 10) || 1));
        updateStars();
        setStatus('', '');
      });
    });

    if (textarea) textarea.addEventListener('input', updateCounter);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.style.display !== 'none') close();
    });
    submitBtn.addEventListener('click', async () => {
      if (selectedRating < 1) {
        setStatus('Selecione de 1 a 5 estrelas para continuar.', 'error');
        return;
      }
      if (!submitHandler) {
        setStatus('A ação de avaliação não está disponível agora.', 'error');
        return;
      }

      submitBtn.disabled = true;
      setStatus('Salvando avaliação...', '');
      try {
        const result = await submitHandler({
          rating: selectedRating,
          comment: String(textarea && textarea.value || '').trim().slice(0, 280),
        });
        if (result && result.ok) {
          setStatus('Avaliação salva com sucesso.', 'success');
          close();
          return;
        }
        setStatus((result && result.error && result.error.message) || 'Não foi possível salvar sua avaliação.', 'error');
      } catch (error) {
        setStatus((error && error.message) || 'Não foi possível salvar sua avaliação.', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });

    sellerRatingModal = { open, close };
    return sellerRatingModal;
  }

  function refreshSellerRatingUI(post, summary, ratingState) {
    const summaryEl = document.getElementById('sellerRatingSummary');
    const hintEl = document.getElementById('sellerRatingHint');
    const button = document.getElementById('sellerRateButton');
    const authorId = getPostAuthorId(post);
    const postId = getPostIdForMutation(post);
    const isLegacyExample = isLegacyExamplePost(post) || isLegacyExampleProfile(post && post.authorProfile);
    const normalizedSummary = normalizeSellerRatingSummary(summary && typeof summary === 'object' ? summary : getSellerRatingSummaryFromPost(post));

    applySellerRatingSummaryToPost(post, normalizedSummary);

    if (summaryEl) {
      summaryEl.innerHTML = buildSellerRatingSummaryHtml(normalizedSummary);
      summaryEl.style.display = 'grid';
    }

    if (!button) return;

    const viewerId = String((currentUser && currentUser.id) || '').trim();
    const isSelf = !!(viewerId && authorId && viewerId === authorId);
    const statePayload = (ratingState && typeof ratingState === 'object' && !Array.isArray(ratingState)) ? ratingState : null;
    const existingRating = statePayload && statePayload.myRating ? statePayload.myRating : null;
    const canRate = !!(statePayload && statePayload.canRate === true);

    button.style.display = 'none';
    button.disabled = false;
    button.className = 'kc-btn-secondary kc-btn-full';
    button.innerHTML = '';
    button.onclick = null;

    if (hintEl) {
      hintEl.textContent = '';
      hintEl.style.display = 'none';
    }

    if (!authorId || isLegacyExample || isSelf) {
      return;
    }

    if (!currentUser || !currentUser.id) {
      button.style.display = 'inline-flex';
      button.innerHTML = '<i class="fas fa-right-to-bracket"></i> Entrar para avaliar';
      button.onclick = () => openAuthForUserRating();
      if (hintEl) {
        hintEl.textContent = getUserRatingReasonMessage('AUTH_REQUIRED');
        hintEl.style.display = 'block';
      }
      return;
    }

    function openRatingModal(initialRating, initialComment, nextLabel) {
      ensureSellerRatingModal().open({
        targetName: post.authorName || post.autor || post.author || 'este usuário',
        rating: initialRating,
        comment: initialComment,
        onSubmit: async (payload) => {
          const result = await window.KCAPI.upsertUserRating({
            targetUserId: authorId,
            contextPostId: postId,
            rating: payload.rating,
            comment: payload.comment,
          });
          if (result && result.ok) {
            applySellerRatingSummaryToPost(currentPost || post, result.summary);
            refreshSellerRatingUI(currentPost || post, result.summary, {
              targetUserId: authorId,
              contextPostId: postId,
              canRate: true,
              reason: 'OK',
              myRating: result.rating,
            });
            toast(nextLabel, 'success', 1800);
          }
          return result;
        },
      });
    }

    if (existingRating) {
      button.style.display = 'inline-flex';
      button.className = 'kc-btn-primary kc-btn-full';
      button.innerHTML = '<i class="fas fa-pen"></i> Editar avaliação';
      if (hintEl) {
        hintEl.textContent = 'Sua nota atual: ' + String(existingRating.rating || 0) + ' estrela' + (Number(existingRating.rating) === 1 ? '' : 's') + '.';
        hintEl.style.display = 'block';
      }
      button.onclick = () => openRatingModal(existingRating.rating || 0, existingRating.comment || '', 'Avaliação atualizada.');
      return;
    }

    if (canRate) {
      button.style.display = 'inline-flex';
      button.className = 'kc-btn-primary kc-btn-full';
      button.innerHTML = '<i class="fas fa-star"></i> Avaliar usuário';
      button.onclick = () => openRatingModal(0, '', 'Avaliação enviada.');
      return;
    }

    button.style.display = 'inline-flex';
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-lock"></i> Avaliação indisponível';
    if (hintEl) {
      hintEl.textContent = getUserRatingReasonMessage(statePayload && statePayload.reason);
      hintEl.style.display = 'block';
    }
  }

  function setSeller(post) {
    const card = document.getElementById('sellerCard');
    const avatar = document.getElementById('sellerAvatar');
    const name = document.getElementById('sellerName');
    const handle = document.getElementById('sellerHandle');
    const stats = document.getElementById('sellerStats');
    if (!card || !avatar || !name || !stats) return;

    const normalizedName = post.authorName || post.autor || post.author || '';
    const normalizedAvatar = post.authorAvatar || post.autorAvatar || '';
    const publicHandle = String(post.authorHandle || '').trim()
      || (window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function'
        ? window.KCUtils.buildPublicHandle(normalizedName)
        : '');
    const isLegacyExample = isLegacyExamplePost(post) || isLegacyExampleProfile(post && post.authorProfile);

    const author = normalizedName || 'Autor';
    const avatarUrl = normalizedAvatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '');

    avatar.src = avatarUrl;
    name.innerHTML = esc(author)
      + (post.verificado ? ' <i class="fas fa-check-circle" style="color: var(--kc-green-check);" title="Verificado"></i>' : '')
      + (isLegacyExample ? ' ' + buildLegacyExampleBadgeHtml('Exemplo', 'kc-product-example-ribbon--seller') : '');

    // Handle (@login) abaixo do nome
    if (handle) {
      if (publicHandle) {
        handle.textContent = publicHandle;
        handle.style.display = 'block';
      } else {
        handle.style.display = 'none';
      }
    }

    const items = [];
    const authorProfile = post && post.authorProfile && typeof post.authorProfile === 'object' ? post.authorProfile : null;

    if (isLegacyExample) {
      items.push('<span><i class="fas fa-flask"></i> Perfil de exemplo</span>');
    }

    if (authorProfile && authorProfile.affiliation && shared && typeof shared.formatProfileValue === 'function') {
      const affiliationLabel = shared.formatProfileValue('affiliation', authorProfile.affiliation);
      if (affiliationLabel) {
        items.push('<span><i class="fas fa-user-graduate"></i> ' + esc(affiliationLabel) + '</span>');
      }
    }

    // Engajamento da publicação atual
    if (typeof post.votos === 'number' && post.votos > 0) {
      items.push('<span><i class="fas fa-fire"></i> ' + post.votos + ' voto' + (post.votos !== 1 ? 's' : '') + '</span>');
    }
    if (typeof post.comentarios === 'number' && post.comentarios > 0) {
      items.push('<span><i class="fas fa-comments"></i> ' + post.comentarios + ' coment' + (post.comentarios !== 1 ? 'ários' : 'ário') + '</span>');
    }

    // Membro desde (data de cadastro do perfil)
    if (post.authorCreatedAt) {
      try {
        const d = new Date(post.authorCreatedAt);
        if (!isNaN(d.getTime())) {
          const formatted = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
          items.push('<span><i class="fas fa-calendar-alt"></i> Desde ' + formatted + '</span>');
        }
      } catch (_) { }
    }

    stats.innerHTML = items.join('');
    refreshSellerRatingUI(post, getSellerRatingSummaryFromPost(post), null);
    card.style.display = 'block';
    loadSellerAuthorStats(post, stats, items.slice()).catch(() => {});
  }

  async function loadSellerAuthorStats(post, statsContainer, baseItems) {
    const authorId = getPostAuthorId(post);
    if (!authorId || !statsContainer || !window.KCAPI) return;

    const requestToken = ++sellerStatsRequestToken;

    try {
      const postsPromise = typeof window.KCAPI.getPostsByAuthorId === 'function'
        ? window.KCAPI.getPostsByAuthorId(authorId, { page: 1, limit: 24 })
        : Promise.resolve([]);
      const summaryPromise = typeof window.KCAPI.getUserRatingSummary === 'function'
        ? window.KCAPI.getUserRatingSummary(authorId)
        : Promise.resolve(getSellerRatingSummaryFromPost(post));
      const ratingStatePromise = (currentUser && currentUser.id && typeof window.KCAPI.getUserRatingState === 'function')
        ? window.KCAPI.getUserRatingState({
          targetUserId: authorId,
          contextPostId: getPostIdForMutation(post),
        })
        : Promise.resolve({
          targetUserId: authorId,
          contextPostId: getPostIdForMutation(post),
          canRate: false,
          reason: 'AUTH_REQUIRED',
          myRating: null,
        });

      const [items, summary, ratingState] = await Promise.all([postsPromise, summaryPromise, ratingStatePromise]);
      if (requestToken !== sellerStatsRequestToken) return;

      const currentPostId = String(getPostIdForMutation(post) || '').trim();
      const authorPostCount = (Array.isArray(items) ? items : []).filter(function (item) {
        if (!item) return false;
        const itemId = String((item.uuid || item.id) || '').trim();
        return !currentPostId || itemId !== currentPostId;
      }).length;

      const rows = Array.isArray(baseItems) ? baseItems.slice() : [];
      if (authorPostCount > 0) {
        rows.push('<span><i class="fas fa-layer-group"></i> ' + authorPostCount + ' publicaç' + (authorPostCount === 1 ? 'ão' : 'ões') + '</span>');
      }
      statsContainer.innerHTML = rows.join('');
      refreshSellerRatingUI(post, summary, ratingState);
    } catch (_) { }
  }

  async function enrichPostAuthorFromProfile(post) {
    const authorId = getPostAuthorId(post);
    if (!authorId || !window.KCAPI || typeof window.KCAPI.getProfileById !== 'function') return post;

    let profile = null;
    try {
      profile = await window.KCAPI.getProfileById(authorId);
    } catch (_) {
      profile = null;
    }

    if (!profile) return post;

    const profileName = String(profile.display_name || profile.full_name || '').trim();
    const profileAvatar = String(profile.avatar_url || '').trim();
    const fallbackName = String(post.authorName || post.autor || post.author || '').trim();
    const fallbackAvatar = String(post.authorAvatar || post.autorAvatar || '').trim();
    const publicHandle = window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function'
      ? window.KCUtils.buildPublicHandle(profileName || fallbackName)
      : '';

    const mergedName = profileName || fallbackName || 'Autor';
    const mergedAvatar = profileAvatar
      || fallbackAvatar
      || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '');

    return {
      ...post,
      authorName: mergedName,
      author: mergedName,
      autor: mergedName,
      authorAvatar: mergedAvatar,
      autorAvatar: mergedAvatar,
      verified: profile.verified === true ? true : post.verified,
      verificado: profile.verified === true ? true : post.verificado,
      authorCreatedAt: profile.created_at || post.authorCreatedAt || null,
      authorHandle: publicHandle || post.authorHandle || '',
      authorProfile: profile,
      authorEmail: post.authorEmail || '',
    };
  }

  function normalizeWhatsAppPhone(raw) {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (!digits) return '';
    if (digits.startsWith('55')) return digits;
    return '55' + digits;
  }

  function getPostContactActionLegacy(post) {
    const meta = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
    const moduleKey = String(post.modulo || post.module || '').trim().toLowerCase();
    const categoryKey = String(post.categoria || post.category || '').trim().toLowerCase();

    const whatsappRaw = post.whatsapp || post.whatsappNumber || post.contatoWhatsapp || meta.whatsapp;
    const whatsapp = normalizeWhatsAppPhone(whatsappRaw);
    if (whatsapp) {
      return {
        type: 'whatsapp',
        href: 'https://wa.me/' + encodeURIComponent(whatsapp),
        target: '_blank',
        rel: 'noopener noreferrer',
      };
    }

    const externalUrl = String(post.link || post.externalUrl || post.url || post.formUrl || meta.formUrl || meta.externalUrl || '').trim();
    if (/^https?:\/\//i.test(externalUrl)) {
      return {
        type: 'external_link',
        href: externalUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
      };
    }

    const isOpportunityForm = moduleKey === 'oportunidades' || categoryKey === 'estagio' || categoryKey === 'emprego';
    if (isOpportunityForm && typeof window.openFormModal === 'function') {
      return {
        type: 'real_form',
        handler: () => window.openFormModal({ postId: post.id || post.uuid || null, post }),
      };
    }

    const authorId = getPostAuthorId(post);
    if (authorId) {
      return {
        type: 'open_contact',
        href: 'profile.html?id=' + encodeURIComponent(authorId),
      };
    }

    return {
      type: 'safe_fallback',
      handler: () => {
        toast('Contato indisponível para esta publicação.', 'warn', 2400);
      },
    };
  }

  function reportCtaError(reason, details) {
    const payload = {
      reason: String(reason || 'unknown_cta_error'),
      details: details && typeof details === 'object' ? details : {},
      at: new Date().toISOString(),
      page: window.location && window.location.pathname ? window.location.pathname : 'unknown',
    };
    try {
      console.error('[KC Product][CTA]', payload);
    } catch (_) { }
    try {
      window.dispatchEvent(new CustomEvent('kc:cta-error', { detail: payload }));
    } catch (_) { }
  }

  function setCTALegacy(post) {
    const btn = document.getElementById('primaryCta');
    if (!btn) return;

    const cta = post._kcCTA || { label: 'Entrar em contato', iconClass: 'fas fa-paper-plane' };
    const label = cta.label || 'Entrar em contato';
    const icon = cta.iconClass || 'fas fa-paper-plane';

    btn.innerHTML = `<i class="${esc(icon)}"></i> ${esc(label)}`;
    btn.dataset.kcCtaLabel = label;
    btn.dataset.kcCtaHref = '';
    btn.dataset.kcCtaTarget = '';
    btn.dataset.kcCtaRel = '';
    btn.dataset.kcCtaActionType = '';

    const action = getPostContactAction(post);
    btn.dataset.kcCtaActionType = action.type || 'safe_fallback';

    if (action.href) {
      btn.dataset.kcCtaHref = action.href;
      btn.dataset.kcCtaTarget = action.target || '';
      btn.dataset.kcCtaRel = action.rel || '';
    }

    if (btn.tagName === 'A') {
      btn.setAttribute('href', action.href || '#');
      if (action.target) btn.setAttribute('target', action.target);
      else btn.removeAttribute('target');
      if (action.rel) btn.setAttribute('rel', action.rel);
      else btn.removeAttribute('rel');
    }

    if (btn.dataset.kcCtaBound !== '1') {
      btn.dataset.kcCtaBound = '1';
      btn.addEventListener('click', (event) => {
        try {
          const href = String(btn.dataset.kcCtaHref || '').trim();
          const actionType = String(btn.dataset.kcCtaActionType || '').trim();
          const target = String(btn.dataset.kcCtaTarget || '').trim();

          if (href) {
            if (btn.tagName === 'A') return;
            event.preventDefault();
            if (target === '_blank') {
              window.open(href, '_blank', 'noopener,noreferrer');
            } else {
              window.location.href = href;
            }
            return;
          }

          const liveAction = getPostContactAction(currentPost || post || {});
          if (typeof liveAction.handler === 'function') {
            event.preventDefault();
            liveAction.handler();
            return;
          }

          throw new Error('cta_action_unresolved:' + actionType);
        } catch (error) {
          event.preventDefault();
          reportCtaError('cta_click_failed', {
            message: error && error.message ? String(error.message) : 'unknown',
            postId: (currentPost && (currentPost.id || currentPost.uuid)) || (post && (post.id || post.uuid)) || null,
            module: (currentPost && (currentPost.modulo || currentPost.module)) || null,
            category: (currentPost && (currentPost.categoria || currentPost.category)) || null,
          });
          toast('Não foi possível executar esta ação agora.', 'error', 2400);
        }
      });
    }
  }

  /**
   * Calcula pontuação de relevância entre um candidato e o post atual.
   * Pontuação mais alta = mais relevante.
   */
  function getSavedButtons() {
    return Array.from(document.querySelectorAll('[data-kc-save-kind]'));
  }

  function getSaveKindLabel(kind) {
    if (kind === 'favorite') return 'Favorito';
    if (kind === 'later') return 'Lembrar Depois';
    if (kind === 'highlight') return 'Destaque';
    return '';
  }

  function getSaveKinds() {
    return Array.isArray(savedPostState && savedPostState.kinds)
      ? savedPostState.kinds.slice()
      : [];
  }

  function trackHomeCategoryInteraction(eventType, post) {
    try {
      if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
        window.KCHomeCategories.trackEvent(eventType, { post });
      }
    } catch (_) { }
  }

  function updateSavedButtonsUI() {
    const activeKinds = new Set(getSaveKinds());
    const loading = !!(savedPostState && savedPostState.pending);
    getSavedButtons().forEach((button) => {
      const kind = String(button.getAttribute('data-kc-save-kind') || '').trim();
      const active = !!kind && activeKinds.has(kind);
      button.classList.toggle('is-active', active);
      button.classList.toggle('is-loading', loading);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (loading) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    });

    const trigger = document.getElementById('saveButton');
    const count = document.getElementById('saveButtonCount');
    const totalActive = activeKinds.size;
    if (trigger) {
      trigger.classList.toggle('is-active', totalActive > 0);
      trigger.classList.toggle('is-loading', loading);
      trigger.setAttribute('aria-pressed', totalActive > 0 ? 'true' : 'false');
    }
    if (count) {
      if (totalActive > 0) {
        count.style.display = 'inline-flex';
        count.textContent = String(totalActive);
      } else {
        count.style.display = 'none';
        count.textContent = '0';
      }
    }
  }

  async function refreshViewerState() {
    let profile = null;

    try {
      if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        currentUser = await window.KCAPI.getCurrentUser();
      }
    } catch (_) {
      currentUser = null;
    }

    try {
      if (window.KCAPI && typeof window.KCAPI.getMyProfile === 'function') {
        profile = await window.KCAPI.getMyProfile();
      }
    } catch (_) {
      profile = null;
    }

    if (!profile) {
      try {
        if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
          profile = window.KCProfiles.getCurrentProfile();
        }
      } catch (_) {
        profile = null;
      }
    }

    currentProfile = profile || null;
    applyCommentComposerSessionState(currentUser, currentProfile);
    if (currentPost) {
      setCTA(currentPost);
      setSeller(currentPost);
      maybeResumeQueuedContact(currentPost);
    }
  }

  async function refreshSavedState(post) {
    const postId = getPostIdForMutation(post);
    if (!postId || !window.KCAPI || typeof window.KCAPI.getSavedPostState !== 'function') {
      savedPostState = { kinds: [], loaded: true, pending: false };
      updateSavedButtonsUI();
      return;
    }

    try {
      const result = await window.KCAPI.getSavedPostState(postId);
      savedPostState = {
        kinds: Array.isArray(result && result.kinds)
          ? result.kinds.slice()
          : (result && result.kind ? [String(result.kind)] : []),
        loaded: true,
        pending: false,
      };
    } catch (_) {
      savedPostState = { kinds: [], loaded: true, pending: false };
    }
    updateSavedButtonsUI();
  }

  function bindSavedActions(post) {
    const postId = getPostIdForMutation(post);
    getSavedButtons().forEach((button) => {
      if (button.dataset.kcSaveBound === '1') return;
      button.dataset.kcSaveBound = '1';
      button.addEventListener('click', async () => {
        if (!postId || !window.KCAPI) return;
        if (!currentUser || !currentUser.id) {
          toast('Faça login para salvar esta publicação.', 'warn', 2400);
          return;
        }
        const kind = String(button.getAttribute('data-kc-save-kind') || '').trim();
        if (!kind) return;

        savedPostState = { ...savedPostState, pending: true };
        updateSavedButtonsUI();

        try {
          if (getSaveKinds().includes(kind)) {
            const result = (typeof window.KCAPI.clearSavedPostState === 'function')
              ? await window.KCAPI.clearSavedPostState(postId, kind)
              : { ok: false, error: { message: 'Recurso indisponível.' } };
            if (!result || result.ok === false) {
              const message = result && result.error && result.error.message ? String(result.error.message) : 'Não foi possível remover o item salvo.';
              toast(message, 'error', 2600);
            } else {
              savedPostState = {
                kinds: getSaveKinds().filter((item) => item !== kind),
                loaded: true,
                pending: false,
              };
              toast('Salvamento removido.', 'info', 2000);
            }
          } else {
            const result = (typeof window.KCAPI.setSavedPostState === 'function')
              ? await window.KCAPI.setSavedPostState(postId, kind, true)
              : { ok: false, error: { message: 'Recurso indisponível.' } };
            if (!result || result.ok === false) {
              const message = result && result.error && result.error.message ? String(result.error.message) : 'Não foi possível salvar a publicação.';
              toast(message, 'error', 2600);
            } else {
              savedPostState = {
                kinds: Array.from(new Set(getSaveKinds().concat(kind))),
                loaded: true,
                pending: false,
              };
              toast(`${getSaveKindLabel(kind)} salvo com sucesso.`, 'success', 2200);
              trackHomeCategoryInteraction(kind, post);
            }
          }
        } catch (_) {
          toast('Não foi possível atualizar este salvamento agora.', 'error', 2600);
        } finally {
          savedPostState = { ...savedPostState, pending: false };
          updateSavedButtonsUI();
        }
      });
    });
  }

  let relatedRequestToken = 0;

  function getRelatedReasonLabel(candidate, currentPost) {
    var explicitReason = String(candidate && candidate._kcRelatedReason || '').trim();
    if (explicitReason) return explicitReason;

    var currentAuthorId = getPostAuthorId(currentPost);
    var candidateAuthorId = getPostAuthorId(candidate);
    var currentModule = String(currentPost && (currentPost.modulo || currentPost.module) || '').trim().toLowerCase();
    var candidateModule = String(candidate && (candidate.modulo || candidate.module) || '').trim().toLowerCase();

    if (currentAuthorId && candidateAuthorId && currentAuthorId === candidateAuthorId && currentModule && currentModule === candidateModule) {
      return 'Mesmo autor neste módulo';
    }
    if (currentAuthorId && candidateAuthorId && currentAuthorId === candidateAuthorId) {
      return 'Outro anúncio do mesmo autor';
    }
    if (currentModule && candidateModule && currentModule === candidateModule) {
      return 'Relacionado neste módulo';
    }
    return 'Publicação relacionada';
  }

  function getRelatedImageHtml(post) {
    var images = Array.isArray(post && post.imagens) ? post.imagens : (Array.isArray(post && post.images) ? post.images : []);
    var title = String(post && (post.titulo || post.title) || 'Imagem da publicação').trim() || 'Imagem da publicação';
    var exampleBadge = isLegacyExamplePost(post) ? buildLegacyExampleBadgeHtml('Exemplo', 'kc-product-example-ribbon--related') : '';
    if (images.length) {
      return '<div class="kc-related-card__media">' + exampleBadge + '<img src="' + esc(String(images[0])) + '" alt="' + esc(title) + '" loading="lazy" decoding="async" /></div>';
    }

    var emoji = String(post && post.emoji || '✨').trim() || '✨';
    return '<div class="kc-related-card__media kc-related-card__media--fallback">' + exampleBadge + '<span aria-hidden="true">' + esc(emoji) + '</span></div>';
  }

  function getRelatedPriceLabel(post) {
    var price = post && (post.preco != null ? post.preco : post.price);
    if (price == null || price === '') return '';
    if (typeof price === 'number') return price === 0 ? 'Gratuito' : formatCurrency(price);
    var normalized = String(price).trim();
    return normalized || '';
  }

  function renderRelatedPosts(posts, currentPost) {
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedGrid');
    if (!section || !grid) return;

    var list = Array.isArray(posts) ? posts.filter(Boolean) : [];
    if (!list.length) {
      grid.innerHTML = '';
      section.style.display = 'none';
      return;
    }

    grid.innerHTML = list.map(function (item) {
      var postId = String((item && (item.uuid || item.id)) || '').trim();
      if (!postId) return '';

      var href = 'product.html?id=' + encodeURIComponent(postId);
      var title = String(item && (item.titulo || item.title) || 'Publicação').trim() || 'Publicação';
      var author = String(item && (item.authorName || item.autor || item.author) || 'Autor').trim() || 'Autor';
      var reason = getRelatedReasonLabel(item, currentPost);
      var priceLabel = getRelatedPriceLabel(item);
      var moduleText = moduleLabel(item && (item.modulo || item.module) || '');
      var categoryText = String(item && (item.categoriaLabel || item.categoria || item.categoryLabel || item.category) || '').trim();
      var metaParts = [
        moduleText ? '<span><i class="fas fa-layer-group"></i> ' + esc(moduleText) + '</span>' : '',
        categoryText ? '<span><i class="fas fa-tag"></i> ' + esc(categoryText) + '</span>' : '',
        priceLabel ? '<span><i class="fas fa-money-bill-wave"></i> ' + esc(priceLabel) + '</span>' : '',
      ].filter(Boolean).join('');

      return [
        '<a class="kc-related-card" href="' + href + '">',
        getRelatedImageHtml(item),
        '<div class="kc-related-card__body">',
        '<span class="kc-related-card__reason">' + esc(reason) + '</span>',
        '<h4 class="kc-related-card__title">' + esc(title) + '</h4>',
        '<div class="kc-related-card__author"><i class="fas fa-user"></i> ' + esc(author) + '</div>',
        metaParts ? '<div class="kc-related-card__meta">' + metaParts + '</div>' : '',
        '</div>',
        '</a>',
      ].join('');
    }).filter(Boolean).join('');

    section.style.display = 'block';
  }

  async function setRelated(post) {
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedGrid');
    if (!section || !grid || !post || !window.KCAPI || typeof window.KCAPI.getRelatedPosts !== 'function') {
      if (section) section.style.display = 'none';
      if (grid) grid.innerHTML = '';
      return;
    }

    var currentPostId = getPostIdForMutation(post);
    if (!currentPostId) {
      section.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    var requestToken = ++relatedRequestToken;
    grid.innerHTML = '<div class="kc-related-loading"><i class="fas fa-spinner fa-spin"></i> Carregando publicações relacionadas...</div>';
    section.style.display = 'block';

    try {
      var items = await window.KCAPI.getRelatedPosts(currentPostId, {
        limit: 8,
        module: post.modulo || post.module || '',
        authorId: getPostAuthorId(post),
        currentPost: post,
        viewerAuthenticated: isViewerAuthenticated(),
      });
      if (requestToken !== relatedRequestToken) return;
      renderRelatedPosts(items, post);
    } catch (error) {
      if (requestToken !== relatedRequestToken) return;
      console.warn('[KC Product] related posts:', error);
      grid.innerHTML = '';
      section.style.display = 'none';
    }
  }

  function isAuthor(post, user) {
    if (!post || !user || !user.id) return false;
    const postAuthorId = String(post.autorId || post.authorId || post.author_id || '').trim();
    return !!postAuthorId && postAuthorId === String(user.id).trim();
  }

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }

  function buildEditPayload(form, sourcePost) {
    const tagsRaw = String(form.tags.value || '').trim();
    const metadata = {
      ...(sourcePost && sourcePost.metadata && typeof sourcePost.metadata === 'object' ? sourcePost.metadata : {}),
      ...(form.subcategory.value ? { subcategory: String(form.subcategory.value).trim() } : {}),
      ...(form.condition.value ? { condicao: String(form.condition.value).trim() } : {}),
      ...(form.emoji.value ? { emoji: String(form.emoji.value).trim() } : {}),
    };

    if (tagsRaw) metadata.tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    else delete metadata.tags;

    return {
      title: String(form.title.value || '').trim(),
      description: String(form.description.value || '').trim(),
      module: String(form.module.value || '').trim(),
      category: String(form.category.value || '').trim(),
      location: String(form.location.value || '').trim(),
      price: String(form.price.value || '').trim(),
      metadata,
    };
  }

  function upsertOwnerActions(post, user) {
    const actions = document.querySelector('.kc-product-actions');
    if (!actions) return;

    const canManage = isAuthor(post, user);
    const existing = document.getElementById('ownerActionsWrap');
    if (existing) existing.remove();
    if (!canManage) return;

    const wrap = document.createElement('div');
    wrap.id = 'ownerActionsWrap';
    wrap.style.cssText = 'grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'kc-btn-secondary';
    editBtn.id = 'editPostButton';
    editBtn.innerHTML = '<i class="fas fa-pen"></i> Editar';

    // Status atual do post
    const postStatus = String((post && (post.status || post.estado)) || 'published').toLowerCase();
    const isHidden  = postStatus === 'hidden';
    const isExpired = postStatus === 'expired';
    const isPublished = postStatus === 'published';
    const isPending = postStatus === 'pending'; // v9.3.2: auto-moderação

    // ── Botão Desabilitar / Reativar (apenas para published/hidden) ────────
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'kc-btn-secondary';
    toggleBtn.id = 'togglePostStatusButton';
    toggleBtn.setAttribute('data-post-status', postStatus);
    if (isExpired || isPending) {
      toggleBtn.style.display = 'none'; // oculto para expirados e pendentes
    } else {
      toggleBtn.innerHTML = isHidden
        ? '<i class="fas fa-eye"></i> Reativar anúncio'
        : '<i class="fas fa-eye-slash"></i> Desabilitar anúncio';
    }

    // ── Botão Renovar Publicação (expirado OU hidden) ──────────────────────
    const renewBtn = document.createElement('button');
    renewBtn.type = 'button';
    renewBtn.className = 'kc-btn-secondary';
    renewBtn.id = 'renewPostButton';
    renewBtn.innerHTML = '<i class="fas fa-rotate-right"></i> Renovar publicação';
    renewBtn.style.display = (isExpired || isHidden) ? '' : 'none';

    // ── Botão Impulsionar Hoje (apenas published) ──────────────────────────
    const bumpBtn = document.createElement('button');
    bumpBtn.type = 'button';
    bumpBtn.className = 'kc-btn-secondary';
    bumpBtn.id = 'bumpPostButton';
    const bumpedAt = post && (post.bumped_at || post.bumpedAt);
    const bumpCooldownMs = 1 * 24 * 60 * 60 * 1000;
    const bumpReady = !bumpedAt || (Date.now() - new Date(bumpedAt).getTime() >= bumpCooldownMs);
    bumpBtn.style.display = isPublished ? '' : 'none';
    if (bumpReady) {
      bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionar hoje';
    } else {
      const nextBump = new Date(new Date(bumpedAt).getTime() + bumpCooldownMs);
      bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionar hoje';
      bumpBtn.title = 'Próximo impulso disponível em ' + nextBump.toLocaleDateString('pt-BR');
      bumpBtn.disabled = true;
      bumpBtn.style.opacity = '0.55';
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'kc-btn-secondary';
    deleteBtn.id = 'deletePostButton';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Excluir';

    // ── Badge de status para o dono ────────────────────────────────────────
    const ownerStatusBadge = document.getElementById('ownerStatusBadge');
    if (ownerStatusBadge) ownerStatusBadge.remove();

    if (isPending) {
      // v9.3.2: badge de moderação automática
      const badge = document.createElement('div');
      badge.id = 'ownerStatusBadge';
      badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(59,130,246,.10);border:1px solid rgba(59,130,246,.3);color:#93c5fd;font-size:.9em;margin-bottom:12px;';
      badge.innerHTML = '<i class="fas fa-clock"></i><span>Esta publicação está <strong>em análise</strong> pela moderação e não aparece nos feeds ainda. Você será notificado quando for aprovada.</span>';
      const details = document.querySelector('.kc-product-details');
      if (details) details.insertAdjacentElement('afterbegin', badge);
    } else if (isHidden || isExpired) {
      const badge = document.createElement('div');
      badge.id = 'ownerStatusBadge';
      if (isExpired) {
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(244,67,54,.10);border:1px solid rgba(244,67,54,.30);color:#ef9a9a;font-size:.9em;margin-bottom:12px;';
        const expiresAt = post && (post.expires_at || post.expiresAt);
        const expiryStr = expiresAt ? ' em ' + new Date(expiresAt).toLocaleDateString('pt-BR') : '';
        badge.innerHTML = '<i class="fas fa-calendar-xmark"></i><span>Este anúncio <strong>expirou</strong>' + expiryStr + ' e não aparece nos feeds. Renove-o para voltar a aparecer.</span>';
      } else {
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(239,108,0,.12);border:1px solid rgba(239,108,0,.3);color:#ef6c00;font-size:.9em;margin-bottom:12px;';
        badge.innerHTML = '<i class="fas fa-eye-slash"></i><span>Este anúncio está <strong>desabilitado</strong> e não aparece nos feeds. Apenas você consegue ver esta página.</span>';
      }
      const details = document.querySelector('.kc-product-details');
      if (details) details.insertAdjacentElement('afterbegin', badge);
    } else if (isPublished) {
      // Badge de validade quando expira em menos de 5 dias
      const expiresAt = post && (post.expires_at || post.expiresAt);
      if (expiresAt) {
        const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
        if (daysLeft <= 5 && daysLeft >= 0) {
          const badge = document.createElement('div');
          badge.id = 'ownerStatusBadge';
          badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(255,193,7,.12);border:1px solid rgba(255,193,7,.35);color:#ffc107;font-size:.9em;margin-bottom:12px;';
          badge.innerHTML = '<i class="fas fa-clock"></i><span>Seu anúncio <strong>expira em ' + daysLeft + (daysLeft === 1 ? ' dia' : ' dias') + '</strong>. Renove-o para continuar aparecendo nos feeds.</span>';
          const details = document.querySelector('.kc-product-details');
          if (details) details.insertAdjacentElement('afterbegin', badge);
        }
      }
    }

    wrap.appendChild(editBtn);
    wrap.appendChild(bumpBtn);
    wrap.appendChild(renewBtn);
    wrap.appendChild(toggleBtn);
    wrap.appendChild(deleteBtn);

    const reportBtn = document.getElementById('reportButton');
    if (reportBtn && reportBtn.parentNode === actions) actions.insertBefore(wrap, reportBtn);
    else actions.appendChild(wrap);

    editBtn.addEventListener('click', () => {
      // Usa o kc-create-modal completo em modo edição, se disponível
      if (typeof window.kcOpenEditPostModal === 'function') {
        window.kcOpenEditPostModal(post, async (updatedData) => {
          const next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
            ? window.KCPostModel.from(updatedData, { pageModule: updatedData.modulo || '', view: 'product' })
            : updatedData;
          renderPost(next);
          markPostAsEdited();
          // Log edição no audit_log
          try {
            const client = window.KCSupabase && window.KCSupabase.getClient ? window.KCSupabase.getClient() : null;
            const uid = currentUser && currentUser.id;
            if (client && uid) {
              await client.from('audit_log').insert({
                action: 'post_edited',
                entity_type: 'posts',
                entity_id: String(post.uuid || post.id || ''),
                actor_id: uid,
              });
            }
          } catch (_) { /* silent */ }
        });
        return;
      }
      // Fallback para o modal antigo
      if (!editUI) editUI = buildEditUI();
      editUI.open(post);
    });

    deleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm('Tem certeza que deseja excluir esta publicação?');
      if (!confirmed) return;

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.deletePost === 'function') {
          res = await window.KCAPI.deletePost(getPostIdForMutation(post));
        }
      } catch (_) { }

      if (res && res.ok) {
        try { showToast('Publicação excluída com sucesso.', 'success', 2000); } catch (_) { }
        setTimeout(() => { window.location.href = 'index.html'; }, 300);
        return;
      }

      const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível excluir a publicação.';
      try { showToast(msg, 'error', 2800); } catch (_) { }
    });

    toggleBtn.addEventListener('click', async () => {
      if (toggleBtn.disabled) return;
      toggleBtn.disabled = true;
      const prevHTML = toggleBtn.innerHTML;
      toggleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde…';

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.togglePostStatus === 'function') {
          res = await window.KCAPI.togglePostStatus(getPostIdForMutation(post));
        }
      } catch (_) { }

      toggleBtn.disabled = false;

      if (res && res._kcError === 'POST_LIMIT_REACHED') {
        toggleBtn.innerHTML = prevHTML;
        const limitMsg = res.message || 'Você atingiu o limite de publicações ativas. Desabilite outra publicação antes de reativar esta.';
        try { showToast(limitMsg, 'error', 4000); } catch (_) { }
        return;
      }

      if (res && (res.ok || res.data)) {
        const result = res.data || res;
        const newStatus = String(result.new_status || result.status || '').toLowerCase();
        const nowHidden = newStatus === 'hidden' || newStatus === 'desabilitado';

        // Update button
        toggleBtn.setAttribute('data-post-status', nowHidden ? 'hidden' : 'published');
        toggleBtn.innerHTML = nowHidden
          ? '<i class="fas fa-eye"></i> Reativar anúncio'
          : '<i class="fas fa-eye-slash"></i> Desabilitar anúncio';

        // Update in-memory post status
        if (currentPost) {
          currentPost.status = nowHidden ? 'hidden' : 'published';
          currentPost.estado = currentPost.status;
        }

        // Update owner badge
        const existingBadge = document.getElementById('ownerStatusBadge');
        if (existingBadge) existingBadge.remove();
        if (nowHidden) {
          const badge = document.createElement('div');
          badge.id = 'ownerStatusBadge';
          badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(239,108,0,.12);border:1px solid rgba(239,108,0,.3);color:#ef6c00;font-size:.9em;margin-bottom:12px;';
          badge.innerHTML = '<i class="fas fa-eye-slash"></i><span>Este anúncio está <strong>desabilitado</strong> e não aparece nos feeds. Apenas você consegue ver esta página.</span>';
          const details = document.querySelector('.kc-product-details');
          if (details) details.insertAdjacentElement('afterbegin', badge);
        }

        const toastMsg = nowHidden ? 'Anúncio desabilitado com sucesso.' : 'Anúncio reativado com sucesso.';
        try { showToast(toastMsg, 'success', 2500); } catch (_) { }
        return;
      }

      // Generic error
      toggleBtn.innerHTML = prevHTML;
      const errMsg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível alterar o status do anúncio.';
      try { showToast(errMsg, 'error', 2800); } catch (_) { }
    });

    renewBtn.addEventListener('click', async () => {
      if (renewBtn.disabled) return;
      renewBtn.disabled = true;
      const prevHTML = renewBtn.innerHTML;
      renewBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Renovando…';

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.renewPost === 'function') {
          res = await window.KCAPI.renewPost(getPostIdForMutation(post));
        }
      } catch (_) { }

      renewBtn.disabled = false;

      if (res && (res._kcError === 'POST_LIMIT_REACHED' || res.code === 'LIMIT_REACHED')) {
        renewBtn.innerHTML = prevHTML;
        try { showToast(res.message || 'Limite de publicações ativas atingido.', 'error', 4500); } catch (_) { }
        return;
      }

      if (res && res.ok) {
        if (currentPost) { currentPost.status = 'published'; currentPost.estado = 'published'; }
        // Oculta Renovar, mostra Desabilitar e Impulsionar
        renewBtn.style.display = 'none';
        toggleBtn.style.display = '';
        toggleBtn.setAttribute('data-post-status', 'published');
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Desabilitar anúncio';
        bumpBtn.style.display = '';
        // Remove badge de expirado/oculto
        const existingBadge = document.getElementById('ownerStatusBadge');
        if (existingBadge) existingBadge.remove();
        try { showToast(res.message || 'Publicação renovada! Disponível por mais 30 dias.', 'success', 3000); } catch (_) { }
        return;
      }

      renewBtn.innerHTML = prevHTML;
      const msg = (res && res.message) || (res && res.error && res.error.message) || 'Não foi possível renovar a publicação.';
      try { showToast(msg, 'error', 2800); } catch (_) { }
    });

    bumpBtn.addEventListener('click', async () => {
      if (bumpBtn.disabled) return;
      bumpBtn.disabled = true;
      const prevHTML = bumpBtn.innerHTML;
      bumpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Impulsionando…';

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.bumpPost === 'function') {
          res = await window.KCAPI.bumpPost(getPostIdForMutation(post));
        }
      } catch (_) { }

      if (res && res.ok) {
        bumpBtn.disabled = true;
        bumpBtn.style.opacity = '0.55';
        bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionado!';
        if (currentPost) { currentPost.bumped_at = new Date().toISOString(); }
        try { showToast(res.message || 'Anúncio impulsionado com sucesso!', 'success', 3000); } catch (_) { }
        return;
      }

      bumpBtn.disabled = false;
      bumpBtn.style.opacity = '';
      bumpBtn.innerHTML = prevHTML;
      const msg = (res && res.message) || (res && res.error && res.error.message) || 'Não foi possível impulsionar agora.';
      try { showToast(msg, res && res.code === 'COOLDOWN_ACTIVE' ? 'warn' : 'error', 3500); } catch (_) { }
    });
  }

  function renderPost(post) {
    currentPost = post;
    window.kcCurrentPostContext = post;
    document.body.setAttribute('data-post-module', String(post && (post.modulo || post.module) || ''));
    document.body.setAttribute('data-post-category', String(post && (post._kcTabCategoryKey || post.categoriaKey || post.categoria || post.categoryKey || post.category) || ''));
    document.body.setAttribute('data-post-subcategory', String(post && (post.subcategoriaKey || post.subcategoria || post.subcategoryKey || post.subcategory) || ''));
    document.body.setAttribute('data-post-tags', Array.isArray(post && post.tagKeys) ? post.tagKeys.join(' ') : (Array.isArray(post && post.tags) ? post.tags.join(' ') : ''));
    trackHomeCategoryInteraction('post_open', post);
    hide('notFound');
    const postTitleText = post.titulo || post.title || 'Detalhes';
    setText('postTitle', postTitleText);
    document.title = postTitleText + ' — KinoCampus';
    setOpenGraphTags(post);
    setBreadcrumb(post);
    setBadges(post);
    setGallery(post);
    setPrice(post);
    setLegacyBanner(post);
    setDescription(post);
    setSpecs(post);
    setSeller(post);
    setCTA(post);
    setEventCalendar(post);
    setRelated(post);
    upsertOwnerActions(post, currentUser);
    renderAuthorAnalytics(post, currentUser);
    bindSavedActions(post);
    refreshSavedState(post).catch(() => { });
    maybeResumeQueuedContact(post);
    wireReportButton({ postId: (post && post.uuid) ? post.uuid : post.id, postTitle: post.titulo || post.title || 'Publicação' });
  }

  // ── v9.3.1: Painel de analytics do autor ────────────────────────
  function renderAuthorAnalytics(post, user) {
    if (!isAuthor(post, user)) return;
    var details = document.querySelector('.kc-product-details');
    if (!details) return;

    var existing = document.getElementById('kcAuthorAnalytics');
    if (existing) existing.remove();

    var panel = document.createElement('div');
    panel.id = 'kcAuthorAnalytics';
    panel.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:10px;background:var(--kc-surface-dark, #1a1a22);margin-bottom:12px;font-size:.85em;align-items:center;';
    panel.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--kc-text-dark-secondary, #888);"></i> <span style="color:var(--kc-text-dark-secondary, #888);">Carregando analytics...</span>';

    var actions = document.querySelector('.kc-product-actions');
    if (actions) actions.insertAdjacentElement('afterend', panel);
    else details.insertAdjacentElement('afterbegin', panel);

    var pid = getPostIdForMutation(post);
    if (!pid || !window.KCAPI || typeof window.KCAPI.getPostAnalytics !== 'function') {
      panel.style.display = 'none';
      return;
    }

    window.KCAPI.getPostAnalytics(pid).then(function (res) {
      if (!res || !res.ok) { panel.style.display = 'none'; return; }
      panel.innerHTML =
        _statBadge('fas fa-eye', res.views, 'Views') +
        _statBadge('fas fa-arrow-up', res.votos, 'Votos') +
        _statBadge('fas fa-comment', res.comments, 'Coment.') +
        _statBadge('fas fa-share-nodes', res.shares, 'Compartilh.') +
        _statBadge('fas fa-bookmark', res.saves, 'Salvos') +
        _statBadge('fas fa-hand-pointer', res.coupon_clicks, 'Cliques CTA');
    }).catch(function () { panel.style.display = 'none'; });
  }

  function _statBadge(icon, value, label) {
    var v = Number(value) || 0;
    return '<div style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;background:var(--kc-background-dark, #0f0f13);white-space:nowrap;">' +
      '<i class="' + esc(icon) + '" style="color:var(--kc-primary-brand, #ff6b00);font-size:.9em;"></i> ' +
      '<strong>' + v + '</strong> <span style="color:var(--kc-text-dark-secondary, #888);">' + esc(label) + '</span>' +
      '</div>';
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

    let raw = null;

    // Preferir driver unificado (V8.1.2.4.5): localStorage + seed JSON (+ futuro UUID/backend)
    try {
      if (window.KCAPI && typeof window.KCAPI.getPostById === 'function') {
        raw = await window.KCAPI.getPostById(id);
      }
    } catch (_) { }


    if (!raw) { showNotFound(); return; }

    await refreshViewerState();

    // Contrato único (Model) + regras centrais
    let post = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(raw, { pageModule: (raw && raw.modulo) || '', view: 'product' })
      : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : raw);

    post = await enrichPostAuthorFromProfile(post);

    // V8.1.6.2: Denúncia requer UUID real do post (Supabase). Guardar para o botão/modal.
    const postUuid = (post && post.uuid) ? String(post.uuid)
      : ((raw && raw.uuid) ? String(raw.uuid) : null);
    window.kcCurrentPostUuid = postUuid;
    if (postUuid) document.body.setAttribute('data-post-uuid', postUuid);

    renderPost(post);

    // v9.3.1: track view (fire-and-forget, anti-spam server-side)
    try {
      var viewPostId = (post && post.uuid) ? post.uuid : (post && post.id);
      if (viewPostId && window.KCAPI && typeof window.KCAPI.trackView === 'function') {
        window.KCAPI.trackView(viewPostId).catch(function () {});
      }
    } catch (_trackErr) { /* silenciar */ }

    // V8.1.6.2: wire botão Denunciar (gated por driver + auth)
    // Comments
    if (typeof window.renderComments === 'function') {
      window.renderComments(id, 'commentsContainer');
    }
  }

  function buildEditUI() {
    const overlay = document.createElement('div');
    overlay.className = 'kc-modal-overlay';
    overlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'kc-create-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="kc-create-modal-header">
        <h2 class="kc-create-modal-title">Editar publicação</h2>
        <button type="button" class="kc-modal-close" aria-label="Fechar">×</button>
      </div>
      <div class="kc-create-modal-body">
        <div class="kc-form-group"><label>Título</label><input class="kc-input" name="title" /></div>
        <div class="kc-form-group"><label>Descrição</label><textarea class="kc-input" name="description" rows="4"></textarea></div>
        <div class="kc-form-group"><label>Preço</label><input class="kc-input" name="price" placeholder="Ex.: 99,90" /></div>
        <div class="kc-form-group"><label>Localização</label><input class="kc-input" name="location" /></div>
        <div class="kc-form-group"><label>Módulo</label><input class="kc-input" name="module" /></div>
        <div class="kc-form-group"><label>Categoria</label><input class="kc-input" name="category" /></div>
        <div class="kc-form-group"><label>Subcategoria</label><input class="kc-input" name="subcategory" /></div>
        <div class="kc-form-group"><label>Condição</label><input class="kc-input" name="condition" /></div>
        <div class="kc-form-group"><label>Emoji</label><input class="kc-input" name="emoji" maxlength="4" /></div>
        <div class="kc-form-group"><label>Tags (vírgula)</label><input class="kc-input" name="tags" /></div>
        <div class="kc-create-actions">
          <button type="button" class="kc-btn-secondary" data-action="cancel">Cancelar</button>
          <button type="button" class="kc-btn-primary" data-action="save">Salvar</button>
        </div>
        <div data-role="status" style="margin-top:8px;color:var(--text-muted, #64748b);"></div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtn = modal.querySelector('.kc-modal-close');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    const saveBtn = modal.querySelector('[data-action="save"]');
    const status = modal.querySelector('[data-role="status"]');

    const form = {
      title: modal.querySelector('[name="title"]'),
      description: modal.querySelector('[name="description"]'),
      price: modal.querySelector('[name="price"]'),
      location: modal.querySelector('[name="location"]'),
      module: modal.querySelector('[name="module"]'),
      category: modal.querySelector('[name="category"]'),
      subcategory: modal.querySelector('[name="subcategory"]'),
      condition: modal.querySelector('[name="condition"]'),
      emoji: modal.querySelector('[name="emoji"]'),
      tags: modal.querySelector('[name="tags"]'),
    };

    let editingPost = null;

    function close() {
      overlay.style.display = 'none';
      status.textContent = '';
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }

    function open(post) {
      editingPost = post;
      const md = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
      form.title.value = post.titulo || post.title || '';
      form.description.value = post.descricao || post.description || '';
      form.price.value = (post.preco != null) ? String(post.preco) : '';
      form.location.value = post.location || '';
      form.module.value = post.modulo || post.module || '';
      form.category.value = post.category || post.categoria || '';
      form.subcategory.value = post.subcategoria || md.subcategory || '';
      form.condition.value = post.condicao || md.condicao || '';
      form.emoji.value = post.emoji || md.emoji || '';
      const tags = Array.isArray(post.tags) ? post.tags : (Array.isArray(md.tags) ? md.tags : []);
      form.tags.value = tags.join(', ');

      overlay.style.display = 'flex';
      try { form.title.focus(); } catch (_) { }
    }

    async function save() {
      if (!editingPost || !isAuthor(editingPost, currentUser)) {
        status.textContent = 'Você não tem permissão para editar este post.';
        return;
      }

      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      status.textContent = 'Salvando...';

      const payload = buildEditPayload(form, editingPost);
      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.updatePost === 'function') {
          res = await window.KCAPI.updatePost(getPostIdForMutation(editingPost), payload);
        }
      } catch (_) { }

      if (res && res.ok && res.data) {
        const next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
          ? window.KCPostModel.from(res.data, { pageModule: (res.data && res.data.modulo) || '', view: 'product' })
          : res.data;
        renderPost(next);
        try { showToast('Publicação atualizada com sucesso.', 'success', 2000); } catch (_) { }
        close();
        return;
      }

      const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível atualizar a publicação.';
      status.textContent = msg;
      try { showToast(msg, 'error', 2400); } catch (_) { }
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    saveBtn.addEventListener('click', save);

    return { open, close };
  }

  // ─── Reports UI V8.3.0 — Popover / Bottom-Sheet ──────────────────────────
  // Desktop: popover ancorado ao botão; Mobile: bottom sheet deslizante.
  // Segurança: nenhuma injeção de HTML com dados do usuário (textContent apenas).
  var _reportPopover = null;

  var REPORT_REASONS = [
    { value: 'spam',          label: 'Spam / conteúdo repetitivo',   icon: 'fas fa-ban' },
    { value: 'scam',          label: 'Golpe / fraude',               icon: 'fas fa-exclamation-triangle' },
    { value: 'inappropriate', label: 'Conteúdo impróprio',           icon: 'fas fa-eye-slash' },
    { value: 'hate',          label: 'Ódio / assédio',               icon: 'fas fa-frown' },
    { value: 'illegal',       label: 'Ilegal / proibido',            icon: 'fas fa-gavel' },
    { value: 'duplicate',     label: 'Publicação duplicada',         icon: 'fas fa-copy' },
    { value: 'other',         label: 'Outro motivo',                 icon: 'fas fa-comment-dots' },
  ];

  function wireReportButton(ctx) {
    var btn = document.getElementById('reportButton');
    if (!btn) return;

    if (btn.dataset.kcReportBound === '1') {
      btn.dataset.kcReportPostId = String(ctx.postId || '');
      btn.dataset.kcReportPostTitle = String(ctx.postTitle || 'Publicação');
      return;
    }

    btn.dataset.kcReportBound = '1';
    btn.dataset.kcReportPostId = String(ctx.postId || '');
    btn.dataset.kcReportPostTitle = String(ctx.postTitle || 'Publicação');

    btn.addEventListener('click', async function (e) {
      e.stopPropagation();

      var payloadCtx = {
        postId: btn.dataset.kcReportPostId || ctx.postId,
        postTitle: btn.dataset.kcReportPostTitle || ctx.postTitle,
      };

      var driver = (window.KC_ENV && window.KC_ENV.driver) ? window.KC_ENV.driver : 'local';
      if (driver !== 'supabase') {
        try { showToast('Denúncias disponíveis apenas no modo Supabase.', 'info', 2200); } catch (_) { }
        return;
      }

      // Requer login
      var user = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
          user = await window.KCAPI.getCurrentUser();
        }
      } catch (_) { }

      if (!user) {
        try { showToast('Faça login para denunciar.', 'info', 2200); } catch (_) { }
        try { if (typeof window.kcOpenAuthModal === 'function') window.kcOpenAuthModal(); } catch (_) { }
        return;
      }

      if (!_reportPopover) _reportPopover = buildReportPopover();
      _reportPopover.open(payloadCtx, btn);
    });
  }

  /**
   * buildReportPopover — cria uma vez e reutiliza.
   * Desktop: popover ancorado ao botão clicado.
   * Mobile (≤640px): bottom sheet.
   */
  function buildReportPopover() {
    // ── Backdrop ──────────────────────────────────────────────────
    var backdrop = document.createElement('div');
    backdrop.className = 'kc-report-popover-backdrop';
    backdrop.style.display = 'none';
    document.body.appendChild(backdrop);

    // ── Popover container ──────────────────────────────────────────
    var popover = document.createElement('div');
    popover.className = 'kc-report-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'true');
    popover.setAttribute('aria-label', 'Denunciar publicação');
    popover.style.display = 'none';
    document.body.appendChild(popover);

    // ── Shared elements ────────────────────────────────────────────
    var header = document.createElement('div');
    header.className = 'kc-report-popover-header';

    var headerTitle = document.createElement('h3');

    var headerActions = document.createElement('div');
    headerActions.className = 'kc-report-popover-header-actions';

    var btnBack = document.createElement('button');
    btnBack.type = 'button';
    btnBack.className = 'kc-report-btn-back';
    btnBack.setAttribute('aria-label', 'Voltar');
    btnBack.innerHTML = '<i class=”fas fa-arrow-left”></i>';
    btnBack.style.display = 'none';

    var btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'kc-report-btn-close';
    btnClose.setAttribute('aria-label', 'Fechar');
    btnClose.innerHTML = '<i class=”fas fa-times”></i>';

    headerActions.appendChild(btnBack);
    headerActions.appendChild(btnClose);
    header.appendChild(headerTitle);
    header.appendChild(headerActions);

    var postLabel = document.createElement('div');
    postLabel.className = 'kc-report-post-label';

    // ── Step 1: lista de motivos ───────────────────────────────────
    var stepReasons = document.createElement('div');

    var reasonList = document.createElement('ul');
    reasonList.className = 'kc-report-reason-list';
    reasonList.setAttribute('role', 'listbox');

    REPORT_REASONS.forEach(function (r, idx) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kc-report-reason-item';
      btn.dataset.kcReasonValue = r.value;

      var icon = document.createElement('i');
      icon.className = r.icon;
      icon.setAttribute('aria-hidden', 'true');

      var labelSpan = document.createElement('span');
      labelSpan.textContent = r.label;

      var chevron = document.createElement('i');
      chevron.className = 'fas fa-chevron-right kc-report-chevron';
      chevron.setAttribute('aria-hidden', 'true');

      btn.appendChild(icon);
      btn.appendChild(labelSpan);
      btn.appendChild(chevron);
      li.appendChild(btn);

      // Separador entre itens (exceto último)
      if (idx < REPORT_REASONS.length - 1) {
        var sep = document.createElement('hr');
        sep.className = 'kc-report-reason-separator';
        li.appendChild(sep);
      }

      btn.addEventListener('click', function () {
        goToConfirm(r.value, r.label);
      });

      reasonList.appendChild(li);
    });

    stepReasons.appendChild(reasonList);

    // ── Step 2: confirmação + detalhes ────────────────────────────
    var stepConfirm = document.createElement('div');
    stepConfirm.style.display = 'none';

    var confirmBody = document.createElement('div');
    confirmBody.className = 'kc-report-confirm-body';

    var confirmInfo = document.createElement('p');
    confirmInfo.className = 'kc-report-confirm-info';
    confirmInfo.textContent = 'Deseja confirmar esta denúncia? Adicione detalhes se quiser.';

    var detailsLabel = document.createElement('label');
    detailsLabel.className = 'kc-report-details-label';
    detailsLabel.textContent = 'Detalhes adicionais (opcional, máx. 1000 caracteres)';

    var detailsField = document.createElement('textarea');
    detailsField.className = 'kc-report-details-field';
    detailsField.maxLength = 1000;
    detailsField.placeholder = 'Descreva o problema com mais detalhes…';
    detailsField.rows = 3;

    var statusEl = document.createElement('div');
    statusEl.className = 'kc-report-status';

    var confirmActions = document.createElement('div');
    confirmActions.className = 'kc-report-confirm-actions';

    var btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'kc-btn-secondary';
    btnCancel.textContent = 'Cancelar';

    var btnSubmit = document.createElement('button');
    btnSubmit.type = 'button';
    btnSubmit.className = 'kc-btn-primary';
    btnSubmit.innerHTML = '<i class=”fas fa-flag”></i> Enviar denúncia';

    confirmActions.appendChild(btnCancel);
    confirmActions.appendChild(btnSubmit);

    confirmBody.appendChild(confirmInfo);
    confirmBody.appendChild(detailsLabel);
    confirmBody.appendChild(detailsField);
    confirmBody.appendChild(statusEl);
    confirmBody.appendChild(confirmActions);
    stepConfirm.appendChild(confirmBody);

    // ── Assemble ───────────────────────────────────────────────────
    popover.appendChild(header);
    popover.appendChild(postLabel);
    popover.appendChild(stepReasons);
    popover.appendChild(stepConfirm);

    // ── State ──────────────────────────────────────────────────────
    var currentPostId = null;
    var currentReason = null;

    // ── Positioning (desktop) ──────────────────────────────────────
    function positionPopover(anchorBtn) {
      var isMobile = window.innerWidth <= 640;
      if (isMobile) {
        // bottom sheet: CSS handles it
        popover.style.removeProperty('top');
        popover.style.removeProperty('left');
        popover.style.removeProperty('right');
        return;
      }

      var rect = anchorBtn.getBoundingClientRect();
      var popW = 310; // matches CSS width
      var margin = 8;

      var left = rect.left;
      var top = rect.bottom + margin;

      // Evita sair pela direita
      if (left + popW > window.innerWidth - margin) {
        left = window.innerWidth - popW - margin;
      }
      // Evita sair pela esquerda
      if (left < margin) left = margin;

      // Se não cabe abaixo, abre acima
      var popH = Math.min(popover.scrollHeight || 400, window.innerHeight * 0.8);
      if (top + popH > window.innerHeight - margin) {
        top = rect.top - popH - margin;
        if (top < margin) top = margin;
      }

      popover.style.top = top + 'px';
      popover.style.left = left + 'px';
      popover.style.right = 'auto';
      popover.style.bottom = 'auto';
    }

    // ── Steps ──────────────────────────────────────────────────────
    function showStep1() {
      headerTitle.innerHTML = '<i class=”fas fa-flag” aria-hidden=”true”></i> Denunciar';
      btnBack.style.display = 'none';
      stepReasons.style.display = '';
      stepConfirm.style.display = 'none';
      detailsField.value = '';
      statusEl.textContent = '';
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
    }

    function goToConfirm(reasonValue, reasonLabel) {
      currentReason = reasonValue;
      headerTitle.innerHTML = '<i class=”fas fa-flag” aria-hidden=”true”></i> ' + esc(reasonLabel);
      btnBack.style.display = '';
      stepReasons.style.display = 'none';
      stepConfirm.style.display = '';
      statusEl.textContent = '';
      try { detailsField.focus(); } catch (_) { }
    }

    // ── Open / Close ───────────────────────────────────────────────
    function open(ctx, anchorBtn) {
      currentPostId = ctx.postId;

      var title = String(ctx.postTitle || 'Publicação');
      postLabel.textContent = title;

      showStep1();

      backdrop.style.display = '';
      popover.style.display = '';

      // Positioning must happen after display (to measure dimensions)
      requestAnimationFrame(function () {
        positionPopover(anchorBtn);
      });

      try { reasonList.querySelector('.kc-report-reason-item').focus(); } catch (_) { }
    }

    function closePopover() {
      backdrop.style.display = 'none';
      popover.style.display = 'none';
      currentPostId = null;
      currentReason = null;
      showStep1();
    }

    async function submitReport() {
      if (!currentReason) return;

      btnSubmit.disabled = true;
      btnCancel.disabled = true;
      statusEl.textContent = 'Enviando…';

      var res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.reportPost === 'function') {
          res = await window.KCAPI.reportPost(currentPostId, {
            reason: currentReason,
            details: detailsField.value,
          });
        }
      } catch (e) {
        res = { ok: false, error: { message: 'Falha ao enviar.' } };
      }

      if (res && res.ok) {
        statusEl.textContent = 'Denúncia registrada. Obrigado!';
        statusEl.style.color = 'var(--kc-green-check, #22c55e)';
        try { showToast('Denúncia registrada. Obrigado!', 'success', 2200); } catch (_) { }
        setTimeout(closePopover, 900);
        return;
      }

      var msg = (res && res.error && res.error.message)
        ? String(res.error.message)
        : 'Não foi possível registrar a denúncia.';
      statusEl.textContent = msg;
      statusEl.style.color = '';
      try { showToast(msg, 'error', 2600); } catch (_) { }
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
    }

    // ── Event wiring ───────────────────────────────────────────────
    btnClose.addEventListener('click', closePopover);
    btnCancel.addEventListener('click', closePopover);
    btnBack.addEventListener('click', showStep1);
    btnSubmit.addEventListener('click', submitReport);

    // Fechar ao clicar no backdrop
    backdrop.addEventListener('click', closePopover);

    // Fechar com Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popover.style.display !== 'none') closePopover();
    });

    // Reposicionar no resize (desktop)
    window.addEventListener('resize', function () {
      if (popover.style.display !== 'none' && window.innerWidth > 640) {
        var anchorEl = document.getElementById('reportButton');
        if (anchorEl) positionPopover(anchorEl);
      }
    });

    return { open: open, close: closePopover };
  }
  // ─────────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    wireSharePopover();
    wireSavePopover();
    wireCreateSimilarBtn();
    bindStaticInteractions();
    document.addEventListener('kc:authchange', () => { refreshViewerState().catch(() => { }); });
    document.addEventListener('kc:profilechange', () => {
      if (currentPost) {
        enrichPostAuthorFromProfile(currentPost).then((post) => {
          if (!post) return;
          currentPost = post;
          setSeller(post);
          setCTA(post);
        }).catch(() => { });
      }
      refreshViewerState().catch(() => { });
    });
    loadPost();
  });
})();
