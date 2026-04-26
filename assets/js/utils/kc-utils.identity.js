/*
  KinoCampus - Utils / Identity Domain (v12.2.3)

  Sub-módulo do kc-utils.js — domínio de identidade de usuário
  (normalização de e-mail, extração de domínio, validação de e-mail
  institucional e geração de handle público).
  Expõe window._KCU.identity com 5 funções.

  Carregamento: deve ser incluído APÓS kc-utils.dom.js e
  ANTES de kc-utils.js em todos os HTMLs.
  Dependências: window._KCU.string (para buildPublicHandle via slugifyText).
  Contrato: window._KCU.identity é Object.freeze() — imutável em runtime.
*/
(function () {
  'use strict';

  // ── Helper interno ────────────────────────────────────────────────────────

  // Acesso lazy a _KCU.string (já carregado antes deste módulo)
  function _str() {
    return (window._KCU && window._KCU.string) ? window._KCU.string : null;
  }

  function _slugifyText(v) {
    const s = _str();
    if (s) return s.slugifyText(v);
    // fallback inline mínimo
    return String(v || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ── Funções do domínio identity ───────────────────────────────────────────

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function getEmailDomain(email) {
    const em = normalizeEmail(email);
    const at = em.lastIndexOf('@');
    if (at < 0) return '';
    return em.slice(at + 1);
  }

  function normalizeAllowedDomains(allowedDomains) {
    if (!Array.isArray(allowedDomains)) return [];
    return Array.from(new Set(
      allowedDomains
        .map((d) => String(d || '').trim().toLowerCase())
        .filter(Boolean)
    ));
  }

  function isInstitutionalEmailAllowed(email, allowedDomains) {
    const list = normalizeAllowedDomains(allowedDomains);
    if (!list.length) return true; // sem restrição definida
    const domain = getEmailDomain(email);
    if (!domain) return false;
    // Regra única: aceita apenas domínio explícito na allowlist.
    return list.includes(domain);
  }

  function buildPublicHandle(value, options) {
    const slug = _slugifyText(value).slice(0, 32);
    if (!slug) return '';
    const prefix = options && options.prefix === false ? '' : '@';
    return prefix + slug;
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCU = window._KCU || {};
  window._KCU.identity = Object.freeze({
    normalizeEmail,
    getEmailDomain,
    normalizeAllowedDomains,
    isInstitutionalEmailAllowed,
    buildPublicHandle,
  });
})();
