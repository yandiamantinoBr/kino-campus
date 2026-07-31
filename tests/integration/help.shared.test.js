const Help = require('../../assets/js/shared/help.shared.js');

describe('KCHelpUtils', () => {
  test('mantém rótulos públicos em português brasileiro com acentuação correta', () => {
    expect(Help.HELP_TYPE_LABELS.question).toBe('Dúvida');
    expect(Help.HELP_TYPE_LABELS.external_access).toBe('Solicitação de acesso externo');
    expect(Help.HELP_TYPE_LABELS.report).toBe('Denúncia');
    expect(Help.HELP_MODULE_LABELS.index).toBe('Página inicial');
    expect(Help.HELP_MODULE_LABELS.settings).toBe('Configurações');
    expect(Help.HELP_TOPIC_LABELS.slow_performance).toBe('Lentidão');
    expect(Help.HELP_TOPIC_LABELS.create_edit_post).toBe('Criar ou editar publicação');
  });

  test('getHelpTopicOptions returns coherent topics for platform issues', () => {
    const results = Help.getHelpTopicOptions('platform_issue');

    expect(results.map((item) => item.value)).toEqual([
      'bugs_crashes',
      'slow_performance',
      'search_filters',
      'create_edit_post',
    ]);
  });

  test('getHelpSubtopicOptions returns coherent subtopics for platform issue bugs', () => {
    const results = Help.getHelpSubtopicOptions('platform_issue', 'bugs_crashes');

    expect(results.map((item) => item.value)).toEqual([
      'menu_bug',
      'layout_break',
      'mobile_bug',
      'freeze_reload',
    ]);
  });

  test('expõe direitos de privacidade como subtipos compatíveis com conta e configurações', () => {
    const results = Help.getHelpSubtopicOptions('account_access', 'onboarding_settings');
    const values = results.map((item) => item.value);

    expect(values).toEqual(expect.arrayContaining([
      'account_data_copy',
      'account_data_portability',
      'account_deletion',
    ]));
    expect(Help.getPrivacyRequestKind('account_access', 'onboarding_settings', 'account_data_copy'))
      .toBe('data_access_copy');
    expect(Help.getPrivacyRequestKind('account_access', 'onboarding_settings', 'account_data_portability'))
      .toBe('data_portability');
    expect(Help.getPrivacyRequestKind('account_access', 'onboarding_settings', 'account_deletion'))
      .toBe('account_erasure');
    expect(Help.getPrivacyRequestKind('question', 'profile_contact', 'account_deletion')).toBe('');
  });

  test('usa campos próprios e obrigatórios para cópia, portabilidade e exclusão', () => {
    const copyFields = Help.getHelpConditionalFields(
      'account_access',
      'onboarding_settings',
      'account_data_copy'
    );
    const portabilityFields = Help.getHelpConditionalFields(
      'account_access',
      'onboarding_settings',
      'account_data_portability'
    );
    const deletionFields = Help.getHelpConditionalFields(
      'account_access',
      'onboarding_settings',
      'account_deletion'
    );

    expect(copyFields.map((item) => item.key)).toEqual([
      'account_email',
      'data_scope',
      'data_copy_format',
    ]);
    expect(portabilityFields.map((item) => item.key)).toEqual([
      'account_email',
      'data_scope',
      'portability_context',
    ]);
    expect(deletionFields.map((item) => item.key)).toEqual([
      'account_email',
      'export_before_erasure',
    ]);
    expect(copyFields.find((item) => item.key === 'account_email').required).toBe(true);
    expect(deletionFields.every((item) => item.required === true)).toBe(true);
    expect(deletionFields.map((item) => item.key)).not.toEqual(
      expect.arrayContaining(['page_path', 'error_message'])
    );
  });

  test('getHelpConditionalFields returns conditional fields for performance issues', () => {
    const results = Help.getHelpConditionalFields('platform_issue', 'slow_performance');

    expect(results.map((item) => item.key)).toEqual([
      'affected_module',
      'page_path',
      'reproduce_steps',
      'device_context',
      'impact_scope',
    ]);
  });

  test('normalizeHelpRequestInput validates and normalizes the new help payload', () => {
    const payload = Help.normalizeHelpRequestInput({
      type: 'Platform Issue',
      topic: 'Bugs_Crashes',
      subtopic: 'Menu_Bug',
      subject: '  Menu fecha e recarrega tudo  ',
      message: '  Quando eu abro o menu no celular, a pagina recarrega.  ',
      priority: 'High',
      page_path: ' /index.html ',
      contact_email: ' Yan@Discente.UFG.Br ',
      allow_contact: true,
      metadata: {
        affected_module: 'Eventos',
        page_path: ' /eventos.html ',
        reproduce_steps: '  Abrir menu > arrastar para baixo  ',
        device_context: ' Android 14 / Chrome ',
        ignored_field: 'should-not-survive',
      },
    });

    expect(payload).toMatchObject({
      type: 'platform_issue',
      topic: 'bugs_crashes',
      subtopic: 'menu_bug',
      subject: 'Menu fecha e recarrega tudo',
      message: 'Quando eu abro o menu no celular, a pagina recarrega.',
      priority: 'high',
      page_path: '/index.html',
      contact_email: 'yan@discente.ufg.br',
      allow_contact: true,
      metadata: {
        affected_module: 'eventos',
        page_path: '/eventos.html',
        reproduce_steps: 'Abrir menu > arrastar para baixo',
        device_context: 'Android 14 / Chrome',
      },
    });

    expect(payload.metadata.ignored_field).toBeUndefined();
  });

  test('normalizeHelpRequestInput uses safe fallbacks for invalid values', () => {
    const payload = Help.normalizeHelpRequestInput({
      type: '???',
      topic: '???',
      priority: '???',
      status: '???',
      contact_email: 'email-invalido',
    }, {
      fallbackEmail: 'contato@kinocampus.com.br',
    });

    expect(payload.type).toBe('question');
    expect(payload.topic).toBe('publishing_navigation');
    expect(payload.priority).toBe('normal');
    expect(payload.status).toBe('new');
    expect(payload.contact_email).toBe('contato@kinocampus.com.br');
  });

  test('normalizeHelpRequestInput maps Portuguese priority labels without silent demotion', () => {
    expect(Help.normalizeHelpRequestInput({ priority: 'Urgente' }).priority).toBe('urgent');
    expect(Help.normalizeHelpRequestInput({ priority: 'urgente' }).priority).toBe('urgent');
    expect(Help.normalizeHelpRequestInput({ priority: 'Alta' }).priority).toBe('high');
    expect(Help.normalizeHelpRequestInput({ priority: 'Baixa' }).priority).toBe('low');
    expect(Help.normalizeHelpRequestInput({ priority: 'Normal' }).priority).toBe('normal');
  });

  test('normalizeHelpRequestInput preserves external access metadata safely', () => {
    const payload = Help.normalizeHelpRequestInput({
      type: 'external_access',
      topic: 'non_institutional_email',
      subtopic: 'has_context',
      subject: 'Solicitação de acesso externo',
      message: 'Sou pesquisador convidado e preciso acompanhar eventos.',
      contact_email: ' convidado@example.com ',
      metadata: {
        request_kind: 'external_access',
        source: 'kc-auth-non-ufg',
        requester_name: ' Visitante Externo ',
        affiliation_context: ' Projeto parceiro da UFG ',
        institutional_domain_hint: '@ufg.br, @discente.ufg.br',
        email_notification: {
          status: 'simulated_local',
          provider: 'local',
          to: 'contato@kinocampus.com.br',
          sent_at: '2026-05-07T12:00:00.000Z',
        },
        ignored_field: 'remove me',
      },
    });

    expect(payload).toMatchObject({
      type: 'external_access',
      topic: 'non_institutional_email',
      subtopic: 'has_context',
      contact_email: 'convidado@example.com',
      metadata: {
        request_kind: 'external_access',
        source: 'kc-auth-non-ufg',
        requester_name: 'Visitante Externo',
        affiliation_context: 'Projeto parceiro da UFG',
        institutional_domain_hint: '@ufg.br, @discente.ufg.br',
        email_notification: {
          status: 'simulated_local',
          provider: 'local',
          to: 'contato@kinocampus.com.br',
          sent_at: '2026-05-07T12:00:00.000Z',
        },
      },
    });
    expect(payload.metadata.ignored_field).toBeUndefined();
  });

  test('deriva request_kind do subtipo canônico e não aceita classificação conflitante', () => {
    const copy = Help.normalizeHelpRequestInput({
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_data_copy',
      subject: 'Quero uma cópia',
      message: 'Solicito todos os dados associados à conta.',
      contact_email: 'titular@example.com',
      metadata: {
        request_kind: 'account_erasure',
        account_email: 'titular@example.com',
        data_scope: 'all_account_data',
        data_copy_format: 'structured',
      },
    });

    expect(copy.metadata).toMatchObject({
      request_kind: 'data_access_copy',
      account_email: 'titular@example.com',
      data_scope: 'all_account_data',
      data_copy_format: 'structured',
    });
  });
});
