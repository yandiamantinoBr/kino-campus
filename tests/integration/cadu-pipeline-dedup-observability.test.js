const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const controller = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-cadu.controller.js'),
  'utf8'
);

function extractFunctionSource(name) {
  const start = controller.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const bodyStart = controller.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < controller.length; index += 1) {
    if (controller[index] === '{') depth += 1;
    if (controller[index] === '}') depth -= 1;
    if (depth === 0) return controller.slice(start, index + 1);
  }
  throw new Error(`function ${name} is incomplete`);
}

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

describe('Cadu dedup observability', () => {
  test('renders the standalone dedup funnel without generic publication labels', () => {
    const renderRunSummary = Function(
      'escapeHtml',
      `"use strict"; return (${extractFunctionSource('renderRunSummary')});`
    )(escapeHtml);
    const html = renderRunSummary({
      metrics: {
        dedup_posts_analyzed: 137,
        dedup_official_reference_pairs: 1,
        dedup_text_candidates: 36,
        dedup_exact_image_groups: 1,
        dedup_similar_image_pairs: 7,
        dedup_ai_pairs: 0,
        dedup_semantic_pairs: 2,
        dedup_program_identity_pairs: 1,
        dedup_semantic_distinct: 2,
        dedup_semantic_ambiguous: 1,
        dedup_semantic_hides_blocked: 1,
        dedup_preview_reused: 1,
        dedup_hides_planned: 0,
        dedup_reviews_planned: 4,
      },
      warnings: [],
    });

    expect(html).toContain('analisados 137');
    expect(html).toContain('referências oficiais compartilhadas 1');
    expect(html).toContain('candidatos textuais 36');
    expect(html).toContain('grupos de imagem idêntica 1');
    expect(html).toContain('imagens similares 7');
    expect(html).toContain('pares avaliados pela IA 0');
    expect(html).toContain('pares semânticos avaliados 2');
    expect(html).toContain('pares por identidade de programa 1');
    expect(html).toContain('classificados como distintos 2');
    expect(html).toContain('classificados como ambíguos 1');
    expect(html).toContain('recomendações de ocultação bloqueadas 1');
    expect(html).toMatch(/class="is-warning">classificados como ambíguos 1/);
    expect(html).toMatch(/class="is-warning">recomendações de ocultação bloqueadas 1/);
    expect(html).toContain('prévia semântica aplicada 1');
    expect(html).toContain('ocultações planejadas 0');
    expect(html).toContain('revisões planejadas 4');
    expect(html).toMatch(/class="is-warning">revisões planejadas 4/);
    expect(html).not.toContain('publicados');
  });

  test('warns that real dedup applies an immutable recent simulation', () => {
    expect(controller).toContain("stageId === 'dedup' && dryRun === false");
    expect(controller).toContain('aplica a simulação recente sem consultar novamente a IA');
    expect(controller).toContain('o backend bloqueará toda escrita');
  });

  test('separates run-produced reports from stale contextual artifacts', () => {
    const renderPipelineArtifact = Function(
      'escapeHtml',
      `"use strict"; return (${extractFunctionSource('renderPipelineArtifact')});`
    )(escapeHtml);
    const renderPipelineArtifacts = Function(
      'renderPipelineArtifact',
      `"use strict"; return (${extractFunctionSource('renderPipelineArtifacts')});`
    )(renderPipelineArtifact);
    const html = renderPipelineArtifacts([
      {
        kind: 'dedup_report',
        name: 'dedup-run.json',
        size_bytes: 191211,
        produced_during_run: true,
        stale_for_run: false,
      },
      {
        kind: 'curator_daily',
        name: '<old>.json',
        size_bytes: 1024,
        produced_during_run: false,
        stale_for_run: true,
      },
    ]);

    expect(html).toContain('Gerados nesta execução (1)');
    expect(html).toContain('gerado nesta execução');
    expect(html).toContain('Contexto anterior (1)');
    expect(html).toContain('contexto anterior');
    expect(html).toContain('&lt;old&gt;.json');
    expect(html).not.toContain('<old>.json');
  });
});
