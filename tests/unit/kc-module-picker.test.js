describe('kc-module-picker', () => {
  const baseModules = {
    'compra-venda': { label: 'Compra e Venda', emoji: '🛍️', redirect: 'compra-venda-feed.html' },
    caronas: { label: 'Caronas', emoji: '🚗', redirect: 'caronas-feed.html' },
    moradia: { label: 'Moradia', emoji: '🏡', redirect: 'moradia.html' },
    eventos: { label: 'Eventos', emoji: '📅', redirect: 'eventos.html' },
    'achados-perdidos': { label: 'Achados e Perdidos', emoji: '🔎', redirect: 'achados-perdidos.html' },
    oportunidades: { label: 'Oportunidades', emoji: '💼', redirect: 'oportunidades.html' },
  };

  beforeAll(() => {
    window.history.replaceState({}, '', '/eventos.html?closed=1');
    document.body.innerHTML = `
      <header><nav class="kc-nav-links">
        <a href="eventos.html">Eventos</a>
        <a href="oportunidades.html">Oportunidades</a>
        <a href="moradia.html">Moradia</a>
        <a href="compra-venda-feed.html">Compra e Venda</a>
        <a href="caronas-feed.html">Caronas</a>
        <a href="achados-perdidos.html">Achados e Perdidos</a>
      </nav></header>
      <main>
        <button type="button" data-outside>Fora</button>
        <div class="kc-feed-toolbar__actions">
          <button type="button" data-kc-module-picker-open aria-haspopup="dialog"
            aria-controls="kcModulePickerModal" aria-expanded="false" hidden>Escolher Módulo</button>
        </div>
      </main>`;
    window._KCCreatePost = { schema: { modules: { ...baseModules } } };
    window.KCHideClosed = { getState: jest.fn(() => true) };
    window.KCOverlayLock = { lock: jest.fn(), unlock: jest.fn() };
    jest.resetModules();
    require('../../assets/js/features/kc-module-picker.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  beforeEach(() => {
    window.history.replaceState({}, '', '/eventos.html?closed=1');
    window._KCCreatePost.schema.modules = { ...baseModules };
    window.KCHideClosed.getState.mockReturnValue(true);
    window.KCOverlayLock.lock.mockClear();
    window.KCOverlayLock.unlock.mockClear();
    window.KCModulePicker.close({ restoreFocus: false });
    window.KCModulePicker.sync();
  });

  afterAll(() => {
    window.KCModulePicker.close({ restoreFocus: false });
    document.body.innerHTML = '';
    delete window._KCCreatePost;
    delete window.KCHideClosed;
    delete window.KCOverlayLock;
    delete window.KCModulePicker;
  });

  function open() {
    const trigger = document.querySelector('[data-kc-module-picker-open]');
    trigger.focus();
    trigger.click();
    return { trigger, modal: document.getElementById('kcModulePickerModal') };
  }

  test('revela o gatilho e renderiza os seis módulos na ordem da navegação', () => {
    const { trigger, modal } = open();
    const options = Array.from(modal.querySelectorAll('[data-kc-module-picker-option]'));

    expect(trigger.hidden).toBe(false);
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(options).toHaveLength(6);
    expect(options.map((option) => option.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('📅'),
      expect.stringContaining('💼'),
      expect.stringContaining('🏡'),
      expect.stringContaining('🛍️'),
      expect.stringContaining('🚗'),
      expect.stringContaining('🔎'),
    ]));
    expect(options.map((option) => option.dataset.kcModulePickerOption)).toEqual([
      'eventos',
      'oportunidades',
      'moradia',
      'compra-venda',
      'caronas',
      'achados-perdidos',
    ]);
    expect(options[0].getAttribute('aria-current')).toBe('page');
    expect(options.every((option) => new URL(option.href).searchParams.get('closed') === '1')).toBe(true);
  });

  test('inclui um novo módulo válido do schema sem alterar o componente', () => {
    window._KCCreatePost.schema.modules.alimentacao = {
      label: 'Alimentação',
      emoji: '🍎',
      redirect: 'alimentacao.html',
    };
    window._KCCreatePost.schema.modules.inseguro = {
      label: 'Inseguro',
      emoji: '⚠️',
      redirect: 'javascript:alert(1)',
    };

    const { modal } = open();
    const options = Array.from(modal.querySelectorAll('[data-kc-module-picker-option]'));

    expect(options).toHaveLength(7);
    expect(options.at(-1).dataset.kcModulePickerOption).toBe('alimentacao');
    expect(options.at(-1).textContent).toContain('🍎');
    expect(modal.textContent).not.toContain('Inseguro');
  });

  test('usa o caminho completo para distinguir módulos futuros com o mesmo basename', () => {
    window.history.replaceState({}, '', '/campus/alpha/index.html?closed=1');
    window._KCCreatePost.schema.modules = {
      alpha: { label: 'Alpha', emoji: '🅰️', redirect: '/campus/alpha/index.html' },
      beta: { label: 'Beta', emoji: '🅱️', redirect: '/campus/beta/index.html' },
    };

    const { modal } = open();
    const current = Array.from(modal.querySelectorAll('[aria-current="page"]'));

    expect(current).toHaveLength(1);
    expect(current[0].dataset.kcModulePickerOption).toBe('alpha');
  });

  test('busca ignora acentos e mostra estado vazio sem remover opções', () => {
    const { modal } = open();
    const search = modal.querySelector('[data-kc-module-picker-search]');
    search.value = 'moradía';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const visible = Array.from(modal.querySelectorAll('.kc-module-picker-list__item'))
      .filter((item) => !item.hidden);
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain('Moradia');

    search.value = 'inexistente';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(modal.querySelector('[data-kc-module-picker-empty]').hidden).toBe(false);
    expect(modal.querySelectorAll('[data-kc-module-picker-option]')).toHaveLength(6);
  });

  test('bloqueia o fundo, prende o foco e restaura gatilho e inert ao fechar', () => {
    const { trigger, modal } = open();
    const dialog = modal.querySelector('[role="dialog"]');
    const close = modal.querySelector('[data-kc-module-picker-close].kc-sidebar-context-modal__close');
    const outside = document.querySelector('[data-outside]');

    expect(document.activeElement).toBe(close);
    expect(close.textContent).toContain('×');
    expect(window.KCOverlayLock.lock).toHaveBeenCalledWith('module-picker-modal');
    expect(document.querySelector('main').hasAttribute('inert')).toBe(true);
    expect(modal.querySelector('.kc-sidebar-context-modal__backdrop').tagName).toBe('DIV');

    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    const options = Array.from(dialog.querySelectorAll('[data-kc-module-picker-option]'));
    expect(document.activeElement).toBe(options.at(-1));

    outside.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(dialog.contains(document.activeElement)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('main').hasAttribute('inert')).toBe(false);
    expect(window.KCOverlayLock.unlock).toHaveBeenCalledWith('module-picker-modal');
    expect(document.activeElement).toBe(trigger);
  });

  test('sincronização durante o modal aberto preserva aria-expanded coerente', () => {
    const { trigger, modal } = open();

    expect(window.KCModulePicker.sync()).toBe(true);
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  test('fecha e libera o overlay se o catálogo ficar indisponível durante a abertura', () => {
    const { trigger, modal } = open();
    window._KCCreatePost.schema.modules = {};

    expect(window.KCModulePicker.sync()).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(trigger.hidden).toBe(true);
    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(window.KCOverlayLock.unlock).toHaveBeenCalledWith('module-picker-modal');
  });

  test('clicar no módulo atual fecha sem navegar e o backdrop restaura o foco', () => {
    const first = open();
    first.modal.querySelector('[aria-current="page"]').click();
    expect(first.modal.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(first.trigger);

    const second = open();
    second.modal.querySelector('.kc-sidebar-context-modal__backdrop').click();
    expect(second.modal.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(second.trigger);
  });

  test('sem catálogo válido mantém o gatilho indisponível sem lançar erro', () => {
    window._KCCreatePost.schema.modules = {
      externo: { label: 'Externo', emoji: '⚠️', redirect: 'https://example.org/' },
    };
    const trigger = document.querySelector('[data-kc-module-picker-open]');

    expect(window.KCModulePicker.sync()).toBe(false);
    expect(trigger.hidden).toBe(true);
    expect(trigger.disabled).toBe(true);
    expect(() => window.KCModulePicker.open(trigger)).not.toThrow();
    expect(document.getElementById('kcModulePickerModal').getAttribute('aria-hidden')).toBe('true');
  });
});
