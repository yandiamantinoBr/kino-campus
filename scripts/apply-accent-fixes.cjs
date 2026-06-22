// scripts/apply-accent-fixes.cjs
const https = require('https');
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT = 'wacyrkwhkvzwkqpolrbg';

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: '/v1/projects/' + PROJECT + '/database/query',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body, 'utf8')
      },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        else { try { resolve(JSON.parse(data)); } catch (e) { resolve(data); } }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body, 'utf8');
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const fixes = [
  { from: 'Sade', to: 'Saúde' },
  { from: 'Acadmica', to: 'Acadêmica' },
  { from: 'Gesto', to: 'Gestão' },
  { from: 'Lnguas', to: 'Línguas' },
  { from: 'Comunicao', to: 'Comunicação' },
  // Casos antigos com encoding quebrado que apareceram antes do meu UPDATE original
  { from: 'ElActrica e de ComputaA�A�o', to: 'Engenharia Elétrica e de Computação' },  // só corrige sufixo
];

(async () => {
  let total = 0;
  for (const f of fixes) {
    const hex = Buffer.from(f.to, 'utf8').toString('hex');
    const sql = "UPDATE posts SET metadata = metadata || jsonb_build_object(" +
      "'subcategoria', convert_from(decode('" + hex + "', 'hex'), 'UTF8'), " +
      "'subcategoriaKey', lower(unaccent(convert_from(decode('" + hex + "', 'hex'), 'UTF8'))), " +
      "'subcategoryLabel', convert_from(decode('" + hex + "', 'hex'), 'UTF8')) " +
      "WHERE metadata->>'subcategoria' = '" + f.from.replace(/'/g, "''") + "' " +
      "RETURNING id;";
    try {
      const r = await runQuery(sql);
      const n = Array.isArray(r) ? r.length : 0;
      console.log('[' + (n > 0 ? 'OK' : 'SKIP') + '] ' + f.from + ' -> ' + f.to + ': ' + n + ' posts');
      total += n;
    } catch (e) {
      console.log('[ERR] ' + f.from + ': ' + e.message.slice(0, 200));
    }
    await sleep(400);
  }

  // Verificação final
  console.log('\n=== Subcategorias únicas atuais ===');
  const verify = await runQuery(
    "SELECT metadata->>'subcategoria' AS subcat, count(*) AS qtd " +
    "FROM posts WHERE status = 'published' AND metadata->>'subcategoria' IS NOT NULL " +
    "AND metadata->>'subcategoria' != '' GROUP BY 1 ORDER BY qtd DESC;"
  );
  console.log(JSON.stringify(verify, null, 2));
  console.log('\nTotal corrigidos: ' + total);
})().catch(e => console.error('FATAL:', e.message));