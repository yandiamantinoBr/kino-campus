// KinoCampus — Edge Function cadu-publish: contrato por modulo.
//
// Espelha assets/js/features/create-post/kc-create-post.fields.js (campos e
// obrigatoriedades) e os mapas de rotulo/categoria de
// services/cadu-ufg-publisher/src/mapper.js, para que posts do Cadu fiquem
// estruturalmente identicos aos de humanos.

import { normalizeText, slugify } from "./util.ts";

export const MODULE_KEYS = [
  "eventos",
  "oportunidades",
  "moradia",
  "compra-venda",
  "caronas",
  "achados-perdidos",
] as const;

export type ModuleKey = typeof MODULE_KEYS[number];

export function isValidModule(m: unknown): m is ModuleKey {
  return typeof m === "string" && (MODULE_KEYS as readonly string[]).includes(m);
}

// Rotulos canonicos de categoria (label de exibicao).
export const CATEGORY_LABELS: Record<string, string> = {
  academicos: "Academicos",
  culturais: "Culturais",
  empregos: "Empregos",
  esportivos: "Esportivos",
  estagios: "Estagios",
  festas: "Festas",
  freelancer: "Freelancer",
  monitoria: "Monitoria",
  pesquisa: "Pesquisa",
  sustentabilidade: "Sustentabilidade",
  voluntariado: "Voluntariado",
  workshops: "Workshops",
};

