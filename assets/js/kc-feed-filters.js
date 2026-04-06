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
    writeTextParam,
    readBooleanParam,
    writeBooleanParam,
    readListParam,
    writeListParam,
    readCoreState,
    writeCoreState,
    bindDesktopAccordion,
  });

  document.addEventListener('DOMContentLoaded', function () {
    const mode = (document.body && document.body.getAttribute('data-kc-filters')) || '';
    if (mode === 'tab-search') bindDesktopAccordion();
  });
})();
