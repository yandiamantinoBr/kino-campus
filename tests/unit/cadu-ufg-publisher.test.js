'use strict';

const { classifyItem } = require('../../services/cadu-ufg-publisher/src/classifier');
const { mapToKinoPayload, toPostgrestInsert } = require('../../services/cadu-ufg-publisher/src/mapper');
const { isAllowedByRobots, parseRobotsTxt } = require('../../services/cadu-ufg-publisher/src/robots');
const { parseFeed, parseSitemap } = require('../../services/cadu-ufg-publisher/src/xml');

describe('cadu-ufg-publisher', () => {
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
    const result = classifyItem(item, { tier: 1 });
    expect(['publish', 'review']).toContain(result.decision);
    expect(result.module).toBe('oportunidades');
    expect(result.category).toBe('monitoria');
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
    };
    const classification = classifyItem(item, { tier: 1 });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });
    expect(payload.modulo).toBe('oportunidades');
    expect(payload.titulo.length).toBeLessThanOrEqual(80);
    expect(payload.descricao.length).toBeLessThanOrEqual(2000);
    expect(payload.metadata.source_url).toBe(item.sourceUrl);
    expect(payload.metadata.link_as_cta).toBe(true);

    const row = toPostgrestInsert(payload, 'user-1');
    expect(row.author_id).toBe('user-1');
    expect(row.module).toBe('oportunidades');
    expect(row.metadata.source_url).toBe(item.sourceUrl);
  });
});
