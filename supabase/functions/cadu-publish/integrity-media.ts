type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MEDIA_ROW_KEYS = ["id", "post_id", "url", "is_cover", "sort_order", "created_at"];
function plain(value: unknown): value is Row { return !!value && typeof value === "object" && !Array.isArray(value); }
export function mediaRows(value: unknown, postId: unknown): Row[] {
  if (!Array.isArray(value) || value.length > 24) throw new Error("Snapshot de midia invalido ou muito grande.");
  const ids = new Set(); const urls = new Set();
  for (const row of value) {
    if (!plain(row) || Object.keys(row).sort().join() !== [...MEDIA_ROW_KEYS].sort().join() ||
      !UUID.test(String(row.id)) || row.post_id !== postId || typeof row.url !== "string" || row.url.length > 4096 ||
      typeof row.is_cover !== "boolean" || !Number.isSafeInteger(row.sort_order) || Number(row.sort_order) < 0 ||
      Number(row.sort_order) > 100 || typeof row.created_at !== "string" || row.created_at.length > 40 || !Number.isFinite(Date.parse(row.created_at)) ||
      ids.has(row.id) || urls.has(row.url)) throw new Error("Cada midia deve corresponder a uma linha completa, unica e do proprio post.");
    const url = new URL(row.url);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("URL de midia invalida.");
    ids.add(row.id); urls.add(row.url);
  }
  return value.map((row) => ({ ...row })).sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || String(a.id).localeCompare(String(b.id)));
}
export function prepareMediaSelection(value: unknown, postId: unknown): { before: Row[]; after: Row[] } {
  if (!plain(value) || Object.keys(value).sort().join() !== ["expectedRows", "keepIds", "coverId"].sort().join() ||
    !Array.isArray(value.keepIds) || !value.keepIds.length || value.keepIds.length > 12 ||
    new Set(value.keepIds).size !== value.keepIds.length || value.coverId !== value.keepIds[0]) {
    throw new Error("Selecione IDs existentes e a capa como primeiro ID; nao envie URLs novas.");
  }
  const before = mediaRows(value.expectedRows, postId);
  const after = value.keepIds.map((id, index) => {
    const row = before.find((entry) => entry.id === id);
    if (!row) throw new Error("Midia selecionada nao pertence ao snapshot.");
    return { ...row, is_cover: index === 0, sort_order: index };
  });
  return { before, after };
}
