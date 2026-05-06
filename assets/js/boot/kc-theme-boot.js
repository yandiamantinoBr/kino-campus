// KinoCampus - Theme boot (sem flash)
// Mantém a execução o mais cedo possível no <head>.
(function () {
  'use strict';

  const STORAGE_KEY = 'theme';
  const SHELL_SNAPSHOT_KEY = 'kc:9.0.0:shell:auth-shell';
  const root = document.documentElement;
  root.classList.add('kc-theme-preload');
  root.classList.add('kc-loading');

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}

  const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = (saved === 'light' || saved === 'dark') ? saved : (prefersDark ? 'dark' : 'light');

  root.setAttribute('data-theme', theme);
  // melhora o UI nativa (inputs/scrollbar) em ambos os temas
  root.style.colorScheme = theme;

  try {
    const rawShell = sessionStorage.getItem(SHELL_SNAPSHOT_KEY);
    const shell = rawShell ? JSON.parse(rawShell) : null;
    if (shell && shell.value && shell.value.user && shell.value.user.id) {
      root.classList.add('kc-auth-shell-cached');
    }
  } catch (e) {}
})();
