(function () {
  'use strict';

  var LIVE_ORIGIN = 'https://kino-campus-pitch.yandiamantinobr.chatgpt.site';
  var body = document.body;
  var frame = document.getElementById('kc-pitch-frame');
  var fullscreenButton = document.querySelector('[data-kc-pitch-fullscreen]');
  var directLinks = document.querySelectorAll('[data-kc-pitch-direct]');

  if (!body || !frame) return;

  var liveUrl = LIVE_ORIGIN + (window.location.search || '') + (window.location.hash || '');
  frame.src = liveUrl;
  directLinks.forEach(function (link) {
    link.href = liveUrl;
  });

  frame.addEventListener('load', function () {
    body.classList.add('is-pitch-ready');
    body.classList.remove('is-pitch-slow');
    document.documentElement.classList.remove('kc-loading');
  });

  window.setTimeout(function () {
    if (!body.classList.contains('is-pitch-ready')) body.classList.add('is-pitch-slow');
  }, 9000);

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
