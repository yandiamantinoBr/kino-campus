describe('kc-sidebar-context', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <button type="button" data-kc-context-open="eventos">Abrir contexto</button>
      <aside>
        <div data-kc-context-section="eventos">
          <div class="kc-sidebar-section-head kc-sidebar-section-head--accordion">
            <h3><i class="fas fa-circle-info"></i> Eventos com contexto</h3>
            <button type="button" data-kc-sidebar-toggle="true">Alternar</button>
          </div>
          <div class="kc-sidebar-section__body">
            <p class="kc-sidebar-help">Informação útil do módulo.</p>
            <details class="kc-sidebar-context"><summary>Critérios</summary><p>Conteúdo detalhado.</p></details>
          </div>
        </div>
      </aside>`;
    jest.resetModules();
    require('../../assets/js/features/kc-sidebar-context.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  test('abre de forma compacta e fecha com Escape restaurando o foco', () => {
    const trigger = document.querySelector('[data-kc-context-open="eventos"]');
    trigger.focus();
    trigger.click();

    const modal = document.getElementById('kcSidebarContextModal');
    expect(modal).not.toBeNull();
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(modal.querySelector('#kcSidebarContextTitle').textContent).toContain('Eventos com contexto');
    expect(modal.querySelector('[data-kc-context-modal-body]').textContent).toContain('Informação útil do módulo.');
    expect(modal.querySelector('[data-kc-context-modal-body] h3')).toBeNull();
    expect(modal.querySelector('[data-kc-context-modal-body] [data-kc-sidebar-toggle]')).toBeNull();
    expect(modal.querySelector('details').open).toBe(false);
    expect(document.activeElement).toBe(modal.querySelector('.kc-sidebar-context-modal__close'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(trigger);
  });
});
