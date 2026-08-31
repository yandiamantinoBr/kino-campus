// Pure body selection shared by early validation and the mapper. No network or
// persistence, and no truncation after the publisher approved the content.
import { normalizeText, normalizeWhitespace, stripHtml } from "./util.ts";

// Mirrors KC_DESCRIPTION_MAX_LENGTH_ADMIN in the administrative product editor.
export const MAX_CADU_DESCRIPTION_LENGTH = 5000;

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

function isUsefulFormattedDescription(value: unknown): boolean {
  const text = stripCmsCreditLines(value);
  if (text.length < 140) return false;
  if (hasCmsCreditLine(value)) return false;
  const normalized = normalizeText(text);
  if (/universidade gratuita|mais de\s+\d+\s+mil alunos|ensino pesquisa e extensao/.test(normalized)) return false;
  return /\*\*|\[[^\]]+\]\(https?:\/\/|prazo|inscric|edital|evento|bolsa|curso|palestra|sele[cç][aã]o|submiss/i.test(text);
}

export function caduDescriptionBody(item: DescriptionInput): string {
  const formatted = stripCmsCreditLines(item.formattedDescription || item.formatted_description || "");
  const lead = normalizeWhitespace(
    stripCmsCreditLines(stripHtml(item.description || item.summary || item.text || "")),
  );
  // Preserve the existing body selection/credit cleanup, but validate the exact
  // selected body (including a fallback) before even looking up a cover.
  const body = formatted && isUsefulFormattedDescription(formatted) ? formatted : lead;
  if (body.length > MAX_CADU_DESCRIPTION_LENGTH) {
    throw new TypeError(`description pode ter no máximo ${MAX_CADU_DESCRIPTION_LENGTH} caracteres; reformate o texto completo antes de publicar.`);
  }
  return body;
}
