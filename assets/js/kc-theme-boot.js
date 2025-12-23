// KinoCampus - Theme boot (sem flash)
// Mantém a execução o mais cedo possível no <head>.
(function () {
  'use strict';

  const STORAGE_KEY = 'theme';
  const root = document.documentElement;
  root.classList.add('kc-theme-preload');

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}

  const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = (saved === 'light' || saved === 'dark') ? saved : (prefersDark ? 'dark' : 'light');

  root.setAttribute('data-theme', theme);
  // melhora o UI nativo (inputs/scrollbar) em ambos os temas
  root.style.colorScheme = theme;
})();
