const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('apresentação institucional do KinoCampus', () => {
  const page = read('apresentacao-institucional.html');
  const home = read('index.html');
  const about = read('sobre.html');
  const vercel = read('vercel.json');
  const hostScript = read('assets/js/features/kc-pitch-host.js');

  test('possui uma rota pública canônica com incorporação acessível', () => {
    expect(page).toContain('https://www.kinocampus.com.br/apresentacao-institucional.html');
    expect(page).toContain('title="Apresentação institucional interativa do KinoCampus"');
    expect(page).toContain('allowfullscreen');
    expect(page).toContain('data-kc-pitch-fullscreen');
  });

  test('preserva o acesso anônimo e não expõe controle privado no host', () => {
    expect(page).not.toMatch(/presenterToken|token de controle|controle privado/i);
    expect(hostScript).toContain('kino-campus-pitch.yandiamantinobr.chatgpt.site');
    expect(hostScript).toContain('window.location.search');
  });

  test('é encontrável na home e na página Sobre, abrindo em nova aba', () => {
    // v1.1.0+: links de entrada abrem em nova aba para evitar navegação que causa loop
    expect(home).toContain('href="apresentacao-institucional.html" target="_blank"');
    expect(about).toContain('href="apresentacao-institucional.html" target="_blank"');
    expect(about).toContain('Conversar sobre parceria');
  });

  test('tem aliases curtos e política de frames explícita', () => {
    expect(vercel).toContain('"source": "/pitch"');
    expect(vercel).toContain('https://*.chatgpt.site');
  });

  // ── v1.2.0: embed direto + loop protection ───────────────────────────────

  test('host script tem proteção contra loop (detecção de iframe)', () => {
    expect(hostScript).toContain('window.self !== window.top');
    expect(hostScript).toContain('window.top.location.href');
    expect(hostScript).toContain('SecurityError');
  });

  test('host script embeda o iframe diretamente (sem window.open/landing)', () => {
    // v1.2.0: volta ao embed direto, sem redirect/popup
    expect(hostScript).not.toContain('window.open(liveUrl');
    expect(hostScript).toContain('frame.src = liveUrl');
  });

  test('host script tem fallback de loading após timeout', () => {
    expect(hostScript).toContain('is-pitch-slow');
    expect(hostScript).toContain('is-pitch-ready');
  });

  test('encaminha parâmetros públicos, revela o iframe e aciona tela cheia', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/apresentacao-institucional.html?read=15-interativo#read-contexto');
    document.body.innerHTML = `
      <button data-kc-pitch-fullscreen></button>
      <a data-kc-pitch-direct></a>
      <iframe id="kc-pitch-frame"></iframe>
    `;
    const frame = document.getElementById('kc-pitch-frame');
    frame.requestFullscreen = jest.fn();

    window.eval(hostScript);

    expect(frame.src).toBe('https://kino-campus-pitch.yandiamantinobr.chatgpt.site/?read=15-interativo#read-contexto');
    expect(document.querySelector('[data-kc-pitch-direct]').href).toBe(frame.src);

    frame.dispatchEvent(new Event('load'));
    expect(document.body.classList.contains('is-pitch-ready')).toBe(true);

    document.querySelector('[data-kc-pitch-fullscreen]').click();
    expect(frame.requestFullscreen).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
