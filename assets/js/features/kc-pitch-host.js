(function () {
  'use strict';

  // v1.2.0: Embed direto do iframe + loop protection.
  //
  // Diferente da v1.1.0 (que tentava window.open/redirect), esta versão
  // mostra a apresentação DENTRO da página (iframe embedado), como o
  // usuário prefere. A única proteção extra sobre o original (v1.0.0):
  //   1. Detecção de iframe (loop) → se a página host está dentro de
  //      outro iframe, redireciona top para o app direto (quebra ciclo).
  //   2. Timeout de fallback: se o iframe não carrega em 12s, mostra
  //      botão "Abrir em nova aba" para o usuário não ficar preso.
  //   3. Links de fallback com target=_blank sempre disponíveis.

  var LIVE_ORIGIN = 'https://kino-campus-pitch.yandiamantinobr.chatgpt.site';
  var body = document.body;
  var frame = document.getElementById('kc-pitch-frame');
  var fullscreenButton = document.querySelector('[data-kc-pitch-fullscreen]');
  var directLinks = document.querySelectorAll('[data-kc-pitch-direct]');

  if (!body || !frame) return;

  // ── 1. Loop protection: se estamos dentro de um iframe, escapar ────────────
  try {
    if (window.self !== window.top) {
      var liveUrl = LIVE_ORIGIN + (window.location.search || '') + (window.location.hash || '');
      window.top.location.href = liveUrl;
      return;
    }
  } catch (e) {
    // window.top lançou SecurityError (cross-origin iframe) — loop confirmado.
    var fallbackUrl = LIVE_ORIGIN + (window.location.search || '') + (window.location.hash || '');
    window.location.href = fallbackUrl;
    return;
  }

  // ── 2. Setar iframe src (embed direto, como v1.0.0) ───────────────────────
  var liveUrl = LIVE_ORIGIN + (window.location.search || '') + (window.location.hash || '');
  frame.src = liveUrl;

  directLinks.forEach(function (link) {
    link.href = liveUrl;
  });

  // ── 3. Detectar carregamento do iframe ────────────────────────────────────
  frame.addEventListener('load', function () {
    body.classList.add('is-pitch-ready');
    body.classList.remove('is-pitch-slow');
    document.documentElement.classList.remove('kc-loading');
  });

  // ── 4. Timeout: se não carrega em 12s, mostrar fallback "abrir nova aba" ──
  window.setTimeout(function () {
    if (!body.classList.contains('is-pitch-ready')) {
      body.classList.add('is-pitch-slow');
    }
  }, 12000);

  // ── 5. Botão de tela cheia (opcional) ─────────────────────────────────────
  if (fullscreenButton) {
    fullscreenButton.addEventListener('click', function () {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen();
        return;
      }
      if (frame.requestFullscreen) frame.requestFullscreen();
    });

    document.addEventListener('fullscreenchange', function () {
      var active = document.fullscreenElement === frame;
      fullscreenButton.setAttribute('aria-label', active ? 'Sair da tela cheia' : 'Abrir apresentação em tela cheia');
      fullscreenButton.setAttribute('title', active ? 'Sair da tela cheia' : 'Abrir em tela cheia');
    });
  }
})();
