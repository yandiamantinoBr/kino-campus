import assert from "node:assert/strict";
import {
  caduDescriptionBody,
  caduDescriptionQualityFlags,
  isUsefulFormattedDescription,
  MAX_CADU_DESCRIPTION_LENGTH,
  WEAK_DESCRIPTION_MIN_CHARS,
} from "./description.ts";
import { mapItemToPost } from "./mapper.ts";
import { handlePublish } from "./index.ts";
import { validateItem, type CaduItem } from "./schema.ts";

/**
 * FRAG-08 (issue #587, 2026-09-22) — contrato UNICO de corpo + um limiar de
 * weak_description + paridade com o lado JS.
 *
 * Antes o MESMO gate tinha 4 limiares (80/120/140/160) sobre 3 corpos e, o que
 * e pior: abaixo de 140 chars a Edge PUBLICAVA OUTRO CORPO (o lead sem
 * Markdown) que nao era o formattedDescription APROVADO pelo formatador +
 * quality-gate (auditoria openclaw-cadu
 * docs/engineering/audits-2026-09-22/audit-fragility.md, secao 3.1).
 *
 * Espelho lockstep: o lado JS trava o MESMO contrato em
 * openclaw-cadu tests/test-weak-description-contract.js, contra
 * lib/quality-gate.js (exporta WEAK_DESCRIPTION_MIN_CHARS),
 * pipeline-kino.js::publishReadinessIssues e
 * lib/edge-quality-parity.js::edgeDescriptionBody/edgeBuildDescription.
 */

const now = new Date("2026-09-22T16:00:00Z");
const SOURCE_URL = "https://ufg.br/n/999999";
const LEAD = "Resumo bruto da fonte, sem Markdown, longo o suficiente para ser um "
  + "corpo publicavel proprio, mas NUNCA o substituto do corpo aprovado pelo "
  + "formatador enquanto formattedDescription existir neste item de teste. "
  + "O lead original nao traz a estrutura que o formatador aprovou e nao pode "
  + "ser promovido a corpo publicado por nenhuma heuristica de utilidade.";

/** prefixo + preenchimento 'a' ate o tamanho EXATO (uma linha, ASCII: sobrevive a NFKC + normalizeWhitespace com o mesmo tamanho). */
function padded(prefix: string, length: number): string {
  assert(prefix.length < length, "prefixo maior que o tamanho pedido");
  return prefix + "a".repeat(length - prefix.length);
}

function baseItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Curso com inscrições abertas para a comunidade UFG",
    module: "oportunidades",
    category: "cursos-capacitacoes",
    description: LEAD,
    link: "https://ufg.br/formulario/curso",
    linkAsCta: true,
    score: 0.75,
    sourceId: "web.ufg.fixture:" + SOURCE_URL,
    sourceRevision: "a".repeat(64),
    itemVersion: "b".repeat(64),
    dates: {
      applicationDeadline: "2099-09-23",
      applicationStatus: "open",
      canApply: true,
      applicationPurpose: "registration",
    },
    ...overrides,
  };
}

function readOnlyAdmin() {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "neq", "contains", "order", "limit", "or", "in"]) query[method] = () => query;
  query.maybeSingle = () => Promise.resolve({ data: null, error: null });
  query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve);
  query.insert = query.update = () => { throw Error("unexpected production-style write in dry-run"); };
  return { from: (table: string) => { assert.equal(table, "posts"); return query; } } as any;
}

