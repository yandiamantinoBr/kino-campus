#!/usr/bin/env node
/**
 * tests/test-email-deliverability.js
 *
 * Valida que o sistema de e-mail do KinoCampus tem condições mínimas
 * para entregar e-mails no inbox (não spam) dos principais provedores.
 *
 * Checagens:
 *  1. DNS — kinocampus.com.br tem SPF, DKIM, DMARC records
 *  2. Supabase Auth — SMTP configurado e consistente
 *  3. Signup real — usuário é criado, confirmation_sent_at é setado
 *
 * Saída:
 *  - 0 problemas: OK
 *  - 1+ problema crítico: exit 1 com lista de problemas
 *
 * Requer:
 *  - Node 20+
 *  - KINOCAMPUS_SUPABASE_ANON_KEY env var (pra testes Auth)
 *  - SUPABASE_ACCESS_TOKEN env var (pra Management API)
 */

'use strict';

const https = require('https');

const SUPABASE_PROJECT = 'wacyrkwhkvzwkqpolrbg';
const DOMAIN = 'kinocampus.com.br';
const DKIM_SELECTOR = 'default';

const errors = [];
const warnings = [];

function recordDns(label, hostname, type, expected) {
  // Try Google DoH first (8.8.8.8), fall back to Cloudflare (1.1.1.1) if cache stale
  return new Promise((resolve) => {
    const resolvers = [
      { url: `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`, name: 'Google' },
      { url: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, name: 'Cloudflare', headers: { 'Accept': 'application/dns-json' } },
    ];

    function tryResolver(idx) {
      if (idx >= resolvers.length) {
        errors.push(`[${label}] NO ${type} record found for ${hostname} (all resolvers returned NXDOMAIN)`);
        return resolve(false);
      }
      const resolver = resolvers[idx];
      const req = https.get(resolver.url, { timeout: 10_000, headers: resolver.headers || {} }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.Status !== 0) {
              // Try next resolver (cache may be stale)
              return tryResolver(idx + 1);
            }
            const records = (data.Answer || []).map((a) => a.data);
            if (records.length === 0) {
              return tryResolver(idx + 1);
            }
            if (expected && !records.some((r) => r.includes(expected))) {
              warnings.push(`[${label}] ${type} record(s) for ${hostname} exist but missing expected substring "${expected}". Found: ${records.join(', ')}`);
              return resolve(false);
            }
            const recordStr = records[0].slice(0, 80) + (records[0].length > 80 ? '...' : '');
            console.log(`  ✓ ${label}: ${hostname} ${type} = ${recordStr} (via ${resolver.name})`);
            resolve(true);
          } catch (e) {
            errors.push(`[${label}] DNS parse error: ${e.message}`);
            resolve(false);
          }
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error('DNS query timeout'));
        tryResolver(idx + 1);
      });
      req.on('error', (e) => {
        errors.push(`[${label}] DNS error for ${hostname} (${resolver.name}): ${e.message}`);
        tryResolver(idx + 1);
      });
    }
    tryResolver(0);
  });
}

async function checkDns() {
  console.log('\n=== 1. DNS Deliverability (Google DNS-over-HTTPS) ===\n');
  await recordDns('SPF', DOMAIN, 'TXT', 'v=spf1');
  await recordDns('DMARC', `_dmarc.${DOMAIN}`, 'TXT', 'v=DMARC1');
  const dkimOk = await recordDns('DKIM', `${DKIM_SELECTOR}._domainkey.${DOMAIN}`, 'TXT', 'v=DKIM');
  if (!dkimOk) {
    errors.push('[DKIM] *** CRITICAL: DKIM missing — Yahoo/Outlook/Gmail will reject or spam ***');
  }
  await recordDns('MX', DOMAIN, 'MX');
}

