// Regenerate kino-posts-cache.json from current Supabase state.
// Run: node scripts/regenerate-posts-cache.js
// Cron suggestion: daily at 06:00 UTC after curator runs.
//
// Fixes the bug where pipeline-kino.js used a STALE 12-day-old cache that
// caused items to be wrongly classified as duplicates. 2026-07-08.
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = process.env.KINOCAMPUS_SUPABASE_URL || 'https://wacyrkwhkvzwkqpolrbg.supabase.co';
const ANON_KEY = process.env.KINOCAMPUS_SUPABASE_ANON_KEY || process.env.CADU_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const CACHE_PATH = process.env.KINO_CACHE_PATH
  || path.join(process.env.HOME || '/data/.openclaw/workspace', 'kino-posts-cache.json')
  || '/data/.openclaw/workspace/kino-posts-cache.json';

if (!ANON_KEY) {
  console.error('ERROR: KINOCAMPUS_SUPABASE_ANON_KEY (or CADU_SUPABASE_ANON_KEY) not set');
  process.exit(1);
}

function fetchAllPublished() {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/posts?select=id,title,status,created_at,metadata&status=eq.published&order=created_at.desc&limit=1000`;
    const req = https.get(url, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Accept: 'application/json'
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

(async () => {
  console.log(`Fetching from ${SUPABASE_URL}...`);
  const posts = await fetchAllPublished();
  console.log(`Fetched ${posts.length} published posts`);

  const cache = {
    updated: new Date().toISOString(),
    total: posts.length,
    byStatus: { published: posts.length },
    posts: posts.map((p) => {
      const meta = p.metadata || {};
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        created_at: p.created_at,
        metadata: meta,
        metadata_link: meta.link || '',
        metadata_source_url: meta.source_url || '',
      };
    }),
  };

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 0));
  console.log(`Cache written to ${CACHE_PATH} (${cache.posts.length} entries)`);
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});