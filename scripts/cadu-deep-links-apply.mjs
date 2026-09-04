#!/usr/bin/env node
// Aplica updates do backfill de deep-links ao Supabase via Management API.
// Cada update vira um UPDATE idempotente (guard NOT (metadata ? 'deep_link_hydration')).
import fs from 'node:fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const REF = process.env.PROJECT_REF || 'wacyrkwhkvzwkqpolrbg';
const UPDATES_PATH = process.env.UPDATES_PATH || 'data/cadu-deep-links-updates/latest.json';
if (!TOKEN || !TOKEN.startsWith('sbp_')) {
  console.error('SUPABASE_ACCESS_TOKEN ausente/inválido (prefixo esperado sbp_)');
  process.exit(1);
}

const updates = JSON.parse(fs.readFileSync(UPDATES_PATH, 'utf8'));
if (!Array.isArray(updates)) { console.error('updates não é array'); process.exit(1); }
console.log(`aplicando ${updates.length} update(s)…`);

const q = (s) => typeof s === 'string' ? s : null;
async function runQuery(sql) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${process.env.PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

const dollar = (value) => {
  if (value === null || value === undefined) return 'NULL';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s.includes('$dl$')) throw new Error('conteúdo colide com dollar-quote');
  return '$dl$' + s + '$dl$::jsonb';
};

let applied = 0;
let skipped = 0;
for (const update of updates) {
  const sets = ['metadata = ' + dollar(update.metadata)];
  if (typeof update.description === 'string') sets.push('description = $dl$' + update.description + '$dl$');
  if (typeof update.image_url === 'string' && update.image_url) sets.push('image_url = $dl$' + update.image_url + '$dl$');
  const sql = `UPDATE posts SET ${sets.join(', ')} WHERE id = '${update.id}' AND status = 'published' AND NOT (metadata ? 'deep_link_hydration') RETURNING id;`;
  try {
    const result = await runQuery(sql);
    if (Array.isArray(result) && result.length > 0) { applied += 1; console.log(`✅ ${update.id} aplicado`); }
    else { skipped += 1; console.log(`⏭️ ${update.id} pulado (já hidratado ou inalterado)`); }
  } catch (error) {
    console.error(`❌ ${update.id}:`, String(error.message || error).slice(0, 200));
  }
}
console.log(`RESUMO: ${applied} aplicados, ${skipped} pulados, ${updates.length} total`);
if (applied === 0 && updates.length > 0) process.exitCode = 1;