async function checkSupabaseAuth() {
  console.log('\n=== 2. Supabase Auth Config ===\n');
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    warnings.push('[Supabase Auth] SUPABASE_ACCESS_TOKEN not set, skipping (run with env var to enable check)');
    return;
  }

  const url = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT}/config/auth`;
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            errors.push(`[Supabase Auth] management API returned ${res.statusCode}`);
            return resolve();
          }
          try {
            const cfg = JSON.parse(body);
            const required = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_sender_name', 'smtp_admin_email'];
            for (const k of required) {
              if (!cfg[k]) {
                errors.push(`[Supabase Auth] ${k} not configured`);
              } else if (k.includes('pass') && cfg[k].length < 10) {
                errors.push(`[Supabase Auth] ${k} seems too short (${cfg[k].length} chars)`);
              } else {
                const display = k.includes('pass') ? `${cfg[k].length} chars` : cfg[k];
                console.log(`  ✓ ${k}: ${display}`);
              }
            }
            if (cfg.smtp_max_frequency < 30) {
              warnings.push(`[Supabase Auth] smtp_max_frequency=${cfg.smtp_max_frequency} may be too low`);
            }
            if (!cfg.mailer_autoconfirm && !cfg.external_email_enabled) {
              errors.push('[Supabase Auth] mailer_autoconfirm=false AND external_email_enabled=false — no emails will be sent');
            } else {
              console.log(`  ✓ mailer_autoconfirm=${cfg.mailer_autoconfirm}, external_email_enabled=${cfg.external_email_enabled}`);
            }
            const subjConfirm = cfg.mailer_subjects_confirmation || '';
            const subjInvite = cfg.mailer_subjects_invite || '';
            if (!subjConfirm.includes('KinoCampus') && !subjConfirm.toLowerCase().includes('confirme')) {
              warnings.push(`[Supabase Auth] mailer_subjects_confirmation unexpected: "${subjConfirm}"`);
            }
            if (!subjInvite.includes('KinoCampus') && !subjInvite.toLowerCase().includes('aprovad')) {
              warnings.push(`[Supabase Auth] mailer_subjects_invite unexpected: "${subjInvite}"`);
            }
            console.log(`  ✓ subject_confirmation: "${subjConfirm}"`);
            console.log(`  ✓ subject_invite: "${subjInvite}"`);
          } catch (e) {
            errors.push(`[Supabase Auth] parse error: ${e.message}`);
          }
          resolve();
        });
      },
    );
    req.on('error', (e) => {
      errors.push(`[Supabase Auth] request error: ${e.message}`);
      resolve();
    });
    req.end();
  });
}

async function checkSignup() {
  console.log('\n=== 3. Real Signup Test (creates user, checks confirmation_sent_at) ===\n');
  const anon = process.env.KINOCAMPUS_SUPABASE_ANON_KEY;
  if (!anon) {
    warnings.push('[Signup] KINOCAMPUS_SUPABASE_ANON_KEY not set, skipping');
    return;
  }

  const testEmail = `delivery-test-${Date.now()}@kinocampus-test.com`;
  console.log(`  Attempting signup with ${testEmail}...`);

  return new Promise((resolve) => {
    const data = JSON.stringify({ email: testEmail, password: 'TestPass123!@#' });
    const req = https.request(
      {
        hostname: `${SUPABASE_PROJECT}.supabase.co`,
        port: 443,
        path: '/auth/v1/signup',
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 15_000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            errors.push(`[Signup] auth returned ${res.statusCode}: ${body.slice(0, 200)}`);
            return resolve();
          }
          try {
            const json = JSON.parse(body);
            if (json.error) {
              errors.push(`[Signup] auth error: ${json.error.message || json.error.error_description}`);
              return resolve();
            }
            const sent_at = json.user?.confirmation_sent_at;
            const confirmed_at = json.user?.email_confirmed_at;
            if (!sent_at) {
              errors.push(`[Signup] *** CRITICAL: confirmation_sent_at is null — Supabase Auth is NOT sending emails ***`);
              errors.push(`[Signup] User ID was created: ${json.user?.id || '?'}`);
            } else {
              console.log(`  ✓ confirmation_sent_at: ${sent_at}`);
            }
            if (confirmed_at) {
              warnings.push(`[Signup] email_confirmed_at set — autoconfirm may be on, or test email was already verified`);
            }
            console.log(`  ℹ user.id: ${json.user?.id}`);
            console.log(`  ℹ user.email_confirmed_at: ${confirmed_at || '(null)'}`);
          } catch (e) {
            errors.push(`[Signup] parse error: ${e.message}`);
          }
          resolve();
        });
      },
    );
    req.on('error', (e) => {
      errors.push(`[Signup] request error: ${e.message}`);
      resolve();
    });
    req.end();
  });
}

async function main() {
  console.log(`KinoCampus Email Deliverability Test`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Supabase project: ${SUPABASE_PROJECT}`);

  await checkDns();
  await checkSupabaseAuth();
  await checkSignup();

  console.log('\n=== Summary ===\n');
  if (errors.length === 0) {
    console.log('✓ No critical errors found. Email should be deliverable.');
  } else {
    console.log(`✗ ${errors.length} critical error(s):`);
    for (const e of errors) console.log(`  - ${e}`);
  }
  if (warnings.length > 0) {
    console.log(`\n⚠ ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }

  process.exit(errors.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(2);
});