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

interface CategoryDefinition {
  key: string;
  label: string;
  aliases?: readonly string[];
}

interface SecondaryDefinition {
  key: string;
  label: string;
  aliases?: readonly string[];
}

// Espelha exatamente os grupos obrigatorios de
// assets/js/features/create-post/kc-create-post.schema.js. Aliases sao
// deliberadamente explicitos: valores desconhecidos nunca escolhem uma
// categoria padrao nem atravessam para outro modulo.
export const CATEGORY_DEFINITIONS = {
  eventos: [
    { key: "academicos", label: "Acad\u00eamicos", aliases: ["academico", "academica", "academicas"] },
    { key: "palestras", label: "Palestras", aliases: ["palestra"] },
    { key: "congressos", label: "Congressos", aliases: ["congresso"] },
    { key: "cursos", label: "Cursos", aliases: ["curso"] },
    { key: "culturais", label: "Culturais", aliases: ["cultural"] },
    { key: "esportivos", label: "Esportivos", aliases: ["esportivo"] },
    { key: "workshops", label: "Workshops", aliases: ["workshop"] },
    { key: "festas", label: "Festas", aliases: ["festa"] },
    { key: "sustentabilidade", label: "Sustentabilidade" },
  ],
  oportunidades: [
    { key: "editais", label: "Editais", aliases: ["edital"] },
    { key: "concursos", label: "Concursos", aliases: ["concurso"] },
    { key: "bolsas", label: "Bolsas", aliases: ["bolsa"] },
    { key: "estagios", label: "Est\u00e1gio", aliases: ["estagio"] },
    { key: "empregos", label: "Emprego", aliases: ["emprego"] },
    { key: "monitoria", label: "Monitoria", aliases: ["monitorias"] },
    { key: "pesquisa", label: "Pesquisa" },
    {
      key: "cursos-capacitacoes",
      label: "Cursos e capacita\u00e7\u00f5es",
      aliases: [
        "curso-capacitacao",
        "curso-capacitacoes",
        "cursos-capacitacao",
        "curso e capacitacao",
        "cursos e capacitacoes",
      ],
    },
    { key: "voluntariado", label: "Voluntariado", aliases: ["voluntariados"] },
    { key: "freelancer", label: "Freelancer", aliases: ["freelancers"] },
  ],
  moradia: [
    { key: "republicas", label: "Rep\u00fablicas", aliases: ["republica"] },
    { key: "quartos", label: "Quartos", aliases: ["quarto"] },
    { key: "apartamentos", label: "Apartamentos", aliases: ["apartamento"] },
    { key: "casas", label: "Casas", aliases: ["casa"] },
    { key: "procurando", label: "Procurando", aliases: ["procuro", "procurando-moradia"] },
  ],
  "compra-venda": [
    { key: "eletronicos", label: "Eletr\u00f4nicos", aliases: ["eletronico"] },
    { key: "livros", label: "Livros", aliases: ["livro"] },
    { key: "ingressos", label: "Ingressos", aliases: ["ingresso"] },
    { key: "moveis", label: "M\u00f3veis", aliases: ["movel"] },
    { key: "vestuario", label: "Vestu\u00e1rio" },
    { key: "outros", label: "Outros", aliases: ["outro"] },
  ],
  caronas: [
    { key: "ofereco", label: "Ofere\u00e7o carona", aliases: ["ofereco-carona"] },
    { key: "procuro", label: "Procuro carona", aliases: ["procuro-carona"] },
  ],
  "achados-perdidos": [
    { key: "perdidos", label: "Perdidos", aliases: ["perdido"] },
    {
      key: "encontrados",
      label: "Encontrados",
      aliases: ["encontrado", "achado", "achados"],
    },
  ],
} as const satisfies Record<ModuleKey, readonly CategoryDefinition[]>;

export const CATEGORIES_BY_MODULE: Readonly<Record<ModuleKey, readonly string[]>> =
  Object.freeze(Object.fromEntries(
    MODULE_KEYS.map((module) => [
      module,
      Object.freeze(CATEGORY_DEFINITIONS[module].map(({ key }) => key)),
    ]),
  ) as Record<ModuleKey, readonly string[]>);

export const CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    MODULE_KEYS.flatMap((module) =>
      CATEGORY_DEFINITIONS[module].map(({ key, label }) => [key, label])
    ),
  ),
);

const CATEGORY_ALIASES_BY_MODULE: Readonly<Record<ModuleKey, Readonly<Record<string, string>>>> =
  Object.freeze(Object.fromEntries(
    MODULE_KEYS.map((module) => [
      module,
      Object.freeze(Object.fromEntries(
        (CATEGORY_DEFINITIONS[module] as readonly CategoryDefinition[]).flatMap(({ key, label, aliases }) =>
          [key, label, ...(aliases || [])].map((alias) => [slugify(alias), key])
        ),
      )),
    ]),
  ) as Record<ModuleKey, Readonly<Record<string, string>>>);

