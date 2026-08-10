'use strict';

function renderToggle() {
  document.body.innerHTML = `
    <div data-kc-hide-closed-toggle>
      <label for="hideClosedTest">Ocultar encerrados</label>
      <input id="hideClosedTest" type="checkbox" role="switch"
        data-kc-hide-closed-input aria-describedby="hideClosedStatus">
      <span id="hideClosedStatus" data-kc-hide-closed-status></span>
    </div>
    <button type="button" data-kc-hide-closed-reveal hidden>Mostrar encerrados</button>
  `;
}

function loadFresh(url = '/eventos.html') {
  jest.resetModules();
  delete window.KCHideClosed;
  window.history.replaceState({}, '', url);
  renderToggle();
  require('../../assets/js/features/kc-hide-closed.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  return window.KCHideClosed;
}

describe('KCHideClosed', () => {
  afterEach(() => {
    delete window.KCHideClosed;
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  test('lê estado canônico e legado e normaliza a URL', () => {
    const api = loadFresh('/eventos.html?hideClosed=true&tab=palestras');
    expect(api.getState()).toBe(true);
    expect(document.querySelector('[data-kc-hide-closed-input]').checked).toBe(true);
    expect(window.location.search).toContain('closed=1');
    expect(window.location.search).not.toContain('hideClosed');
    expect(window.location.search).toContain('tab=palestras');
  });

  test('mudança do input atualiza URL, aria e emite contrato comum', () => {
    const api = loadFresh('/oportunidades.html');
    const input = document.querySelector('[data-kc-hide-closed-input]');
    const listener = jest.fn();
    document.addEventListener('kc:hide-closed-change', listener, { once: true });
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(api.getState()).toBe(true);
    expect(input.getAttribute('aria-checked')).toBe('true');
    expect(window.location.search).toBe('?closed=1');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toMatchObject({ hideClosed: true, reason: 'toggle' });
  });

  test('botão Mostrar encerrados desliga o filtro', () => {
    const api = loadFresh('/moradia.html?closed=1');
    const reveal = document.querySelector('[data-kc-hide-closed-reveal]');
    api.setRevealVisible(true);
    expect(reveal.hidden).toBe(false);
    reveal.click();
    expect(api.getState()).toBe(false);
    expect(window.location.search).toBe('');
    expect(document.querySelector('[data-kc-hide-closed-status]').textContent).toBe('Encerrados visíveis');
  });

  test('popstate restaura o estado compartilhado', () => {
    const api = loadFresh('/eventos.html');
    window.history.replaceState({}, '', '/eventos.html?closed=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(api.getState()).toBe(true);
    expect(document.querySelector('[data-kc-hide-closed-input]').checked).toBe(true);
  });

  test('preserva contagem acessível ao alternar o estado de carregamento', () => {
    const api = loadFresh('/eventos.html?closed=1');
    const input = document.querySelector('[data-kc-hide-closed-input]');
    const status = document.querySelector('[data-kc-hide-closed-status]');
    api.setHiddenCount(3);
    api.setBusy(true);
    expect(input.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toBe('3 encerrados ocultos');
    api.setBusy(false);
    expect(input.getAttribute('aria-busy')).toBe('false');
    expect(status.textContent).toBe('3 encerrados ocultos');
  });
});
