/**
 * KinoCampus — Auth Callback Handler (V8.2.5.0)
 * Gerencia a confirmação de e-mail / OTP após redirecionamento do Supabase Auth.
 * Depende de: kc-env.js, supabase-js (CDN), kc-supabase.client.js
 */
(function () {
  'use strict';

  var REDIRECT_DELAY = 4000; // ms até redirecionar automaticamente após sucesso

  // ── Helpers DOM ──────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  function setState(type, icon, title, msg, showBtn, showProgress) {
    var iconEl    = el('cbIcon');
    var iconInner = el('cbIconInner');
    var titleEl   = el('cbTitle');
    var msgEl     = el('cbMsg');
    var btnEl     = el('cbBtn');
    var progress  = el('cbProgress');

    iconEl.className     = 'kc-callback-icon ' + type;
    iconInner.className  = icon;
    titleEl.textContent  = title;
    msgEl.innerHTML      = msg;
    btnEl.style.display  = showBtn ? 'inline-flex' : 'none';

    if (showProgress) {
      progress.classList.add('visible');
    } else {
      progress.classList.remove('visible');
    }
  }

  function startCountdown(seconds) {
    var countEl = el('cbCountdown');
    countEl.style.display = 'block';
    var left = seconds;

    var tick = function () {
      countEl.textContent = 'Redirecionando em ' + left + ' segundo' + (left !== 1 ? 's' : '') + '…';
      if (left <= 0) {
        window.location.href = 'index.html';
        return;
      }
      left--;
      setTimeout(tick, 1000);
    };
    tick();

    // Barra de progresso animada
    var bar = el('cbProgressBar');
    var progressEl = el('cbProgress');
    progressEl.classList.add('visible');
    var start = Date.now();
    var total = seconds * 1000;

    var animateBar = function () {
      var elapsed = Date.now() - start;
      var pct = Math.min(100, (elapsed / total) * 100);
      bar.style.width = pct + '%';
      if (pct < 100) requestAnimationFrame(animateBar);
    };
    requestAnimationFrame(animateBar);
  }

  function showSuccess(email) {
    setState(
      'success',
      'fas fa-check',
      'E-mail confirmado! 🎉',
      'Bem-vindo(a) ao <strong>KinoCampus</strong>! Sua conta' +
        (email ? ' (<strong>' + email + '</strong>)' : '') +
        ' foi verificada com sucesso. Você já está logado.',
      true,
      false
    );
    startCountdown(Math.round(REDIRECT_DELAY / 1000));
  }

  function showError(msg) {
    setState(
      'error',
      'fas fa-exclamation-triangle',
      'Não foi possível confirmar',
      msg || 'O link de confirmação pode ter expirado ou já foi usado.<br>' +
             'Tente fazer login novamente ou solicite um novo e-mail de confirmação.',
      true,
      false
    );
    el('cbBtn').textContent = '';
    el('cbBtn').innerHTML = '<i class="fas fa-arrow-left"></i> Voltar ao início';
    el('cbBtn').href = 'index.html';
    el('cbCountdown').style.display = 'none';
  }

  function showAlreadyLogged(email) {
    setState(
      'success',
      'fas fa-user-check',
      'Você já está logado!',
      'A sessão de <strong>' + (email || 'sua conta') + '</strong> está ativa.' +
        ' Redirecionando para o feed…',
      true,
      false
    );
    startCountdown(Math.round(REDIRECT_DELAY / 1000));
  }

  // ── Lógica principal ──────────────────────────────────────────────────────
  async function handleCallback() {
    // Aguarda Supabase JS e KC_ENV carregarem
    var maxWait = 4000;
    var waited  = 0;
    while ((!window.supabase || !window.KC_ENV) && waited < maxWait) {
      await new Promise(function(r) { setTimeout(r, 80); });
      waited += 80;
    }

    var env = window.KC_ENV || {};
    var url  = String(env.SUPABASE_URL || (env.supabase && env.supabase.url) || '').trim();
    var anon = String(env.SUPABASE_ANON_KEY || (env.supabase && env.supabase.anonKey) || '').trim();

    if (!url || !anon || /placeholder/i.test(url)) {
      showError('Configuração do servidor não encontrada. Tente recarregar a página.');
      return;
    }

    var client;
    try {
      client = window.supabase.createClient(url, anon, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch(e) {
      showError('Erro ao conectar com o servidor de autenticação.');
      return;
    }

    // Aguarda Supabase processar o token da URL (hash ou query param)
    // O detectSessionInUrl: true faz isso automaticamente ao criar o client
    await new Promise(function(r) { setTimeout(r, 600); });

    try {
      var result = await client.auth.getSession();
      var session = result && result.data && result.data.session;

      if (session && session.user) {
        // Sincroniza com o KCSupabase global (se disponível)
        if (window.KCSupabase && typeof window.KCSupabase.refreshSession === 'function') {
          try { await window.KCSupabase.refreshSession(); } catch(_) {}
        }
        showSuccess(session.user.email || '');
      } else {
        // Verifica se há erro de expiração no hash
        var hash = window.location.hash || '';
        var params = new URLSearchParams(hash.replace(/^#/, ''));
        var errorCode = params.get('error_code') || params.get('error');
        var errorDesc = params.get('error_description') || '';

        if (errorCode === 'otp_expired' || errorDesc.toLowerCase().includes('expired')) {
          showError('O link de confirmação <strong>expirou</strong>. Por favor, solicite um novo cadastro e confirme em até 24 horas.');
        } else if (errorCode) {
          showError('Erro de autenticação: <em>' + errorDesc + '</em>');
        } else {
          // Pode ser que o usuário já estava logado e o link foi reutilizado
          // Tenta verificar a sessão atual
          var userResult = await client.auth.getUser();
          if (userResult && userResult.data && userResult.data.user) {
            showAlreadyLogged(userResult.data.user.email || '');
          } else {
            showError('Link de confirmação inválido ou já utilizado.<br>Se você já confirmou seu e-mail, tente fazer login normalmente.');
          }
        }
      }
    } catch(e) {
      console.error('[KC Auth Callback]', e);
      showError('Ocorreu um erro inesperado. Tente novamente ou entre em contato com o suporte.');
    }
  }

  // Inicia após DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleCallback);
  } else {
    handleCallback();
  }
})();