export function normalizeCategoryForModule(moduleKey: unknown, categoryKey: unknown): string {
  if (!isValidModule(moduleKey)) return "";
  if (typeof categoryKey !== "string") return "";
  const alias = slugify(categoryKey);
  return alias ? CATEGORY_ALIASES_BY_MODULE[moduleKey][alias] || "" : "";
}

export function isValidCategoryForModule(moduleKey: unknown, categoryKey: unknown): boolean {
  return !!normalizeCategoryForModule(moduleKey, categoryKey);
}

export function categoriesForModule(moduleKey: unknown): readonly string[] {
  return isValidModule(moduleKey) ? CATEGORIES_BY_MODULE[moduleKey] : [];
}

export function categoryLabel(categoryKey: unknown): string {
  if (typeof categoryKey !== "string") return "";
  return CATEGORY_LABELS[slugify(categoryKey)] || "";
}

// Grupos secundarios obrigatorios do modal. Eles nao sao categorias: compra e
// venda usa a acao (vendo/compro), enquanto achados e perdidos usa o tipo do
// item. O escopo por modulo evita aceitar uma chave valida no grupo errado.
export const SECONDARY_DEFINITIONS = {
  "compra-venda": [
    { key: "vendo", label: "Vendo" },
    { key: "compro", label: "Compro" },
  ],
  "achados-perdidos": [
    { key: "documentos", label: "Documentos", aliases: ["documento"] },
    { key: "eletronicos", label: "Eletr\u00f4nicos", aliases: ["eletronico"] },
    { key: "outros", label: "Outros", aliases: ["outro"] },
  ],
} as const satisfies Partial<Record<ModuleKey, readonly SecondaryDefinition[]>>;

export type SecondaryModuleKey = keyof typeof SECONDARY_DEFINITIONS;

function isSecondaryModule(moduleKey: unknown): moduleKey is SecondaryModuleKey {
  return moduleKey === "compra-venda" || moduleKey === "achados-perdidos";
}

const SECONDARY_ALIASES_BY_MODULE: Readonly<
  Record<SecondaryModuleKey, Readonly<Record<string, string>>>
> = Object.freeze(Object.fromEntries(
  (Object.keys(SECONDARY_DEFINITIONS) as SecondaryModuleKey[]).map((module) => [
    module,
    Object.freeze(Object.fromEntries(
      (SECONDARY_DEFINITIONS[module] as readonly SecondaryDefinition[]).flatMap(
        ({ key, label, aliases }) =>
          [key, label, ...(aliases || [])].map((alias) => [slugify(alias), key]),
      ),
    )),
  ]),
) as Record<SecondaryModuleKey, Readonly<Record<string, string>>>);

export function secondaryValuesForModule(moduleKey: unknown): readonly string[] {
  return isSecondaryModule(moduleKey)
    ? SECONDARY_DEFINITIONS[moduleKey].map(({ key }) => key)
    : [];
}

export function normalizeSecondaryForModule(moduleKey: unknown, value: unknown): string {
  if (!isSecondaryModule(moduleKey) || typeof value !== "string") return "";
  const alias = slugify(value);
  return alias ? SECONDARY_ALIASES_BY_MODULE[moduleKey][alias] || "" : "";
}

export function secondaryLabelForModule(moduleKey: unknown, value: unknown): string {
  if (!isSecondaryModule(moduleKey)) return "";
  const key = normalizeSecondaryForModule(moduleKey, value);
  return key
    ? SECONDARY_DEFINITIONS[moduleKey].find((definition) => definition.key === key)?.label || ""
    : "";
}

// Todo alias secundario explicitamente enviado participa do contrato. Aceitamos
// aliases equivalentes, mas nunca escolhemos silenciosamente entre chaves
// conflitantes nem ignoramos um valor invalido porque outro alias e valido.
// actionKey so participa em compra-venda; nos demais modulos continua reservado
// ao CTA.
export function secondaryInputForItem(item: CaduItem): unknown {
  const module = item.module;
  if (!isSecondaryModule(module)) return "";

  const aliases = module === "compra-venda"
    ? ["acao", "action", "subcategoriaKey", "subcategoria", "type", "actionKey"] as const
    : ["subcategoriaKey", "subcategoryKey", "subcategoria", "subcategory", "type"] as const;
  const provided = aliases.filter((alias) =>
    Object.prototype.hasOwnProperty.call(item, alias)
  );
  if (!provided.length) return "";

  const keys = new Set<string>();
  for (const alias of provided) {
    const raw = item[alias];
    const key = normalizeSecondaryForModule(module, raw);
    if (typeof raw !== "string" || !raw.trim() || !key) {
      throw new TypeError(
        `grupo secundario invalido para module "${module}" em item.${alias}.`,
      );
    }
    keys.add(key);
  }
  if (keys.size > 1) {
    throw new TypeError(
      `grupo secundario conflitante para module "${module}" nos aliases do item.`,
    );
  }
  return keys.values().next().value || "";
}

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
  acao?: string;
  action?: string;
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
  applicationOpensAt?: string;
  applicationDeadline?: string;
  eventStartsAt?: string;
  eventEndsAt?: string;
  resultPublishedAt?: string;
  category?: string;
  subcategory?: string;
  subcategoryKey?: string;
  subcategoria?: string;
  subcategoriaKey?: string;
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
  tagKeys?: string[];
  sourceUrl?: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceRegistryId?: string;
  sourceRevision?: string;
  actionFingerprints?: string[];
  actionFingerprintContract?: string;
  actionFingerprintV2?: string[];
  relevantLinks?: Record<string, unknown>;
  actionEvidence?: Array<Record<string, unknown>>;
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

