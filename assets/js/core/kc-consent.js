(function () {
  'use strict';

  const VERSION = '2026-06-05';
  const STORAGE_KEY = 'kc_consent_v1';
  const DEFAULT_PREFERENCES = Object.freeze({
    necessary: true,
    preferences: false,
    analytics: false,
    advertising: false,
  });

  const state = {
    preferences: null,
    modalOpen: false,
    returnFocus: null,
    inertSnapshot: [],
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function readRaw() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function normalizePreferences(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return {
      version: String(source.version || VERSION),
      necessary: true,
      preferences: source.preferences === true,
      analytics: source.analytics === true,
      advertising: source.advertising === true,
      updatedAt: String(source.updatedAt || ''),
      source: String(source.source || ''),
    };
  }

  function readPreferences() {
    if (state.preferences) return state.preferences;
    const raw = readRaw();
    if (!raw || raw.version !== VERSION) return null;
    state.preferences = normalizePreferences(raw);
    return state.preferences;
  }

  function writePreferences(next, source) {
    const payload = normalizePreferences({
      ...DEFAULT_PREFERENCES,
      ...(next || {}),
      version: VERSION,
      updatedAt: new Date().toISOString(),
      source: source || 'user',
    });
    state.preferences = payload;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) { }
    dispatchChange(payload);
    return payload;
  }

  function hasConsent(category) {
    const key = String(category || '').trim();
    if (key === 'necessary') return true;
    const prefs = readPreferences();
    if (!prefs) return false;
    return prefs[key] === true;
  }

  function dispatchChange(preferences) {
    try {
      window.dispatchEvent(new CustomEvent('kc:consentchange', {
        detail: { preferences: { ...preferences } },
      }));
    } catch (_) { }
  }

  function lockScroll(active) {
    try {
      if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
        if (active) window.KCOverlayLock.lock('consent-modal');
        else window.KCOverlayLock.unlock('consent-modal');
        return;
      }
      document.body.classList.toggle('kc-modal-open', !!active);
    } catch (_) { }
  }

  function setElementInert(element) {
    state.inertSnapshot.push({
      element,
      hadAttribute: element.hasAttribute('inert'),
      propertyValue: element.inert === true,
    });
    element.setAttribute('inert', '');
    element.inert = true;
  }

  function setBackgroundInert(modal) {
    state.inertSnapshot = [];
    const consentRoot = modal.parentElement;
    Array.prototype.forEach.call(document.body.children, function (element) {
      if (element !== consentRoot) setElementInert(element);
    });
    Array.prototype.forEach.call(consentRoot.children, function (element) {
      if (element !== modal) setElementInert(element);
    });
  }

  function restoreBackgroundInert() {
    state.inertSnapshot.forEach(function (entry) {
      if (!entry.element || !entry.element.isConnected) return;
      if (!entry.hadAttribute) entry.element.removeAttribute('inert');
      entry.element.inert = entry.propertyValue;
    });
    state.inertSnapshot = [];
  }

  function isFocusable(element) {
    if (!element || element.disabled || element.hidden) return false;
    if (element.getAttribute('tabindex') === '-1') return false;
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (!window.getComputedStyle) return true;
    let current = element;
    while (current && current.nodeType === 1) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      current = current.parentElement;
    }
    return true;
  }

  function restoreFocusAfterConsent(candidate) {
    if (candidate && candidate.isConnected && isFocusable(candidate)) {
      candidate.focus();
      return;
    }

    const fallback = document.querySelector('main:not([hidden]), [role="main"]:not([hidden])') || document.body;
    if (!fallback || !fallback.isConnected || typeof fallback.focus !== 'function') return;
    const previousTabIndex = fallback.getAttribute('tabindex');
    if (previousTabIndex === null) fallback.setAttribute('tabindex', '-1');
    fallback.focus({ preventScroll: true });
    if (previousTabIndex === null) {
      fallback.addEventListener('blur', function cleanupFallbackTabIndex() {
        fallback.removeAttribute('tabindex');
      }, { once: true });
    }
  }

  function getModalFocusable(modal) {
    const dialog = modal.querySelector('.kc-consent-modal__card');
    if (!dialog) return [];
    return Array.prototype.slice.call(dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(isFocusable);
  }

  function getLegalHref(file) {
    const isAdmin = String(window.location.pathname || '').indexOf('/admin/') >= 0;
    return isAdmin ? `../${file}` : file;
  }

  function getRootHref(file) {
    const isAdmin = String(window.location.pathname || '').indexOf('/admin/') >= 0;
    const clean = String(file || '').replace(/^\/+/, '');
    return isAdmin ? `../${clean}` : clean;
  }

  function initPlatformFooter() {
    if ($('#kcPlatformFooter') || document.body?.dataset?.kcNoFooter === 'true') return;

    const footer = document.createElement('footer');
    footer.id = 'kcPlatformFooter';
    footer.className = 'kc-platform-footer';
    footer.setAttribute('aria-label', 'Rodapé do KinoCampus');
    footer.innerHTML = [
      '<div class="kc-platform-footer__inner">',
      '  <section class="kc-platform-footer__brand">',
      '    <a class="kc-platform-footer__brand-mark" href="' + getRootHref('index.html') + '" aria-label="KinoCampus - página inicial">',
      '      <i class="fas fa-campground" aria-hidden="true"></i><span>Kino<span>Campus</span></span>',
      '    </a>',
      '    <p>Comunidade digital para publicar, encontrar e organizar oportunidades, eventos, moradias, caronas e itens úteis no contexto da UFG.</p>',
      '  </section>',
      '  <nav class="kc-platform-footer__column" aria-label="Navegação da plataforma">',
      '    <h2>Plataforma</h2>',
      '    <a href="' + getRootHref('index.html') + '">Início</a>',
      '    <a href="' + getRootHref('sobre.html') + '">Sobre</a>',
      '    <a href="' + getRootHref('my-posts.html') + '">Minhas publicações</a>',
      '    <a href="' + getRootHref('create-post.html') + '">Criar publicação</a>',
      '  </nav>',
      '  <nav class="kc-platform-footer__column" aria-label="Módulos do KinoCampus">',
      '    <h2>Módulos</h2>',
      '    <a href="' + getRootHref('achados-perdidos.html') + '">Achados e perdidos</a>',
      '    <a href="' + getRootHref('eventos.html') + '">Eventos</a>',
      '    <a href="' + getRootHref('moradia.html') + '">Moradia</a>',
      '    <a href="' + getRootHref('oportunidades.html') + '">Oportunidades</a>',
      '    <a href="' + getRootHref('compra-venda-feed.html') + '">Compra e venda</a>',
      '    <a href="' + getRootHref('caronas-feed.html') + '">Caronas</a>',
      '  </nav>',
      '  <nav class="kc-platform-footer__column" aria-label="Suporte e conta">',
      '    <h2>Suporte</h2>',
      '    <a href="' + getRootHref('ajuda.html') + '">Central de Ajuda</a>',
      '    <a href="' + getRootHref('settings.html') + '">Configurações</a>',
      '    <a href="' + getRootHref('my-posts.html') + '">Minhas publicações</a>',
      '    <a href="mailto:contato@kinocampus.com.br">contato@kinocampus.com.br</a>',
      '  </nav>',
      '  <nav class="kc-platform-footer__column" aria-label="Transparência e privacidade">',
      '    <h2>Transparência</h2>',
      '    <a href="' + getLegalHref('transparencia.html') + '">Central de Transparência</a>',
      '    <a href="' + getRootHref('editorial.html') + '">Política editorial</a>',
      '    <a href="' + getLegalHref('privacidade.html') + '">Declaração de Privacidade</a>',
      '    <a href="' + getLegalHref('termos.html') + '">Termos de Uso</a>',
      '    <button type="button" data-kc-cookie-preferences>Preferências de cookies</button>',
      '    <a href="' + getRootHref('ajuda.html#solicitacoes-suporte') + '">Solicitações de suporte</a>',
      '  </nav>',
      '</div>',
      '<div class="kc-platform-footer__bottom">',
      '  <span>© 2026 KinoCampus. Plataforma comunitária independente.</span>',
      '  <div class="kc-platform-footer__legal">',
      '    <a href="' + getRootHref('ajuda.html') + '">Contato</a>',
      '    <a href="' + getLegalHref('transparencia.html') + '">Transparência</a>',
      '    <a href="' + getLegalHref('privacidade.html') + '">Privacidade</a>',
      '    <a href="' + getLegalHref('termos.html') + '">Termos de Uso</a>',
      '    <button type="button" data-kc-cookie-preferences>Cookies</button>',
      '  </div>',
      '</div>',
    ].join('');

    const mobileNav = document.querySelector('.kc-mobile-nav');
    if (mobileNav && mobileNav.parentNode) {
      mobileNav.parentNode.insertBefore(footer, mobileNav);
    } else {
      document.body.appendChild(footer);
    }
  }

  function buildMarkup() {
    if ($('#kcConsentRoot')) return;
    const root = document.createElement('div');
    root.id = 'kcConsentRoot';
    root.innerHTML = [
      '<section class="kc-consent-banner" id="kcConsentBanner" role="dialog" aria-live="polite" aria-label="Aviso de privacidade e cookies" data-i18n-aria-label="aria-label.privacy-cookie-notice" hidden>',
      '  <div class="kc-consent-banner__content">',
      '    <strong><i class="fas fa-shield-halved" aria-hidden="true"></i> Privacidade no KinoCampus</strong>',
      '    <p>Usamos dados necessários para manter a plataforma funcionando. Com sua autorização, também usamos preferências, métricas e publicidade controlada para melhorar a experiência.</p>',
      '    <div class="kc-consent-banner__links">',
      `      <a href="${getLegalHref('privacidade.html')}">Declaração de Privacidade</a>`,
      `      <a href="${getLegalHref('termos.html')}">Termos de Uso</a>`,
      '    </div>',
      '  </div>',
      '  <div class="kc-consent-banner__actions">',
      '    <button type="button" class="kc-consent-btn kc-consent-btn--ghost" data-consent-reject>Rejeitar opcionais</button>',
      '    <button type="button" class="kc-consent-btn kc-consent-btn--ghost" data-consent-config>Configurar</button>',
      '    <button type="button" class="kc-consent-btn kc-consent-btn--primary" data-consent-accept>Aceitar todos</button>',
      '  </div>',
      '</section>',
      '<div class="kc-consent-modal" id="kcConsentModal" aria-hidden="true" hidden>',
      '  <div class="kc-consent-modal__backdrop" data-consent-close></div>',
      '  <section class="kc-consent-modal__card" role="dialog" aria-modal="true" aria-labelledby="kcConsentTitle">',
      '    <header class="kc-consent-modal__header">',
      '      <div><span class="kc-consent-kicker">LGPD</span><h2 id="kcConsentTitle">Preferências de cookies</h2></div>',
      '      <button type="button" class="kc-consent-modal__close" aria-label="Fechar preferências" data-i18n-aria-label="aria-label.close-cookie-preferences" data-consent-close><span class="kc-consent-modal__close-glyph" aria-hidden="true">×</span></button>',
      '    </header>',
      '    <div class="kc-consent-modal__body">',
      '      <p>Você controla os usos opcionais. Cookies e dados necessários continuam ativos para autenticação, segurança e funcionamento básico.</p>',
      '      <label class="kc-consent-option is-locked">',
      '        <span><strong>Necessários</strong><small>Autenticação, segurança, sessão, idioma, tema e operação da plataforma.</small></span>',
      '        <input type="checkbox" checked disabled />',
      '      </label>',
      '      <label class="kc-consent-option">',
      '        <span><strong>Preferências</strong><small>Salvam ajustes de experiência que não são essenciais.</small></span>',
      '        <input type="checkbox" id="kcConsentPreferences" />',
      '      </label>',
      '      <label class="kc-consent-option">',
      '        <span><strong>Métricas</strong><small>Ajudam a entender buscas, categorias e uso agregado para melhorar o KinoCampus.</small></span>',
      '        <input type="checkbox" id="kcConsentAnalytics" />',
      '      </label>',
      '      <label class="kc-consent-option">',
      '        <span><strong>Publicidade</strong><small>Permite carregar redes de anúncios como Google AdSense. A personalização individual fica desativada nesta fase.</small></span>',
      '        <input type="checkbox" id="kcConsentAdvertising" />',
      '      </label>',
      '      <p class="kc-consent-modal__note">Anúncios próprios contextuais podem aparecer sem rastrear seu perfil individual. Redes externas, como AdSense, só carregam com publicidade aceita. Veja a <a href="' + getLegalHref('privacidade.html') + '">Declaração de Privacidade</a> e os <a href="' + getLegalHref('termos.html') + '">Termos de Uso</a>.</p>',
      '    </div>',
      '    <footer class="kc-consent-modal__footer">',
      '      <button type="button" class="kc-consent-btn kc-consent-btn--ghost" data-consent-reject>Rejeitar opcionais</button>',
      '      <button type="button" class="kc-consent-btn kc-consent-btn--primary" data-consent-save>Salvar preferências</button>',
      '    </footer>',
      '  </section>',
      '</div>',
    ].join('');
    document.body.appendChild(root);
  }

  function setBannerVisible(active) {
    const banner = $('#kcConsentBanner');
    if (!banner) return;
    banner.hidden = !active;
    banner.classList.toggle('is-visible', !!active);
  }

  function setModalVisible(active) {
    const modal = $('#kcConsentModal');
    if (!modal) return;
    const wasOpen = state.modalOpen;
    state.modalOpen = !!active;
    modal.hidden = !active;
    modal.classList.toggle('is-visible', !!active);
    modal.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (active) {
      if (!wasOpen) setBackgroundInert(modal);
      lockScroll(true);
      const prefs = readPreferences() || DEFAULT_PREFERENCES;
      const preferencesInput = $('#kcConsentPreferences');
      const analyticsInput = $('#kcConsentAnalytics');
      const advertisingInput = $('#kcConsentAdvertising');
      if (preferencesInput) preferencesInput.checked = prefs.preferences === true;
      if (analyticsInput) analyticsInput.checked = prefs.analytics === true;
      if (advertisingInput) advertisingInput.checked = prefs.advertising === true;
      setTimeout(function () {
        const target = $('#kcConsentPreferences') || $('[data-consent-save]');
        if (target && typeof target.focus === 'function') target.focus();
      }, 20);
    } else if (wasOpen) {
      lockScroll(false);
      restoreBackgroundInert();
      const returnFocus = state.returnFocus;
      state.returnFocus = null;
      restoreFocusAfterConsent(returnFocus);
    }
  }

  function dismissConsentUi() {
    const root = $('#kcConsentRoot');
    const activeElement = document.activeElement;
    const wasModalOpen = state.modalOpen;
    setBannerVisible(false);
    setModalVisible(false);
    if (!wasModalOpen && root && root.contains(activeElement)) {
      restoreFocusAfterConsent(null);
    }
  }

  function acceptAll(source) {
    writePreferences({ preferences: true, analytics: true, advertising: true }, source || 'accept_all');
    dismissConsentUi();
  }

  function rejectOptional(source) {
    writePreferences({ preferences: false, analytics: false, advertising: false }, source || 'reject_optional');
    dismissConsentUi();
  }

  function saveFromModal() {
    writePreferences({
      preferences: $('#kcConsentPreferences')?.checked === true,
      analytics: $('#kcConsentAnalytics')?.checked === true,
      advertising: $('#kcConsentAdvertising')?.checked === true,
    }, 'custom');
    dismissConsentUi();
  }

  function openPreferences(trigger) {
    buildMarkup();
    if (!state.modalOpen) {
      state.returnFocus = trigger && trigger.isConnected ? trigger : document.activeElement;
    }
    setModalVisible(true);
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest ? event.target.closest('[data-consent-accept],[data-consent-reject],[data-consent-config],[data-consent-save],[data-consent-close],[data-kc-cookie-preferences]') : null;
      if (!target) return;
      if (target.hasAttribute('data-kc-cookie-preferences')) {
        event.preventDefault();
        openPreferences(target);
        return;
      }
      if (target.hasAttribute('data-consent-accept')) {
        event.preventDefault();
        acceptAll('accept_all');
        return;
      }
      if (target.hasAttribute('data-consent-reject')) {
        event.preventDefault();
        rejectOptional('reject_optional');
        return;
      }
      if (target.hasAttribute('data-consent-config')) {
        event.preventDefault();
        openPreferences(target);
        return;
      }
      if (target.hasAttribute('data-consent-save')) {
        event.preventDefault();
        saveFromModal();
        return;
      }
      if (target.hasAttribute('data-consent-close')) {
        event.preventDefault();
        setModalVisible(false);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (!state.modalOpen) return;
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        setModalVisible(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = $('#kcConsentModal');
      const dialog = modal && modal.querySelector('.kc-consent-modal__card');
      if (!dialog) return;
      const focusable = getModalFocusable(modal);
      if (!focusable.length) {
        event.preventDefault();
        dialog.setAttribute('tabindex', '-1');
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function init() {
    buildMarkup();
    initPlatformFooter();
    bindEvents();
    if (!readPreferences()) setBannerVisible(true);
  }

  window.KCConsent = Object.freeze({
    VERSION,
    STORAGE_KEY,
    getPreferences: function () {
      const prefs = readPreferences();
      return prefs ? { ...prefs } : null;
    },
    hasConsent,
    openPreferences,
    setPreferences: writePreferences,
    acceptAll,
    rejectOptional,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
