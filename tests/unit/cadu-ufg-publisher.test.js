'use strict';

const fs = require('fs');
const path = require('path');

const { analyzeTemporalRelevance, classifyItem } = require('../../services/cadu-ufg-publisher/src/classifier');
const { cleanTitle, extractFirstImageUrl, extractLinksFromHtml, normalizeWebyItem } = require('../../services/cadu-ufg-publisher/src/extractors');
const { HttpClient } = require('../../services/cadu-ufg-publisher/src/http-client');
const { mapToKinoPayload, toPostgrestInsert } = require('../../services/cadu-ufg-publisher/src/mapper');
const { resolveDeepSeekEndpoint, resolveDeepSeekModel } = require('../../services/cadu-ufg-publisher/src/model');
const { splitMessage } = require('../../services/cadu-ufg-publisher/src/notifier');
const { imageUrlFromCandidate, normalizeImages, SupabasePublisher } = require('../../services/cadu-ufg-publisher/src/publisher');
const { evaluatePayloadQuality } = require('../../services/cadu-ufg-publisher/src/quality');
const { collectReviews, formatReviews, resolveReviewKey } = require('../../services/cadu-ufg-publisher/src/reviews');
const { isAllowedByRobots, parseRobotsTxt } = require('../../services/cadu-ufg-publisher/src/robots');
const { discoverFromWebyJson } = require('../../services/cadu-ufg-publisher/src/runner');
const { StateStore } = require('../../services/cadu-ufg-publisher/src/state');
const { loadSources, selectSources } = require('../../services/cadu-ufg-publisher/src/sources');
const { normalizeWhitespace } = require('../../services/cadu-ufg-publisher/src/utils');
const { parseFeed, parseSitemap } = require('../../services/cadu-ufg-publisher/src/xml');
const { canonicalJsonSha256 } = require('../../services/cadu-ufg-publisher/scripts/sync-candidate-source-registry');

const SOURCE_REGISTRY_PATH = path.resolve(__dirname, '../../services/cadu-ufg-publisher/config/sources.json');
const EXPECTED_SOURCE_REGISTRY_SHA256 = 'ff41a4d9d71d1c6f3af46388bf0000bfbf76c15c562f084359da58f4bd18af49';

function readSourceRegistry() {
  return JSON.parse(fs.readFileSync(SOURCE_REGISTRY_PATH, 'utf8').replace(/^\uFEFF/, ''));
}

