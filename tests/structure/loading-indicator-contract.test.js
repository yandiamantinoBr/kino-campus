'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function walk(dir, predicate) {
  const output = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'tmp', 'vendor'].includes(entry.name)) {
        output.push(...walk(fullPath, predicate));
      }
      return;
    }
    if (predicate(fullPath)) output.push(fullPath);
  });
  return output;
}

describe('indicadores de carregamento globais', () => {
  const css = read('assets/css/styles.css');

  test('spinner transversal possui rotação, pulso e fallback para movimento reduzido', () => {
    expect(css).toContain('@keyframes kc-loader-rotate');
    expect(css).toContain('@keyframes kc-loader-pulse');
    expect(css).toMatch(/\.fa-spinner\.fa-spin\s*\{[\s\S]*animation:\s*kc-loader-rotate/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.fa-spinner\.fa-spin[\s\S]*animation:\s*none !important/
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.kc-skeleton[\s\S]*animation:\s*none !important/
    );
  });

  test('loaders auxiliares também respeitam movimento reduzido', () => {
    const themeBoot = read('assets/css/kc-theme-boot.css');
    const chat = read('assets/css/kc-chat.css');
    const cadu = read('admin/cadu.html');

    expect(themeBoot).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.kc-hero-carousel\.kc-hero-loading::after[\s\S]*animation:\s*none/
    );
    expect(themeBoot.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
      .toBeGreaterThan(themeBoot.lastIndexOf('transition: opacity 0.28s ease'));
    expect(chat).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.kc-chat-typing span[\s\S]*animation:\s*none !important/
    );
    expect(chat).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.kc-chat-skeleton-circle[\s\S]*\.kc-chat-skeleton-line::after/
    );
    expect(cadu).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.kc-pipeline-status-dot\.is-running[\s\S]*animation:\s*none !important/
    );
  });

  test('chat, feed e Cadu encerram e anunciam estados de carregamento', () => {
    const chatHtml = read('mensagens.html');
    const chatCss = read('assets/css/kc-chat.css');
    const chatController = read('assets/js/controllers/public/chat-inbox.controller.js');
    const feed = read('assets/js/controllers/public/kc-feed.controller.js');
    const cadu = read('admin/cadu.html');

    expect(chatHtml).toContain('id="kcChatListStatus" role="status" aria-live="polite"');
    expect(chatHtml).toContain('id="kcChatList" role="list" aria-busy="true"');
    expect(chatCss).toMatch(
      /\[data-theme="light"\] \.kc-chat-skeleton-circle,[\s\S]*background: rgba\(15, 23, 42, 0\.18\)/
    );
    expect(chatController).toContain("list.setAttribute('aria-busy', busy ? 'true' : 'false')");
    expect(chatController).toContain("mwrap.setAttribute('aria-busy', 'true')");
    expect(chatController).toContain("wrap.setAttribute('aria-busy', 'false')");
    expect(feed).toContain('data-kc-feed-error="renderer-unavailable"');
    expect(feed).toContain("container.setAttribute('aria-busy', 'false')");
    expect(feed).not.toContain('mantendo fallback estático');
    expect(cadu).toMatch(
      /id="cadu-status-pill"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*aria-busy="true"/
    );
  });

  test('todo spinner literal esconde o ícone decorativo da árvore de acessibilidade', () => {
    const files = [
      ...walk(path.join(ROOT, 'assets', 'js'), (file) => file.endsWith('.js') && !file.endsWith('.min.js')),
      ...walk(ROOT, (file) => {
        const rel = path.relative(ROOT, file);
        return !rel.includes(path.sep) && file.endsWith('.html');
      }),
      ...walk(path.join(ROOT, 'admin'), (file) => file.endsWith('.html')),
    ];
    const failures = [];
    const spinnerTag = /<i\b[^>]*\bfa-spinner\b[^>]*\bfa-spin\b[^>]*>/gi;

    files.forEach((file) => {
      const source = fs.readFileSync(file, 'utf8');
      Array.from(source.matchAll(spinnerTag)).forEach((match) => {
        if (!/\baria-hidden=(["'])true\1/i.test(match[0])) {
          failures.push(`${path.relative(ROOT, file)}: ${match[0]}`);
        }
      });
    });

    expect(failures).toEqual([]);
  });

  test('loaders icon-only de ranking e calendário anunciam o estado', () => {
    const ranking = read('assets/js/features/kc-ranking.js');
    const home = read('assets/js/controllers/public/index.controller.js');
    const calendar = read('assets/js/features/kc-events-calendar.js');

    [ranking, home].forEach((source) => {
      expect(source).toContain('role="status"');
      expect(source).toContain('Carregando ranking…');
    });
    expect(calendar).toContain('aria-busy="true"');
    expect(calendar).toContain("grid.setAttribute('aria-busy', calState.loading ? 'true' : 'false')");
    expect(calendar).toContain('Carregando calendário…');
    expect(calendar).not.toMatch(/kc-cal-loading" role="status"/);
    expect(home).toContain('status.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span>${message}</span>`');
  });

  test('gates administrativos anunciam a verificação ou o carregamento', () => {
    const pages = [
      'admin/index.html',
      'admin/moderation.html',
      'admin/reports.html',
      'admin/privacy-analytics.html',
      'admin/ga4-dashboard.html',
      'admin/help-requests.html',
    ];
    pages.forEach((page) => {
      expect(read(page)).toMatch(
        /id="admin-loading"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/
      );
    });
    expect(read('admin/banners.html')).toMatch(
      /id="banners-loading"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/
    );
  });

  test('toda página que carrega styles.css aponta para a versão global nova', () => {
    const pages = [
      ...walk(ROOT, (file) => {
        const rel = path.relative(ROOT, file);
        return !rel.includes(path.sep) && file.endsWith('.html');
      }),
      ...walk(path.join(ROOT, 'admin'), (file) => file.endsWith('.html')),
    ];
    const stale = [];
    pages.forEach((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const matches = Array.from(source.matchAll(/styles\.css\?v=([^"'&\s]+)/g));
      matches.forEach((match) => {
        if (match[1] !== '8.6.11') stale.push(`${path.relative(ROOT, file)}=${match[1]}`);
      });
    });
    expect(stale).toEqual([]);
  });
});
