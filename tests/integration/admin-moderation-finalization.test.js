'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

describe('moderação — acabamento funcional e acessível', () => {
  const html = read('admin/moderation.html');
  const moderation = read('assets/js/controllers/admin/admin-moderation.controller.js');
  const invites = read('assets/js/controllers/admin/admin-invite.controller.js');
  const external = read('assets/js/controllers/admin/admin-external-access.controller.js');

  test('tabela de convites pode ser exibida e carregamentos iniciais são anunciados', () => {
    expect(html).not.toMatch(/#invite-table\s*\{\s*display\s*:\s*none/);
    ['post-limits-body', 'post-flood-limits-body', 'audit-log-body'].forEach((id) => {
      const start = html.indexOf(`id="${id}"`);
      expect(start).toBeGreaterThan(-1);
      expect(html.slice(start, start + 520)).toContain('fa-spinner fa-spin');
      expect(html.slice(start, start + 520)).toContain('role="status"');
    });
    expect(html).toContain('id="invite-table-wrap" aria-busy="false"');
  });

  test('tabelas, paginação, limites e tabs expõem contratos responsivos e ARIA', () => {
    expect(html).toContain('<caption class="kc-sr-only">');
    expect(html).toContain('<th scope="col">');
    expect(html).toContain('id="limit-global-value" type="number" min="1" max="1000"');
    expect(html).toContain('id="limit-user-value" type="number" min="0" max="1000"');
    expect(html).toMatch(/id="audit-pagination" style="display:none;(?![^"]*display:)/);
    expect(html).toContain('role="tablist" aria-label="Status das solicitações de acesso externo"');
    expect(html).toContain('id="ext-access-list" class="kc-ext-access-list" role="tabpanel"');
    expect(html).not.toMatch(/id="ext-access-list"[^>]*aria-live/);
    expect(html).not.toContain('id="audit-log-empty"');
  });

  test('export congela filtros e dados, usa corte temporal e bloqueia ações concorrentes', () => {
    expect(moderation).toContain('function captureModerationExportContext()');
    expect(moderation).toContain('return Object.freeze(');
    expect(moderation).toContain("client.rpc('kc_admin_search_posts_full_snapshot'");
    expect(moderation.match(/client\.rpc\('kc_admin_search_posts_full_snapshot'/g)).toHaveLength(1);
    expect(moderation).toContain('p_limit: EXPORT_ROW_LIMIT');
    expect(moderation).toContain('p_offset: 0');
    expect(moderation).toContain('Array.isArray(envelope.out_rows)');
    expect(moderation).toContain('Number(envelope.out_total_count || 0)');
    const postsExport = moderation.slice(
      moderation.indexOf('async function fetchPostsForExport'),
      moderation.indexOf('async function fetchAuditRowsForExport')
    );
    expect(postsExport).not.toContain('for (let offset');
    expect(postsExport).not.toContain('.range(');
    expect(postsExport).toContain('.limit(EXPORT_ROW_LIMIT)');
    expect(moderation).toContain('p_until: context.snapshotAt');
    expect(moderation.match(/p_until: context\.snapshotAt/g)).toHaveLength(2);
    expect(moderation).toContain(".lte('created_at', context.snapshotAt)");
    expect(moderation).toContain("$('#moderation-export-pdf')");
    expect(moderation).toContain("$('#moderation-export-xlsx')");
    expect(moderation).toContain('if (_exportInFlight)');
    expect(moderation).toContain('audit_rows_exportadas');
    expect(moderation).not.toContain('audit_rows_na_pagina');
    expect(moderation).toContain('activeLimitsAvailable: limitsState.limitsLoaded === true');
    expect(moderation).toContain('externalAccessSnapshot');
    expect(moderation).toContain('function collectVisibleAdminSnapshotsForExport(warnings, context)');
    expect(moderation).not.toContain('async function fetchPostLimitsForExport');
    expect(moderation).not.toContain('async function fetchExternalAccessForExport');
  });

  test('listas auxiliares ignoram respostas antigas e preservam estado de loading', () => {
    expect(moderation).toContain('let _limitsRequestSeq = 0;');
    expect(moderation).toContain('let _floodLimitsRequestSeq = 0;');
    expect(moderation).toContain('if (requestSeq !== _limitsRequestSeq) return;');
    expect(moderation).toContain('if (requestSeq !== _floodLimitsRequestSeq) return;');
    expect(moderation).toContain('renderTableRequestState(tbody, 5,');
    expect(moderation).toContain('list.length > 0 &&');
    expect(invites).toContain('var inviteRequestSeq = 0;');
    expect(invites).toContain('if (requestSeq !== inviteRequestSeq) return;');
    expect(invites).toContain("wrap.setAttribute('aria-busy', 'true')");
    expect(invites).toContain('var SLOW_POLL_DELAY_MS = 2500;');
    expect(invites).toContain('renderInviteListUnavailable(');
    expect(invites).toContain('schedulePoll(tryLoad, SLOW_POLL_DELAY_MS);');
    expect(invites).toContain('if (pageInactive) return;');
  });

  test('convites renderizam células móveis e revogação mostra progresso real', () => {
    ['E-mail', 'Enviado em', 'Expira em', 'Status', 'Nota', 'Ação'].forEach((label) => {
      expect(invites).toContain(`data-label="${label}"`);
    });
    expect(invites).toContain("button.innerHTML = '<i class=\"fas fa-spinner fa-spin\"");
    expect(invites).toContain("row.setAttribute('aria-busy', 'true')");
    expect(invites).toContain('await loadInvites();');
  });

  test('histórico externo só sinaliza truncamento real e tabs funcionam pelo teclado', () => {
    expect(external).toContain('incomplete: total > MAX_LIST_ITEMS_PER_STATUS || items.length < target');
    expect(external).toContain("ev.key === 'ArrowRight' || ev.key === 'ArrowDown'");
    expect(external).toContain("ev.key === 'ArrowLeft' || ev.key === 'ArrowUp'");
    expect(external).toContain("ev.key === 'Home'");
    expect(external).toContain("ev.key === 'End'");
    expect(external).toContain("list.setAttribute('aria-labelledby', tab.id)");
    expect(external).toContain('window.KCAdminExternalAccessSnapshot = Object.freeze');
    expect(external).toContain('return freezeSnapshotValue({');
    expect(external).toContain('available: STATE.hasLoaded');
  });

  test('fallback do audit resolve nomes antes de paginar e preserva UUID exato', () => {
    expect(moderation).toContain('async function resolveAuditActorIds(client, actorQuery)');
    expect(moderation).toContain("query = query.in('actor_id', actorIdsForFallback)");
    expect(moderation).toContain("query = query.eq('actor_id', actorQuery)");
    expect(moderation).not.toContain('const actorQueryLower = actorQuery.toLowerCase();');

    const interactiveStart = moderation.indexOf('// Fallback paginado para projetos ainda sem a RPC.');
    const interactiveEnd = moderation.indexOf('// Detectar hasMore', interactiveStart);
    const interactiveFallback = moderation.slice(interactiveStart, interactiveEnd);
    expect(interactiveFallback.indexOf("query = query.in('actor_id', actorIdsForFallback)"))
      .toBeLessThan(interactiveFallback.indexOf('query = query.range(offset, offset + limit)'));

    const exportStart = moderation.indexOf('async function fetchAuditRowsForExport');
    const exportEnd = moderation.indexOf('function collectVisibleAdminSnapshotsForExport', exportStart);
    const exportFallback = moderation.slice(exportStart, exportEnd);
    expect(exportFallback.indexOf("query = query.in('actor_id', actorIdsForFallback)"))
      .toBeLessThan(exportFallback.indexOf('query = query.range(offset, offset + limit - 1)'));
  });

  test('cópia de link só confirma sucesso após a API ou fallback responder', () => {
    expect(external).toContain('async function copyInviteLink(input)');
    expect(external).toContain('await navigator.clipboard.writeText(input.value)');
    expect(external).toContain('const copied = await copyInviteLink(input)');
    expect(external).toContain('if (copied)');
    expect(external).toContain('Copie manualmente');
  });

  test('handoff da fila abre e destaca o pedido sem disparar decisão', () => {
    expect(external).toContain('function consumeExternalAccessFocus()');
    expect(external).toContain("window.sessionStorage.removeItem(EXTERNAL_ACCESS_FOCUS_KEY)");
    expect(external).toContain('expiresAt >= Date.now() && UUID_RE.test(storedId)');
    expect(external).toContain("window.history.replaceState(null, '', url.pathname + url.search + url.hash)");
    expect(external).toContain("card.classList.add('is-focused')");
    expect(external).toContain("card.scrollIntoView({ behavior: 'smooth', block: 'center' })");
    expect(external).toMatch(
      /if \(!items\.length\) \{[\s\S]*?focusRequestedItem\(\);[\s\S]*?return;/,
    );
    const handoff = external.slice(
      external.indexOf('function consumeExternalAccessFocus'),
      external.indexOf('async function init()', external.indexOf('function consumeExternalAccessFocus'))
    );
    expect(handoff).not.toContain('openModal(');
    expect(handoff).not.toContain('decideExternalAccess');
  });
});