describe('cadu-ufg-publisher', () => {
  test('publisher source registry metadata matches its canonical source counts and hash', () => {
    const registry = readSourceRegistry();
    const counts = {
      totalSites: registry.sources.length,
      tier1: registry.sources.filter((source) => source.tier === 1).length,
      tier2: registry.sources.filter((source) => source.tier === 2).length,
      tier3: registry.sources.filter((source) => source.tier === 3).length,
      quick: registry.sources.filter((source) => source.quick === true).length,
      withInstagram: registry.sources.filter((source) => Boolean(source.instagram)).length,
      withFeedRss: registry.sources.filter((source) => source.hasFeedRss === true).length,
    };

    expect(registry.meta).toEqual({
      lastAudit: '2026-07-15',
      tier1: 93,
      withInstagram: 63,
      totalSites: 107,
      quick: 103,
      tier2: 10,
      version: '3.1',
      withFeedRss: 103,
      tier3: 4,
    });
    expect(counts).toEqual({
      totalSites: registry.meta.totalSites,
      tier1: registry.meta.tier1,
      tier2: registry.meta.tier2,
      tier3: registry.meta.tier3,
      quick: registry.meta.quick,
      withInstagram: registry.meta.withInstagram,
      withFeedRss: registry.meta.withFeedRss,
    });
    expect(canonicalJsonSha256({ meta: registry.meta, sources: registry.sources }))
      .toBe(EXPECTED_SOURCE_REGISTRY_SHA256);
  });

  test('publisher source IDs are unique, codepoint-sorted, and contain no competing PROEC source', () => {
    const { sources } = readSourceRegistry();
    const ids = sources.map((source) => source.id);
    const sortedIds = [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(sortedIds);
    expect(ids).not.toContain('proec');
    expect(sources.filter((source) => new URL(source.baseUrl).hostname === 'proec.ufg.br')).toEqual([]);
  });

  test('publisher quick inventory includes the historical PROEX ID at its current official source', () => {
    const { sources } = readSourceRegistry();
    const proex = sources.find((source) => source.id === 'proex');
    const runtimeSources = loadSources(SOURCE_REGISTRY_PATH);
    const runtimeProex = runtimeSources.find((source) => source.id === 'proex');
    const quickIds = selectSources(runtimeSources, 'quick').map((source) => source.id);

    expect(proex).toEqual({
      id: 'proex',
      name: 'Pró-Reitoria de Extensão (PROEX)',
      baseUrl: 'https://proex.ufg.br',
      tier: 1,
      quick: true,
      hasFeedRss: true,
      hasEventsRss: true,
      feedRssUrl: 'https://proex.ufg.br/feed',
      feedItemsCount: 10,
      instagram: 'proex.ufg',
      lastPostDate: '2026-07-13',
      qualityScore: 1,
      lastAudit: '2026-07-15',
    });
    expect(runtimeProex).toMatchObject({
      id: 'proex',
      name: 'Pró-Reitoria de Extensão (PROEX)',
      baseUrl: 'https://proex.ufg.br/',
      tier: 1,
      quick: true,
      enabled: true,
    });
    expect(quickIds).toContain('proex');
  });

  test('publisher preserves cultural source IDs and URLs with audited Portuguese labels', () => {
    const { sources } = readSourceRegistry();
    const byId = new Map(sources.map((source) => [source.id, source]));

    expect(byId.get('centrocultural')).toMatchObject({
      id: 'centrocultural',
      name: 'Centro Cultural UFG (CCUFG)',
      baseUrl: 'https://centrocultural.ufg.br',
      instagram: 'centroculturalufg',
      lastAudit: '2026-07-15',
    });
    expect(byId.get('museu')).toMatchObject({
      id: 'museu',
      name: 'Museu Antropológico da UFG (MA)',
      baseUrl: 'https://museu.ufg.br',
      instagram: 'museu_ufg',
      lastAudit: '2026-07-15',
    });
    expect(byId.get('seacult')).toMatchObject({
      id: 'seacult',
      name: 'Secretaria de Arte e Cultura (SEACULT)',
      baseUrl: 'https://seacult.ufg.br',
      tier: 3,
      quick: false,
      hasFeedRss: false,
      hasEventsRss: false,
      feedRssUrl: null,
      instagram: null,
      lastAudit: '2026-07-15',
    });
  });

  test('extractor strips UFG site suffix from titles', () => {
    expect(cleanTitle('PRPI UFG divulga quatro editais abertos da Fapeg | UFG - Universidade Federal de Goiás'))
      .toBe('PRPI UFG divulga quatro editais abertos da Fapeg');
  });

  test('normalizeWhitespace preserves Portuguese accents while normalizing width and spacing', () => {
    expect(normalizeWhitespace('  Iniciação   científica para estudantes da UFG  ')).toBe('Iniciação científica para estudantes da UFG');
    expect(normalizeWhitespace('edital： pesquisa')).toBe('edital: pesquisa');
  });

  test('extractor keeps absolute image URLs and resolves relative images', () => {
    expect(extractFirstImageUrl('<img src="https://files.cercomp.ufg.br/cover.jpg">', 'https://ufg.br/n/1'))
      .toBe('https://files.cercomp.ufg.br/cover.jpg');
    expect(extractFirstImageUrl('<img src="/media/cover.jpg">', 'https://prograd.ufg.br/n/1'))
      .toBe('https://prograd.ufg.br/media/cover.jpg');

    const item = normalizeWebyItem({ id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br' }, {
      id: 1,
      title: 'Edital',
      image: 'https://files.cercomp.ufg.br/img.png',
      text: 'Inscricoes abertas',
    });
    expect(item.imageUrl).toBe('https://files.cercomp.ufg.br/img.png');
  });

  test('extractor normalizes Weby event JSON fields', () => {
    const item = normalizeWebyItem({ id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br' }, {
      id: 39107,
      slug: '39107-concerto-cenico-a-vida-do-heroi',
      name: 'Concerto Cenico - A Vida do Heroi',
      information: '<p>Evento cultural da UFG.</p>',
      image: 'https://files.cercomp.ufg.br/weby/up/1/o/evento.jpeg',
      begin_at: '2026-05-22T20:00:00.000-03:00',
      end_at: '2026-05-22T21:30:00.000-03:00',
      kind: 'regional',
    }, 'event');

    expect(item.type).toBe('event');
    expect(item.sourceUrl).toBe('https://ufg.br/e/39107-concerto-cenico-a-vida-do-heroi');
    expect(item.title).toBe('Concerto Cenico - A Vida do Heroi');
    expect(item.text).toContain('Evento cultural da UFG.');
    expect(item.dateBeginAt).toBe('2026-05-22T20:00:00.000-03:00');
    expect(item.dateEndAt).toBe('2026-05-22T21:30:00.000-03:00');
    expect(item.imageUrl).toBe('https://files.cercomp.ufg.br/weby/up/1/o/evento.jpeg');
  });

  test('extractor preserves individual edital links with labels', () => {
    const links = extractLinksFromHtml(`
      <a href="/files/Edital-PIBIC.pdf">Edital PIBIC</a>
      <a href="https://fapeg.go.gov.br/chamada-1">Chamada Fapeg</a>
    `, 'https://prpi.ufg.br/n/1');

    expect(links).toEqual(expect.arrayContaining([
      { url: 'https://prpi.ufg.br/files/Edital-PIBIC.pdf', label: 'Edital PIBIC' },
      { url: 'https://fapeg.go.gov.br/chamada-1', label: 'Chamada Fapeg' },
    ]));
  });

  test('parseSitemap extracts loc and lastmod', () => {
    const parsed = parseSitemap(`
      <urlset>
        <url><loc>https://ufg.br/n/1-edital</loc><lastmod>2026-05-17</lastmod></url>
      </urlset>
    `);
    expect(parsed.urls).toEqual([
      expect.objectContaining({ loc: 'https://ufg.br/n/1-edital', lastmod: '2026-05-17' }),
    ]);
  });

  test('parseFeed extracts RSS items', () => {
    const parsed = parseFeed(`
      <rss><channel><item><title>Edital aberto</title><link>https://ufg.br/n/1</link><description>Inscricoes abertas</description></item></channel></rss>
    `);
    expect(parsed[0]).toEqual(expect.objectContaining({ title: 'Edital aberto', url: 'https://ufg.br/n/1' }));
  });

  test('robots longest rule allows specific path', () => {
    const robots = parseRobotsTxt(`
      User-agent: *
      Disallow: /admin
      Disallow: /noticias
      Allow: /noticias/publicas
    `);
    expect(isAllowedByRobots('https://ufg.br/admin', robots)).toBe(false);
    expect(isAllowedByRobots('https://ufg.br/noticias/publicas/1', robots)).toBe(true);
  });

  test('classifier promotes actionable edital to publish or review', () => {
    const item = {
      title: 'Edital de selecao para monitoria com inscricoes abertas',
      summary: 'Prazo ate 20/05/2026. Vagas para estudantes da UFG.',
      text: 'Processo seletivo com bolsa e edital em PDF.',
      pdfLinks: ['https://ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
    expect(['publish', 'review']).toContain(result.decision);
    expect(result.module).toBe('oportunidades');
    expect(result.category).toBe('monitoria');
  });

  test('classifier maps research and PRPI/Fapeg calls to pesquisa', () => {
    const item = {
      title: 'PRPI divulga editais Fapeg para pesquisa',
      summary: 'Chamadas de iniciacao cientifica com inscricoes ate 29/05/2026.',
      text: 'Editais PIBIC, PIVIC e mobilidade internacional para pesquisadores da UFG.',
      updatedAt: '2026-05-18',
      pdfLinks: ['https://prpi.ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
    expect(result.module).toBe('oportunidades');
    expect(result.category).toBe('pesquisa');
    expect(['publish', 'review']).toContain(result.decision);
  });

  test('classifier keeps Weby events as eventos even when text mentions estagio', () => {
    const item = {
      type: 'event',
      title: 'XIX Seminario de Estagio Supervisionado',
      summary: 'Evento academico da Faculdade de Historia.',
      text: 'Seminario com inscricoes para apresentacao de trabalhos.',
      dateBeginAt: '2026-06-10T19:00:00.000-03:00',
    };
    const result = classifyItem(item, { tier: 3 }, { now: '2026-05-21T12:00:00-03:00' });

    expect(result.module).toBe('eventos');
    expect(result.category).toBe('academicos');
  });

  test('classifier maps palestras and congressos to schema event keys', () => {
    const palestra = classifyItem({
      title: 'Palestra com Dra. Camila Oliveira: Nutricao e Metabolismo',
      summary: 'Ultima palestra do ciclo Dialogos com inscricoes abertas.',
      text: 'Evento gratuito da UFG em 05/08/2026.',
      updatedAt: '2026-08-01',
    }, { tier: 1 }, { now: '2026-08-01T12:00:00-03:00' });

    expect(palestra.module).toBe('eventos');
    expect(palestra.category).toBe('palestras');

    const congresso = classifyItem({
      title: 'IX EGOEEP discute Engenharia de Producao na era da IA',
      summary: 'Simposio e jornada academica com programacao em setembro.',
      text: 'Congresso da UFG com submissao de trabalhos ate 15/09/2026.',
      updatedAt: '2026-08-01',
    }, { tier: 1 }, { now: '2026-08-01T12:00:00-03:00' });

    expect(congresso.module).toBe('eventos');
    expect(congresso.category).toBe('congressos');
  });

  test('classifier maps opportunity types to create-post schema keys', () => {
    const edital = classifyItem({
      title: 'Edital de matriculas para estudantes veteranos',
      summary: 'Chamada com prazo de inscricao ate 20/08/2026.',
      text: 'Processo de matricula da PROGRAD/UFG. PDF oficial disponivel.',
      pdfLinks: ['https://prograd.ufg.br/edital.pdf'],
      updatedAt: '2026-08-01',
    }, { tier: 1 }, { now: '2026-08-01T12:00:00-03:00' });
    expect(edital.module).toBe('oportunidades');
    expect(edital.category).toBe('editais');

    const concurso = classifyItem({
      title: 'Concurso publico para professor substituto da UFG',
      summary: 'Inscricoes abertas ate 30/08/2026.',
      text: 'Edital de concurso publico com vagas e prova objetiva.',
      pdfLinks: ['https://ufg.br/concurso.pdf'],
      updatedAt: '2026-08-01',
    }, { tier: 1 }, { now: '2026-08-01T12:00:00-03:00' });
    expect(concurso.module).toBe('oportunidades');
    expect(concurso.category).toBe('concursos');

    const bolsa = classifyItem({
      title: 'Bolsa de estudos DAAD para intercambio na Alemanha',
      summary: 'Auxilio financeiro com inscricoes ate 12/09/2026.',
      text: 'Programa de bolsas para estudantes da UFG.',
      updatedAt: '2026-08-01',
    }, { tier: 1 }, { now: '2026-08-01T12:00:00-03:00' });
    expect(bolsa.module).toBe('oportunidades');
    expect(bolsa.category).toBe('bolsas');

    const curso = classifyItem({
      title: 'Curso de Verao PPGCB com vagas abertas',
      summary: 'Capacitacao com inscricao ate 10/09/2026.',
      text: 'Curso de capacitacao e treinamento para estudantes e comunidade.',
      updatedAt: '2026-08-01',
    }, { tier: 1 }, { now: '2026-08-01T12:00:00-03:00' });
    expect(curso.module).toBe('oportunidades');
    expect(curso.category).toBe('cursos-capacitacoes');
  });

  test('classifier does not put palestra about science talks into pesquisa opportunity', () => {
    const result = classifyItem({
      title: 'Ultima palestra do Dialogos debate apresentacao de trabalhos cientificos',
      summary: 'Ciclo de palestras com programacao em agosto.',
      text: 'Palestra gratuita na UFG sobre metodologia de pesquisa cientifica.',
      updatedAt: '2026-08-01',
    }, { tier: 1 }, { now: '2026-08-01T12:00:00-03:00' });

    expect(result.module).toBe('eventos');
    expect(result.category).toBe('palestras');
  });

  test('classifier sends pos-graduacao and aluno especial opportunities to pesquisa', () => {
    const item = {
      title: 'Processo seletivo para aluno especial de mestrado',
      summary: 'Inscricoes abertas para disciplinas da pos-graduacao.',
      text: 'Edital de selecao para mestrado e doutorado com prazo ate 10/06/2026.',
      updatedAt: '2026-05-21',
      pdfLinks: ['https://ppgadm.face.ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 3 }, { now: '2026-05-21T12:00:00-03:00' });

    expect(result.module).toBe('oportunidades');
    expect(result.category).toBe('pesquisa');
  });

  test('classifier promotes Espaco das Profissoes to review instead of discard', () => {
    const item = {
      title: 'Espaco das Profissoes apresenta oportunidades para o futuro',
      summary: 'Evento segue ate 25/05/2026 com programacao para estudantes.',
      text: 'Estandes mostram cursos de graduacao e oportunidades da Universidade Federal de Goias.',
      updatedAt: '2026-05-21',
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-21T12:00:00-03:00' });

    expect(result.module).toBe('eventos');
    expect(['publish', 'review']).toContain(result.decision);
  });

  test('classifier discards institutional releases without concrete action', () => {
    const item = {
      title: 'PRPI/UFG se engaja no Espaco das Profissoes 2026',
      summary: 'Equipe marca presenca e recebe alunos durante evento institucional.',
      text: 'A unidade reune autoridades, reconhece os destaques e apresenta a trajetoria academica de servidores.',
      updatedAt: '2026-06-03',
      pdfLinks: [],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-06-03T12:00:00-03:00' });

    expect(result.decision).toBe('discard');
    expect(result.confidence).toBeLessThanOrEqual(0.39);
    expect(result.reasons).toContain('exclude:institutional_release');
  });

  test('classifier does not let broad event words rescue institutional titles', () => {
    const cases = [
      'UFG prospecta acordos durante o 1 Forum de Reitores Brasil-Africa',
      'Cerimonia reconhece os destaques goianos da Olimpiada Brasileira de Informatica',
      'Vice-reitora e professora estao na China para evento sobre IA',
    ];

    for (const title of cases) {
      const result = classifyItem({
        title,
        summary: 'Noticia institucional informa participacao de representantes da UFG em evento.',
        text: 'A materia registra agenda institucional, reconhecimento de destaques e repercussao academica da universidade.',
        updatedAt: '2026-06-03',
        pdfLinks: [],
      }, { tier: 1 }, { now: '2026-06-03T12:00:00-03:00' });

      expect(result.decision).toBe('discard');
      expect(result.confidence).toBeLessThanOrEqual(0.39);
      expect(result.reasons).toContain('exclude:institutional_release');
    }
  });

  test('classifier discards expired signup windows', () => {
    const item = {
      title: 'Quer trabalhar com redes sociais na UFG?',
      summary: 'Inscricoes de 04 a 11 de maio para estudantes da UFG.',
      text: 'Processo seletivo com bolsa para redes sociais.',
      updatedAt: '2026-05-04',
      pdfLinks: [],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-17T12:00:00-03:00' });

    expect(result.temporal.expired).toBe(true);
    expect(result.temporal.deadlineDate).toBe('2026-05-11');
    expect(result.decision).toBe('discard');
  });

  test('classifier uses Weby date_end_at as actionable deadline context', () => {
    const item = {
      title: 'Edital MARCA seleciona estudantes para mobilidade internacional',
      summary: 'Inscricoes abertas para estudantes da UFG interessados em mobilidade.',
      text: 'Processo seletivo com edital e formulario de candidatura.',
      dateBeginAt: '2026-05-10T08:00:00.000-03:00',
      dateEndAt: '2026-05-18T23:59:00.000-03:00',
      pdfLinks: ['https://sri.ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-21T12:00:00-03:00' });

    expect(result.temporal.deadlineDate).toBe('2026-05-18');
    expect(result.temporal.expired).toBe(true);
    expect(result.decision).toBe('discard');
  });

  test('temporal analysis keeps future deadlines eligible', () => {
    const item = {
      title: 'Edital de monitoria para estudantes da UFG',
      summary: 'Inscricoes ate 20/05/2026.',
      text: 'Processo seletivo com bolsa.',
      updatedAt: '2026-05-17',
    };
    const temporal = analyzeTemporalRelevance(item, { now: '2026-05-17T12:00:00-03:00' });
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-17T12:00:00-03:00' });

    expect(temporal.expired).toBe(false);
    expect(temporal.deadlineDate).toBe('2026-05-20');
    expect(['publish', 'review']).toContain(result.decision);
  });

  test('temporal analysis extracts named prazo final dates', () => {
    const item = {
      title: 'Chamada interna para apoio a projetos de pesquisa',
      summary: 'O prazo final e 30 de junho de 2026.',
      text: 'Pesquisadores da UFG devem conferir as regras no edital.',
      updatedAt: '2026-06-20',
    };
    const temporal = analyzeTemporalRelevance(item, { now: '2026-06-20T12:00:00-03:00' });

    expect(temporal.expired).toBe(false);
    expect(temporal.deadlineDate).toBe('2026-06-30');
  });

  test('temporal analysis prefers signup deadlines over later schedule dates', () => {
    const item = {
      title: 'Processo seletivo para bolsa de extensao',
      summary: 'Inscricoes: de 15/06/2026 ate 19/06/2026. Resultado: 24/06/2026. Matricula: a partir de 25/06/2026.',
      text: 'Edital com vagas para estudantes da UFG.',
      updatedAt: '2026-06-10',
    };
    const temporal = analyzeTemporalRelevance(item, { now: '2026-06-10T12:00:00-03:00' });

    expect(temporal.expired).toBe(false);
    expect(temporal.deadlineDate).toBe('2026-06-19');
  });

  test('classifier discards opportunities after signup even with future results', () => {
    const item = {
      title: 'Processo seletivo para bolsa de extensao',
      summary: 'Inscricoes: de 15/06/2026 ate 19/06/2026. Resultado: 24/06/2026. Matricula: a partir de 25/06/2026.',
      text: 'Edital com vagas para estudantes da UFG.',
      updatedAt: '2026-06-10',
      pdfLinks: ['https://proex.ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-06-20T12:00:00-03:00' });

    expect(result.temporal.expired).toBe(true);
    expect(result.temporal.deadlineDate).toBe('2026-06-19');
    expect(result.decision).toBe('discard');
  });

  test('temporal analysis keeps latest primary submission deadline across official lines', () => {
    const item = {
      title: 'Edital de apoio a participacao em congresso',
      summary: 'Solicitar Carta de Indicacao a PRPI: ate 31 de agosto de 2026. Submissao do trabalho: ate 15 de setembro de 2026.',
      text: 'Chamada para pesquisadores da UFG com apoio a eventos cientificos.',
      updatedAt: '2026-08-01',
    };
    const temporal = analyzeTemporalRelevance(item, { now: '2026-08-01T12:00:00-03:00' });

    expect(temporal.expired).toBe(false);
    expect(temporal.deadlineDate).toBe('2026-09-15');
  });

  test('mapper keeps Kino modal fields and one official link', () => {
    const item = {
      id: 'ufg:1',
      sourceName: 'PROGRAD',
      sourceUrl: 'https://prograd.ufg.br/n/1',
      title: 'Edital de monitoria para estudantes da UFG',
      summary: 'Inscricoes abertas para monitoria.',
      text: 'Contato: monitoria@ufg.br. Local: Campus Samambaia. Prazo ate 20/05/2026.',
      updatedAt: '2026-05-17',
      pdfLinks: ['https://prograd.ufg.br/edital.pdf'],
      imageUrl: 'https://prograd.ufg.br/assets/cover.jpg',
    };
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-17T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });
    expect(payload.modulo).toBe('oportunidades');
    expect(payload.titulo.length).toBeLessThanOrEqual(80);
    expect(payload.descricao.length).toBeLessThanOrEqual(2000);
    expect(payload.descricao).not.toContain('Resumo');
    expect(payload.descricao).toContain('Fonte oficial: PROGRAD/UFG: [https://prograd.ufg.br/n/1](https://prograd.ufg.br/n/1)');
    expect(payload.imagens).toEqual(['https://prograd.ufg.br/assets/cover.jpg']);
    expect(payload.metadata.source_url).toBe(item.sourceUrl);
    expect(payload.metadata.link).toBe('https://prograd.ufg.br/edital.pdf');
    expect(payload.metadata.cover_url).toBe('https://prograd.ufg.br/assets/cover.jpg');
    expect(payload.metadata.link_as_cta).toBe(true);
    expect(payload.metadata.actionLabel).toBe('Acessar edital');
    expect(payload.metadata.actionKey).toBe('acessar-edital');
    expect(payload.metadata.contato).toBe('monitoria@ufg.br');
    expect(payload.metadata.area).toBe('Academica');
    expect(payload.metadata.areaKey).toBe('academica');
    expect(payload.metadata.categoria).toBe('Monitoria');
    expect(payload.metadata.categoriaKey).toBe('monitoria');
    expect(payload.metadata.categoryKey).toBe('monitoria');
    expect(payload.metadata.gratuito).toBe(true);
    expect(payload.metadata.tagKeys).toEqual(expect.arrayContaining(['ufg', 'prograd', 'monitoria', 'edital', 'prazo']));
    expect(payload.metadata.deadline_date).toBe('2026-05-20');

    const row = toPostgrestInsert(payload, 'user-1');
    expect(row.author_id).toBe('user-1');
    expect(row.module).toBe('oportunidades');
    expect(row.image_url).toBe('https://prograd.ufg.br/assets/cover.jpg');
    expect(row.metadata.image_url).toBe('https://prograd.ufg.br/assets/cover.jpg');
    expect(row.metadata.source_url).toBe(item.sourceUrl);
    expect(row.metadata.link).toBe('https://prograd.ufg.br/edital.pdf');
    expect(row.metadata.actionLabel).toBe('Acessar edital');
    expect(row.metadata.tagKeys).toEqual(expect.arrayContaining(['monitoria']));
  });

  test('mapper keeps user-managed tags separate from the automatic taxonomy', () => {
    const row = toPostgrestInsert({
      modulo: 'oportunidades',
      categoriaKey: 'estagios',
      titulo: 'Estágio com acessibilidade',
      descricao: 'Registro de teste para o editor Cadu.',
      tags: ['UFG', 'Estágio'],
      tagKeys: ['ufg', 'estagio'],
      userTags: ['Acessibilidade', 'Material aberto'],
      userTagKeys: ['acessibilidade', 'material-aberto'],
      metadata: {
        tags: ['Taxonomia legada'],
        tagKeys: ['taxonomia-legada'],
      },
    }, 'agent-1');

    expect(row.metadata.tags).toEqual(['UFG', 'Estágio']);
    expect(row.metadata.tagKeys).toEqual(['ufg', 'estagio']);
    expect(row.metadata.userTags).toEqual(['Acessibilidade', 'Material aberto']);
    expect(row.metadata.userTagKeys).toEqual(['acessibilidade', 'material-aberto']);
  });

  test('direct publisher persists all canonical category aliases for every supported feed category', () => {
    const categories = {
      eventos: {
        academicos: 'Acadêmicos',
        palestras: 'Palestras',
        congressos: 'Congressos',
        cursos: 'Cursos',
        culturais: 'Culturais',
        esportivos: 'Esportivos',
        workshops: 'Workshops',
        festas: 'Festas',
        sustentabilidade: 'Sustentabilidade',
      },
      oportunidades: {
        editais: 'Editais',
        concursos: 'Concursos',
        bolsas: 'Bolsas',
        estagios: 'Estágio',
        empregos: 'Emprego',
        monitoria: 'Monitoria',
        pesquisa: 'Pesquisa',
        'cursos-capacitacoes': 'Cursos e capacitações',
        voluntariado: 'Voluntariado',
        freelancer: 'Freelancer',
      },
    };
    const edgeSchema = fs.readFileSync(path.resolve(
      __dirname,
      '../../supabase/functions/cadu-publish/schema.ts',
    ), 'utf8');
    const edgeLabels = new Map(Array.from(
      edgeSchema.matchAll(/\{\s*key:\s*"([^"]+)",\s*label:\s*"((?:\\.|[^"])*)"/g),
      (match) => [match[1], JSON.parse(`"${match[2]}"`)],
    ));

    Object.entries(categories).forEach(([moduleKey, entries]) => {
      Object.entries(entries).forEach(([categoryKey, categoryText]) => {
        expect(edgeLabels.get(categoryKey)).toBe(categoryText);
        const row = toPostgrestInsert({
          modulo: moduleKey,
          categoriaKey: categoryKey,
          categoriaLabel: 'Rótulo legado',
          titulo: `Teste ${categoryKey}`,
          descricao: 'Descrição de teste',
          metadata: {
            category: 'legacy',
            categoryKey: 'legacy',
            categoriaKey: 'legacy',
            categoryLabel: 'Legacy',
            categoria: 'Legacy',
            categoriaLabel: 'Legacy',
          },
        }, 'user-1');

        expect(row.category).toBe(categoryKey);
        expect(row.metadata).toEqual(expect.objectContaining({
          category: categoryKey,
          categoryKey,
          categoriaKey: categoryKey,
          categoryLabel: categoryText,
          categoria: categoryText,
          categoriaLabel: categoryText,
        }));
      });
    });

    expect(() => toPostgrestInsert({
      modulo: 'eventos',
      categoriaKey: 'empregos',
      titulo: 'Categoria cruzada',
      descricao: 'Não deve ser persistida',
    }, 'user-1')).toThrow('invalid category for module: eventos/empregos');

    const legacyAlias = toPostgrestInsert({
      modulo: 'Oportunidades',
      categoriaKey: 'curso-capacitacao',
      titulo: 'Alias legado',
      descricao: 'Deve usar a chave canônica sem fallback editorial',
    }, 'user-1');
    expect(legacyAlias.category).toBe('cursos-capacitacoes');
    expect(legacyAlias.metadata.categoryLabel).toBe('Cursos e capacitações');
  });

  test('direct publisher edit keeps root category and all metadata aliases atomic', () => {
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    const current = {
      module: 'eventos',
      category: 'academicos',
      metadata: {
        category: 'academicos',
        categoryKey: 'academicos',
        categoriaKey: 'academicos',
        categoryLabel: 'Academicos',
        categoria: 'Academicos',
        categoriaLabel: 'Academicos',
        userTags: ['Acessibilidade', 'Material aberto'],
        userTagKeys: ['acessibilidade', 'material-aberto'],
        kept: true,
      },
    };

    const patch = publisher.buildSafePatch(current, {
      category: 'palestra',
      categoryLabel: 'Rótulo fornecido incorreto',
    });
    expect(patch.category).toBe('palestras');
    expect(patch.metadata).toEqual(expect.objectContaining({
      category: 'palestras',
      categoryKey: 'palestras',
      categoriaKey: 'palestras',
      categoryLabel: 'Palestras',
      categoria: 'Palestras',
      categoriaLabel: 'Palestras',
      userTags: ['Acessibilidade', 'Material aberto'],
      userTagKeys: ['acessibilidade', 'material-aberto'],
      kept: true,
    }));

    const explicitTagEdit = publisher.buildSafePatch(current, {
      userTags: ['Apoio pedagógico'],
      userTagKeys: ['apoio-pedagogico'],
    });
    expect(explicitTagEdit.metadata.userTags).toEqual(['Apoio pedagógico']);
    expect(explicitTagEdit.metadata.userTagKeys).toEqual(['apoio-pedagogico']);

    expect(() => publisher.buildSafePatch(current, {
      category: 'empregos',
    })).toThrow('invalid category for module: eventos/empregos');

    const legacyCurrent = {
      module: 'eventos',
      category: 'academico',
      metadata: { categoryKey: 'academico', categoryLabel: 'Academico' },
    };
    const repairedLegacy = publisher.buildSafePatch(legacyCurrent, {
      metadata: {
        category: 'empregos',
        categoryKey: 'empregos',
        categoriaKey: 'empregos',
        categoryLabel: 'Emprego',
        categoria: 'Emprego',
        categoriaLabel: 'Emprego',
      },
    });
    expect(repairedLegacy.category).toBe('academicos');
    expect(repairedLegacy.metadata).toEqual(expect.objectContaining({
      category: 'academicos',
      categoryKey: 'academicos',
      categoriaKey: 'academicos',
      categoryLabel: 'Acadêmicos',
      categoria: 'Acadêmicos',
      categoriaLabel: 'Acadêmicos',
    }));

    const unknownLegacy = {
      module: 'eventos',
      category: 'seminarios',
      metadata: { categoryKey: 'seminarios', categoryLabel: 'Seminarios' },
    };
    expect(() => publisher.buildSafePatch(unknownLegacy, {
      metadata: { categoryLabel: 'Palestras' },
    })).toThrow('invalid category for module: eventos/seminarios');
    expect(() => publisher.buildSafePatch(unknownLegacy, {
      categoryLabel: 'Palestras',
    })).toThrow('invalid category for module: eventos/seminarios');
    expect(() => publisher.buildSafePatch(unknownLegacy, {
      category: 'empregos',
    })).toThrow('invalid category for module: eventos/empregos');

    const promotedLegacy = publisher.buildSafePatch(unknownLegacy, {
      category: 'palestra',
    });
    expect(promotedLegacy.category).toBe('palestras');
    expect(promotedLegacy.metadata).toEqual(expect.objectContaining({
      category: 'palestras',
      categoryKey: 'palestras',
      categoriaKey: 'palestras',
      categoryLabel: 'Palestras',
      categoria: 'Palestras',
      categoriaLabel: 'Palestras',
    }));
    expect(() => publisher.buildSafePatch(unknownLegacy, {
      title: 'Edição não taxonômica permitida',
    })).not.toThrow();
  });

  test('mapper preserves Weby event begin_at as event date and time metadata', () => {
    const item = normalizeWebyItem({ id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br' }, {
      id: 39107,
      slug: '39107-concerto-cenico-a-vida-do-heroi',
      name: 'Concerto Cenico - A Vida do Heroi',
      information: '<p>Evento cultural da UFG.</p>',
      begin_at: '2026-05-22T20:00:00.000-03:00',
      image: 'https://files.cercomp.ufg.br/weby/up/1/o/evento.jpeg',
    }, 'event');
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-21T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });

    expect(payload.modulo).toBe('eventos');
    expect(payload.metadata.data_evento).toBe('2026-05-22');
    expect(payload.metadata.hora_evento).toBe('20:00');
  });

  test('reviews helper lists review decisions only', () => {
    const items = collectReviews({
      seen: {
        a: { decision: 'discard', title: 'Nao entra' },
        b: { decision: 'review', title: 'Edital para revisar', sourceUrl: 'https://ufg.br/n/2', updatedAt: '2026-05-17T10:00:00Z' },
        c: { decision: 'review:publish-failed', title: 'Falha de publish', sourceUrl: 'https://ufg.br/n/3', updatedAt: '2026-05-17T11:00:00Z' },
      },
    });
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Falha de publish');
    expect(formatReviews(items)).toContain('Edital para revisar');
    expect(resolveReviewKey({ seen: { abcdef1234567890: { decision: 'review' } } }, 'abcdef123456')).toBe('abcdef1234567890');
  });

  test('mapper adds schedule and multiple official PDF labels to markdown preview', () => {
    const item = {
      id: 'prpi:1',
      sourceName: 'PRPI',
      sourceUrl: 'https://prpi.ufg.br/n/1',
      title: 'PRPI divulga editais Fapeg para pesquisa',
      summary: 'Editais para pesquisa com cronograma detalhado.',
      text: 'Inscricoes ate 18/05/2026. Resultado preliminar em 26/05/2026. Resultado final em 29/05/2026.',
      updatedAt: '2026-05-18',
      pdfLinks: [
        'https://prpi.ufg.br/files/Edital-PIBIC.pdf',
        'https://prpi.ufg.br/files/Edital-PIVIC.pdf',
        'https://prpi.ufg.br/files/Edital-Mobilidade.pdf',
      ],
      extractedLinks: [
        { url: 'https://prpi.ufg.br/files/Edital-PIBIC.pdf', label: 'Edital PIBIC' },
        { url: 'https://prpi.ufg.br/files/Edital-PIVIC.pdf', label: 'Edital PIVIC' },
        { url: 'https://fapeg.go.gov.br/chamada-mobilidade', label: 'Chamada Mobilidade Fapeg' },
      ],
    };
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });
    expect(payload.categoriaKey).toBe('pesquisa');
    expect(payload.descricao).toContain('Datas importantes');
    expect(payload.descricao).toContain('Resultado final em 29/05/2026');
    expect(payload.descricao).toContain('**Edital PIBIC:** [https://prpi.ufg.br/files/Edital-PIBIC.pdf](https://prpi.ufg.br/files/Edital-PIBIC.pdf)');
    expect(payload.descricao).toContain('**Chamada Mobilidade Fapeg:** [https://fapeg.go.gov.br/chamada-mobilidade](https://fapeg.go.gov.br/chamada-mobilidade)');
    expect(payload.metadata.link).toBe('https://fapeg.go.gov.br/chamada-mobilidade');
    expect(payload.metadata.actionLabel).toBe('Acessar editais');
    expect(payload.metadata.edital_pdf_urls).toHaveLength(3);
    expect(payload.metadata.official_document_urls).toContain('https://fapeg.go.gov.br/chamada-mobilidade');
  });

  test('mapper replaces generic institutional model summaries with actionable source details', () => {
    const item = {
      id: 'prpi:generic',
      sourceName: 'PRPI',
      sourceUrl: 'https://prpi.ufg.br/n/generic',
      title: 'PRPI divulga quatro editais abertos da Fapeg',
      summary: 'UFG divulga editais para pesquisa.',
      text: [
        'Edital PIBIC recebe inscricoes ate 18/05/2026.',
        'Edital PIVIC tem resultado preliminar em 26/05/2026.',
        'Edital de mobilidade internacional tem resultado final em 29/05/2026.',
      ].join('\n'),
      pdfLinks: [
        'https://prpi.ufg.br/files/Edital-PIBIC.pdf',
        'https://prpi.ufg.br/files/Edital-PIVIC.pdf',
      ],
    };
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, {
      runId: 'test-run',
      summaryText: 'A UFG e uma universidade gratuita, com mais de 35 mil alunos.',
    });

    expect(payload.descricao).not.toContain('35 mil alunos');
    expect(payload.descricao).toContain('Edital PIBIC');
    expect(payload.descricao).toContain('Edital PIVIC');
  });

  test('quality guard flags generic summaries and missing multi-document context', () => {
    const item = {
      title: 'PRPI divulga quatro editais abertos da Fapeg',
      summary: '',
      text: 'Inscricoes ate 18/05/2026. Resultado em 26/05/2026.',
      sourceUrl: 'https://prpi.ufg.br/n/1',
      pdfLinks: ['https://prpi.ufg.br/a.pdf', 'https://prpi.ufg.br/b.pdf'],
    };
    const classification = {
      hasPdf: true,
      hasDeadline: true,
      module: 'oportunidades',
      category: 'pesquisa',
    };
    const payload = {
      descricao: 'A UFG e uma universidade gratuita, com mais de 35 mil alunos.',
      imagens: [],
      metadata: { source_url: item.sourceUrl },
    };

    const quality = evaluatePayloadQuality(item, classification, payload);
    expect(quality.ok).toBe(false);
    expect(quality.warnings).toEqual(expect.arrayContaining([
      'generic_summary',
      'missing_multiple_documents',
      'missing_deadline_context',
      'missing_schedule_dates',
      'missing_image_url',
      'missing_contact',
      'missing_cta_link',
      'missing_link_as_cta',
      'missing_action_metadata',
      'missing_area_metadata',
      'missing_category_metadata',
      'missing_tag_metadata',
      'missing_free_flag',
      'missing_work_mode',
    ]));
  });

  test('quality guard accepts complete Kino modal metadata', () => {
    const item = {
      id: 'ufg:complete',
      sourceName: 'PROGRAD',
      sourceUrl: 'https://prograd.ufg.br/n/1',
      title: 'Edital de monitoria para estudantes da UFG',
      summary: 'Inscricoes abertas para monitoria.',
      text: 'Contato: monitoria@ufg.br. Prazo ate 20/05/2026.',
      pdfLinks: ['https://prograd.ufg.br/edital.pdf'],
      imageUrl: 'https://prograd.ufg.br/assets/cover.jpg',
    };
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-17T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });
    const quality = evaluatePayloadQuality(item, classification, payload);

    expect(quality.ok).toBe(true);
    expect(quality.warnings).toEqual([]);
  });

  test('quality guard blocks legacy or out-of-schema category keys', () => {
    const item = {
      sourceUrl: 'https://prograd.ufg.br/n/legacy',
      title: 'Edital legado',
      summary: 'Inscricoes abertas.',
      text: 'Prazo ate 20/08/2026.',
      pdfLinks: ['https://prograd.ufg.br/edital.pdf'],
    };
    const classification = {
      hasPdf: true,
      hasDeadline: true,
      module: 'oportunidades',
      category: 'curso-capacitacao',
    };
    const payload = {
      modulo: 'oportunidades',
      descricao: 'Inscricoes abertas com prazo ate 20/08/2026.\n\nFonte: [https://prograd.ufg.br/n/legacy](https://prograd.ufg.br/n/legacy)',
      imagens: ['https://prograd.ufg.br/cover.jpg'],
      metadata: {
        source_url: item.sourceUrl,
        contato: 'prograd@ufg.br',
        link: item.sourceUrl,
        link_as_cta: true,
        actionLabel: 'Acessar edital',
        actionKey: 'acessar-edital',
        area: 'Academica',
        areaKey: 'academica',
        categoria: 'Curso capacitacao',
        categoriaKey: 'curso-capacitacao',
        categoryKey: 'curso-capacitacao',
        tags: ['UFG', 'Edital'],
        tagKeys: ['ufg', 'edital'],
        gratuito: true,
        modalidadeTrabalho: 'Presencial',
      },
    };

    const quality = evaluatePayloadQuality(item, classification, payload);
    expect(quality.ok).toBe(false);
    expect(quality.warnings).toContain('invalid_category_key');
    expect(quality.blockingWarnings).toContain('invalid_category_key');
  });

  test('quality guard treats missing event time as non-blocking when date exists', () => {
    const item = {
      sourceUrl: 'https://eventos.ufg.br/n/1',
      title: 'Seminario academico com inscricoes abertas',
      summary: 'Evento gratuito da UFG.',
      text: 'O seminario ocorre em 10/06/2026. Contato: eventos@ufg.br.',
      pdfLinks: [],
    };
    const classification = {
      hasPdf: false,
      hasDeadline: false,
      module: 'eventos',
      category: 'academicos',
    };
    const payload = {
      descricao: 'Evento gratuito da UFG em 10/06/2026.\n\nFonte: [https://eventos.ufg.br/n/1](https://eventos.ufg.br/n/1)',
      imagens: ['https://eventos.ufg.br/cover.jpg'],
      modulo: 'eventos',
      metadata: {
        source_url: item.sourceUrl,
        contato: 'eventos@ufg.br',
        link: item.sourceUrl,
        link_as_cta: true,
        actionLabel: 'Acessar evento',
        actionKey: 'acessar-evento',
        area: 'Academicos',
        areaKey: 'academicos',
        categoria: 'Academicos',
        categoriaKey: 'academicos',
        categoryKey: 'academicos',
        tags: ['UFG', 'Academicos'],
        tagKeys: ['ufg', 'academicos'],
        gratuito: true,
        data_evento: '2026-06-10',
      },
    };

    const quality = evaluatePayloadQuality(item, classification, payload);
    expect(quality.warnings).toContain('missing_event_time');
    expect(quality.blockingWarnings).not.toContain('missing_event_time');
    expect(quality.ok).toBe(true);
  });

  test('Weby JSON discovery paginates news and events before sorting candidates', async () => {
    const calls = [];
    const http = {
      json: jest.fn(async (url) => {
        calls.push(url);
        const parsed = new URL(url);
        const page = parsed.searchParams.get('page');
        if (url.includes('/news.json') && page === '1') {
          return {
            data: { news: [{
              id: 1,
              slug: '1-noticia-antiga',
              title: 'Noticia antiga',
              text: '<p>Edital antigo</p>',
              updated_at: '2026-05-19T10:00:00.000-03:00',
            }] },
          };
        }
        if (url.includes('/news.json') && page === '2') {
          return {
            data: { news: [{
              id: 2,
              slug: '2-noticia-recente',
              title: 'Noticia recente',
              text: '<p>Edital recente</p>',
              updated_at: '2026-05-21T10:00:00.000-03:00',
            }] },
          };
        }
        if (url.includes('/events.json') && page === '1') {
          return {
            data: { events: [{
              id: 3,
              slug: '3-evento',
              name: 'Evento UFG',
              information: '<p>Programacao aberta</p>',
              begin_at: '2026-05-22T20:00:00.000-03:00',
            }] },
          };
        }
      return { data: [] };
      }),
    };

    const items = await discoverFromWebyJson(http, { id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br' }, 1, {
      maxPages: 2,
      perPage: 1,
    });

    expect(calls).toEqual(expect.arrayContaining([
      'https://ufg.br/news.json?per_page=1&page=1&order=updated_at&direction=desc',
      'https://ufg.br/news.json?per_page=1&page=2&order=updated_at&direction=desc',
      'https://ufg.br/events.json?per_page=1&page=1&order=updated_at&direction=desc',
    ]));
    expect(items.map((item) => item.title)).toEqual([
      'Evento UFG',
      'Noticia recente',
      'Noticia antiga',
    ]);
  });

  test('DeepSeek endpoint accepts only the official API host', () => {
    expect(resolveDeepSeekEndpoint({})).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(resolveDeepSeekEndpoint({ deepseekBaseUrl: 'https://api.deepseek.com/v1' }))
      .toBe('https://api.deepseek.com/v1/chat/completions');
    expect(resolveDeepSeekEndpoint({ deepseekEndpoint: 'https://api.deepseek.com/chat/completions' }))
      .toBe('https://api.deepseek.com/v1/chat/completions');
    expect(() => resolveDeepSeekEndpoint({ deepseekEndpoint: 'https://example.invalid/chat/completions' }))
      .toThrow('DeepSeek endpoint must use https://api.deepseek.com');
    expect(() => resolveDeepSeekEndpoint({ deepseekEndpoint: 'not-a-url' }))
      .toThrow('DeepSeek endpoint must be a valid URL');
  });

  test('DeepSeek model permits Vision Exp by default, Flash and Pro as alternatives', () => {
    // 2026-08-25: switched default to deepseek-v4-flash-vision-exp
    // (V4-Flash Vision Exp, 21/ago/2026) with reasoning_effort=max.
    // Flash and Pro remain valid alternatives for defensive rollback.
    expect(resolveDeepSeekModel({})).toBe('deepseek-v4-flash-vision-exp');
    expect(resolveDeepSeekModel({ deepseekModel: 'deepseek-v4-flash' })).toBe('deepseek-v4-flash');
    expect(resolveDeepSeekModel({ deepseekModel: 'deepseek-v4-pro' })).toBe('deepseek-v4-pro');
    expect(() => resolveDeepSeekModel({ deepseekModel: 'other-model' }))
      .toThrow('DeepSeek model must be deepseek-v4-flash-vision-exp, deepseek-v4-flash, or deepseek-v4-pro');
  });

  test('publisher uploads remote cover images to Supabase Storage before post_media', async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = jest.fn(async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).startsWith('https://source.local')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      }
      return { ok: true, status: 200, text: async () => '{"Key":"ok"}' };
    });

    try {
      const publisher = new SupabasePublisher({
        supabaseUrl: 'https://project.supabase.co',
        supabaseAnonKey: 'anon',
        kinoEmail: 'cadu@example.com',
        kinoPassword: 'secret',
        supabaseStorageBucket: 'kino-media',
        maxImageBytes: 1024,
      });
      publisher.session = { access_token: 'token', user: { id: 'user-1' } };
      const prepared = await publisher.prepareImagesForPost('post-1', ['https://source.local/cover.jpg']);

      expect(prepared.images[0]).toMatch(/^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/kino-media\/post-media\//);
      expect(prepared.uploads[0].ok).toBe(true);
      expect(calls[1].url).toContain('/storage/v1/object/kino-media/post-media/');
      expect(calls[1].options.headers['content-type']).toBe('image/jpeg');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('publisher normalizes direct and metadata cover image URLs', () => {
    expect(normalizeImages({
      imagens: ['https://source.local/cover.jpg'],
      image_url: 'https://source.local/cover.jpg',
      metadata: {
        image_url: 'https://source.local/meta.png',
        cover_url: 'javascript:alert(1)',
      },
    })).toEqual([
      'https://source.local/cover.jpg',
      'https://source.local/meta.png',
    ]);
  });

  test('publisher deduplicates and limits galleries to six valid images', () => {
    const images = Array.from({ length: 7 }, (_, index) => `https://source.local/image-${index + 1}.jpg`);

    expect(normalizeImages([
      images[0],
      { image_url: images[0] },
      ...images.slice(1),
      'javascript:alert(1)',
    ])).toEqual(images.slice(0, 6));
  });

  test('prepareImagesForPost enforces the six-image limit for direct calls', async () => {
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    publisher.session = { access_token: 'token', user: { id: 'user-1' } };
    publisher.uploadImageToStorage = jest.fn(async (_postId, sourceUrl) => `https://storage.local/${sourceUrl.split('/').pop()}`);
    const images = Array.from({ length: 7 }, (_, index) => `https://source.local/image-${index + 1}.jpg`);

    const prepared = await publisher.prepareImagesForPost('post-1', images);

    expect(prepared.images).toHaveLength(6);
    expect(prepared.uploads).toHaveLength(6);
    expect(publisher.uploadImageToStorage).toHaveBeenCalledTimes(6);
    expect(publisher.uploadImageToStorage).not.toHaveBeenCalledWith('post-1', images[6], 6);
  });

  test('publisher accepts object-shaped image candidates and never emits object strings', async () => {
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    publisher.session = { access_token: 'token', user: { id: 'user-1' } };
    publisher.uploadImageToStorage = jest.fn(async () => {
      throw new Error('storage_upload_http_403');
    });

    expect(imageUrlFromCandidate({ url: 'https://source.local/cover.jpg' })).toBe('https://source.local/cover.jpg');
    const prepared = await publisher.prepareImagesForPost('post-1', [{ url: 'https://source.local/cover.jpg' }]);

    expect(prepared.images).toEqual(['https://source.local/cover.jpg']);
    expect(prepared.images[0]).not.toBe('[object Object]');
    expect(prepared.uploads[0].source_url).toBe('https://source.local/cover.jpg');
  });

  test('publisher can disable external image fallback for temporary Telegram images', async () => {
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    publisher.session = { access_token: 'token', user: { id: 'user-1' } };
    publisher.uploadImageToStorage = jest.fn(async () => {
      throw new Error('storage_upload_http_403');
    });

    const prepared = await publisher.prepareImagesForPost(
      'post-1',
      [{ url: 'https://api.telegram.org/file/bot-token/photos/photo.jpg' }],
      { allowExternalFallback: false },
    );

    expect(prepared.images).toEqual([]);
    expect(prepared.uploads[0].source_url).toBe('https://api.telegram.org/file/bot-token/photos/photo.jpg');
  });

  test('publisher skips temporary CDN fallback by default when upload fails', async () => {
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    publisher.session = { access_token: 'token', user: { id: 'user-1' } };
    publisher.uploadImageToStorage = jest.fn(async () => {
      throw new Error('storage_upload_http_403');
    });

    const prepared = await publisher.prepareImagesForPost(
      'post-1',
      [{ url: 'https://scontent.cdninstagram.com/v/t51.2885-15/photo.jpg' }],
    );

    expect(prepared.images).toEqual([]);
    expect(prepared.uploads[0].source_url)
      .toBe('https://scontent.cdninstagram.com/v/t51.2885-15/photo.jpg');
  });

  test('createPost clears a temporary CDN cover when the storage upload fails', async () => {
    const originalFetch = global.fetch;
    const createdRow = {
      id: 'post-1',
      module: 'eventos',
      title: 'Teste',
      status: 'published',
      image_url: 'https://scontent.cdninstagram.com/v/t51.2885-15/photo.jpg',
      metadata: {},
    };
    global.fetch = jest.fn(async (url, options = {}) => {
      if (String(url).endsWith('/rest/v1/posts') && (options.method || 'GET') === 'POST') {
        return { ok: true, status: 201, text: async () => JSON.stringify([createdRow]) };
      }
      return { ok: true, status: 200, text: async () => '{}' };
    });
    try {
      const publisher = new SupabasePublisher({
        supabaseUrl: 'https://project.supabase.co',
        supabaseAnonKey: 'anon',
        kinoEmail: 'cadu@example.com',
        kinoPassword: 'secret',
      });
      publisher.session = { access_token: 'token', user: { id: 'user-1' } };
      publisher.checkPostFloodLimit = jest.fn(async () => null);
      publisher.checkPostLimit = jest.fn(async () => null);
      publisher.uploadImageToStorage = jest.fn(async () => {
        throw new Error('storage_upload_http_403');
      });
      publisher.updatePostCoverImage = jest.fn(async () => ({ ok: true }));

      const result = await publisher.createPost({
        title: 'Teste',
        module: 'eventos',
        images: ['https://scontent.cdninstagram.com/v/t51.2885-15/photo.jpg'],
        metadata: { categoria: 'Academicos', categoriaKey: 'academicos' },
      });

      expect(result.ok).toBe(true);
      expect(result.post.image_url).toBe('');
      expect(publisher.updatePostCoverImage).toHaveBeenCalledWith(
        'post-1',
        expect.anything(),
        '',
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('patchPost fetches the post when return=representation returns an empty array', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    try {
      const publisher = new SupabasePublisher({
        supabaseUrl: 'https://project.supabase.co',
        supabaseAnonKey: 'anon',
        kinoEmail: 'cadu@example.com',
        kinoPassword: 'secret',
      });
      publisher.session = { access_token: 'token', user: { id: 'user-1' } };
      publisher.getPost = jest.fn(async () => ({ id: 'post-1', metadata: { kept: true } }));

      const result = await publisher.patchPost('post-1', { title: 'Novo titulo' });

      expect(result).toEqual({ id: 'post-1', metadata: { kept: true } });
      expect(publisher.getPost).toHaveBeenCalledWith('post-1');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('caduEditPost prepares image before patching and validates the final row', async () => {
    const order = [];
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    publisher.session = { access_token: 'token', user: { id: 'user-1' } };
    publisher.getPost = jest.fn()
      .mockResolvedValueOnce({
        id: 'post-1',
        image_url: 'https://old.local/old.jpg',
        metadata: {
          link: 'https://old.local',
          gallery_image_urls: ['https://old.local/old.jpg'],
        },
      })
      .mockResolvedValueOnce({
        id: 'post-1',
        image_url: 'https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover.jpg',
        metadata: {
          link: 'https://new.local',
          image_url: 'https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover.jpg',
          cover_url: 'https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover.jpg',
          gallery_image_urls: ['https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover.jpg'],
        },
      });
    publisher.getPostMedia = jest.fn(async () => [{ url: 'https://old.local/old.jpg' }]);
    publisher.prepareImagesForPost = jest.fn(async () => {
      order.push('prepare');
      return {
        images: ['https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover.jpg'],
        uploads: [{ ok: true }],
      };
    });
    publisher.patchPost = jest.fn(async (postId, row) => {
      order.push('patch');
      return { id: postId, ...row };
    });
    publisher.replacePostMedia = jest.fn(async () => {
      order.push('media');
      return { ok: true, count: 1 };
    });

    const result = await publisher.caduEditPost('post-1', {
      metadata: { link: 'https://new.local' },
      images: ['https://source.local/cover.jpg'],
    });

    expect(result.ok).toBe(true);
    expect(order).toEqual(['prepare', 'patch', 'media']);
    expect(publisher.patchPost.mock.calls[0][1].metadata).toMatchObject({
      link: 'https://new.local',
      image_url: 'https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover.jpg',
      cover_url: 'https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover.jpg',
      gallery_image_urls: ['https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover.jpg'],
    });
  });

  test('publisher validation tolerates JSONB key reordering inside ordered arrays', () => {
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    const expectedHistory = [
      { at: '2026-07-27T19:19:50.298Z', operation: 'repair', reason: 'validated' },
      { at: '2026-07-27T19:20:00.000Z', operation: 'review', reason: 'complete' },
    ];
    const jsonbHistory = [
      { reason: 'validated', operation: 'repair', at: '2026-07-27T19:19:50.298Z' },
      { reason: 'complete', operation: 'review', at: '2026-07-27T19:20:00.000Z' },
    ];

    expect(publisher.validatePostPatch(
      { metadata: { image_repair_history: jsonbHistory } },
      {},
      { image_repair_history: expectedHistory },
    )).toMatchObject({ ok: true, errors: [] });

    expect(publisher.validatePostPatch(
      { metadata: { image_repair_history: [...jsonbHistory].reverse() } },
      {},
      { image_repair_history: expectedHistory },
    )).toMatchObject({
      ok: false,
      errors: ['mismatch_metadata_image_repair_history'],
    });
  });

  test('safeUpdatePost merges metadata and does not delete media when no image is provided', async () => {
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    publisher.session = { access_token: 'token', user: { id: 'user-1' } };
    publisher.getPost = jest.fn()
      .mockResolvedValueOnce({
        id: 'post-1',
        metadata: {
          link: 'https://old.local',
          link_as_cta: true,
          nested: { a: 1 },
        },
      })
      .mockResolvedValueOnce({
        id: 'post-1',
        status: 'published',
        moderation_reason: null,
        metadata: {
          link: 'https://old.local',
          link_as_cta: true,
          contato: 'contato@ufg.br',
          nested: { a: 1, b: 2 },
        },
      });
    publisher.patchPost = jest.fn(async (postId, row) => ({ id: postId, ...row }));
    publisher.replacePostMedia = jest.fn();

    const result = await publisher.safeUpdatePost('post-1', {
      status: 'published',
      moderation_reason: null,
      metadata: { contato: 'contato@ufg.br', nested: { b: 2 } },
    });

    const patch = publisher.patchPost.mock.calls[0][1];
    expect(result.ok).toBe(true);
    expect(patch.status).toBe('published');
    expect(patch.moderation_reason).toBeNull();
    expect(patch.metadata).toMatchObject({
      link: 'https://old.local',
      link_as_cta: true,
      contato: 'contato@ufg.br',
      nested: { a: 1, b: 2 },
    });
    expect(publisher.replacePostMedia).not.toHaveBeenCalled();
    expect(result.media.skipped).toBe(true);
  });

  test('caduEditPost serializes concurrent edits for the same post', async () => {
    const order = [];
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    publisher.session = { access_token: 'token', user: { id: 'user-1' } };
    publisher.getPost = jest.fn(async () => ({ id: 'post-1', metadata: {} }));
    publisher.patchPost = jest.fn(async (postId, row) => {
      order.push(`patch-start-${row.metadata.label}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`patch-end-${row.metadata.label}`);
      return { id: postId, ...row };
    });
    publisher.validatePostPatch = jest.fn((post, row) => ({ ok: true, errors: [], post: { id: 'post-1', ...row } }));
    publisher.replacePostMedia = jest.fn();

    await Promise.all([
      publisher.caduEditPost('post-1', { metadata: { label: 'a' } }),
      publisher.caduEditPost('post-1', { metadata: { label: 'b' } }),
    ]);

    expect(order).toEqual(['patch-start-a', 'patch-end-a', 'patch-start-b', 'patch-end-b']);
  });

  test('mergeMetadata method performs a safe metadata-only edit', async () => {
    const publisher = new SupabasePublisher({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      kinoEmail: 'cadu@example.com',
      kinoPassword: 'secret',
    });
    publisher.session = { access_token: 'token', user: { id: 'user-1' } };
    publisher.getPost = jest.fn()
      .mockResolvedValueOnce({ id: 'post-1', metadata: { link_as_cta: true } })
      .mockResolvedValueOnce({ id: 'post-1', metadata: { link_as_cta: true, contato: 'cadu@ufg.br' } });
    publisher.patchPost = jest.fn(async (postId, row) => ({ id: postId, ...row }));

    const result = await publisher.mergeMetadata('post-1', { contato: 'cadu@ufg.br' });

    expect(result.ok).toBe(true);
    expect(publisher.patchPost.mock.calls[0][1].metadata).toMatchObject({
      link_as_cta: true,
      contato: 'cadu@ufg.br',
    });
  });

  test('telegram notifier chunks long review messages', () => {
    const chunks = splitMessage(['a'.repeat(2000), 'b'.repeat(2000), 'c'.repeat(2000)].join('\n\n'), 3900);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(3900));
  });

  test('http client retries through configured proxy on network failure', async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      if (calls.length === 1) throw new TypeError('fetch failed');
      return { ok: true, status: 200, text: async () => 'ok' };
    });
    try {
      const client = new HttpClient({ minDelayMs: 0, fetchProxyTemplate: 'https://proxy.local/read?url={url}' });
      const response = await client.fetch('https://proex.ufg.br/robots.txt');
      expect(response.ok).toBe(true);
      expect(calls[1]).toBe('https://proxy.local/read?url=https%3A%2F%2Fproex.ufg.br%2Frobots.txt');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('state ignores dry-run publish markers for real publishes', () => {
    const state = new StateStore('unused');
    state.mark('dry', { decision: 'dry-run-publish' });
    state.mark('published', { decision: 'published' });

    expect(state.has('dry')).toBe(false);
    expect(state.has('published')).toBe(true);
  });

  test('state aliases prevent cross-source duplicate publications', () => {
    const state = new StateStore('unused');
    state.mark('item:primary', { decision: 'review' }, ['url:portal', 'raw:weby']);

    expect(state.has('url:portal')).toBe(true);
    expect(state.hasAny(['url:unit', 'raw:weby'])).toBe(true);
    expect(Object.keys(state.data.seen)).toEqual(['item:primary']);
  });
});
