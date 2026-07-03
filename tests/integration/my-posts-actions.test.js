/*
  my-posts.controller.js — action contracts.
  Cobre ações visíveis em minhas publicações sem executar DOM completo.
*/

'use strict';

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'public', 'my-posts.controller.js');

describe('my-posts.controller — ações de publicação', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('renderiza ações pedidas pelo produto', () => {
    expect(source).toContain('Compartilhar');
    expect(source).toContain('Marcar na agenda');
    expect(source).toContain('Impulsionar hoje');
    expect(source).toContain('Desabilitar anúncio');
    expect(source).toContain('Encerrar');
  });

  test('usa APIs existentes para compartilhar, encerrar e reativar', () => {
    expect(source).toContain('api.trackShare(uuid)');
    expect(source).toContain('api.closePost(uuid');
    expect(source).toContain('api.reactivatePost(uuid)');
  });

  test('reconhece status closed como encerrado', () => {
    expect(source).toContain("closed:    { label: 'Encerrado'");
    expect(source).toContain("status === 'closed'");
  });

  test('cria link rápido de Google Agenda para eventos com data', () => {
    expect(source).toContain('function buildGoogleCalendarHref(post)');
    expect(source).toContain('https://calendar.google.com/calendar/render?');
    expect(source).toContain("moduleKey !== 'eventos'");
  });
});
