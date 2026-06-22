// scripts/add-all-links.cjs
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

const updates = [
  { id: 'a584e695-fac2-4481-be12-768882a1076b', link: 'https://proex.ufg.br/p/61616-edital-proex-n-15-2026-selecao-de-propostas-de-trabalho-da-ufg-para-a-operacao-carnauba-do-projeto-rondon', label: 'Rondon PROEX (já aplicado)' },
  { id: 'adfa4f98-6bdb-4b79-a016-33af0b4435f6', link: 'https://idiomassemfronteiras.sri.ufg.br/', label: 'IsF-UFG idiomas' },
  { id: '94fd05d7-cb35-4c05-8ef3-29a2e7097e96', link: 'https://sri.ufg.br/n/201395-edital-sri-n-06-2026-mobilidade-marca-agronomia', label: 'MARCA agronomia' },
  { id: '5c239822-5c46-4002-a40d-ee65573f0995', link: 'https://ppgeec.emc.ufg.br/', label: 'PPGEEC/EMC' },
  { id: '5817f691-d1a0-486d-82f4-ffff19500be9', link: 'https://ecoevol.ufg.br/', label: 'PPGEcoevol' },
  { id: 'edd64571-bd7e-4f86-b4b0-4231e2cc2c66', link: 'https://ppgeas.eeca.ufg.br/p/61363-processo-seletivo-aluno-regular-edital-n-002-2026', label: 'PPGEAS' },
  { id: '2c436cec-609f-4896-a648-b14e212c2eb7', link: 'https://ufg.br/n/200953-ppg-em-geotecnia-estruturas-e-construcao-civil-inscreve-candidatos-a-mestrado-e-doutorado', label: 'PPGGECON' },
  { id: 'b0a80050-9d70-44ba-b596-01cf77be4664', link: 'https://emc.ufg.br/n/200409-convite-do-grupo-de-trabalho-mulheres-nas-engenharias-gtme-emc-ufg', label: 'GTME EMC UFG' },
];

(async () => {
  for (const u of updates) {
    const sql = "UPDATE posts SET metadata = metadata || jsonb_build_object('link', '" +
      u.link.replace(/'/g, "''") + "') WHERE id = '" + u.id + "' RETURNING id, metadata->>'link' AS new_link;";
    try {
      const r = await runQuery(sql);
      const n = Array.isArray(r) ? r.length : 0;
      console.log(`[${n > 0 ? 'OK' : 'SKIP'}] ${u.label} (${u.id.slice(0,8)}): ${n} row`);
    } catch (e) {
      console.log(`[ERR] ${u.label}: ${e.message.slice(0, 200)}`);
    }
    await sleep(400);
  }

  // Verificação final
  console.log('\n=== Posts sem link restantes ===');
  const verify = await runQuery(
    "SELECT count(*) AS sem_link FROM posts WHERE status = 'published' " +
    "AND (metadata->>'link' IS NULL OR metadata->>'link' = '');"
  );
  console.log(JSON.stringify(verify));
})().catch(e => console.error('FATAL:', e.message));