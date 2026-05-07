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
  let cachedShell = null;

  const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = (saved === 'light' || saved === 'dark') ? saved : (prefersDark ? 'dark' : 'light');

  root.setAttribute('data-theme', theme);
  // melhora o UI nativa (inputs/scrollbar) em ambos os temas
  root.style.colorScheme = theme;

  try {
    const rawShell = sessionStorage.getItem(SHELL_SNAPSHOT_KEY);
    const shell = rawShell ? JSON.parse(rawShell) : null;
    if (shell && shell.value && shell.value.user && shell.value.user.id) {
      cachedShell = shell.value;
      root.classList.add('kc-auth-shell-cached');
    }
  } catch (e) {}

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function hydrateCachedShell(attempt) {
    if (!cachedShell || !cachedShell.user || !cachedShell.user.id) return;
    const button = document.querySelector('a.btn-login, a[href="#login"]');
    if (!button) {
      if ((attempt || 0) < 120) window.setTimeout(function () { hydrateCachedShell((attempt || 0) + 1); }, 16);
      return;
    }
    const user = cachedShell.user || {};
    const profile = cachedShell.profile || {};
    const display = String(profile.display_name || profile.full_name || (user.email ? String(user.email).split('@')[0] : '') || 'Minha conta').trim();
    const avatar = String(profile.avatar_url || '').trim();
    const avatarMarkup = avatar
      ? '<img class="kc-header-user__avatar" src="' + escapeHtml(avatar) + '" alt="' + escapeHtml(display) + '" loading="lazy" decoding="async" />'
      : '<span class="kc-header-user__avatar kc-header-user__avatar--placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>';
    button.innerHTML = '<span class="kc-header-user">' + avatarMarkup + '<span class="kc-header-user__name">' + escapeHtml(display) + '</span>' + (profile.verified === true ? '<i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i>' : '') + '<i class="fas fa-chevron-down kc-header-user__chevron" aria-hidden="true"></i></span>';
    button.classList.add('is-auth');
    button.setAttribute('data-kc-login', 'true');
    button.setAttribute('href', '#login');
    if (user.email) button.setAttribute('title', String(user.email));
  }

  if (cachedShell) {
    window.setTimeout(function () { hydrateCachedShell(0); }, 0);
  }
})();
