#!/usr/bin/env node
/**
 * Grant profiles.is_admin only after resolving one confirmed Auth identity.
 * Accepts both legacy service-role JWTs and current sb_secret_* keys through
 * the official Supabase client; secrets are never assembled as Bearer JWTs.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.KC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.KINOCAMPUS_SUPABASE_KEY || '';
const target = String(process.argv[2] || '').trim();
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou KINOCAMPUS_SUPABASE_KEY) no env');
  process.exitCode = 1;
} else if (!target) {
  console.error('Uso: node scripts/grant-admin.js <email_ou_user_id>');
  process.exitCode = 1;
} else {
  run().catch(error => {
    console.error('ERRO:', error.message);
    process.exitCode = 2;
  });
}

async function resolveAuthUser(supabase) {
  if (isUuid) {
    const { data, error } = await supabase.auth.admin.getUserById(target);
    if (error) throw error;
    if (!data || !data.user) throw new Error(`Auth user ${target} não encontrado`);
    return data.user;
  }

  const matches = [];
  const normalizedTarget = target.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = Array.isArray(data && data.users) ? data.users : [];
    users.forEach(user => {
      if (String(user && user.email || '').trim().toLowerCase() === normalizedTarget) matches.push(user);
    });
    if (users.length < perPage || (data.lastPage && page >= data.lastPage)) break;
  }
  if (matches.length !== 1) {
    throw new Error(`esperado exatamente 1 Auth user para "${target}"; encontrados=${matches.length}`);
  }
  return matches[0];
}

async function run() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const user = await resolveAuthUser(supabase);
  if (!user.email_confirmed_at && !user.confirmed_at) {
    throw new Error(`Auth user ${user.id} não possui e-mail confirmado`);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,display_name,is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error(`profile do Auth user ${user.id} não encontrada`);

  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ is_admin: true })
    .eq('id', user.id)
    .select('id,email,display_name,is_admin')
    .single();
  if (updateError) throw updateError;
  if (!updated || updated.is_admin !== true) throw new Error('reconciliação de profile não confirmou is_admin=true');

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc('kc_is_admin', {
    p_user_id: user.id,
  });
  if (adminCheckError) throw adminCheckError;
  if (isAdmin !== true) throw new Error('kc_is_admin não confirmou o privilégio após a atualização');

  console.log(`✅ administrador confirmado: ${updated.display_name || '(sem nome)'} (${updated.email || user.email}) id=${user.id}`);
}
