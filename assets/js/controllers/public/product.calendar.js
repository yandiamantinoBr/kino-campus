/**
 * @file product.calendar.js
 * @description Sub-módulo de agenda da página de produto (v11.30.12)
 * Extraído de product.controller.js. Registra window._KCProduct.calendar.
 *
 * Dependências em runtime:
 *   - window._KCProduct  — namespace criado por product.controller.js
 *   - window.KCUtils     — escapeHtml
 *
 * Carregado após product.related.js em _product.html (defer).
 * Execução: IIFE imediata → window._KCProduct.calendar disponível antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  var CALENDAR_POPOVER_DESKTOP_BREAKPOINT = 640;
  var CALENDAR_POPOVER_VIEWPORT_MARGIN = 12;
  var CALENDAR_POPOVER_GAP = 8;
  var calendarViewportBound = false;

  function esc(str) {
    try {
      return window.KCUtils && typeof window.KCUtils.escapeHtml === 'function'
        ? window.KCUtils.escapeHtml(str)
        : String(str || '');
    } catch (_) {
      return String(str || '');
    }
  }

  function clearCalendarPopoverPosition(popover) {
    if (!popover) return;
    popover.style.removeProperty('top');
    popover.style.removeProperty('left');
    popover.style.removeProperty('right');
    popover.style.removeProperty('bottom');
    popover.style.removeProperty('width');
    popover.style.removeProperty('max-width');
  }

  function positionCalendarPopover(anchorBtn) {
    var popover = document.getElementById('calendarPopover');
    var anchor = anchorBtn || document.getElementById('calendarButton');
    if (!popover || !anchor) return;

    if (window.innerWidth <= CALENDAR_POPOVER_DESKTOP_BREAKPOINT) {
      clearCalendarPopoverPosition(popover);
      return;
    }

    var rect = anchor.getBoundingClientRect();
    var viewportMargin = CALENDAR_POPOVER_VIEWPORT_MARGIN;
    var maxWidth = Math.max(180, window.innerWidth - (viewportMargin * 2));
    var preferredWidth = Math.min(330, maxWidth);
    var popoverHeight = Math.min(
      popover.scrollHeight || popover.offsetHeight || 0,
      Math.floor(window.innerHeight * 0.84)
    );

    var left = rect.left;
    if ((left + preferredWidth) > (window.innerWidth - viewportMargin)) {
      left = window.innerWidth - preferredWidth - viewportMargin;
    }
    if (left < viewportMargin) left = viewportMargin;

    var top = rect.bottom + CALENDAR_POPOVER_GAP;
    if ((top + popoverHeight) > (window.innerHeight - viewportMargin)) {
      top = rect.top - popoverHeight - CALENDAR_POPOVER_GAP;
      if (top < viewportMargin) top = viewportMargin;
    }

    popover.style.width = preferredWidth + 'px';
    popover.style.maxWidth = maxWidth + 'px';
    popover.style.top = Math.round(top) + 'px';
    popover.style.left = Math.round(left) + 'px';
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';
  }

  function scheduleCalendarPopoverPosition(anchorBtn) {
    window.requestAnimationFrame(function () {
      var popover = document.getElementById('calendarPopover');
      if (!popover || !popover.classList.contains('active')) return;
      positionCalendarPopover(anchorBtn);
    });
  }

  function syncActiveCalendarPopover() {
    var popover = document.getElementById('calendarPopover');
    if (!popover || !popover.classList.contains('active')) return;
    positionCalendarPopover(document.getElementById('calendarButton'));
  }

  function ensureCalendarPopoverViewportBinding() {
    if (calendarViewportBound) return;
    calendarViewportBound = true;

    var syncScheduled = false;
    var scheduleSync = function () {
      if (syncScheduled) return;
      syncScheduled = true;
      window.requestAnimationFrame(function () {
        syncScheduled = false;
        syncActiveCalendarPopover();
      });
    };

    window.addEventListener('resize', scheduleSync, { passive: true });
    window.addEventListener('scroll', scheduleSync, { passive: true, capture: true });
  }

  function closeExternalPopover(popoverId, backdropId, buttonId) {
    var popover = document.getElementById(popoverId);
    var backdrop = document.getElementById(backdropId);
    var button = document.getElementById(buttonId);
    if (popover) {
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
      clearCalendarPopoverPosition(popover);
    }
    if (backdrop) backdrop.classList.remove('active');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function openCalendarPopover(btn) {
    var popover = document.getElementById('calendarPopover');
    var backdrop = document.getElementById('calendarBackdrop');
    if (!popover) return;
    closeExternalPopover('savePopover', 'saveBackdrop', 'saveButton');
    closeExternalPopover('sharePopover', 'shareBackdrop', 'shareButton');
    popover.classList.add('active');
    popover.setAttribute('aria-hidden', 'false');
    scheduleCalendarPopoverPosition(btn);
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeCalendarPopover() {
    var popover = document.getElementById('calendarPopover');
    var backdrop = document.getElementById('calendarBackdrop');
    var btn = document.getElementById('calendarButton');
    if (popover) {
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
      clearCalendarPopoverPosition(popover);
    }
    if (backdrop) backdrop.classList.remove('active');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function wireCalendarPopover() {
    var calBtn = document.getElementById('calendarButton');
    var backdrop = document.getElementById('calendarBackdrop');
    var closeBtn = document.getElementById('calendarPopoverClose');
    if (!calBtn) return;
    ensureCalendarPopoverViewportBinding();
    calBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var popover = document.getElementById('calendarPopover');
      if (popover && popover.classList.contains('active')) closeCalendarPopover();
      else openCalendarPopover(calBtn);
    });
    if (backdrop) backdrop.addEventListener('click', closeCalendarPopover);
    if (closeBtn) closeBtn.addEventListener('click', closeCalendarPopover);
  }

  function setEventCalendar(post) {
    var moduleKey = String(post && (post.modulo || post.module) || '').trim().toLowerCase();
    var status = String(post && (post.status || post.estado) || '').trim().toLowerCase();

    var prev = document.getElementById('kcEventCalendarWrap');
    if (prev) prev.remove();
    if (moduleKey !== 'eventos' || status === 'closed' || post.isClosed === true) return;

    var meta = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
    var dataEvento = String(meta.data_evento || '').trim();
    var horaEvento = String(meta.hora_evento || '').trim();
    var localizacao = String(meta.localizacao || '').trim();
    var titulo = String(post.titulo || post.title || '').trim();
    var descricao = String(post.descricao || post.description || '').trim().substring(0, 500);

    if (!dataEvento) return;

    var dateParts = dataEvento.split('-');
    if (dateParts.length !== 3) return;

    var startStr;
    var endStr;
    var startIso;
    var endIso;
    var timeParts = horaEvento ? horaEvento.split(':') : null;
    var hasTime = timeParts && timeParts.length >= 2;

    if (hasTime) {
      var hh = String(timeParts[0]).padStart(2, '0');
      var mm = String(timeParts[1]).padStart(2, '0');
      startStr = dateParts[0] + dateParts[1] + dateParts[2] + 'T' + hh + mm + '00';
      startIso = dateParts[0] + '-' + dateParts[1] + '-' + dateParts[2] + 'T' + hh + ':' + mm + ':00';
      var endHour = parseInt(hh, 10) + 1;
      var endYear = dateParts[0];
      var endMonth = dateParts[1];
      var endDay = dateParts[2];
      if (endHour >= 24) {
        endHour -= 24;
        var nextDay = new Date(dateParts[0] + '-' + dateParts[1] + '-' + dateParts[2]);
        nextDay.setDate(nextDay.getDate() + 1);
        endYear = String(nextDay.getFullYear());
        endMonth = String(nextDay.getMonth() + 1).padStart(2, '0');
        endDay = String(nextDay.getDate()).padStart(2, '0');
      }
      var endHH = String(endHour).padStart(2, '0');
      endStr = endYear + endMonth + endDay + 'T' + endHH + mm + '00';
      endIso = endYear + '-' + endMonth + '-' + endDay + 'T' + endHH + ':' + mm + ':00';
    } else {
      startStr = dateParts[0] + dateParts[1] + dateParts[2];
      startIso = dateParts[0] + '-' + dateParts[1] + '-' + dateParts[2];
      var dayAfter = new Date(dateParts[0] + '-' + dateParts[1] + '-' + dateParts[2]);
      dayAfter.setDate(dayAfter.getDate() + 1);
      endStr = String(dayAfter.getFullYear()) +
        String(dayAfter.getMonth() + 1).padStart(2, '0') +
        String(dayAfter.getDate()).padStart(2, '0');
      endIso = String(dayAfter.getFullYear()) + '-' +
        String(dayAfter.getMonth() + 1).padStart(2, '0') + '-' +
        String(dayAfter.getDate()).padStart(2, '0');
    }

    var gParams = new URLSearchParams({ action: 'TEMPLATE', text: titulo, dates: startStr + '/' + endStr });
    if (localizacao) gParams.set('location', localizacao);
    if (descricao) gParams.set('details', descricao);
    var googleUrl = 'https://calendar.google.com/calendar/render?' + gParams.toString();

    var oParams = new URLSearchParams({
      subject: titulo,
      startdt: startIso,
      enddt: endIso,
      path: '/calendar/action/compose',
      rru: 'addevent'
    });
    if (localizacao) oParams.set('location', localizacao);
    if (descricao) oParams.set('body', descricao);
    var outlookUrl = 'https://outlook.live.com/calendar/0/deeplink/compose?' + oParams.toString();

    var safeStr = function (value) {
      return String(value || '').replace(/\r\n|\r|\n/g, ' ').replace(/[,;\\]/g, function (char) {
        return '\\' + char;
      });
    };
    var icsLines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KinoCampus//PT',
      'BEGIN:VEVENT',
      'SUMMARY:' + safeStr(titulo),
      'DTSTART:' + startStr,
      'DTEND:' + endStr
    ];
    if (localizacao) icsLines.push('LOCATION:' + safeStr(localizacao));
    if (descricao) icsLines.push('DESCRIPTION:' + safeStr(descricao));
    icsLines.push('END:VEVENT', 'END:VCALENDAR');
    var icsHref = 'data:text/calendar;charset=utf8,' + encodeURIComponent(icsLines.join('\r\n'));
    var icsFilename = (titulo.replace(/[^\w\u00C0-\u017E ]/g, '').trim().replace(/\s+/g, '-').substring(0, 50) || 'evento') + '.ics';

    var wrap = document.createElement('div');
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

    var primaryCta = document.getElementById('primaryCta');
    if (primaryCta && primaryCta.parentNode) {
      primaryCta.parentNode.insertBefore(wrap, primaryCta.nextSibling);
      wireCalendarPopover();
    }
  }

  window._KCProduct.calendar = {
    closeCalendarPopover: closeCalendarPopover,
    setEventCalendar: setEventCalendar,
  };
})();
