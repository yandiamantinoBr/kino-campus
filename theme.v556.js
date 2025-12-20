/*
  KinoCampus - Theme Persistence + No Flash (V5.5.6)

  Principal função:
  - Persistir a escolha do usuário em localStorage
  - Aplicar o tema de forma consistente (html + body)
  - Sincronizar o botão/ícone de toggle em qualquer página

  Observação:
  - Para eliminar o "flash" claro, use o snippet inline no <head>
    que seta data-theme no <html> antes de carregar os CSS.
*/

(function () {
  'use strict';

  const STORAGE_KEY = 'theme';
  const VALID_THEMES = new Set(['light', 'dark']);

  let _didInit = false;

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function getSystemTheme() {
    try {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark'
        : 'light';
    } catch (_) {
      return 'light';
    }
  }

  function resolveTheme() {
    const saved = safeGet(STORAGE_KEY);
    if (VALID_THEMES.has(saved)) return saved;
    return getSystemTheme();
  }

  function getCurrentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (VALID_THEMES.has(attr)) return attr;
    return resolveTheme();
  }

  function updateToggleUI(theme) {
    const buttons = document.querySelectorAll('.theme-toggle, [data-kc-theme-toggle]');
    buttons.forEach((btn) => {
      const icon = btn.querySelector('i');
      if (icon) icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';

      // acessibilidade: descreve a ação
      btn.setAttribute('aria-label', theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
      if (!btn.getAttribute('title')) btn.setAttribute('title', 'Alternar tema');
    });
  }

  function applyTheme(theme, { persist = false, silent = false } = {}) {
    const finalTheme = VALID_THEMES.has(theme) ? theme : 'light';

    const root = document.documentElement;
    root.setAttribute('data-theme', finalTheme);

    // melhora UI nativa (inputs/scrollbar) de acordo com o tema
    root.style.colorScheme = finalTheme;

    // compat: algumas regras antigas miravam body[data-theme]
    if (document.body) document.body.setAttribute('data-theme', finalTheme);

    if (persist) safeSet(STORAGE_KEY, finalTheme);

    updateToggleUI(finalTheme);

    if (!silent) {
      try {
        document.dispatchEvent(new CustomEvent('kc:themechange', { detail: { theme: finalTheme } }));
      } catch (_) {
        // ignora browsers sem CustomEvent (Edge moderno ok)
      }
    }

    return finalTheme;
  }

  function toggleTheme() {
    const current = getCurrentTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, { persist: true });
  }

  function initTheme() {
    if (_didInit) return;
    _didInit = true;

    // o snippet do <head> já setou data-theme cedo.
    // aqui só garantimos consistência e removemos o preload.
    const root = document.documentElement;
    const initial = root.getAttribute('data-theme');

    applyTheme(VALID_THEMES.has(initial) ? initial : resolveTheme(), { persist: false, silent: true });

    // remove flag que bloqueia transições (após primeiro paint)
    try {
      requestAnimationFrame(() => root.classList.remove('kc-theme-preload'));
    } catch (_) {
      root.classList.remove('kc-theme-preload');
    }

    // Toggle universal (sem depender de onclick)
    // - usamos capture para evitar double-toggle em botões com onclick inline
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest
        ? e.target.closest('.theme-toggle, [data-kc-theme-toggle]')
        : null;
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();
      toggleTheme();
    }, true);
  }

  // Compatibilidade com HTML atual (onclick="toggleTheme()" + script.v554 chamando applySavedTheme)
  window.toggleTheme = toggleTheme;
  window.applySavedTheme = initTheme;

  // utilitários opcionais
  window.kcGetTheme = getCurrentTheme;
  window.kcSetTheme = (theme) => applyTheme(theme, { persist: true });

  // Se alguma página não chamar applySavedTheme, inicializamos assim mesmo
  document.addEventListener('DOMContentLoaded', initTheme, { once: true });
})();
