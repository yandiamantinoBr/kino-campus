(function () {
  'use strict';

  const shared = window.KCAccountProfileUtils || {};
  const REDIRECT_DELAY_MS = 1800;

  function $(id) {
    return document.getElementById(id);
  }

  function setState(options) {
    const config = options && typeof options === 'object' ? options : {};
    const icon = $('cbIcon');
    const iconInner = $('cbIconInner');
    const title = $('cbTitle');
    const message = $('cbMsg');
    const action = $('cbBtn');
    const progress = $('cbProgress');
    const countdown = $('cbCountdown');
    const resetPanel = $('cbResetPanel');

    if (icon) icon.className = `kc-callback-icon ${config.tone || 'loading'}`;
    if (iconInner) iconInner.className = config.iconClass || 'fas fa-spinner fa-spin';
    if (title) title.textContent = config.title || 'Conferindo seu link...';
    if (message) message.innerHTML = config.message || '';

    if (action) {
      if (config.actionHref) action.href = config.actionHref;
      action.style.display = config.actionLabel ? 'inline-flex' : 'none';
      action.innerHTML = config.actionLabel
        ? `${config.actionIcon ? `<i class="${config.actionIcon}"></i>` : ''}<span>${config.actionLabel}</span>`
        : '';
    }

    if (progress) progress.classList.toggle('visible', config.showProgress === true);
    if (countdown) {
      countdown.style.display = config.showCountdown ? 'block' : 'none';
      countdown.textContent = '';
    }
    if (resetPanel) resetPanel.style.display = config.showResetPanel ? 'grid' : 'none';
  }

  function normalizeNextPath(value) {
    if (shared && typeof shared.normalizeNextPath === 'function') {
      return shared.normalizeNextPath(value, '/index.html');
    }
    const raw = String(value || '').trim();
    if (!raw) return '/index.html';
    return raw.charAt(0) === '/' ? raw : `/${raw}`;
  }

  function getQueryParams() {
    const search = new URLSearchParams(window.location.search || '');
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    return {
      search,
      hash,
    };
  }

  function getAuthType(params) {
    const searchType = String(params.search.get('type') || params.search.get('mode') || '').trim().toLowerCase();
    const hashType = String(params.hash.get('type') || '').trim().toLowerCase();
    return searchType || hashType || '';
  }

  function getAuthError(params) {
    const code = String(params.search.get('error_code') || params.hash.get('error_code') || params.search.get('error') || params.hash.get('error') || '').trim();
    const description = String(params.search.get('error_description') || params.hash.get('error_description') || '').trim();
    return {
      code,
      description,
    };
  }

  function startRedirect(nextPath, label) {
    const countdown = $('cbCountdown');
    const progressBar = $('cbProgressBar');
    const totalSeconds = Math.max(1, Math.round(REDIRECT_DELAY_MS / 1000));
    let remaining = totalSeconds;
    const target = normalizeNextPath(nextPath);

    setState({
      tone: 'success',
      iconClass: 'fas fa-check',
      title: label || 'Tudo certo por aqui',
      message: 'Sua autenticacao foi concluida com sucesso. Estamos te levando para a proxima etapa.',
      actionHref: target,
      actionLabel: 'Ir agora',
      actionIcon: 'fas fa-arrow-right',
      showProgress: true,
      showCountdown: true,
      showResetPanel: false,
    });

    const tick = function () {
      if (countdown) countdown.textContent = `Redirecionando em ${remaining} segundo${remaining === 1 ? '' : 's'}...`;
      const elapsed = (totalSeconds - remaining) / totalSeconds;
      if (progressBar) progressBar.style.width = `${Math.min(100, elapsed * 100)}%`;
      if (remaining <= 0) {
        window.location.href = target;
        return;
      }
      remaining -= 1;
      setTimeout(tick, 1000);
    };

    tick();
    setTimeout(function () {
      window.location.href = target;
    }, REDIRECT_DELAY_MS);
  }

  async function loadProfileForRedirect() {
    if (!window.KCAPI || typeof window.KCAPI.getMyProfile !== 'function') return null;
    let profile = await window.KCAPI.getMyProfile();
    if (!profile && typeof window.KCAPI.syncProfile === 'function') {
      await window.KCAPI.syncProfile();
      profile = await window.KCAPI.getMyProfile();
    }
    return profile;
  }

  function resolvePostAuthRoute(nextPath, profile) {
    const normalizedNext = normalizeNextPath(nextPath);
    const complete = shared && typeof shared.isOnboardingComplete === 'function'
      ? shared.isOnboardingComplete(profile || {})
      : !!(profile && profile.onboarding_completed_at);

    if (!complete) {
      const setupUrl = new URL('/account-setup.html', window.location.origin);
      setupUrl.searchParams.set('next', normalizedNext);
      return `${setupUrl.pathname}${setupUrl.search}`;
    }
    return normalizedNext;
  }

  async function completeAuthFlow(nextPath, label) {
    const profile = await loadProfileForRedirect();
    startRedirect(resolvePostAuthRoute(nextPath, profile), label);
  }

  function showErrorState(message) {
    setState({
      tone: 'error',
      iconClass: 'fas fa-circle-exclamation',
      title: 'Nao foi possivel concluir a autenticacao',
      message: message || 'O link pode ter expirado, ja ter sido usado ou estar incompleto.',
      actionHref: '/index.html',
      actionLabel: 'Voltar ao inicio',
      actionIcon: 'fas fa-house',
      showProgress: false,
      showCountdown: false,
      showResetPanel: false,
    });
  }

  function showRecoveryForm() {
    setState({
      tone: 'success',
      iconClass: 'fas fa-key',
      title: 'Defina uma nova senha',
      message: 'Seu link de recuperacao foi validado. Escolha uma nova senha para continuar usando a plataforma.',
      actionHref: '/index.html',
      actionLabel: '',
      showProgress: false,
      showCountdown: false,
      showResetPanel: true,
    });
  }

  async function handlePasswordResetSubmit(event, nextPath) {
    event.preventDefault();
    const password = $('cbResetPassword') ? String($('cbResetPassword').value || '').trim() : '';
    const confirm = $('cbResetConfirm') ? String($('cbResetConfirm').value || '').trim() : '';

    if (!password || password.length < 6) {
      setState({
        tone: 'warn',
        iconClass: 'fas fa-key',
        title: 'Defina uma senha mais forte',
        message: 'Sua nova senha precisa ter pelo menos 6 caracteres.',
        showResetPanel: true,
      });
      return;
    }

    if (password !== confirm) {
      setState({
        tone: 'warn',
        iconClass: 'fas fa-key',
        title: 'As senhas nao conferem',
        message: 'Repita a mesma senha nos dois campos para concluir a redefinicao.',
        showResetPanel: true,
      });
      return;
    }

    setState({
      tone: 'loading',
      iconClass: 'fas fa-spinner fa-spin',
      title: 'Atualizando sua senha...',
      message: 'Estamos salvando sua nova senha com seguranca.',
      showResetPanel: true,
    });

    const result = await window.KCAPI.updatePassword(password);
    if (!result || !result.ok) {
      showErrorState((result && result.error && result.error.message) || 'Nao foi possivel atualizar sua senha.');
      $('cbResetPanel').style.display = 'grid';
      return;
    }

    await completeAuthFlow(nextPath, 'Senha atualizada com sucesso');
  }

  async function init() {
    const params = getQueryParams();
    const nextPath = normalizeNextPath(params.search.get('next'));
    const authType = getAuthType(params);
    const authError = getAuthError(params);

    if (authError.code) {
      const description = String(authError.description || '').toLowerCase();
      if (authError.code === 'otp_expired' || description.includes('expired')) {
        showErrorState('O link expirou. Solicite um novo e-mail de confirmacao ou de recuperacao de senha.');
      } else {
        showErrorState(authError.description || 'Nao foi possivel validar este link.');
      }
      return;
    }

    if (!window.KCSupabase || typeof window.KCSupabase.refreshSession !== 'function') {
      showErrorState('O cliente de autenticacao nao foi carregado corretamente.');
      return;
    }

    setState({
      tone: 'loading',
      iconClass: 'fas fa-spinner fa-spin',
      title: 'Conferindo seu link...',
      message: 'Estamos finalizando sua autenticacao no KinoCampus.',
      showProgress: true,
      showCountdown: false,
      showResetPanel: false,
    });

    try {
      await window.KCSupabase.refreshSession();
      const user = await window.KCSupabase.getCurrentUser();
      if (!user) {
        showErrorState('Nao encontramos uma sessao valida para esse link. Tente entrar novamente ou solicite um novo e-mail.');
        return;
      }

      if (authType === 'recovery') {
        showRecoveryForm();
        const form = $('cbResetForm');
        if (form && !form.dataset.bound) {
          form.dataset.bound = '1';
          form.addEventListener('submit', function (event) {
            handlePasswordResetSubmit(event, nextPath);
          });
        }
        return;
      }

      await completeAuthFlow(nextPath, 'Conta confirmada');
    } catch (error) {
      console.error('[KCAuthCallback] failed:', error);
      showErrorState('Nao foi possivel concluir sua autenticacao agora. Tente novamente em alguns instantes.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
