#!/usr/bin/env node
// tests/test-email-signup.js - FIXED to handle root-level fields

const https = require('https');
const ANON = process.env.KINOCAMPUS_SUPABASE_ANON_KEY;
if (!ANON) {
  console.error('ERROR: KINOCAMPUS_SUPABASE_ANON_KEY env var required');
  process.exit(1);
}

const email = process.argv[2] || `delivery-${Date.now()}@gmail.com`;
const password = 'TestPass123!@#';

const data = JSON.stringify({ email, password });
const req = https.request(
  {
    hostname: 'wacyrkwhkvzwkqpolrbg.supabase.co',
    port: 443,
    path: '/auth/v1/signup',
    method: 'POST',
    headers: {
      'apikey': ANON,
      'Authorization': `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
    timeout: 30000,
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        console.log('Testing signup with', email);
        console.log('Status:', res.statusCode);

        // Supabase can return fields at root OR under "user" depending on context
        const u = json.user || json;
        console.log('User ID:', u.id || '(none)');
        console.log('Confirmation sent at:', u.confirmation_sent_at || '(not sent)');
        console.log('Email confirmed at:', u.email_confirmed_at || '(not confirmed)');

        if (json.error) {
          console.log('Error:', JSON.stringify(json.error));
          process.exit(1);
        }
        if (!u.confirmation_sent_at) {
          console.log('\nWARNING: confirmation_sent_at is null — email NOT sent');
          process.exit(2);
        }
        console.log('\n✓ Email confirmation sent successfully!');
      } catch (e) {
        console.log('Parse error:', e.message);
        console.log('Body:', body.slice(0, 500));
        process.exit(1);
      }
    });
  },
);
req.on('error', (e) => {
  console.log('Request error:', e.message);
  process.exit(1);
});
req.end(data);