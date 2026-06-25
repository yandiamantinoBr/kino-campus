#!/usr/bin/env node
/**
 * scripts/grant-admin.js — concede is_admin=true numa profile via Service Role key.
 *
 * Uso:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/grant-admin.js <email_ou_user_id>
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY no env (use a sb_secret_... nova se a legacy JWT não funcionar).
 *
 * Exemplo:
 *   node scripts/grant-admin.js yan1nakamura+cadu.kinocampus@gmail.com
 *   node scripts/grant-admin.js bf3a4310-927f-4200-9df7-7478392d6a6e
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.KC_SUPABASE_URL || '').replace(/\/$/, '');
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.KINOCAMPUS_SUPABASE_KEY || '';

if (!SUPABASE_URL || !SVC) {
  console.error('ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou KINOCAMPUS_SUPABASE_KEY) no env');
  process.exit(1);
}

const target = process.argv[2];
if (!target) {
  console.error('Uso: node scripts/grant-admin.js <email_ou_user_id>');
  process.exit(1);
}

const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target);

(async () => {
  try {
    // 1. Resolve user_id (busca em profiles)
    let userId = target;
    if (!isUuid) {
      const r1 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(target)}&select=id,email,display_name,is_admin`, {
        headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
      });
      if (!r1.ok) throw new Error(`profiles query failed: HTTP ${r1.status}: ${await r1.text()}`);
      const rows = await r1.json();
      if (!rows.length) {
        console.error(`ERRO: profile com email "${target}" não encontrada`);
        process.exit(1);
      }
      userId = rows[0].id;
      console.log(`Encontrado: id=${userId} display=${rows[0].display_name} admin_atual=${rows[0].is_admin}`);
    }

    // 2. PATCH is_admin=true
    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SVC,
        Authorization: `Bearer ${SVC}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_admin: true }),
    });
    if (!r2.ok) throw new Error(`PATCH failed: HTTP ${r2.status}: ${await r2.text()}`);

    // 3. Verifica
    const r3 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,email,display_name,is_admin`, {
      headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
    });
    const final = (await r3.json())[0];
    console.log(`✅ is_admin=true aplicado: ${final.display_name} (${final.email})`);

  } catch (e) {
    console.error('ERRO:', e.message);
    process.exit(2);
  }
})();