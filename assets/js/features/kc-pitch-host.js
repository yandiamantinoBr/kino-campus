(function () {
  'use strict';

  // v1.1.0: Redirecionamento inteligente — abre a apresentação em nova aba
  // em vez de embedar via iframe (que causava loop e falha de hidratação).
  //
  // Comportamento:
  // 1. Se a página foi aberta dentro de um iframe (loop acidental),
  //    redireciona a janela top para o app — quebra o ciclo.
  // 2. Se acessada diretamente (top window), abre o app em nova aba via
  //    window.open() e mostra uma landing page com botão fallback.
  // 3. Detecta bloqueador de popup e oferece botão manual.

  var LIVE_ORIGIN = 'https://kino-campus-pitch.yandiamantinobr.chatgpt.site';
  var body = document.body;
  var stage = document.getElementById('kc-main');
  var fallbackButton = document.getElementById('kc-pitch-launch');
  var openStatus = document.getElementById('kc-pitch-status');

  if (!body || !stage) return;

  var liveUrl = LIVE_ORIGIN + (window.location.search || '') + (window.location.hash || '');

  // ── 1. Loop protection: se estamos dentro de um iframe, escapar ────────────
  try {
    if (window.self !== window.top) {
      // Estamos dentro de um iframe — provável loop.
      // Tenta quebrar o ciclo redirecionando a janela top para o app direto.
      window.top.location.href = liveUrl;
      return;
    }
  } catch (e) {
    // window.top lançou SecurityError (cross-origin iframe) — também é loop.
    // Não podemos acessar top.location, mas podemos redirecionar self.
    window.location.href = liveUrl;
    return;
  }

  // ── 2. Atualizar links de fallback com a URL completa ─────────────────────
  var directLinks = document.querySelectorAll('[data-kc-pitch-direct]');
  directLinks.forEach(function (link) {
    link.href = liveUrl;
  });

  // ── 3. Abrir em nova aba automaticamente ──────────────────────────────────
  var opened = false;
  try {
    opened = !!window.open(liveUrl, '_blank', 'noopener,noreferrer');
  } catch (e) {
    opened = false;
  }

  if (opened) {
    // Popup foi aceito pelo navegador — mostrar confirmação
    body.classList.add('is-pitch-launched');
    document.documentElement.classList.remove('kc-loading');
    if (openStatus) openStatus.textContent = 'Abrindo em uma nova aba…';
  } else {
    // Popup bloqueado — mostrar botão de fallback proeminente
    body.classList.add('is-pitch-blocked');
    document.documentElement.classList.remove('kc-loading');
    if (openStatus) openStatus.textContent = 'Toque no botão para abrir a apresentação.';
  }

  // ── 4. Botão fallback: clique manual abre nova aba ─────────────────────────
  if (fallbackButton) {
    fallbackButton.addEventListener('click', function (event) {
      event.preventDefault();
      window.open(liveUrl, '_blank', 'noopener,noreferrer');
      body.classList.remove('is-pitch-blocked');
      body.classList.add('is-pitch-launched');
      if (openStatus) openStatus.textContent = 'Abrindo em uma nova aba…';
    });
  }

  // ── 5. Botão "ver no site" opcional (iframe fallback, escondido por padrão)
  // Mantido para usuários que explicitamente querem ver dentro do KinoCampus.
  var embedToggle = document.getElementById('kc-pitch-embed-toggle');
  var embedFrame = document.getElementById('kc-pitch-frame');
  if (embedToggle && embedFrame) {
    embedToggle.addEventListener('click', function () {
      if (!embedFrame.src) embedFrame.src = liveUrl;
      body.classList.add('is-pitch-embedded');
      embedFrame.addEventListener('load', function () {
        body.classList.add('is-pitch-ready');
        document.documentElement.classList.remove('kc-loading');
      });
    });
  }
})();
