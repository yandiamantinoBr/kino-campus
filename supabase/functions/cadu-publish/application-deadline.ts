// This file mirrors the OpenClaw source-application-deadline contract.
type Row = Record<string, any>;
// Optional precision for two audited official documents. Calendar fields and
// all publication authority remain separate. No model response supplies time.
const CONTRACT = 'cadu-application-deadline-evidence-v1';
const MANIFESTS: Row[] = [
  {
    "sourceRegistryId": "web.ufg.ppg.ppgcc",
    "sourceUrl": "https://ppgcc.inf.ufg.br/n/203275",
    "slug": "ppgcc-publica-edital-de-selecao-para-alunos-regulares-2027",
    "calendarDate": "2026-09-16",
    "localTime": "16:00",
    "instant": "2026-09-16T19:00:00.000Z",
    "documentUrl": "https://files.cercomp.ufg.br/weby/up/1289/o/Edital_PPGCC-regulares-2027_assinado_assinado.pdf",
    "documentSha256": "43f360e53c4242d7a9c80765dacb0dd3f08d03aa698f0c90fb2449ff066fbe14",
    "excerpts": [
      {
        "page": 2,
        "text": "14/08/2026 (às 8h) até 16/09/2026 (às 16h) Período de inscrições para o processo seletivo."
      }
    ],
    "relatedUrl": "https://ppgcc.inf.ufg.br/p/61333-processo-seletivo-de-alunos-regulares-2027",
    "relatedSha256": "fa9fde875aa1a6493e594f2989623bd2e2bf0be74da2d5a8ad167bd6ba4a8da1",
    "typedExcerpt": "8h) a 11/09/2026 (16h) Período de inscrições: de 14/08/2026 (8h) a 16/09/2026 (16h) Resultado final do processo seletivo: 10/12/2026 Em caso"
  },
  {
    "sourceRegistryId": "web.legacy.verbena",
    "sourceUrl": "https://institutoverbena.ufg.br/n/203719",
    "slug": "prefeitura-municipal-de-carmo-do-rio-verde-go",
    "calendarDate": "2026-10-26",
    "localTime": "17:00",
    "instant": "2026-10-26T20:00:00.000Z",
    "documentUrl": "https://sistemas.institutoverbena.ufg.br/2026/concurso-prefeitura-carmo-do-rio-verde/sistema/arquivos/editais/Edital_Concurso_P%C3%BAblico_da_Prefeitura_Municipal_de_Carmo_do_Rio_Verde-GO.pdf",
    "documentSha256": "bc3dd2e57704ea8af955d6632d7a5027937ed843f741c367b1d7e560839c19d8",
    "excerpts": [
      {
        "page": 2,
        "text": "2.1.3.1. A inscrição para o concurso, bem como a emissão do boleto serão encerradas às 17h00 (horário oficial de Brasília/DF) do último dia de inscrição, conforme cronograma (Anexo I)."
      },
      {
        "page": 26,
        "text": "25/09/2026 a 26/10/2026 • Prazo para realizar upload dos documentos comprobatórios de ter exercido a função de jurado(a) no período entre a data de publicação da Lei nº 11.689, de 9 de junho de 2008 e a data de término das inscrições. • Prazo para o(a) candidato(a) realizar upload da documentação caracterizadora da deficiência (preferencialmente no modelo Anexo III) para concorrer à reserva de vagas - pessoa com deficiência. • Prazo para solicitação de condições especiais para realização de prova. • Prazo para o(a) candidato(a) realizar upload da documentação caracterizadora da deficiência ou atestado médico (preferencialmente no modelo Anexo III) para solicitar tempo adicional para realização de prova - pessoa com deficiência e/ou TDAH e/ou dislexia. • Prazo para realizar inscrição e emitir o boleto bancário da taxa de inscrição, no endereço eletrônico www.institutoverbena.ufg.br, no Portal do(a) candidato(a). No último dia, as inscrições e a emissão do boleto bancário serão até às 17h00."
      }
    ]
  }
];
const object = (value: any): Row => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const norm = (value: any) => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const same = (left: any, right: any): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
};
function sourceUrlMatches(value: any, manifest: Row) {
  try {
    const actual = new URL(value); const expected = new URL(manifest.sourceUrl);
    return actual.protocol === 'https:' && actual.host === expected.host && !actual.username && !actual.password
      && !actual.search && !actual.hash && [expected.pathname, expected.pathname + '/',
        expected.pathname + '-' + manifest.slug, expected.pathname + '-' + manifest.slug + '/'].includes(actual.pathname);
  } catch (_) { return false; }
}
function manifestForSource(item: Row, { requireSourceId = true } = {}) {
  return MANIFESTS.find(manifest => {
    const ids = [item.sourceRegistryId, item.source_registry_id].filter(Boolean);
    const sourceIds = [item.sourceId, item.source_id].filter(Boolean);
    const urls = [item.url, item.sourceUrl, item.source_url].filter(Boolean);
    return ids.length && ids.every(id => id === manifest.sourceRegistryId)
      && (!requireSourceId || sourceIds.length) && sourceIds.every(id => typeof id === 'string'
        && id === id.trim() && id.startsWith(manifest.sourceRegistryId + ':') && sourceUrlMatches(id.slice(manifest.sourceRegistryId.length + 1), manifest))
      && urls.length && urls.every(url => typeof url === 'string' && url === url.trim() && sourceUrlMatches(url, manifest));
  }) || null;
}
function manifestForItem(item: Row) {
  if (item?.module !== 'oportunidades') return null;
  const revisions = [item.sourceRevision, item.source_revision].filter(value => value !== undefined && value !== null && value !== '');
  if (revisions.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) || new Set(revisions).size > 1) return null;
  const manifest = manifestForSource(item);
  if (!manifest) return null;
  const dates = object(item.dates);
  const deadlines = [dates.applicationDeadline, dates.application_deadline, dates.deadlineDate, dates.deadline_date,
    item.applicationDeadline, item.application_deadline, item.deadlineDate, item.deadline_date].filter(value => value !== undefined && value !== null && value !== '');
  const instants = [dates.applicationDeadlineAt, dates.application_deadline_at, item.applicationDeadlineAt,
    item.application_deadline_at].filter(value => value !== undefined && value !== null && value !== '');
  return deadlines.length && deadlines.every(date => date === manifest.calendarDate)
    && instants.every(instant => typeof instant === 'string' && Date.parse(instant) === Date.parse(manifest.instant)) ? manifest : null;
}
function documentEvidenceFor(manifest: Row) {
  return { contract: 'cadu-application-deadline-document-v1', sourceRegistryId: manifest.sourceRegistryId,
    sourceUrl: manifest.sourceUrl, role: 'applicationDeadline', calendarDate: manifest.calendarDate,
    localTime: manifest.localTime, timeZone: 'America/Sao_Paulo', instant: manifest.instant,
    document: { url: manifest.documentUrl, sha256: manifest.documentSha256 },
    excerpts: manifest.excerpts.map(({ page, text }: Row) => ({ page, text })) };
}
function applicationDeadlineDocumentEvidence(item: Row, { documentUrl, documentSha256, pageTexts, amendments = [] }: Row = {}) {
  // The collector has a registry ID and lexical URL before it creates the
  // final item sourceId. Publication evidence still requires that final ID.
  const manifest = manifestForSource(item, { requireSourceId: false });
  if (!manifest || documentUrl !== manifest.documentUrl || documentSha256 !== manifest.documentSha256
      || !Array.isArray(amendments) || amendments.length || !Array.isArray(pageTexts)) return null;
  // Inspect the exact physical pages before the human-facing digest is bounded.
  // This receipt has no approval authority and cannot supply a different clock.
  if (!manifest.excerpts.every((excerpt: Row) => norm(pageTexts[excerpt.page - 1]).includes(excerpt.text))) return null;
  return documentEvidenceFor(manifest);
}
function evidenceFor(item: Row, manifest: Row) {
  return { contract: CONTRACT, sourceRegistryId: manifest.sourceRegistryId,
    sourceId: item.sourceId || item.source_id, sourceUrl: item.url || item.sourceUrl || item.source_url,
    sourceRevision: item.sourceRevision || item.source_revision || null,
    role: 'applicationDeadline', calendarDate: manifest.calendarDate, localTime: manifest.localTime,
    timeZone: 'America/Sao_Paulo', instant: manifest.instant,
    document: { url: manifest.documentUrl, sha256: manifest.documentSha256 },
    excerpts: manifest.excerpts.map(({ page, text }: Row) => ({ page, text })) };
}
function sourceResearchMatches(item: Row, manifest: Row) {
  const research = object(item.editorialResearch);
  if (research.contract !== 'cadu-official-source-research-v1' || research.complete !== true
      || research.status !== 'complete' || !Array.isArray(research.sources)
      || (research.amendments && (!Array.isArray(research.amendments) || research.amendments.length))) return false;
  const sources = research.sources;
  if (sources.some((source: Row) => /amendment|retific/i.test(String(source?.type || '')))) return false;
  const documents = sources.filter(source => source?.type === 'official_document');
  if (documents.length !== 1 || documents[0].url !== manifest.documentUrl || documents[0].sha256 !== manifest.documentSha256) return false;
  const digest = norm(research.digest);
  if (research.applicationDeadlineDocumentEvidence !== undefined) {
    if (!same(research.applicationDeadlineDocumentEvidence, documentEvidenceFor(manifest))) return false;
  } else if (!manifest.excerpts.every((excerpt: Row) => digest.includes(excerpt.text))) return false;
  if (manifest.relatedUrl) {
    const related = sources.filter(source => source?.type === 'official_related_page');
    if (related.length !== 1 || related[0].url !== manifest.relatedUrl || related[0].sha256 !== manifest.relatedSha256) return false;
    const evidence = Array.isArray(object(item.dates).dateEvidence) ? item.dates.dateEvidence.filter((entry: Row) =>
      entry?.date === manifest.calendarDate && entry.role === 'applicationDeadline') : [];
    if (!evidence.length || evidence.some((entry: Row) => !['item_text', 'html'].includes(entry.source)
      || entry.yearInferred !== false || norm(entry.excerpt) !== manifest.typedExcerpt)) return false;
  }
  return true;
}
function applicationDeadlineEvidence(item: Row, { derive = true } = {}) {
  const supplied = item?.applicationDeadlineEvidence;
  const manifest = manifestForItem(item);
  if (supplied !== undefined && supplied !== null) {
    if (!manifest || !same(supplied, evidenceFor(item, manifest))) {
      throw new TypeError('application_deadline_evidence_invalid');
    }
    // A supplied proof cannot override an explicitly changed source receipt.
    if (item.editorialResearch && !sourceResearchMatches(item, manifest)) {
      throw new TypeError('application_deadline_evidence_source_conflict');
    }
    return evidenceFor(item, manifest);
  }
  return derive && manifest && sourceResearchMatches(item, manifest) ? evidenceFor(item, manifest) : null;
}
function applicationDeadlineIssues(item: Row, now: Date | string | number = new Date()) {
  let proof;
  try { proof = applicationDeadlineEvidence(item); }
  catch (_) { return ['application_deadline_evidence_invalid']; }
  if (!proof) return [];
  const time = new Date(now).getTime();
  if (!Number.isFinite(time)) return ['application_deadline_clock_invalid'];
  return Date.parse(proof.instant) <= time ? ['application_deadline_instant_past'] : [];
}
function itemFromPost(row: Row) {
  const metadata = object(row?.metadata);
  return { module: row?.module, sourceId: metadata.source_id, sourceUrl: metadata.source_url,
    sourceRegistryId: metadata.source_registry_id, sourceRevision: metadata.source_revision,
    dates: metadata.dates, deadlineDate: metadata.deadline_date,
    applicationDeadline: metadata.applicationDeadline, application_deadline: metadata.application_deadline,
    applicationDeadlineAt: metadata.applicationDeadlineAt, application_deadline_at: metadata.application_deadline_at,
    applicationDeadlineEvidence: metadata.application_deadline_evidence };
}
function applicationDeadlineTransitionIssue(current: Row, next: Row) {
  const currentItem = itemFromPost(current);
  const nextItem = itemFromPost(next);
  if (!currentItem.applicationDeadlineEvidence && !nextItem.applicationDeadlineEvidence) return null;
  try {
    const before = applicationDeadlineEvidence(currentItem, { derive: false });
    const after = applicationDeadlineEvidence(nextItem, { derive: false });
    if ((before && (!after || before.instant !== after.instant)) || (after && (
        Date.parse(next.expires_at) !== Date.parse(after.instant)
        || object(next.metadata).application_deadline_at !== after.instant))) return 'application_deadline_evidence_removed';
  } catch (_) { return 'application_deadline_evidence_invalid'; }
  return null;
}
function applicationDeadlinePostIssues(row: Row, now: Date | string | number = new Date()) {
  return applicationDeadlineIssues(itemFromPost(row), now);
}

export { CONTRACT, applicationDeadlineDocumentEvidence, applicationDeadlineEvidence, applicationDeadlineIssues, applicationDeadlineTransitionIssue, applicationDeadlinePostIssues };
