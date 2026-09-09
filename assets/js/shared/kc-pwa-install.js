/*
  KinoCampus - kc-pwa-install.js (v1.0.0)

  Instalação do KinoCampus como app (PWA) em qualquer navegador:
    - Chrome/Edge (Chromium): captura beforeinstallprompt e chama prompt() no clique.
    - Safari iOS/iPadOS: instruções guiadas (Compartilhar > Adicionar à Tela de Início).
    - Firefox (Android/desktop): instruções guiadas (menu > Instalar).
    - Demais navegadores: instruções genéricas do menu do navegador.

  Responsabilidades:
    1. Capturar cedo o evento beforeinstallprompt (o módulo é carregado com defer).
    2. Injetar o card "Instalar o KinoCampus" no drawer mobile (#mobileMenuDrawer),
       com visual alinhado ao kc-context-pitch-card e botão de fechar persistente
       (localStorage; versão incrementada volta a exibir).
    3. Hidratar qualquer bloco declarativo [data-kc-install] (ex.: card da página
       /configuracoes), sem acoplamento com controllers.

  Contrato declarativo:
    [data-kc-install="prompt"]   — botão que dispara a instalação (ou mostra passos).
    [data-kc-install="dismiss"]  — fecha o card do drawer (persiste a decisão).
    [data-kc-install-steps]      — container onde os passos manuais são renderizados.
    [data-kc-install-status]     — linha de status (ex.: "App instalado").

  Exposição: window.KCPwaInstall
*/
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var DISMISS_KEY = 'kc_pwa_drawer_install_dismissed_v1';

  var deferredPrompt = null;
  var promptConsumed = false;
  var installed = false;
  var cardMounted = false;

  // ── Utilitários ────────────────────────────────────────────────────────────

  function safeLocalStorage() {
    try {
      var store = window.localStorage;
      var probe = '__kc_pwa_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch (_) {
      return null;
    }
  }

  function readDismissed() {
    var store = safeLocalStorage();
    if (!store) return false;
    try {
      return String(store.getItem(DISMISS_KEY) || '') === '1';
    } catch (_) {
      return false;
    }
  }

  function writeDismissed() {
    var store = safeLocalStorage();
    if (!store) return;
    try {
      store.setItem(DISMISS_KEY, '1');
    } catch (_) { /* modo privado sem storage: apenas não persiste */ }
  }

  function isStandalone() {
    var standaloneByMedia = false;
    try {
      standaloneByMedia = window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: minimal-ui)').matches;
    } catch (_) { /* matchMedia indisponível */ }
    // iOS Safari expõe navigator.standalone quando rodando da tela de início.
    var standaloneByNavigator = !!(navigator && navigator.standalone === true);
    return standaloneByMedia || standaloneByNavigator;
  }

  /*
    Plataformas relevantes para o fluxo de instalação manual:
      ios        — Safari/Chrome no iPhone/iPad (ambos usam o fluxo do Safari)
      android    — Chrome, Edge, Samsung Internet, Firefox etc. no Android
      desktop    — desktop sem beforeinstallprompt (Firefox desktop, Safari macOS)
  */
  function detectPlatform(userAgentOverride) {
    var ua = String(userAgentOverride || (navigator && navigator.userAgent) || '');
    var isIOS = /iPad|iPhone|iPod/.test(ua)
      || (/Macintosh/.test(ua) && navigator && navigator.maxTouchPoints > 1); // iPadOS 13+ se faz passar por Mac
    if (isIOS) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }

  function buildInstructions(platformOverride) {
    var platform = platformOverride || detectPlatform();
    if (platform === 'ios') {
      return {
        platform: platform,
        title: 'No iPhone/iPad (Safari):',
        steps: [
          'Toque no botão de compartilhar (quadrado com seta para cima) na barra do Safari.',
          'Role a lista e toque em "Adicionar à Tela de Início".',
          'Confirme em "Adicionar" (canto superior direito).',
        ],
      };
    }
    if (platform === 'android') {
      return {
        platform: platform,
        title: 'No Android:',
        steps: [
          'Abra o menu do navegador (tres pontos, canto superior direito).',
          'Toque em "Instalar app", "Adicionar à tela de início" ou "Adicionar à Tela de Início".',
          'Confirme a instalação.',
        ],
      };
    }
    return {
      platform: platform,
      title: 'No computador:',
      steps: [
        'Procure o ícone de instalação na barra de endereço do navegador.',
        'Clique nele e confirme em "Instalar".',
        'No Firefox/Safari, use o menu do navegador > "Instalar" ou "Adicionar ao Dock".',
      ],
    };
  }

  // ── Ciclo de vida da instalação ────────────────────────────────────────────

  // Reconcilia toda a UI com o estado atual (chamado nos eventos de ciclo de
  // vida e na abertura do drawer).
  function syncAll() {
    var status = getStatus();
    if (status.installed) {
      markInstalledState();
      return;
    }
    syncDrawerCard();
  }

  function onBeforeInstallPrompt(event) {
    // Sem preventDefault o Chromium mostraria o mini-infobar próprio; queremos
    // o nosso card no menu (mesma abordagem do prompt customizado).
    event.preventDefault();
    deferredPrompt = event;
    promptConsumed = false;
    emit('kc:pwa-available');
    syncAll();
  }

  function onAppInstalled() {
    installed = true;
    deferredPrompt = null;
    emit('kc:pwa-installed');
    syncAll();
  }

  function emit(name) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: { version: VERSION } }));
    } catch (_) { /* ambientes sem CustomEvent (testes) */ }
  }

  function getStatus() {
    var standalone = isStandalone();
    var platform = detectPlatform();
    return {
      version: VERSION,
      platform: platform,
      standalone: standalone,
      installed: installed || standalone,
      canPrompt: !!(deferredPrompt && !promptConsumed),
      instructions: buildInstructions(platform),
      drawerDismissed: readDismissed(),
    };
  }

  function promptInstall() {
    if (installed || isStandalone()) {
      return Promise.resolve({ ok: false, reason: 'already-installed' });
    }
    if (!deferredPrompt || promptConsumed) {
      // Sem API (iOS, Firefox, critérios não atendidos): o chamador mostra os passos.
      return Promise.resolve({ ok: false, reason: 'manual' });
    }
    var promptEvent = deferredPrompt;
    deferredPrompt = null;
    var outcome = 'dismissed';
    try {
      promptEvent.prompt();
    } catch (_) {
      return Promise.resolve({ ok: false, reason: 'prompt-error' });
    }
    return Promise.resolve()
      .then(function () {
        return promptEvent.userChoice;
      })
      .then(function (choice) {
        outcome = (choice && choice.outcome) || 'dismissed';
        promptConsumed = true;
        if (outcome === 'accepted') {
          // appinstalled dispara por conta do navegador; estado otimista já aplicado.
          installed = true;
        }
        return { ok: true, outcome: outcome };
      })
      .catch(function () {
        return { ok: false, reason: 'prompt-error' };
      });
  }

  // ── Card do drawer (visual kc-context-pitch-card) ─────────────────────────

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildCardHtml() {
    return [
      '<div class="kc-install-card" data-kc-install-card="true">',
      '  <button class="kc-install-card__close" data-kc-install="dismiss" type="button" aria-label="N\u00e3o mostrar op\u00e7\u00e3o de instalar novamente"><i class="fas fa-xmark" aria-hidden="true"></i></button>',
      '  <button class="kc-install-card__main" data-kc-install="prompt" type="button" aria-expanded="false">',
      '    <span class="kc-install-card__mark" aria-hidden="true"><img src="assets/favicon.svg" alt="" width="36" height="36" loading="lazy" /></span>',
      '    <span class="kc-install-card__copy">',
      '      <strong>Instalar o KinoCampus</strong>',
      '      <small>App direto na tela inicial. R\u00e1pido, gr\u00e1tis e discreto.</small>',
      '    </span>',
      '    <span class="kc-install-card__arrow" aria-hidden="true"><i class="fas fa-download"></i></span>',
      '  </button>',
      '  <div class="kc-install-card__steps" data-kc-install-steps hidden></div>',
      '</div>',
    ].join('');
  }

  function findDrawer() {
    return document.getElementById('mobileMenuDrawer')
      || document.querySelector('.kc-mobile-menu-drawer')
      || document.querySelector('.kc-mobile-menu');
  }

  function findInsertAnchor(content) {
    return content.querySelector('#mobileMenuAccountSection')
      || content.querySelector('#mobileMenuUserSection');
  }

  function mountDrawerCard() {
    if (cardMounted) return;
    var drawer = findDrawer();
    if (!drawer) return;
    var content = drawer.querySelector('.kc-mobile-menu-content');
    if (!content) return;
    if (content.querySelector('[data-kc-install-card]')) {
      cardMounted = true;
      return;
    }
    var status = getStatus();
    if (status.installed || status.drawerDismissed) return; // nada a oferecer

    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildCardHtml();
    var card = wrapper.firstElementChild;
    if (!card) return;

    var anchor = findInsertAnchor(content);
    if (anchor && anchor.parentNode === content) {
      anchor.insertAdjacentElement('afterend', card);
    } else {
      content.insertBefore(card, content.firstChild);
    }
    cardMounted = true;
  }

  function removeDrawerCard() {
    var drawer = findDrawer();
    if (!drawer) return;
    var card = drawer.querySelector('[data-kc-install-card]');
    if (card && card.parentNode) card.parentNode.removeChild(card);
    cardMounted = false;
  }

  function syncDrawerCard() {
    var status = getStatus();
    if (status.installed || status.drawerDismissed) {
      removeDrawerCard();
      return;
    }
    if (!cardMounted) mountDrawerCard();
  }

  // ── Passos manuais (iOS/Firefox/desktop sem prompt API) ────────────────────

  function renderSteps(container, platform) {
    if (!container) return;
    var guide = buildInstructions(platform);
    var items = guide.steps.map(function (step) {
      return '<li>' + escapeHtml(step) + '</li>';
    }).join('');
    container.innerHTML = '<p class="kc-install-steps__title">' + escapeHtml(guide.title) + '</p>'
      + '<ol class="kc-install-steps__list">' + items + '</ol>';
    container.hidden = false;
  }

  function closeSteps(container) {
    if (!container) return;
    container.hidden = true;
    container.innerHTML = '';
  }

  function nearestSteps(trigger) {
    var scope = trigger.closest('[data-kc-install-card]')
      || trigger.closest('.kc-settings-card')
      || trigger.closest('section')
      || document;
    return scope.querySelector('[data-kc-install-steps]');
  }

  function markInstalledState() {
    document.querySelectorAll('[data-kc-install="prompt"]').forEach(function (button) {
      button.disabled = true;
      var label = button.querySelector('span');
      if (label && !label.dataset.kcInstallOriginal) {
        label.dataset.kcInstallOriginal = label.textContent;
      }
      if (label) label.textContent = 'App instalado \u2713';
    });
    document.querySelectorAll('[data-kc-install-status]').forEach(function (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = 'O KinoCampus j\u00e1 est\u00e1 instalado neste dispositivo.';
    });
    removeDrawerCard();
  }

  function handlePromptClick(button) {
    var status = getStatus();
    if (status.installed) {
      markInstalledState();
      return;
    }
    var steps = nearestSteps(button);
    // Sem prompt nativo (iOS, Firefox, critérios não atendidos): passos guiados
    // imediatos — atualização de DOM síncrona, sem esperar microtarefas.
    if (!status.canPrompt) {
      if (steps && !steps.hidden) {
        closeSteps(steps);
        button.setAttribute('aria-expanded', 'false');
        return;
      }
      renderSteps(steps, status.platform);
      button.setAttribute('aria-expanded', 'true');
      return;
    }
    promptInstall().then(function (result) {
      if (result && result.ok && result.outcome === 'accepted') {
        markInstalledState();
        if (typeof window.showToast === 'function') {
          window.showToast('KinoCampus instalado! Confira a tela inicial do seu dispositivo.', 'success', 4200);
        }
        return;
      }
      if (result && result.ok && result.outcome === 'dismissed') {
        if (typeof window.showToast === 'function') {
          window.showToast('Instala\u00e7\u00e3o cancelada. Voc\u00ea pode instalar quando quiser.', 'info', 3200);
        }
      }
    });
  }

  // ── Hidratação de blocos declarativos (ex.: /configuracoes) ────────────────

  function hydrateSettingsBlocks() {
    var blocks = document.querySelectorAll('.kc-settings-card [data-kc-install="prompt"]');
    blocks.forEach(function (button) {
      var status = getStatus();
      if (status.installed) {
        markInstalledState();
      }
    });
  }

  // ── Delegação global + boot ────────────────────────────────────────────────

  function onDocumentClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var action = target.closest('[data-kc-install]');
    if (!action) return;
    var mode = String(action.getAttribute('data-kc-install') || '').trim();
    if (mode === 'dismiss') {
      event.preventDefault();
      writeDismissed();
      removeDrawerCard();
      return;
    }
    if (mode === 'prompt') {
      event.preventDefault();
      handlePromptClick(action);
      return;
    }
  }

  function onMenuToggleCapture(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (!target.closest('[data-kc-mobile-menu="toggle"]')) return;
    // Sincroniza o card antes de o shell abrir o drawer (capture roda antes).
    syncDrawerCard();
  }

  function observeDrawer() {
    if (!window.MutationObserver || !document.body) return;
    var observer = new MutationObserver(function () {
      if (cardMounted) return;
      if (document.getElementById('mobileMenuDrawer')) syncDrawerCard();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('click', onMenuToggleCapture, true);

    if (getStatus().installed) {
      markInstalledState();
    } else {
      syncDrawerCard();
      observeDrawer();
      hydrateSettingsBlocks();
    }
  }

  function boot() {
    // Inclusão canônica é <script defer> na <head>: o corpo já existe quando o
    // módulo executa, então a inicialização é imediata (e o beforeinstallprompt,
    // que costuma disparar depois do load, nunca escapa da captura).
    if (document.body) {
      init();
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  boot();

  // ── Exportação (browser + testes Node via vm/global) ───────────────────────
  var api = {
    VERSION: VERSION,
    getStatus: getStatus,
    promptInstall: promptInstall,
    buildInstructions: buildInstructions,
    detectPlatform: detectPlatform,
    isStandalone: isStandalone,
    isDrawerDismissed: readDismissed,
    dismissDrawer: function () { writeDismissed(); syncDrawerCard(); },
    mountDrawerCard: mountDrawerCard,
    removeDrawerCard: removeDrawerCard,
    syncDrawerCard: syncDrawerCard,
    renderSteps: renderSteps,
    buildCardHtml: buildCardHtml,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  window.KCPwaInstall = Object.freeze(api);
})();
