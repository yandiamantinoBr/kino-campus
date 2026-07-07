#!/usr/bin/env node
/**
 * tests/test-email-signup.js — Testa SMTP delivery real via Supabase Auth
 *
 * Faz signup real com email descartável e verifica se:
 *  - Auth retorna OK
 *  - Email é "enviado" (não bounced)
 *  - Captura erro se houver
 *
 * Requer: SUPABASE_ANON_KEY e supabase project_url
 */

const https = require('https');

const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';
const ANON_KEY = process.env.KINOCAMPUS_SUPABASE_ANON_KEY;

if (!ANON_KEY) {
  console.error('Missing KINOCAMPUS_SUPABASE_ANON_KEY env var');
  process.exit(1);
}

const TEST_EMAIL = process.argv[2] || `test-${Date.now()}@mailinator.com`;
const TEST_PASSWORD = 'TestPass123!@#';

console.log(`Testing signup with ${TEST_EMAIL}...`);

const data = JSON.stringify({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});

const req = https.request(
  {
    hostname: 'wacyrkwhkvzwkqpolrbg.supabase.co',
    port: 443,
    path: '/auth/v1/signup',
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
    timeout: 15000,
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      try {
        const json = JSON.parse(body);
        if (json.error) {
          console.log('ERROR:', json.error.message || json.error);
        } else {
          console.log('User created:', json.user?.email || '?');
          console.log('Confirmation sent at:', json.user?.confirmation_sent_at || '(not sent)');
          console.log('Email confirmed at:', json.user?.email_confirmed_at || '(not confirmed)');
        }
      } catch (e) {
        console.log('Body:', body.slice(0, 500));
      }
    });
  },
);
req.on('error', (e) => console.log('Req error:', e.message));
req.write(data);
req.end();