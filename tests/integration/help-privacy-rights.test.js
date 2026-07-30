'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('public privacy-rights discovery and request contract', () => {
  test('central de ajuda oferece caminhos distintos e conteúdo honesto', () => {
    const html = read('ajuda.html');

    expect(html).toContain('id="dados-e-privacidade"');
    expect(html).toContain('?request=data_access_copy#helpRequestForm');
    expect(html).toContain('?request=data_portability#helpRequestForm');
    expect(html).toContain('?request=account_erasure#helpRequestForm');
    expect(
      (html.match(/href="settings\.html#settingsPrivacyData"/g) || []).length
    ).toBeGreaterThanOrEqual(3);
    expect(html).toContain('Usar o formulário alternativo');
    expect(html).toContain('id="helpRequestPresetNotice"');
    expect(html).toContain('id="helpProtocol"');
    expect(html).toContain('id="helpProtocolValue"');
    expect(html).toContain('id="helpProtocolLabel"');
    expect(html).toContain('id="helpProtocolGuidance"');
    expect(html).toContain('use Configurações para baixar a parte automatizada da cópia');
    expect(html).toContain('O manifesto avisará se alguma categoria precisa de complemento assistido');
    expect(html).toContain('Este formulário registra uma referência de atendimento');
    expect(html).toContain('Ela não permite consulta pública nesta página');
    expect(html).toContain('Enviar o formulário, por si só, não apaga a conta');
  });

  test('controller aceita somente request canônico, não importa PII da URL e mostra protocolo', () => {
    const html = read('ajuda.html');
    const controller = read('assets/js/controllers/public/help.controller.js');

    expect(controller).toContain('const PRIVACY_DEEP_LINKS = Object.freeze({');
    expect(controller).toContain("data_access_copy: Object.freeze({");
    expect(controller).toContain("data_portability: Object.freeze({");
    expect(controller).toContain("account_erasure: Object.freeze({");
    expect(controller).toContain('Object.prototype.hasOwnProperty.call(PRIVACY_DEEP_LINKS, request)');
    expect(controller).toContain("new URLSearchParams(window.location.search || '').get('request')");
    expect(controller).not.toMatch(/params\.get\(['"](?:email|user_id|account_id)['"]\)/);
    expect(controller).toContain("String(window.location.pathname || '/ajuda.html')");
    expect(controller).not.toContain("(window.location.pathname || '/ajuda.html') + (window.location.search || '')");
    expect(controller).toContain('result.data.id || result.data.out_id');
    expect(controller).toContain("dataSubjectProtocol ? 'data_subject_protocol' : 'help_reference'");
    expect(controller).toContain("'Protocolo do titular'");
    expect(controller).toContain("'Referência de atendimento'");
    expect(controller).toContain('acompanhar o pedido em Configurações');
    expect(controller).toContain('accountLoadGeneration');
    expect(controller).toContain('isActiveAccountLoad(generation, userId)');
    expect(controller).toContain("document.addEventListener('kc:authchange'");
    expect(controller).toContain('kcAccountPrefillUserId');
    expect(controller).toContain('profileBelongsToUser');
    expect(controller).toContain("expected_auth_state: authenticatedAccount ? 'authenticated' : 'anonymous'");
    expect(controller).toContain('expected_user_id: expectedUserId || null');
    expect(controller).toContain('state.accountLoadGeneration !== generation');
    expect(controller).toContain("form.setAttribute('aria-busy'");
    expect(controller).toContain("button.setAttribute('aria-busy'");
    expect(html).toMatch(/id="helpProtocol"[^>]*role="group"/);
    expect(html).not.toMatch(/id="helpProtocol"[^>]*aria-live=/);
  });

  test('request_kind é coletado pelo subtipo atual, sem depender do texto livre', () => {
    const controller = read('assets/js/controllers/public/help.controller.js');

    expect(controller).toContain('Help.getPrivacyRequestKind');
    expect(controller).toContain("metadata.source = state.deepLinkPreset ? 'help_privacy_deep_link' : 'help_form'");
    expect(controller).toContain("if (!requestKind) metadata.user_agent = navigator.userAgent || '';");
    expect(controller).toContain("document.querySelector('#helpConditionalFields [required]:invalid')");
  });

  test('visitante usa Turnstile explícito somente nas três rotas LGPD', () => {
    const html = read('ajuda.html');
    const css = read('assets/css/kc-public-shell.css');
    const controller = read('assets/js/controllers/public/help.controller.js');
    const adapter = read('assets/js/adapters/supabase/supabase.admin.adapter.js');
    const edge = read('supabase/functions/kc-create-privacy-help-guest/index.ts');

    expect(html).toMatch(
      /id="helpPrivacyVerification"[^>]*role="group"[^>]*aria-labelledby="helpPrivacyVerificationTitle"/
    );
    expect(html).toMatch(
      /id="helpPrivacyVerificationStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/
    );
    expect(html).toContain('id="helpPrivacyTurnstileWidget"');
    expect(html).toContain('data-kc-login="true"');
    expect(css).toContain('.kc-help-verification[hidden]');
    expect(css).toContain('.kc-help-turnstile-widget');

    expect(controller).toContain(
      "'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'"
    );
    expect(controller).toContain("const TURNSTILE_ACTION = 'help_privacy_guest'");
    expect(controller).toContain('const TURNSTILE_TOKEN_MAX_CHARS = 2048');
    expect(controller).toContain(
      'normalizedToken.length <= TURNSTILE_TOKEN_MAX_CHARS'
    );
    expect(controller).toContain('action: TURNSTILE_ACTION');
    expect(edge).toContain('const TURNSTILE_ACTION = "help_privacy_guest"');
    expect(controller).toContain('env.TURNSTILE_SITE_KEY || privacyHelp.turnstileSiteKey');
    expect(controller).toContain('state.authResolved &&');
    expect(controller).toContain('!isAuthenticatedAccountUser(state.user)');
    expect(controller).toContain("'expired-callback'");
    expect(controller).toContain("'error-callback'");
    expect(controller).toContain('window.turnstile.reset(state.turnstileWidgetId)');
    expect(controller).toContain('turnstile_token: privacyVerification.token');
    expect(controller.indexOf('preparePrivacyIdempotency(payload)')).toBeLessThan(
      controller.indexOf('turnstile_token: privacyVerification.token')
    );
    expect(controller).not.toMatch(
      /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([^)]*turnstile/iu
    );
    const fingerprint = controller.slice(
      controller.indexOf('function buildPrivacyFingerprintShape('),
      controller.indexOf('function getPrivacyCallerScope(')
    );
    expect(fingerprint).not.toContain('turnstile');

    expect(adapter).toContain("'kc-create-privacy-help-guest'");
    expect(adapter).toContain('turnstile_token: turnstileToken');
    expect(adapter).toContain('payload: rpcPayload');
    expect(adapter).toContain("client.rpc(rpcName");
    expect(adapter).toContain('error.context.json()');
    expect(adapter).not.toMatch(
      /console\.(?:log|debug|info|warn|error)\([^)]*turnstileToken/iu
    );
  });

  test('RPC do formulário vincula a gravação ao estado Auth observado', () => {
    const migration = read('supabase/migrations/20260729011000_harden_help_expected_auth_state.sql');
    const adapter = read('assets/js/adapters/supabase/supabase.admin.adapter.js');

    expect(migration).toContain("v_expected_auth_state not in ('', 'anonymous', 'authenticated')");
    expect(migration).toContain("message = 'AUTH_ACCOUNT_CHANGED'");
    expect(migration).toContain('if not kc_private.kc_is_current_session_active()');
    expect(migration).toContain("v_expected_auth_state := 'anonymous'");
    expect(migration).toContain('set user_id = null');
    expect(migration).toContain('kc_help_request_v2_20260729_auth_base');
    expect(adapter).toContain("expectedAuthState = expectedUserId ? 'authenticated' : 'anonymous'");
    expect(adapter).toContain('currentAuthState !== expectedAuthState');
    expect(adapter).toContain('expected_auth_state: expectedAuthState');
  });

  test('logout público falha fechado e só limpa a interface após confirmação do backend', () => {
    const settings = read('assets/js/controllers/public/settings.controller.js');
    const authUi = read('assets/js/core/kc-auth.ui.js');

    const settingsLogout = settings.slice(
      settings.indexOf('async function doLogout()'),
      settings.indexOf('function bindEvents()', settings.indexOf('async function doLogout()'))
    );
    expect(settingsLogout).toContain('const loggedOut = await window.KCAPI.logout();');
    expect(settingsLogout).toContain('if (loggedOut !== true)');
    expect(settingsLogout).toContain('Sua sessão continua ativa.');
    expect(settingsLogout.indexOf('if (loggedOut !== true)')).toBeLessThan(
      settingsLogout.indexOf("window.location.href = '/index.html'")
    );

    const shellLogout = authUi.slice(
      authUi.indexOf('async function doLogout()'),
      authUi.indexOf('function refreshHeaderLabel(', authUi.indexOf('async function doLogout()'))
    );
    expect(shellLogout).toContain('const loggedOut = await window.KCAPI.logout();');
    expect(shellLogout).toContain('if (loggedOut !== true)');
    expect(shellLogout.indexOf('if (loggedOut !== true)')).toBeLessThan(
      shellLogout.indexOf('writeShellSnapshot(null, null);')
    );
    expect(shellLogout).toContain('return false;');
    expect(shellLogout).toContain('if (logoutState.active)');
    expect(shellLogout).toContain('setLogoutControlsBusy(true);');
    expect(shellLogout).toContain("setLogoutStatus(failureMessage, 'error');");
    expect(shellLogout).toContain('setLogoutControlsBusy(false);');

    expect(authUi).toContain("status.id = 'kcAuthGlobalStatus';");
    expect(authUi).toContain("status.setAttribute('role', 'status');");
    expect(authUi).toContain("status.setAttribute('aria-atomic', 'true');");
    expect(authUi).toContain("normalizedTone === 'error' ? 'assertive' : 'polite'");

    const dropdownBinding = authUi.slice(
      authUi.indexOf('function openProfileDropdown('),
      authUi.indexOf('function closeProfileDropdown(', authUi.indexOf('function openProfileDropdown('))
    );
    expect(dropdownBinding).toContain("logoutButton.addEventListener('click', doLogout);");
    expect(dropdownBinding).not.toContain('{ once: true }');
  });

  test('protocolos aceitos reconciliam retry idempotente e cancelamento libera nova chave', () => {
    const controller = read('assets/js/controllers/public/settings.controller.js');

    expect(controller).toContain('function reconcilePrivacyActionKeys(requests)');
    expect(controller).toContain('PRIVACY_ACCEPTED_REQUEST_STATUSES.has(status)');
    expect(controller).toContain('reconcilePrivacyActionKeys(state.dataSubjectRequests);');
    expect(controller).not.toContain('authoritativelyComplete');
    expect(controller).toContain("result.data.reuse_reason === 'idempotency_key'");
    expect(controller).toContain('IDEMPOTENCY_ROTATION_CONFLICT');
    expect(controller).toContain("clearPrivacyActionKey('account_erasure');");
    expect(controller).toContain('clearPrivacyActionKey(request.request_kind);');
  });

  test('lista de protocolos expõe estado ocupado e semântica acessível', () => {
    const html = read('settings.html');
    const controller = read('assets/js/controllers/public/settings.controller.js');

    expect(html).toMatch(/id="settingsPrivacyDataStatus"[^>]*aria-atomic="true"/);
    expect(html).toMatch(/id="settingsDataSubjectRequests"[^>]*role="list"/);
    expect(html).toMatch(/id="settingsDataSubjectRequests"[^>]*aria-live="polite"/);
    expect(html).toMatch(/id="settingsDataSubjectRequests"[^>]*aria-busy="true"/);
    expect(controller).toContain("row.setAttribute('role', 'listitem');");
    expect(controller).toContain("button.setAttribute('aria-busy', mode === 'loading' ? 'true' : 'false');");
    expect(controller).toContain('class="fas fa-check" aria-hidden="true"');
  });

  test('pedido direto explica que a preferência de cópia ainda não é persistida', () => {
    const html = read('settings.html');
    const controller = read('assets/js/controllers/public/settings.controller.js');

    expect(html).toContain('id="settingsErasureCopyNotice"');
    expect(html).toContain('Baixe seus dados primeiro');
    expect(html).toContain('O pedido direto ainda não registra essa decisão');
    expect(controller).toContain('Este pedido direto ainda não registra se você quer uma cópia antes da exclusão.');
    expect(controller).not.toContain('export_before_erasure:');
  });

  test.each([
    'settings.html',
    'assets/js/controllers/public/settings.controller.js',
    'assets/js/core/kc-auth.ui.js',
    'assets/js/core/kc-i18n.js',
    'supabase/functions/kc-account-erasure/index.ts',
  ])('%s não contém sequências clássicas de mojibake', (relativePath) => {
    const source = read(relativePath);
    const mojibake = /(?:Ã(?:[\u0080-\u00bf]|\u0192)|Â(?:[\u0080-\u00bf]|\s)|â(?:[\u0080-\u00bf]|\u20ac)|ï¿½|\uFFFD)/u;
    expect(source).not.toMatch(mojibake);
  });

  test('e-mail de conclusão preserva português acentuado em texto e HTML', () => {
    const edge = read('supabase/functions/kc-account-erasure/index.ts');
    const completionEmail = edge.slice(
      edge.indexOf('function buildCompletionEmail('),
      edge.indexOf('function buildExternalProcessorMatrix(', edge.indexOf('function buildCompletionEmail('))
    );

    expect(completionEmail).toContain('Conclusão da solicitação de exclusão');
    expect(completionEmail).toContain('Concluímos o processamento');
    expect(completionEmail).toContain('Retenções mínimas');
    expect(completionEmail).toContain('Este comprovante não contém');
    expect(completionEmail).not.toContain('Conclusao');
  });
});
