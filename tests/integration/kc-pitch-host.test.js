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
  const hostCss = read('assets/css/kc-pitch-host.css');

  test('possui uma rota pública canônica com landing page acessível', () => {
    expect(page).toContain('https://www.kinocampus.com.br/apresentacao-institucional.html');
    expect(page).toContain('title="Apresentação institucional interativa do KinoCampus"');
    // iframe ainda existe como fallback opcional
    expect(page).toContain('allowfullscreen');
    expect(page).toContain('kc-pitch-frame');
  });

  test('preserva o acesso anônimo e não expõe controle privado no host', () => {
    expect(page).not.toMatch(/presenterToken|token de controle|controle privado/i);
    expect(hostScript).toContain('kino-campus-pitch.yandiamantinobr.chatgpt.site');
    expect(hostScript).toContain('window.location.search');
  });

  test('é encontrável na home e na página Sobre, abrindo em nova aba', () => {
    // v1.1.0: links de entrada abrem em nova aba para evitar navegação que causa loop
    expect(home).toContain('href="apresentacao-institucional.html" target="_blank"');
    expect(about).toContain('href="apresentacao-institucional.html" target="_blank"');
    expect(about).toContain('Conversar sobre parceria');
  });

  test('tem aliases curtos e política de frames explícita', () => {
    expect(vercel).toContain('"source": "/pitch"');
    expect(vercel).toContain('https://*.chatgpt.site');
  });

  // ── v1.1.0: redirect inteligente + loop protection ───────────────────────

  test('host script tem proteção contra loop (detecção de iframe)', () => {
    expect(hostScript).toContain('window.self !== window.top');
    expect(hostScript).toContain('window.top.location.href');
    expect(hostScript).toContain('SecurityError');
  });

  test('host script abre o app em nova aba via window.open', () => {
    expect(hostScript).toContain('window.open(liveUrl');
    expect(hostScript).toContain("'_blank'");
  });

  test('host script tem fallback de botão manual para popup bloqueado', () => {
    expect(hostScript).toContain('is-pitch-blocked');
    expect(hostScript).toContain('is-pitch-launched');
    expect(hostScript).toContain('kc-pitch-launch');
  });

  test('HTML tem landing page com botão CTA e toggle de embed', () => {
    expect(page).toContain('kc-pitch-landing');
    expect(page).toContain('kc-pitch-launch');
    expect(page).toContain('kc-pitch-embed-toggle');
    expect(page).toContain('Abrir apresentação');
  });

  test('CSS tem estilos para landing page e estados de launch/blocked', () => {
    expect(hostCss).toContain('kc-pitch-landing');
    expect(hostCss).toContain('is-pitch-launched');
    expect(hostCss).toContain('is-pitch-blocked');
    expect(hostCss).toContain('is-pitch-embedded');
    expect(hostCss).toContain('kc-pitch-landing__cta');
  });

  test('encaminha parâmetros públicos e abre em nova aba com a URL completa', () => {
    window.history.replaceState({}, '', '/apresentacao-institucional.html?read=15-interativo#read-contexto');
    document.body.innerHTML = `
      <div id="kc-main">
        <div id="kc-pitch-status"></div>
        <a id="kc-pitch-launch" data-kc-pitch-direct></a>
        <button id="kc-pitch-embed-toggle"></button>
        <iframe id="kc-pitch-frame"></iframe>
      </div>
    `;

    const openSpy = jest.spyOn(window, 'open').mockReturnValue({ focus: jest.fn() });

    window.eval(hostScript);

    const expectedBase = 'https://kino-campus-pitch.yandiamantinobr.chatgpt.site';
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(expectedBase),
      '_blank',
      expect.any(String)
    );
    expect(openSpy.mock.calls[0][0]).toContain('read=15-interativo');
    expect(openSpy.mock.calls[0][0]).toContain('#read-contexto');
    expect(document.querySelector('[data-kc-pitch-direct]').href).toContain(expectedBase);

    // Body recebe classe de launched quando popup é aceito
    expect(document.body.classList.contains('is-pitch-launched')).toBe(true);

    openSpy.mockRestore();
    jest.useRealTimers();
  });

  test('mostra fallback de botão quando popup é bloqueado', () => {
    window.history.replaceState({}, '', '/apresentacao-institucional.html');
    document.body.innerHTML = `
      <div id="kc-main">
        <div id="kc-pitch-status"></div>
        <a id="kc-pitch-launch" data-kc-pitch-direct></a>
        <button id="kc-pitch-embed-toggle"></button>
        <iframe id="kc-pitch-frame"></iframe>
      </div>
    `;

    // Simular popup bloqueado
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);

    window.eval(hostScript);

    expect(document.body.classList.contains('is-pitch-blocked')).toBe(true);

    // Clicar no botão de fallback deve tentar abrir novamente
    openSpy.mockReturnValue({ focus: jest.fn() });
    document.getElementById('kc-pitch-launch').click();
    expect(document.body.classList.contains('is-pitch-launched')).toBe(true);

    openSpy.mockRestore();
  });
});
