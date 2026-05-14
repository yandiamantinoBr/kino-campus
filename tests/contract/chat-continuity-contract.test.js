'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('chat continuity contract', () => {
  test('KCAPI exposes chat before freezing the public facade', () => {
    const source = read('assets/js/api/kc-api.client.js');
    expect(source).toContain('const chat = window._KCAPI.chat || {};');
    expect(source).toContain('window._KCAPI.chat = chat;');
    expect(source).toContain('chat,');
  });

  test('kc-api.chat fills the shared chat facade instead of mutating frozen KCAPI', () => {
    const source = read('assets/js/api/kc-api.chat.js');
    expect(source).toContain('var target = window._KCAPI.chat || {};');
    expect(source).not.toContain('window.KCAPI.chat =');
  });

  test('chat images use signed URLs instead of public storage URLs', () => {
    const source = read('assets/js/controllers/public/chat-inbox.controller.js');
    expect(source).toContain('getSignedUrl');
    expect(source).not.toContain('getPublicUrl');
  });

  test('mensagens has the short Vercel route rewrite', () => {
    const source = read('vercel.json');
    expect(source).toContain('"source": "/mensagens"');
    expect(source).toContain('"destination": "/mensagens.html"');
  });
});