export const ACTION_FINGERPRINT_V2_CONTRACT = "cadu-opportunity-action-v2";
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface ActionFingerprintMetadata {
  fingerprints: string[];
  contract: string;
  v2Fingerprints: string[];
}

function normalizedLegacyFingerprints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((entry) => String(entry ?? "").trim().slice(0, 200))
    .filter(Boolean))].slice(0, 20);
}

function strictV2Fingerprints(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new TypeError(`${field} deve conter de 1 a 20 hashes SHA-256.`);
  }
  if (value.some((entry) => typeof entry !== "string" || !SHA256_HEX.test(entry))) {
    throw new TypeError(`${field} contem hash SHA-256 invalido.`);
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError(`${field} contem hashes duplicados.`);
  }
  return [...value];
}

// The v2 marker is authoritative only when both arrays are exact, canonical,
// and equal. This prevents an Edge invocation from laundering a legacy or
// malformed fingerprint into the stronger cross-source identity contract.
export function actionFingerprintMetadataForItem(item: CaduItem): ActionFingerprintMetadata {
  const record = item as Record<string, unknown>;
  const rawFingerprints = item.actionFingerprints ?? record.action_fingerprints;
  const rawContract = item.actionFingerprintContract ?? record.action_fingerprint_contract;
  const rawV2 = item.actionFingerprintV2 ?? record.action_fingerprint_v2;
  const contract = typeof rawContract === "string" ? rawContract.trim() : "";

  if (!contract) {
    if (rawV2 !== undefined && rawV2 !== null) {
      if (!Array.isArray(rawV2) || rawV2.length !== 0) {
        throw new TypeError("actionFingerprintV2 exige actionFingerprintContract v2.");
      }
    }
    return {
      fingerprints: normalizedLegacyFingerprints(rawFingerprints),
      contract: "",
      v2Fingerprints: [],
    };
  }
  if (contract !== ACTION_FINGERPRINT_V2_CONTRACT) {
    throw new TypeError(`actionFingerprintContract desconhecido: "${contract}".`);
  }

  const fingerprints = strictV2Fingerprints(rawFingerprints, "actionFingerprints");
  const v2Fingerprints = strictV2Fingerprints(rawV2, "actionFingerprintV2");
  const expected = [...fingerprints].sort();
  const declared = [...v2Fingerprints].sort();
  if (expected.length !== declared.length || expected.some((value, index) => value !== declared[index])) {
    throw new TypeError("actionFingerprintV2 deve coincidir exatamente com actionFingerprints.");
  }
  return { fingerprints, contract, v2Fingerprints };
}

// A source revision is evidence supplied by the collector, not a derived
// presentation hash. Preserve it only in the canonical lowercase SHA-256
// form so the pipeline can safely distinguish a real lifecycle update from a
// repeated scrape of the same source.
export function sourceRevisionForItem(item: CaduItem): string {
  const record = item as Record<string, unknown>;
  const value = item.sourceRevision ?? record.source_revision;
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    throw new TypeError("sourceRevision deve ser um hash SHA-256 em minúsculas.");
  }
  return value;
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

  try {
    actionFingerprintMetadataForItem(item);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    sourceRevisionForItem(item);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const allowedCategories = categoriesForModule(module);
  if (!hasText(item.category)) {
    errors.push(
      `${module}: 'category' obrigatoria. Use uma de: ${allowedCategories.join(", ")}.`,
    );
  } else if (!normalizeCategoryForModule(module, item.category)) {
    errors.push(
      `category invalida para module "${module}": "${String(item.category)}". ` +
        `Use uma de: ${allowedCategories.join(", ")}.`,
    );
  }

  const secondaryValues = secondaryValuesForModule(module);
  if (secondaryValues.length) {
    try {
      const secondaryInput = secondaryInputForItem(item);
      if (!hasText(secondaryInput)) {
        errors.push(
          `${module}: grupo secundario obrigatorio. Use uma de: ${secondaryValues.join(", ")}.`,
        );
      } else if (!normalizeSecondaryForModule(module, secondaryInput)) {
        errors.push(
          `grupo secundario invalido para module "${module}": "${String(secondaryInput)}". ` +
            `Use uma de: ${secondaryValues.join(", ")}.`,
        );
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
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
      if (normalizeCategoryForModule(module, item.category) === "encontrados" && !hasText(item.entrega)) {
        errors.push("achados-perdidos (encontrados): 'entrega' obrigatoria.");
      }
      break;
  }

  // marca para uso a jusante (mapper) sem revalidar
  if (module === "oportunidades") void type;

  return { ok: errors.length === 0, errors, warnings };
}