async function dryRun(item: Record<string, unknown>) {
  const response = await handlePublish(readOnlyAdmin(), "test-publisher", {
    item,
    options: { dryRun: true },
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

// ---------------------------------------------------------------------------
// (a) formatted < 140 mas >= 120 PUBLICA formatted (era swapado pelo lead!)
// ---------------------------------------------------------------------------
Deno.test("FRAG-08 (a): formatted aprovado de 120..139 chars e o corpo PUBLICADO — nunca mais o lead", () => {
  const formatted = padded("Semana cultural com programacao aberta ", 130);
  assert.equal(formatted.length, 130);
  // A condicao EXATA do swap antigo (janela do formatador, 140 chars) e FALSA
  // aqui — e mesmo assim o corpo publicado e o formatted aprovado.
  assert.equal(isUsefulFormattedDescription(formatted), false, "130 < 140: era exatamente o caso trocado");
  const item = baseItem({ description: LEAD, formattedDescription: formatted });
  assert.equal(caduDescriptionBody(item as CaduItem), formatted);
  const mapped = mapItemToPost(item as CaduItem, { now });
  assert.ok(mapped.row.description.startsWith(formatted), "corpo publicado = formatted aprovado");
  assert.ok(!mapped.row.description.includes(LEAD.slice(0, 60)), "lead nunca substitui o formatted aprovado");
});

Deno.test("FRAG-08 (a): a heuristica de 140 virou warn/flag e NAO troca corpo nem bloqueia", async () => {
  const formatted = padded("Semana cultural com programacao aberta ", 130);
  const item = baseItem({ description: LEAD, formattedDescription: formatted, sourceUrl: SOURCE_URL });
  assert.deepEqual(caduDescriptionQualityFlags(item as CaduItem), ["formatted_description_low_signal"]);
  assert.equal(caduDescriptionBody(item as CaduItem), formatted, "flag de qualidade nao troca o corpo");
  const { body } = await dryRun(item);
  assert.equal(body.code, "DRY_RUN", JSON.stringify(body));
  assert.deepEqual(body.quality.blockingWarnings, [], "flag de qualidade nunca bloqueia");
  assert.ok(body.quality.warnings.includes("formatted_description_low_signal"), JSON.stringify(body.quality));
});

// ---------------------------------------------------------------------------
// (b) formatted ausente -> lead
// ---------------------------------------------------------------------------
Deno.test("FRAG-08 (b): formatted AUSENTE/vazio publica o lead normalizado", () => {
  for (const formattedDescription of [undefined, "", "   "]) {
    const item = baseItem({ description: LEAD, formattedDescription });
    const expected = LEAD.trim();
    assert.equal(caduDescriptionBody(item as CaduItem), expected, String(formattedDescription));
    const mapped = mapItemToPost(item as CaduItem, { now });
    assert.ok(mapped.row.description.startsWith(expected.slice(0, 60)), String(formattedDescription));
  }
});

// ---------------------------------------------------------------------------
// (c) weak < 120 bloqueado nos DOIS lados com o MESMO limiar
// ---------------------------------------------------------------------------
Deno.test("FRAG-08 (c): WEAK_DESCRIPTION_MIN_CHARS = 120 e o MESMO numero do lado JS", () => {
  // openclaw-cadu data/.openclaw/workspace/scripts/lib/quality-gate.js exporta
  // WEAK_DESCRIPTION_MIN_CHARS = 120 (o lado JS trava este valor em
  // tests/test-weak-description-contract.js). Travar 120 aqui e no JS impede
  // drift de limiar entre os dois repositorios.
  assert.equal(WEAK_DESCRIPTION_MIN_CHARS, 120);
});

Deno.test("FRAG-08 (c): corpo canonico 119 e bloqueado como weak_description; 120 publica", async () => {
  // Mesmo item nos dois casos: com fonte oficial anexada pelo mapper, a
  // descricao MAPEADA passa de 160 chars nos dois — o unico discriminador e o
  // limiar de weak sobre o corpo canonico (formatted aprovado). Antes do
  // contrato FRAG-08 a barreira media o corpo mapeado e publicava os dois.
  const weak = padded("Resumo objetivo da programacao da semana cultural ", 119);
  const ok = padded("Resumo objetivo da programacao da semana cultural ", 120);
  const weakItem = baseItem({ description: weak, formattedDescription: weak, sourceUrl: SOURCE_URL });
  const okItem = baseItem({ description: ok, formattedDescription: ok, sourceUrl: SOURCE_URL });
  assert.equal(caduDescriptionBody(weakItem as CaduItem).length, 119);
  assert.equal(caduDescriptionBody(okItem as CaduItem).length, 120);

  const weakRun = await dryRun(weakItem);
  assert.equal(weakRun.body.code, "QUALITY_BLOCKED", JSON.stringify(weakRun.body));
  assert.deepEqual(weakRun.body.quality.blockingWarnings, ["weak_description"], JSON.stringify(weakRun.body.quality));

  const okRun = await dryRun(okItem);
  assert.equal(okRun.body.code, "DRY_RUN", JSON.stringify(okRun.body));
  assert.deepEqual(okRun.body.quality.blockingWarnings, [], JSON.stringify(okRun.body.quality));
});

// ---------------------------------------------------------------------------
// (d) predicados renomeados/documentados nao mudam de comportamento onde eram acao
// ---------------------------------------------------------------------------
Deno.test("FRAG-08 (d): hasActionableMarkdownDescription mantem o comportamento EXATO — so o codigo muda", async () => {
  // Tabela de verdade do predicado de ACAO EXECUTAVEL (>=160 chars + link +
  // termo de acao sobre a descricao MAPEADA). Os casos A/B/C continuam
  // BLOQUEADOS exatamente como antes (antes emitiam o codigo homonimo
  // weak_description; hoje description_not_actionable) e o caso D continua
  // PUBLICAVEL. Nada foi afrouxado no gate de acao executavel.
  //
  // Itens sem sourceUrl: o mapper nao anexa o bloco de fonte, entao a
  // descricao mapeada e exatamente o corpo canonico e cada clausula do
  // predicado pode ser exercitada isoladamente.
  const withoutSource = (body: string) => baseItem({ description: body, formattedDescription: body });

  // A: >=120 (weak passa) e <160 -> falha em TAMANHO.
  const caseA = padded("Resumo com https://ufg.br/x e inscricoes abertas ", 130);
  const runA = await dryRun(withoutSource(caseA));
  assert.equal(runA.body.code, "QUALITY_BLOCKED", JSON.stringify(runA.body));
  assert.deepEqual(runA.body.quality.blockingWarnings, ["description_not_actionable"], JSON.stringify(runA.body.quality));

  // B: >=160 sem URL -> falha em LINK (com termo de acao presente).
  const caseB = padded("Confira o prazo no mural da secretaria do curso ", 170);
  const runB = await dryRun(withoutSource(caseB));
  assert.equal(runB.body.code, "QUALITY_BLOCKED", JSON.stringify(runB.body));
  assert.deepEqual(runB.body.quality.blockingWarnings, ["description_not_actionable"], JSON.stringify(runB.body.quality));

  // C: >=160 com URL e SEM termo de acao -> falha em TERMO.
  const caseC = padded("Conheca a programacao completa em https://ufg.br/semana com atividades abertas ", 170);
  const runC = await dryRun(withoutSource(caseC));
  assert.equal(runC.body.code, "QUALITY_BLOCKED", JSON.stringify(runC.body));
  assert.deepEqual(runC.body.quality.blockingWarnings, ["description_not_actionable"], JSON.stringify(runC.body.quality));

  // D: >=160 com URL e com termo de acao -> publicavel, como sempre foi.
  const caseD = padded("Conheca a programacao completa em https://ufg.br/semana com inscricoes abertas ", 170);
  const runD = await dryRun(withoutSource(caseD));
  assert.equal(runD.body.code, "DRY_RUN", JSON.stringify(runD.body));
  assert.deepEqual(runD.body.quality.blockingWarnings, [], JSON.stringify(runD.body.quality));
});

Deno.test("FRAG-08: o corpo canonico continua validado antes de qualquer lookup, midia ou escrita", () => {
  // Guarda de contrato preservada: o capo administrativo e checado sobre o
  // corpo SELECIONADO, agora sempre o formatted quando existir.
  assert.equal(MAX_CADU_DESCRIPTION_LENGTH, 5000);
  const oversized = "x".repeat(5001);
  const item = baseItem({ description: LEAD, formattedDescription: oversized });
  assert.throws(() => caduDescriptionBody(item as CaduItem), /5000/);
  assert.equal(validateItem(item as CaduItem).ok, false);
});
