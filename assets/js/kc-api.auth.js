/*
  KinoCampus - KCAPI Auth Module (v11.33.6)

  Sub-modulo do dominio auth para a fachada KCAPI.
  Registrado em window._KCAPI.auth e carregado antes de kc-api.client.js.

  Contrato preservado: os 8 metodos abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  os guards de modo local (ENV.driver !== 'supabase') e a delegacao
  para window.KCSupabase (kc-supabase.client.js).

  deps esperado (injetado pela fachada):
  {
    ENV,  // { driver: 'local'|'supabase', ... }
  }

  window.KCSupabase e acessado diretamente como global (disponivel em
  producao apos kc-supabase.client.js carregar).
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  // ── Helper interno ─────────────────────────────────────────────

  function getEnvDriver(deps) {
    return (deps && deps.ENV && typeof deps.ENV.driver === 'string')
      ? deps.ENV.driver
      : 'local';
  }

  // ── Métodos públicos ───────────────────────────────────────────

  async function getCurrentUser(deps) {
    if (getEnvDriver(deps) !== 'supabase') return null;
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getCurrentUser === 'function') {
        return await window.KCSupabase.getCurrentUser();
      }
    } catch (err) { console.warn('[KCAPI] getCurrentUser falhou:', err && err.message || err); }
    return null;
  }

  async function signIn(email, password, deps) {
    if (getEnvDriver(deps) !== 'supabase') {
      return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
    }
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) {
      return { user: null, session: null, error: { message: 'E-mail e senha sao obrigatorios.' } };
    }
    try {
      if (window.KCSupabase && typeof window.KCSupabase.signIn === 'function') {
        const result = await window.KCSupabase.signIn(em, pw);
        if (result && result.error) return result;
        return result || { user: null, session: null, error: { message: 'Nao foi possivel entrar. Verifique seus dados.' } };
      }
    } catch (err) { console.warn('[KCAPI] login falhou:', err && err.message || err); }
    return { user: null, session: null, error: { message: 'Nao foi possivel entrar.' } };
  }

  async function signUp(email, password, options, deps) {
    if (getEnvDriver(deps) !== 'supabase') {
      return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
    }
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) {
      return { user: null, session: null, error: { message: 'E-mail e senha são obrigatórios.' } };
    }
    if (window.KCSupabase && typeof window.KCSupabase.signUp === 'function') {
      const r = await window.KCSupabase.signUp(em, pw, options);
      return r || { user: null, error: { message: 'Não foi possível cadastrar.' } };
    }
    return { user: null, session: null, error: { message: 'Supabase não configurado.' } };
  }

  async function resendConfirmation(email, options, deps) {
    if (getEnvDriver(deps) !== 'supabase') {
      return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
    }
    const em = String(email || '').trim();
    if (!em) return { ok: false, error: { message: 'Informe um e-mail valido.' } };
    try {
      if (window.KCSupabase && typeof window.KCSupabase.resendSignUp === 'function') {
        return await window.KCSupabase.resendSignUp(em, options);
      }
    } catch (err) { console.warn('[KCAPI] resend confirmation falhou:', err && err.message || err); }
    return { ok: false, error: { message: 'Nao foi possivel reenviar a confirmacao.' } };
  }

  async function requestPasswordReset(email, options, deps) {
    if (getEnvDriver(deps) !== 'supabase') {
      return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
    }
    const em = String(email || '').trim();
    if (!em) return { ok: false, error: { message: 'Informe um e-mail valido.' } };
    try {
      if (window.KCSupabase && typeof window.KCSupabase.requestPasswordReset === 'function') {
        return await window.KCSupabase.requestPasswordReset(em, options);
      }
    } catch (err) { console.warn('[KCAPI] password reset falhou:', err && err.message || err); }
    return { ok: false, error: { message: 'Nao foi possivel enviar o link de redefinicao.' } };
  }

  async function updatePassword(password, deps) {
    if (getEnvDriver(deps) !== 'supabase') {
      return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
    }
    const pw = String(password || '').trim();
    if (!pw) return { ok: false, error: { message: 'Informe uma senha valida.' } };
    try {
      if (window.KCSupabase && typeof window.KCSupabase.updatePassword === 'function') {
        return await window.KCSupabase.updatePassword(pw);
      }
    } catch (err) { console.warn('[KCAPI] update password falhou:', err && err.message || err); }
    return { ok: false, error: { message: 'Nao foi possivel atualizar a senha.' } };
  }

  // Alias de compat (mantido por retrocompatibilidade)
  async function login(email, password, deps) {
    const r = await signIn(email, password, deps);
    return r && r.user ? r.user : null;
  }

  async function logout(deps) {
    if (getEnvDriver(deps) !== 'supabase') return false;
    try {
      if (window.KCSupabase && typeof window.KCSupabase.signOut === 'function') {
        const r = await window.KCSupabase.signOut();
        return !!(r && r.ok);
      }
    } catch (err) { console.warn('[KCAPI] logout falhou:', err && err.message || err); }
    return false;
  }

  window._KCAPI.auth = {
    getCurrentUser,
    signIn,
    signUp,
    resendConfirmation,
    requestPasswordReset,
    updatePassword,
    login,
    logout,
  };
})();