export function categoryLabel(categoryKey: string): string {
  const key = slugify(categoryKey);
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  const raw = String(categoryKey || "").trim();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Categoria padrao por modulo quando o curador nao informa uma.
export const DEFAULT_CATEGORY: Record<ModuleKey, string> = {
  eventos: "academicos",
  oportunidades: "monitoria",
  moradia: "aluguel",
  "compra-venda": "outros",
  caronas: "ofereco",
  "achados-perdidos": "achados",
};

// ── Modalidade de trabalho (oportunidades) ────────────────────────────────────
interface KeyLabel {
  key: string;
  label: string;
}

const WORK_MODES: Array<KeyLabel & { match: RegExp }> = [
  { key: "remoto", label: "Remoto", match: /remot|home ?office|a distancia|\bead\b|online|teletrabalho|anywhere/ },
  { key: "hibrido", label: "Hibrido", match: /hibrid|semi ?presencial/ },
  { key: "presencial", label: "Presencial", match: /presencial|in loco|no local|on ?site/ },
];

// Resolve modalidade a partir de um valor explicito OU do texto livre.
// Default seguro: Presencial (igual ao comportamento atual, mas agora so quando
// nao ha sinal de remoto/hibrido no texto).
export function resolveWorkMode(explicit: unknown, text: unknown): KeyLabel {
  const exp = normalizeText(explicit);
  for (const wm of WORK_MODES) {
    if (exp && wm.match.test(exp)) return { key: wm.key, label: wm.label };
  }
  const hay = normalizeText(text);
  for (const wm of WORK_MODES) {
    if (wm.match.test(hay)) return { key: wm.key, label: wm.label };
  }
  return { key: "presencial", label: "Presencial" };
}

// ── Regime/Vinculo (oportunidades do tipo emprego) ────────────────────────────
const REGIMES: Array<KeyLabel & { match: RegExp }> = [
  { key: "clt", label: "CLT", match: /\bclt\b|carteira assinada|celetista/ },
  { key: "pj", label: "PJ", match: /\bpj\b|pessoa juridica|prestador de servico/ },
  { key: "temporario", label: "Temporario", match: /temporari|prazo determinado|contrato por tempo/ },
  { key: "jovem-aprendiz", label: "Jovem Aprendiz", match: /aprendiz/ },
];

export function resolveRegime(explicit: unknown, text: unknown): KeyLabel {
  const exp = normalizeText(explicit);
  for (const rg of REGIMES) {
    if (exp && rg.match.test(exp)) return { key: rg.key, label: rg.label };
  }
  const hay = normalizeText(text);
  for (const rg of REGIMES) {
    if (rg.match.test(hay)) return { key: rg.key, label: rg.label };
  }
  return { key: "", label: "" };
}

// Tipo de oportunidade (emprego/estagio/bolsa/freelancer/voluntariado).
export function normalizeOpportunityType(value: unknown): string {
  const t = normalizeText(value);
  if (/empreg|vaga|clt|efetiv|contrata/.test(t)) return "emprego";
  if (/estagi|trainee/.test(t)) return "estagio";
  if (/bolsa|pibic|pivic|iniciacao|monitor|fapeg/.test(t)) return "bolsa";
  if (/freela|projeto|autonom/.test(t)) return "freelancer";
  if (/voluntari/.test(t)) return "voluntariado";
  return t || "";
}

// ── Validacao do item de entrada (espelha required de fields.js) ──────────────
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface CaduItem {
  module?: string;
  type?: string;
  title?: string;
  formattedTitle?: string;
  formatted_title?: string;
  description?: string;
  formattedDescription?: string;
  formatted_description?: string;
  summary?: string;
  text?: string;
  score?: number | string;
  dates?: Record<string, unknown>;
  category?: string;
  location?: string;
  price?: number | string;
  contato?: string;
  area?: string;
  workMode?: string;
  regime?: string;
  remuneracao?: string;
  dateStart?: string;
  dateEnd?: string;
  time?: string;
  gratuito?: boolean;
  link?: string;
  linkAsCta?: boolean;
  actionLabel?: string;
  actionKey?: string;
  image?: string;
  imageUrl?: string;
  image_url?: string;
  cover?: string;
  images?: string[];
  imageSource?: string;
  allowExternalImageFallback?: boolean;
  tags?: string[];
  sourceUrl?: string;
  sourceId?: string;
  sourceName?: string;
  pdfLinks?: string[];
  extractedLinks?: Array<string | { url?: string; label?: string }>;
  enrichmentSources?: Array<string | { url?: string; label?: string; type?: string }>;
  enrichmentCheckedAt?: string;
  visibility?: string;
  // campos especificos de outros modulos
  regiao?: string;
  origem?: string;
  destino?: string;
  horario?: string;
  contribuicao?: string;
  vagas?: string | number;
  condicao?: string;
  entrega?: string;
  recompensa?: string;
  detalhes?: string;
  features?: string[];
  [k: string]: unknown;
}

function hasText(v: unknown): boolean {
  return !!String(v ?? "").trim();
}

export function validateItem(item: CaduItem): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isValidModule(item.module)) {
    errors.push(`module invalido: "${String(item.module ?? "")}". Use um de: ${MODULE_KEYS.join(", ")}.`);
    return { ok: false, errors, warnings };
  }
  const module = item.module as ModuleKey;

  if (!hasText(item.title)) errors.push("title obrigatorio.");
  if (!hasText(item.description) && !hasText(item.summary) && !hasText(item.text)) {
    errors.push("description (ou summary/text) obrigatorio.");
  }

  const type = normalizeOpportunityType(item.type);

  switch (module) {
    case "eventos":
      if (!hasText(item.location)) warnings.push("eventos: 'location' (Local) e recomendado.");
      break;
    case "oportunidades":
      if (!hasText(item.area)) warnings.push("oportunidades: 'area' nao informada — sera inferida do texto.");
      if (!hasText(item.contato)) warnings.push("oportunidades: 'contato' nao informado — usara 'Ver link oficial'.");
      break;
    case "moradia":
      if (!hasText(item.regiao) && !hasText(item.location)) errors.push("moradia: 'regiao' obrigatoria.");
      if (normalizeText(item.type) === "oferecendo" && item.price == null) {
        warnings.push("moradia (oferecendo): 'price' (valor mensal) recomendado.");
      }
      break;
    case "compra-venda":
      if (normalizeText(item.type) === "vendo" && item.price == null) {
        warnings.push("compra-venda (vendo): 'price' recomendado.");
      }
      break;
    case "caronas":
      if (!hasText(item.origem)) errors.push("caronas: 'origem' obrigatoria.");
      if (!hasText(item.destino)) errors.push("caronas: 'destino' obrigatorio.");
      break;
    case "achados-perdidos":
      if (!hasText(item.location)) errors.push("achados-perdidos: 'location' obrigatorio.");
      if (normalizeText(item.type) === "encontrados" && !hasText(item.entrega)) {
        warnings.push("achados-perdidos (encontrados): 'entrega' recomendada.");
      }
      break;
  }

  // marca para uso a jusante (mapper) sem revalidar
  if (module === "oportunidades") void type;

  return { ok: errors.length === 0, errors, warnings };
}
