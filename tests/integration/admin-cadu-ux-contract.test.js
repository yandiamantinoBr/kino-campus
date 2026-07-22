const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const controller = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-cadu.controller.js'),
  'utf8'
);
const html = fs.readFileSync(path.join(ROOT, 'admin/cadu.html'), 'utf8');

describe('admin Cadu UX contracts', () => {
  test('content-addresses immutable Cadu JavaScript assets', () => {
    [
      'assets/js/controllers/admin/admin-cadu-sources.js',
      'assets/js/controllers/admin/admin-cadu.controller.js'
    ].forEach((relativePath) => {
      const canonicalText = fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
      const version = crypto.createHash('sha256').update(canonicalText, 'utf8').digest('hex').slice(0, 16);
      expect(html).toContain(`src="../${relativePath}?v=${version}"`);
    });
  });

  test('keeps the feed page size aligned with the visible default', () => {
    expect(controller).toContain('var FEED_PAGE_SIZE = 25;');
    expect(controller).toContain('feedLimit: FEED_PAGE_SIZE');
    expect(html).toMatch(/<option value="25">25 itens<\/option>/);
  });

  test('load more appends the next page instead of replacing the current rows', () => {
    expect(controller).toContain('function loadFeedMore()');
    expect(controller).toContain('state.feedPage + loadedPages');
    expect(controller).toContain('state.allFeedItems.concat(items)');
    expect(controller).toContain("feedMoreB.addEventListener('click', loadFeedMore)");
  });

  test('KPI shortcuts reset stale site filters before applying their own filter', () => {
    expect(controller).toContain("state.sitesFilter = { q: '', tier: '', ig: '' }");
    expect(controller).toContain("if (filter !== 'all')");
    expect(html).toContain('data-kpi-filter="all"');
    expect(html).toContain('data-kpi-filter="ig=confirmed"');
    expect(html).toContain('data-kpi-filter="tier=1"');
  });

  test('labels canonical priority metrics separately from the operational context', () => {
    expect(html).toContain('fontes com prioridade efetiva T1, quando disponível');
    expect(html).not.toContain('pró-reitorias + alta prioridade');
    expect(controller).toContain('Contexto operacional:');
    expect(controller).not.toContain('> Context: ');
  });

  test('PDF export restores the original button markup', () => {
    expect(controller).not.toContain('.innerHtml');
    expect(controller.match(/btn \? btn\.innerHTML : ''/g).length).toBeGreaterThanOrEqual(2);
  });

  test('new interactive controls keep localized tooltip contracts', () => {
    [
      'tooltip.cadu-kpi-sites',
      'tooltip.cadu-kpi-instagram',
      'tooltip.cadu-kpi-tier1',
      'tooltip.cadu-kpi-feed',
      'tooltip.cadu-kpi-api',
      'tooltip.cadu-sites-export-pdf',
      'tooltip.cadu-feed-export-pdf',
      'tooltip.cadu-feed-load-more'
    ].forEach((key) => expect(html).toContain(`data-i18n-tooltip="${key}"`));
  });

  test('links the Cadu integration documentation to the real repository path', () => {
    expect(html).toContain('https://github.com/yandiamantinoBr/openclaw-cadu/blob/main/docs/INTEGRATION-KINOCAMPUS.md');
    expect(html).not.toContain('href="docs/INTEGRATION-KINOCAMPUS.md"');
  });

  test('pipeline actions make dry-run versus real execution explicit', () => {
    expect(controller).toContain('data-dry-run="');
    expect(controller).toContain("state.pipelineCapabilities = validation.capabilities;");
    expect(controller).toContain("status.contract_version !== PIPELINE_CONTROL_CONTRACT");
    expect(controller).toContain("pf.can_run !== true");
    expect(controller).toContain('if (!await ensureFreshPipelineControl())');
    expect(controller).toContain('schedulePipelineControlExpiry();');
    expect(controller).toContain('snapshotGeneration !== state.pipelineRequestGeneration');
    expect(controller).toContain("var displayLabel = canRefreshControl ? 'Renovar · ' + label : label;");
    expect(controller).toContain("capabilities.explicit_run_mode_routes === true");
    expect(controller).toContain("profile.force_dry_run === true");
    expect(controller).toContain("profile.mutates_platform ? 'Executar real' : 'Executar'");
    expect(controller).toContain('buildPipelineRunRequest(stageId, dryRun, state.pipelineCapabilities)');
    expect(controller).toContain("path += dryRun ? '/dry-run' : '/real'");
    expect(controller).toContain('body: JSON.stringify(request.payload)');
    expect(html).toContain('.kc-pipeline-stage__actions');
  });

  test('pipeline action siblings are locked and restored as one operation', () => {
    expect(controller).toContain('function lockPipelineActionButtons(clickedButton)');
    expect(controller).toContain("parent.querySelectorAll('.kc-pipeline-stage__btn')");
    expect(controller).toContain('state.pipelineStartPending = true;');
    expect(controller).toContain('state.pipelineStartPending = false;');
    expect(controller).toContain('renderPipelineStages(state.pipelineStages || []);');
    expect(controller).toContain('restoreButtons();');
  });

  test('active pipeline card exposes the effective execution mode', () => {
    expect(controller).toContain("typeof active.dry_run === 'boolean'");
    expect(controller).toContain("active.dry_run ? 'simulação' : 'execução real'");
    expect(controller).toContain("typeof r.dry_run === 'boolean'");
  });

  test('PDF explains registry provenance without calling scanner evidence confirmation', () => {
    expect(controller).not.toContain('perfis validados pelo scanner');
    expect(controller).toContain('perfil com evidência institucional confirmada');
    expect(controller).toContain("{ key: 'ajuste', label: 'Ajuste'");
    expect(controller).toContain('Ajustes estáveis exigem ETag/CAS');
    expect(controller).toContain('Prioridades efetivas e notas administrativas podem estar omitidas no espelho');
  });

  test('does not claim that the shadow registry already drives production collection', () => {
    expect(html).toContain('O Curador em produção ainda consulta os inventários operacionais legados validados.');
    expect(html).toContain('permanece em modo de validação (<code>shadow</code>), com as fontes desabilitadas');
    expect(html).toContain('este catálogo está em <code>shadow</code> e não ativa coleta');
    expect(html).toContain('Curador e scanner ainda leem inventários operacionais validados');
    expect(html).not.toContain('perfis oficiais habilitados pelo catálogo canônico');
  });

  test('explains source counts and the five independent Mapa UFG state dimensions', () => {
    expect(html).toContain('id="sites-source-record-count"');
    expect(html).toContain('Fonte não é programa:');
    expect(html).toContain('a contagem de fontes web não representa a quantidade de programas ou unidades da UFG');
    [
      '1. Identidade / revisão',
      '2. Transporte',
      '3. Ajuste administrativo',
      '4. Fila editorial',
      '5. Última execução'
    ].forEach((label) => expect(html).toContain(label));
    expect(html).toContain('não substitui a auditoria estática de transporte');
    expect(controller).toContain("catalogCountLabel(summary.sources, 'registro de fonte web', 'registros de fonte web')");
    expect(controller).toContain("catalogCountLabel(roleCounts.legacy, 'observação legada', 'observações legadas')");
  });

  test('loads and validates the canonical registry before enabling source views', () => {
    expect(html.indexOf('src="../assets/js/controllers/admin/admin-cadu-sources.js')).toBeLessThan(
      html.indexOf('src="../assets/js/controllers/admin/admin-cadu.controller.js')
    );
    ['sources', 'entities', 'instagram', 'deferred'].forEach((view) => {
      expect(html).toContain(`<option value="${view}">`);
    });
    expect(controller).toContain("apiFetchResponse('/api/cadu/sites/source-registry')");
    expect(controller).toContain("'/api/cadu/sites/source-registry/readiness',");
    expect(controller).toContain('{ timeoutMs: 4000 }');
    expect(controller).toContain('registryModel().validateRegistryReadiness(');
    expect(controller).toContain('registryModel().buildCatalog(registryEnvelope.data, registryResponseMeta(registryEnvelope))');
    expect(controller).toContain("'X-Cadu-Canonical-ETag': envelope.headers.canonicalEtag");
    expect(controller).toContain("canonicalEtag: res.headers.get('x-cadu-canonical-etag')");
    expect(controller).toContain("'X-Cadu-Registry-Sha256': envelope.headers.registrySha256");
    expect(controller).toContain("state.catalogMode = 'legacy-readonly'");
    expect(controller).toContain(
      'Escritas estão bloqueadas porque a API não confirmou o catálogo canônico e suas revisões estáveis.'
    );
  });

  test('never autosaves legacy names and writes stable source IDs with strong CAS', () => {
    expect(controller).not.toContain('scheduleSiteSave');
    expect(controller).not.toContain('commitSiteSave');
    expect(controller).not.toContain("'/meta'");
    expect(controller).toContain('registryModel().buildOverrideMutation(source, changes)');
    expect(controller).toContain("apiFetchResponse('/api/cadu/sites/' + mutation.path");
    expect(controller).toContain('mutation.headers');
    expect(controller).toContain("envelope.status === 412 || envelope.status === 409");
    expect(controller).toContain('var expectedEtag = canonicalResponseEtag(envelope)');
    expect(controller).toContain('Nenhuma repetição automática foi feita.');
    expect(controller).toContain("state.sourceSaveChains[sourceId]");
    expect(controller).toContain('window.confirm(\'Salvar prioridade + nota como ajuste administrativo estável para \' + source.id');
    expect(controller).toContain('Isso não corrige URL/Instagram nem ativa a pipeline.');
  });

  test('keeps inherited notes visibly separate and requires an explicit first tier', () => {
    expect(controller).toContain('Nota herdada (não será copiada):');
    expect(controller).toContain('Escolha a prioridade…');
    expect(controller).toContain('function normalizedDraftNote(note)');
    expect(controller).toContain("String(note == null ? '' : note).trim() === '' ? null : String(note)");
    expect(controller).toContain('compare os valores e decida manualmente antes de salvar novamente');
  });

  test('makes the exact review block reason and adjustment scope visible without relying on title', () => {
    expect(controller).toContain('Motivo do bloqueio: ');
    expect(controller).toContain('aria-describedby="' + "' + escapeHtml(reviewGateId) + '" + '"');
    expect(controller).toContain('class="kc-cadu-review-gate ');
    expect(controller).toContain('salva apenas prioridade e nota administrativa. Não corrige URL/Instagram nem ativa a pipeline.');
    expect(controller).toContain("stable ? 'Atualizar prioridade + nota' : 'Salvar prioridade + nota'");
    expect(controller).not.toContain("stable ? 'Salvar ajuste' : 'Criar ajuste estável'");
  });

  test('provides a durable institutional review queue without implying publication', () => {
    expect(html).toContain('id="institutional-review-queue"');
    expect(html).toContain('id="institutional-review-filters"');
    expect(html).toContain('(correspondência exata; não busca trechos)');
    expect(html).toContain('Aprovar, rejeitar ou substituir apenas encerra a solicitação');
    expect(html).toContain('nenhuma dessas ações publica conteúdo nem ativa fonte, Instagram ou pipeline');
    expect(html).toContain('depois de conferir todas as páginas da fila pendente');
    expect(html).toContain('o ID exato da fonte é confirmado novamente no servidor');
    expect(controller).toContain("return '/api/cadu/source-reviews?' + params.toString()");
    expect(controller).toContain("apiFetchResponse('/api/cadu/source-reviews', {");
    expect(controller).toContain("expected_source_revision: item.source_revision");
    expect(controller).toContain("state.pendingInstitutionalReviewsBySource[source.id]");
    expect(controller).toContain('loadPendingInstitutionalReviewAuthority()');
    expect(controller).toContain('confirmPendingInstitutionalReviewForSource(source.id)');
    expect(controller).toContain('INSTITUTIONAL_REVIEW_AUTHORITY_MAX_ITEMS = 500');
    expect(controller).toContain("pendingInstitutionalReviewAuthorityState: 'loading'");
    expect(controller).toContain("label: authority.loading ? 'Verificando pendências' : 'Revisão indisponível'");
    expect(controller).toContain('Não publica conteúdo e não ativa fonte, Instagram ou pipeline.');
    expect(controller).toContain('function resolveInstitutionalReview(reviewId, decision)');
    expect(controller).toContain('state.institutionalReviewResolveChains[reviewId]');
    expect(controller).toContain('<details class="kc-cadu-review-queue__technical">');
  });

  test('serializes source writes, preserves dirty drafts and revalidates the exact effect', () => {
    expect(controller).toContain('catalogRequestGeneration: 0');
    expect(controller).toContain('requestGeneration !== state.catalogRequestGeneration');
    expect(controller).toContain('state.sourceMutationQueue || Promise.resolve()');
    expect(controller).toContain('baseRevision: source.revision, draft: Object.assign({}, draft)');
    expect(controller).toContain('function revalidatedSourceMatches(source, changes, expectedEtag)');
    expect(controller).toContain("revalidatedMode !== 'registry'");
    expect(controller).toContain('o catálogo canônico não pôde ser revalidado');
    expect(controller).toContain('var retainedDrafts = sourceDraftsForReload(options);');
    expect(controller).toContain('var reloadDrafts = sourceDraftsForReload(opts);');
    expect(controller).toContain('state.sourceDrafts = retainCatalogDrafts(catalog, reloadDrafts);');
    expect(controller).toContain('function sourceDraftIsDirtyWithoutSource(draft)');
  });

  test('keeps shadow registry sources non-publishable and carries every Instagram status as context', () => {
    expect(controller).toContain('registryModel().selectUnambiguousConfirmedInstagram(profiles)');
    expect(controller).toContain("return '@' + profile.handle + ' (' + catalogLabel(profile.status) + ')';");
    expect(controller).toContain('class="kc-cadu-publish-btn" disabled');
    expect(controller).toContain("state.catalogMode !== 'legacy-writable' || (site && (site.sourceId || site.source_id))");
    expect(controller).toContain('fallback legado está em modo somente leitura');
    expect(controller).toContain('fallback legado em modo somente leitura');
  });

  test('renders complete entity and Instagram coverage, including mapping gaps', () => {
    expect(controller).toContain("summary.entities, 'registros de entidade'");
    expect(controller).toContain("summary.sources, 'registros de fonte web (não programas)'");
    expect(controller).not.toContain("summary.sources, 'fontes web oficiais'");
    expect(html).toContain('Registros de entidade');
    expect(html).toContain('<option value="instagram">Perfis Instagram</option>');
    expect(controller).toContain("summary.entitiesWithoutWebSource");
    expect(controller).toContain("'entidades sem site associado'");
    expect(controller).toContain('sem fonte web associada');
    expect(controller).toContain('renderDeferredRows');
    expect(controller).toContain("state.sourceCatalog.sources.find(function (source) { return source.id === sourceId; })");
    expect(html).toContain('<option value="collision_evidence">qualquer evidência de colisão</option>');
    expect(controller).toContain("state.sitesOrigin === 'collision_evidence' && !source.collision");
    expect(controller).toContain('Colisão legada:');
  });

  test('preserves Instagram association provenance and explicit clear intent across CAS conflicts', () => {
    expect(controller).toContain('associação direta observada nesta fonte');
    expect(controller).toContain('associação indireta via entidade');
    expect(controller).toContain("summary.instagramRetired, 'Instagram aposentados'");
    expect(controller).toContain("summary.instagramMissing, 'Instagram indisponíveis'");
    expect(controller).toContain('draft.noteTouched = true');
    expect(controller).toContain('conflictFields: Object.keys(changes)');
    expect(controller).toContain("conflictFields.indexOf('tier')");
    expect(controller).toContain("conflictFields.indexOf('note')");
    expect(controller).not.toContain('(draft.conflict && draft.tierTouched)');
    expect(controller).not.toContain('(draft.conflict && draft.noteTouched)');
    expect(controller).not.toContain('drafts[opts.conflictSourceId].tierTouched = true');
  });

  test('maps source-registry direct fallback to the real OpenClaw route', () => {
    expect(controller).toContain("var registryPrefix = '/api/cadu/sites/source-registry'");
    expect(controller).toContain("cfg.url + '/api/source-registry' + p.slice(registryPrefix.length)");
  });

  test('renders upstream error strings as text rather than HTML', () => {
    expect(controller).toContain("wrap.textContent = String(msg == null ? '' : msg)");
    expect(controller).not.toMatch(/function showCaduError[\s\S]{0,300}wrap\.innerHTML/);
  });

  test('owns a namespaced activity bell without colliding with global notifications', () => {
    expect(html).toContain('id="kcCaduActivityBell"');
    expect(html).toContain('data-i18n-aria-label="aria-label.notifications"');
    expect(html).toContain('data-i18n-tooltip="tooltip.cadu-notifications"');
    expect(html).toContain('id="kcCaduActivityDropdown"');
    expect(html).toContain('id="kcCaduActivityList"');
    expect(html).not.toContain('id="kcNotifBell"');
    expect(html).not.toContain('id="kcNotifDropdown"');
    expect(controller).toContain("$('#kcCaduActivityBell')");
    expect(controller).toContain("notifBell.setAttribute('aria-expanded', 'true')");
    expect(controller).not.toContain("$('#kcNotifDropdown')");
  });

  test('scopes the seven-column filter grid to the source map toolbar', () => {
    expect(html).toContain('#tab-sites > .kc-cadu-toolbar { grid-template-columns:');
    expect(html).toContain('.kc-cadu-hero > .kc-cadu-toolbar { display: flex;');
    expect(html).toContain('.kc-cadu-activity-dropdown[hidden] { display: none !important; }');
  });

  test('turns every Mapa UFG table view into labelled cards on narrow screens', () => {
    expect(html).toContain('#sites-table tbody td {');
    expect(html).toContain('grid-template-columns: minmax(92px,31%) minmax(0,1fr)');
    expect(html).toContain('#sites-table[data-view="sources"] td:nth-child(7)::before { content: "Ações"; }');
    expect(html).toContain('#sites-table[data-view="entities"] td:nth-child(5)::before { content: "Cobertura"; }');
    expect(html).toContain('#sites-table[data-view="instagram"] td:nth-child(5)::before { content: "Execução"; }');
    expect(html).toContain('#sites-table[data-view="deferred"] td:nth-child(5)::before { content: "Evidências"; }');
    expect(html).toContain('#sites-table[data-view="legacy"] td:nth-child(7)::before { content: "Ações"; }');
  });

  test('exports deferred legacy identities and row metadata rather than hashes alone', () => {
    expect(controller).toContain("['Pendência', 'IDs legados', 'Tipos de associação', 'ID da fonte', 'Fontes candidatas', 'IDs das entidades', 'Linhas legadas (JSON)', 'Hashes das linhas']");
    expect(controller).toContain("JSON.stringify(item.rows || (item.row ? [item.row] : []))");
    expect(controller).toContain("var unitIds = item.unitIds || (item.unitId ? [item.unitId] : []);");
    expect(controller).toContain("if (/^[\\t\\r ]*[=+\\-@]/.test(s)) s = \"'\" + s;");
  });

  test('keeps the registry model reviewable as text rather than a binary file', () => {
    const model = fs.readFileSync(
      path.join(ROOT, 'assets/js/controllers/admin/admin-cadu-sources.js'),
      'utf8'
    );
    expect(model).not.toContain('\u0000');
    expect(model).toContain('/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/');
  });
});
