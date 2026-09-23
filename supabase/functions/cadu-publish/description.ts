// Pure body selection shared by early validation and the mapper. No network or
// persistence, and no truncation after the publisher approved the content.
import { normalizeText, normalizeWhitespace, stripHtml } from "./util.ts";

// Mirrors KC_DESCRIPTION_MAX_LENGTH_ADMIN in the administrative product editor.
export const MAX_CADU_DESCRIPTION_LENGTH = 5000;

// FRAG-08 (issue #587, 2026-09-22): contrato UNICO de `weak_description`.
//
// Antes o MESMO gate tinha 4 limiares (80/120/140/160) sobre 3 corpos:
// pipeline-kino.js `publishReadinessIssues` <80, lib/quality-gate.js
// `ensureQuality` <120, a selecao de corpo aqui em descricao.ts <140 e a
// barreira de classificacao de index.ts <160+link+termo (auditoria
// openclaw-cadu docs/engineering/audits-2026-09-22/audit-fragility.md, secao
// 3.1). O contrato passa a ser: UM limiar, UM corpo canonico.
//
// Espelho lockstep nos DOIS repositorios: o lado JS exporta a MESMA constante
// de openclaw-cadu data/.openclaw/workspace/scripts/lib/quality-gate.js
// (consumida por pipeline-kino.js e lib/edge-quality-parity.js; o comentario
// la cita este arquivo). 120 = o limiar do quality-gate, adotado como canonico.
// Nao rebaixar: abaixo de WEAK_DESCRIPTION_MIN_CHARS a publicacao continua
// BLOQUEADA (fail-closed) nos dois lados, com o mesmo numero.
export const WEAK_DESCRIPTION_MIN_CHARS = 120;

interface DescriptionInput {
  formattedDescription?: string;
  formatted_description?: string;
  description?: string;
  summary?: string;
  text?: string;
}

function normalizeMarkdownInput(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean)
    .join("\n");
}

function stripCmsCreditLines(value: unknown): string {
  return normalizeMarkdownInput(value)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => {
      if (!line) return false;
      if (/^(texto|fotos?|foto|imagens?|imagem|reportagem|edicao|edição)\s*:\s*[^:]{2,120}$/i.test(line)) return false;
      if (/^por\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ' .-]{2,80}\*?$/u.test(line)) return false;
      if (/^fonte\s+oficial\s*:\s*https?:\/\//i.test(line)) return false;
      if (/^\*\*?\s*🔗?\s*fonte\s+oficial\s*:/i.test(line)) return false;
      if (/^https?:\/\/\S+$/i.test(line)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasCmsCreditLine(value: unknown): boolean {
  return normalizeMarkdownInput(value)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .some((line) =>
      /^(texto|fotos?|foto|imagens?|imagem|reportagem|edicao|edição)\s*:\s*[^:]{2,120}$/i.test(line) ||
      /^por\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ' .-]{2,80}\*?$/u.test(line)
    );
}

// FRAG-08 (issue #587, 2026-09-22): este predicado e um SINAL DE QUALIDADE,
// nao um seletor de corpo. O comportamento booleano (inclusive a janela de 140
// chars do formatador) permanece EXATAMENTE o mesmo de antes — o que mudou foi
// o poder: ele nao troca mais o corpo publicado. Antes, abaixo de 140 chars o
// formattedDescription APROVADO era descartado e o lead sem Markdown era
// publicado no lugar (o veredito de qualidade media um corpo que nao era o
// artefato publicado). Agora o resultado e devolvido como warn/flag
// (caduDescriptionQualityFlags / quality.warnings) e a decisao de corpo so
// depende de presenca (ver caduDescriptionBody).
export function isUsefulFormattedDescription(value: unknown): boolean {
  const text = stripCmsCreditLines(value);
  if (text.length < 140) return false;
  if (hasCmsCreditLine(value)) return false;
  const normalized = normalizeText(text);
  if (/universidade gratuita|mais de\s+\d+\s+mil alunos|ensino pesquisa e extensao/.test(normalized)) return false;
  return /\*\*|\[[^\]]+\]\(https?:\/\/|prazo|inscric|edital|evento|bolsa|curso|palestra|sele[cç][aã]o|submiss/i.test(text);
}

// Flag de qualidade sobre o corpo formatted PUBLICADO (FRAG-08, issue #587):
// devolvida como warn/flag quando o corpo aprovado parece pouco acionavel pela
// heuristica historica de 140 chars. Nunca troca o corpo publicado e nunca
// bloqueia por si so — weak_description (< WEAK_DESCRIPTION_MIN_CHARS) e a
// barra de qualidade fail-closed.
export function caduDescriptionQualityFlags(item: DescriptionInput): string[] {
  const formatted = stripCmsCreditLines(item.formattedDescription || item.formatted_description || "");
  if (!formatted || isUsefulFormattedDescription(formatted)) return [];
  return ["formatted_description_low_signal"];
}

export function caduDescriptionBody(item: DescriptionInput): string {
  const formatted = stripCmsCreditLines(item.formattedDescription || item.formatted_description || "");
  const lead = normalizeWhitespace(
    stripCmsCreditLines(stripHtml(item.description || item.summary || item.text || "")),
  );
  // FRAG-08 (issue #587, 2026-09-22): o formattedDescription aprovado pelo
  // formatador + quality-gate e o corpo publicado — sempre que existir. O lead
  // entra APENAS quando formatted esta AUSENTE/vazio, nunca por heuristica de
  // 'utilidade'. O contrato de corpo canonico e este, medido tambem pelo gate
  // weak_description (< WEAK_DESCRIPTION_MIN_CHARS) de index.ts e espelhado em
  // openclaw-cadu lib/edge-quality-parity.js::edgeDescriptionBody.
  const body = formatted || lead;
  if (body.length > MAX_CADU_DESCRIPTION_LENGTH) {
    throw new TypeError(`description pode ter no máximo ${MAX_CADU_DESCRIPTION_LENGTH} caracteres; reformate o texto completo antes de publicar.`);
  }
  return body;
}
