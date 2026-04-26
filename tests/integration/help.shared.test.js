const Help = require('../../assets/js/shared/help.shared.js');

describe('KCHelpUtils', () => {
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
});
