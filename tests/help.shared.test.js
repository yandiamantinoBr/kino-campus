const Help = require('../assets/js/help.shared.js');

describe('KCHelpUtils', () => {
  test('getHelpSubtopicOptions devolve subtópicos coerentes por categoria e tema', () => {
    const results = Help.getHelpSubtopicOptions('complaint', 'platform_use');

    expect(results.map((item) => item.value)).toEqual([
      'bug',
      'slow_performance',
      'layout_issue',
      'accessibility',
    ]);
  });

  test('normalizeHelpRequestInput limpa e valida payload básico', () => {
    const payload = Help.normalizeHelpRequestInput({
      type: 'Complaint',
      topic: 'Platform Use',
      subtopic: 'Bug',
      subject: '  Travamento ao abrir o menu  ',
      message: '  O menu congela quando tento abrir no celular.  ',
      priority: 'High',
      page_path: ' /index.html ',
      contact_email: ' Yan@Discente.UFG.Br ',
      allow_contact: true,
      metadata: { viewport: '412x915' },
    });

    expect(payload).toMatchObject({
      type: 'complaint',
      topic: 'platform_use',
      subtopic: 'bug',
      subject: 'Travamento ao abrir o menu',
      message: 'O menu congela quando tento abrir no celular.',
      priority: 'high',
      page_path: '/index.html',
      contact_email: 'yan@discente.ufg.br',
      allow_contact: true,
    });
  });

  test('normalizeHelpRequestInput usa fallbacks seguros quando há valores inválidos', () => {
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
    expect(payload.topic).toBe('platform_use');
    expect(payload.priority).toBe('normal');
    expect(payload.status).toBe('new');
    expect(payload.contact_email).toBe('contato@kinocampus.com.br');
  });
});
