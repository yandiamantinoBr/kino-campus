(function () {
  'use strict';

  const DESKTOP_MEDIA = '(min-width: 769px)';
  const STORAGE_KEY = 'kc-feed-accordion';

  function normalizeText(value) {
    if (typeof window !== 'undefined' && window.KCUtils && typeof window.KCUtils.normalizeText === 'function') {
      return window.KCUtils.normalizeText(value);
    }
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function slugifyText(value) {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    return normalized
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getUrlObject() {
    try {
      return new URL(window.location.href);
    } catch (_) {
      return null;
    }
  }

  function getSearchParams() {
    const url = getUrlObject();
    return url ? url.searchParams : new URLSearchParams();
  }

  function updateSearchParams(mutator) {
    if (typeof mutator !== 'function') return;
    const url = getUrlObject();
    if (!url) return;
    mutator(url.searchParams);
    const query = url.searchParams.toString();
    const nextUrl = url.pathname + (query ? ('?' + query) : '') + (url.hash || '');
    try {
      window.history.replaceState(null, '', nextUrl);
    } catch (_) { }
  }

  function readTextParam(params, key) {
    if (!params || !key || typeof params.get !== 'function') return '';
    return String(params.get(key) || '').trim();
  }

  function writeTextParam(params, key, value) {
    if (!params || !key) return;
    const next = String(value || '').trim();
    if (next) params.set(key, next);
    else params.delete(key);
  }

  function readNumberParam(params, key) {
    const raw = readTextParam(params, key).replace(',', '.');
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function writeNumberParam(params, key, value) {
    if (!params || !key) return;
    if (value == null || value === '') {
      params.delete(key);
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      params.delete(key);
      return;
    }
    params.set(key, String(numeric));
  }

  function readBooleanParam(params, key) {
    const raw = normalizeText(readTextParam(params, key));
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'sim';
  }

  function writeBooleanParam(params, key, value) {
    if (!params || !key) return;
    if (value === true) params.set(key, '1');
    else params.delete(key);
  }

  function readListParam(params, key) {
    const raw = readTextParam(params, key);
    if (!raw) return [];
    return Array.from(new Set(
      raw
        .split(',')
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    ));
  }

  function writeListParam(params, key, values) {
    if (!params || !key) return;
    const list = Array.from(new Set((Array.isArray(values) ? values : [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)));
    if (!list.length) {
      params.delete(key);
      return;
    }
    params.set(key, list.join(','));
  }

  const FEED_DATE_TIMEZONE = 'America/Sao_Paulo';
  const FEED_DATE_PRESETS = Object.freeze({
    'compra-venda': Object.freeze(['today', 'last7d', 'last30d']),
    livros: Object.freeze(['today', 'last7d', 'last30d']),
    moradia: Object.freeze(['today', 'last7d', 'last30d']),
    oportunidades: Object.freeze(['today', 'last7d', 'last30d']),
    'achados-perdidos': Object.freeze(['today', 'last7d', 'last30d']),
    caronas: Object.freeze(['today', 'last3d', 'last7d']),
    eventos: Object.freeze(['today', 'next7d', 'thisMonth', 'past']),
  });

  function padNumber(value) {
    return String(Math.max(0, parseInt(String(value || '0'), 10) || 0)).padStart(2, '0');
  }

  function formatDateKeyParts(year, month, day) {
    const y = parseInt(String(year || '0'), 10);
    const m = parseInt(String(month || '0'), 10);
    const d = parseInt(String(day || '0'), 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || y <= 0 || m <= 0 || d <= 0) return '';
    return `${String(y).padStart(4, '0')}-${padNumber(m)}-${padNumber(d)}`;
  }

  function parseDateKey(dateKey) {
    const match = String(dateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[3], 10),
    };
  }

  function shiftDateKey(dateKey, deltaDays) {
    const parsed = parseDateKey(dateKey);
    if (!parsed) return '';
    const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
    base.setUTCDate(base.getUTCDate() + (parseInt(String(deltaDays || '0'), 10) || 0));
    return formatDateKeyParts(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
  }

  function getDateFormatter() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: FEED_DATE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch (_) {
      return null;
    }
  }

  function getDateKeyInZone(input) {
    if (!input) return '';
    const date = input instanceof Date ? input : new Date(input);
    if (!date || Number.isNaN(date.getTime())) return '';
    const formatter = getDateFormatter();
    if (formatter && typeof formatter.formatToParts === 'function') {
      const parts = formatter.formatToParts(date);
      const bag = {};
      parts.forEach((part) => {
        if (part && part.type) bag[part.type] = part.value;
      });
      return formatDateKeyParts(bag.year, bag.month, bag.day);
    }
    return formatDateKeyParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function getCurrentDateKey(nowValue) {
    return getDateKeyInZone(nowValue || new Date());
  }

  function getCurrentMonthKey(nowValue) {
    return String(getCurrentDateKey(nowValue) || '').slice(0, 7);
  }

  function getAllowedDatePresets(moduleKey) {
    const key = normalizeText(moduleKey);
    if (!key) return [];
    return FEED_DATE_PRESETS[key] ? FEED_DATE_PRESETS[key].slice() : [];
  }

  function normalizeDatePreset(moduleKey, value) {
    const allowed = getAllowedDatePresets(moduleKey);
    const normalized = normalizeText(value);
    if (!normalized || !allowed.length) return '';
    return allowed.includes(normalized) ? normalized : '';
  }

  function readPresetParam(params, key, allowedValues) {
    const raw = readTextParam(params, key);
    if (!raw) return '';
    const normalized = normalizeText(raw);
    const allowed = Array.isArray(allowedValues)
      ? allowedValues.map((entry) => normalizeText(entry)).filter(Boolean)
      : [];
    if (!allowed.length) return normalized;
    return allowed.includes(normalized) ? normalized : '';
  }

  function writePresetParam(params, key, value, allowedValues) {
    if (!params || !key) return;
    const normalized = normalizeText(value);
    const allowed = Array.isArray(allowedValues)
      ? allowedValues.map((entry) => normalizeText(entry)).filter(Boolean)
      : [];
    if (!normalized || (allowed.length && !allowed.includes(normalized))) {
      params.delete(key);
      return;
    }
    params.set(key, normalized);
  }

  function getEventDateKey(post) {
    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    const meta = (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata))
      ? source.metadata
      : {};
    const raw = [
      meta.data_evento,
      meta.dataEvento,
      meta.data,
      source.data_evento,
      source.dataEvento,
      source.data,
    ].find((entry) => String(entry || '').trim());
    const text = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    return getDateKeyInZone(source.created_at || source.createdAt || source.timestamp || null);
  }

  function matchesDatePreset(options) {
    const opt = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const moduleKey = normalizeText(opt.moduleKey || opt.module || opt.pageModule);
    const preset = normalizeDatePreset(moduleKey, opt.preset);
    if (!preset) return true;

    const todayKey = getCurrentDateKey(opt.now || new Date());
    if (!todayKey) return true;

    const createdKey = opt.createdKey || getDateKeyInZone(opt.createdAt || opt.created_at || null);
    const eventKey = opt.eventKey || getEventDateKey(opt.post || opt);
    const candidateKey = moduleKey === 'eventos' ? eventKey : createdKey;
    if (!candidateKey) return false;

    if (preset === 'today') return candidateKey === todayKey;
    if (preset === 'last3d') return candidateKey >= shiftDateKey(todayKey, -2) && candidateKey <= todayKey;
    if (preset === 'last7d') return candidateKey >= shiftDateKey(todayKey, -6) && candidateKey <= todayKey;
    if (preset === 'last30d') return candidateKey >= shiftDateKey(todayKey, -29) && candidateKey <= todayKey;
    if (preset === 'next7d') return candidateKey >= todayKey && candidateKey <= shiftDateKey(todayKey, 6);
    if (preset === 'thisMonth') return String(candidateKey).slice(0, 7) === getCurrentMonthKey(opt.now || new Date());
    if (preset === 'past') return candidateKey < todayKey;
    return true;
  }

  function readCoreState() {
    const params = getSearchParams();
    return {
      query: readTextParam(params, 'q'),
      category: readTextParam(params, 'tab') || readTextParam(params, 'tag'),
    };
  }

  function writeCoreState(nextState) {
    const state = (nextState && typeof nextState === 'object' && !Array.isArray(nextState)) ? nextState : {};
    const query = String(state.query || '').trim();
    const category = String(state.category || '').trim();
    const normalizedCategory = normalizeText(category);

    updateSearchParams((params) => {
      writeTextParam(params, 'q', query);
      if (!category || normalizedCategory === 'toda' || normalizedCategory === 'todas') {
        params.delete('tab');
      } else {
        params.set('tab', category);
      }
      if (params.has('tag')) params.delete('tag');
    });
  }

  function getStorage() {
    try {
      return window.sessionStorage || null;
    } catch (_) {
      return null;
    }
  }

  function readAccordionState() {
    const storage = getStorage();
    if (!storage) return {};
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeAccordionState(nextState) {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(nextState || {}));
    } catch (_) { }
  }

  function getSectionKey(sidebar, section, index) {
    const sidebarKey = slugifyText(
      sidebar && (
        sidebar.getAttribute('data-kc-opp-sidebar') ||
        sidebar.getAttribute('data-kc-market-sidebar') ||
        sidebar.getAttribute('data-kc-housing-sidebar') ||
        sidebar.getAttribute('data-kc-achados-sidebar') ||
        sidebar.getAttribute('data-kc-eventos-sidebar') ||
        sidebar.getAttribute('data-kc-caronas-sidebar') ||
        sidebar.className ||
        'sidebar'
      )
    ) || 'sidebar';

    const sectionKey = slugifyText(
      section && (
        section.getAttribute('data-kc-opp-section') ||
        section.getAttribute('data-kc-market-section') ||
        section.getAttribute('data-kc-housing-section') ||
        section.getAttribute('data-kc-achados-section') ||
        section.getAttribute('data-kc-eventos-section') ||
        section.getAttribute('data-kc-caronas-section') ||
        section.getAttribute('id') ||
        'section-' + index
      )
    ) || ('section-' + index);

    return `${window.location.pathname || '/'}::${sidebarKey}::${sectionKey}`;
  }

  function getSectionHeader(section) {
    const children = Array.from(section.children || []);
    return children.find((node) => {
      return !!(node && node.matches && node.matches('.kc-sidebar-section-head, h3'));
    }) || null;
  }

  function ensureAccordionBody(section, header) {
    let body = Array.from(section.children || []).find((node) => {
      return !!(node && node.classList && node.classList.contains('kc-sidebar-section__body'));
    }) || null;
    if (body) return body;

    body = document.createElement('div');
    body.className = 'kc-sidebar-section__body';
    const children = Array.from(section.children || []);
    children.forEach((node) => {
      if (node === header) return;
      body.appendChild(node);
    });
    section.appendChild(body);
    return body;
  }

  function ensureAccordionHeader(section, header) {
    if (header && header.matches && header.matches('.kc-sidebar-section-head')) {
      header.classList.add('kc-sidebar-section-head--accordion');
      return header;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'kc-sidebar-section-head kc-sidebar-section-head--accordion';
    section.insertBefore(wrapper, header);
    wrapper.appendChild(header);
    return wrapper;
  }

  function ensureToggleButton(headerWrap) {
    let toggle = headerWrap.querySelector('[data-kc-sidebar-toggle="true"]');
    if (toggle) return toggle;

    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'kc-sidebar-section__toggle';
    toggle.setAttribute('data-kc-sidebar-toggle', 'true');
    toggle.setAttribute('aria-label', 'Alternar secao');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.innerHTML = '<i class="fas fa-chevron-up" aria-hidden="true"></i>';
    headerWrap.appendChild(toggle);
    return toggle;
  }

  function bindDesktopAccordion(options) {
    const opt = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const sidebarSelector = opt.sidebarSelector || '.kc-sidebar';
    const sectionSelector = opt.sectionSelector || '.kc-sidebar-section';
    const media = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
      ? window.matchMedia(DESKTOP_MEDIA)
      : null;

    if (!media) return { refresh: function () {} };

    const accordionState = readAccordionState();
    const sections = Array.from(document.querySelectorAll(`${sidebarSelector} ${sectionSelector}`));

    sections.forEach((section, index) => {
      if (!section || section.getAttribute('data-kc-feed-accordion-ready') === 'true') return;
      const sidebar = section.closest(sidebarSelector);
      const header = getSectionHeader(section);
      if (!sidebar || !header) return;

      const headerWrap = ensureAccordionHeader(section, header);
      const body = ensureAccordionBody(section, headerWrap);
      const toggle = ensureToggleButton(headerWrap);
      const sectionKey = getSectionKey(sidebar, section, index);

      const setCollapsed = (collapsed, persist) => {
        const shouldCollapse = !!collapsed && media.matches;
        section.classList.toggle('is-collapsed', shouldCollapse);
        body.hidden = shouldCollapse;
        toggle.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
        if (persist !== false) {
          accordionState[sectionKey] = !!collapsed;
          writeAccordionState(accordionState);
        }
      };

      toggle.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!media.matches) return;
        setCollapsed(!section.classList.contains('is-collapsed'), true);
      });

      setCollapsed(accordionState[sectionKey] === true, false);
      section.setAttribute('data-kc-feed-accordion-ready', 'true');
    });

    const applyBreakpointState = () => {
      sections.forEach((section, index) => {
        if (!section) return;
        const sidebar = section.closest(sidebarSelector);
        const body = Array.from(section.children || []).find((node) => {
          return !!(node && node.classList && node.classList.contains('kc-sidebar-section__body'));
        }) || null;
        const toggle = section.querySelector('[data-kc-sidebar-toggle="true"]');
        if (!sidebar || !body || !toggle) return;
        const sectionKey = getSectionKey(sidebar, section, index);
        const collapsed = accordionState[sectionKey] === true;
        if (!media.matches) {
          section.classList.remove('is-collapsed');
          body.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
          return;
        }
        section.classList.toggle('is-collapsed', collapsed);
        body.hidden = collapsed;
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    };

    if (typeof media.addEventListener === 'function') media.addEventListener('change', applyBreakpointState);
    else if (typeof media.addListener === 'function') media.addListener(applyBreakpointState);

    applyBreakpointState();

    return { refresh: applyBreakpointState };
  }

  window.KCFeedFilters = Object.freeze({
    normalizeText,
    slugifyText,
    getSearchParams,
    updateSearchParams,
    readTextParam,
    readNumberParam,
    writeTextParam,
    writeNumberParam,
    readBooleanParam,
    writeBooleanParam,
    readListParam,
    writeListParam,
    readPresetParam,
    writePresetParam,
    getAllowedDatePresets,
    normalizeDatePreset,
    getDateKeyInZone,
    getEventDateKey,
    getCurrentDateKey,
    matchesDatePreset,
    readCoreState,
    writeCoreState,
    bindDesktopAccordion,
  });

  document.addEventListener('DOMContentLoaded', function () {
    const mode = (document.body && document.body.getAttribute('data-kc-filters')) || '';
    if (mode === 'tab-search') bindDesktopAccordion();
  });
})();
