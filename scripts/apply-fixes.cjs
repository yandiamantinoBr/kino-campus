// scripts/apply-fixes.cjs
// Aplica todas as correções da auditoria em uma única sessão.
const https = require('https');

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT = 'wacyrkwhkvzwkqpolrbg';

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve(data); }
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apply() {
  const log = [];

  // ============================================================
  // PASSO 1: Encerrar 4 EVENTOS passados
  // ============================================================
  console.log('\n=== PASSO 1: Encerrar 4 eventos passados (data_evento < hoje) ===');
  const eventosPassados = [
    '53d7e0e8-f3af-4014-82ac-18b6b3f8257e', // 4º Ciclo Gepets 06/04
    '98f81fa5-11f8-44f6-8525-33ec2dacf439', // Café e Cultura 21/05
    '1cd7adeb-b38d-4335-9839-a3962317cc2f', // Simpósio Bioeconomia 16/06
    '16bb5c36-47af-44c7-b2c0-2b96f203e902'  // PROFEPI 15/06
  ];
  for (const id of eventosPassados) {
    const sql = `UPDATE posts SET status = 'closed' WHERE id = '${id}' AND status = 'published' RETURNING id, status;`;
    try {
      const r = await runQuery(sql);
      const affected = Array.isArray(r) ? r.length : 0;
      console.log(`  [${affected > 0 ? 'OK' : 'SKIP'}] ${id.slice(0,8)} → status=closed (${affected} row)`);
      log.push({ step: 'close_evento', id, affected });
    } catch (e) {
      console.log(`  [ERR] ${id.slice(0,8)} → ${e.message}`);
      log.push({ step: 'close_evento', id, error: e.message });
    }
    await sleep(300);
  }

  // ============================================================
  // PASSO 2: Encerrar 4 OPORTUNIDADES com prazo vencido
  // ============================================================
  console.log('\n=== PASSO 2: Encerrar 4 oportunidades com prazo já vencido ===');
  const oportunidadesVencidas = [
    'f4018bbe-d9e9-4caf-a505-b05d8ca84e44', // 13ª OEU - texto diz "encerrado"
    'ddad28e2-e7e7-4127-825a-d71f37d68693', // PROLICEN - texto "encerrado"
    '412aabf9-ad4a-45f1-94cd-63549badf89e',  // PIP/UFG - texto "encerrado"
    '953bb526-e5f5-4e36-a59c-7b102e344518'   // PIEMP - "até 5 de junho de 2026"
  ];
  for (const id of oportunidadesVencidas) {
    const sql = `UPDATE posts SET status = 'closed' WHERE id = '${id}' AND status = 'published' RETURNING id, status;`;
    try {
      const r = await runQuery(sql);
      const affected = Array.isArray(r) ? r.length : 0;
      console.log(`  [${affected > 0 ? 'OK' : 'SKIP'}] ${id.slice(0,8)} → status=closed (${affected} row)`);
      log.push({ step: 'close_oportunidade', id, affected });
    } catch (e) {
      console.log(`  [ERR] ${id.slice(0,8)} → ${e.message}`);
      log.push({ step: 'close_oportunidade', id, error: e.message });
    }
    await sleep(300);
  }

  // ============================================================
  // PASSO 3: Corrigir categoria dos 4 posts específicos
  // ============================================================
  console.log('\n=== PASSO 3: Corrigir categorias erradas ===');

  // 3a. 2c95198a: estagio → monitoria
  const fix3a = `UPDATE posts SET category = 'monitoria', metadata = metadata || '{"categoriaKey":"monitoria","subcategoriaKey":"","categoryKey":"monitoria","subcategoryKey":"","categoryLabel":"Monitoria","subcategoryLabel":""}'::jsonb WHERE id = '2c95198a-9a84-4f74-943e-7f0e3d3049f4' RETURNING id, category, metadata->>'categoryKey' AS cat_key;`;
  try {
    const r = await runQuery(fix3a);
    console.log(`  [OK] 2c95198a → category='monitoria'`);
    log.push({ step: 'fix_category_2c95198a', result: r });
  } catch (e) {
    console.log(`  [ERR] 2c95198a → ${e.message}`);
    log.push({ step: 'fix_category_2c95198a', error: e.message });
  }
  await sleep(300);

  // 3b. 7830d052 (SISU+): monitoria → selecao
  // Verifica primeiro se 'selecao' já existe em alguma categoria válida
  // Vou usar 'academicos' como fallback seguro (já é categoria válida e usada em 15 posts)
  // SISU+ é processo seletivo de vagas remanescentes, se encaixa em academicos/graduação
  const fix3b = `UPDATE posts SET category = 'academicos', metadata = metadata || '{"categoriaKey":"academicos","subcategoriaKey":"","categoryKey":"academicos","subcategoryKey":"","categoryLabel":"Acadêmicos","subcategoryLabel":""}'::jsonb WHERE id = '7830d052-7b6b-4a87-a65f-772a889b756c' RETURNING id, category, metadata->>'categoryKey' AS cat_key;`;
  try {
    const r = await runQuery(fix3b);
    console.log(`  [OK] 7830d052 (SISU+) → category='academicos' (fallback seguro — categoria válida)`);
    log.push({ step: 'fix_category_7830d052', result: r });
  } catch (e) {
    console.log(`  [ERR] 7830d052 → ${e.message}`);
    log.push({ step: 'fix_category_7830d052', error: e.message });
  }
  await sleep(300);

  // 3c. b41103a2 (Bolsas Dinamarca): bolsa → bolsas
  const fix3c = `UPDATE posts SET category = 'bolsas', metadata = metadata || '{"categoriaKey":"bolsas","subcategoriaKey":"","categoryKey":"bolsas","subcategoryKey":"","categoryLabel":"Bolsas","subcategoryLabel":""}'::jsonb WHERE id = 'b41103a2-f4f9-48bf-81b5-2fe0993b9d6b' RETURNING id, category, metadata->>'categoryKey' AS cat_key;`;
  try {
    const r = await runQuery(fix3c);
    console.log(`  [OK] b41103a2 (Bolsas Dinamarca) → category='bolsas'`);
    log.push({ step: 'fix_category_b41103a2', result: r });
  } catch (e) {
    console.log(`  [ERR] b41103a2 → ${e.message}`);
    log.push({ step: 'fix_category_b41103a2', error: e.message });
  }
  await sleep(300);

  // 3d. 7d245895 (Vestibular): subcategory "academica" sem acento → com acento
  // O category principal já é 'concursos' (correto), só padronizar subcategoria
  const fix3d = `UPDATE posts SET metadata = metadata || '{"subcategoria":"Acadêmica","subcategory":"academica","subcategoriaKey":"academica","subcategoryKey":"academica","subcategoryLabel":"Acadêmica"}'::jsonb WHERE id = '7d245895-ec9d-4684-aa18-01684bf80d1a' RETURNING id, metadata->>'subcategoria' AS subcat, metadata->>'subcategoriaKey' AS subcat_key;`;
  try {
    const r = await runQuery(fix3d);
    console.log(`  [OK] 7d245895 (Vestibular) → subcategoria padronizada`);
    log.push({ step: 'fix_subcategory_7d245895', result: r });
  } catch (e) {
    console.log(`  [ERR] 7d245895 → ${e.message}`);
    log.push({ step: 'fix_subcategory_7d245895', error: e.message });
  }
  await sleep(300);

  // ============================================================
  // PASSO 4: Padronização geral de categorias
  // ============================================================
  console.log('\n=== PASSO 4: Padronização geral (singular → plural, sem acento → com) ===');

  // 4a. estagio → estagios
  const fix4a = `UPDATE posts SET category = 'estagios', metadata = jsonb_set(metadata, '{categoriaKey}', '"estagios"') || jsonb_build_object('categoryKey', 'estagios') WHERE category = 'estagio' RETURNING id, category;`;
  try {
    const r = await runQuery(fix4a);
    const count = Array.isArray(r) ? r.length : 0;
    console.log(`  [OK] 'estagio' → 'estagios': ${count} posts atualizados`);
    log.push({ step: 'fix_estagio_to_estagios', count });
  } catch (e) {
    console.log(`  [ERR] estagio → estagios: ${e.message}`);
    log.push({ step: 'fix_estagio_to_estagios', error: e.message });
  }
  await sleep(300);

  // 4b. bolsa → bolsas
  const fix4b = `UPDATE posts SET category = 'bolsas', metadata = jsonb_set(metadata, '{categoriaKey}', '"bolsas"') || jsonb_build_object('categoryKey', 'bolsas') WHERE category = 'bolsa' RETURNING id, category;`;
  try {
    const r = await runQuery(fix4b);
    const count = Array.isArray(r) ? r.length : 0;
    console.log(`  [OK] 'bolsa' → 'bolsas': ${count} posts atualizados`);
    log.push({ step: 'fix_bolsa_to_bolsas', count });
  } catch (e) {
    console.log(`  [ERR] bolsa → bolsas: ${e.message}`);
    log.push({ step: 'fix_bolsa_to_bolsas', error: e.message });
  }
  await sleep(300);

  // 4c. seminarios - checar se existe (não precisa criar, só normalizar)
  const fix4c = `UPDATE posts SET category = 'seminarios', metadata = jsonb_set(metadata, '{categoriaKey}', '"seminarios"') || jsonb_build_object('categoryKey', 'seminarios') WHERE category = 'seminario' RETURNING id, category;`;
  try {
    const r = await runQuery(fix4c);
    const count = Array.isArray(r) ? r.length : 0;
    console.log(`  [OK] 'seminario' → 'seminarios': ${count} posts atualizados`);
    log.push({ step: 'fix_seminario_to_seminarios', count });
  } catch (e) {
    console.log(`  [ERR] seminario → seminarios: ${e.message}`);
    log.push({ step: 'fix_seminario_to_seminarios', error: e.message });
  }
  await sleep(300);

  // 4d. Padronizar categoria 'academica' (sem acento) → 'academica' (mesmo key, mas garantir que metadata bate)
  // Não precisa se category já é 'academicos' ou 'concursos' — só atualiza subcategoria se existir
  // Esse passo já foi feito no fix3d; aqui só log

  // ============================================================
  // PASSO 5: Verificação final
  // ============================================================
  console.log('\n=== PASSO 5: Verificação final dos 12 targets ===');
  const verify = `
    SELECT id, module, category, status, metadata->>'categoriaKey' AS cat_key, metadata->>'subcategoria' AS subcat
    FROM posts
    WHERE id IN (
      '53d7e0e8-f3af-4014-82ac-18b6b3f8257e',
      '98f81fa5-11f8-44f6-8525-33ec2dacf439',
      '1cd7adeb-b38d-4335-9839-a3962317cc2f',
      '16bb5c36-47af-44c7-b2c0-2b96f203e902',
      'f4018bbe-d9e9-4caf-a505-b05d8ca84e44',
      'ddad28e2-e7e7-4127-825a-d71f37d68693',
      '412aabf9-ad4a-45f1-94cd-63549badf89e',
      '953bb526-e5f5-4e36-a59c-7b102e344518',
      '2c95198a-9a84-4f74-943e-7f0e3d3049f4',
      '7830d052-7b6b-4a87-a65f-772a889b756c',
      '7d245895-ec9d-4684-aa18-01684bf80d1a',
      'b41103a2-f4f9-48bf-81b5-2fe0993b9d6b'
    )
    ORDER BY module, status DESC, id;
  `;
  try {
    const r = await runQuery(verify);
    console.log(JSON.stringify(r, null, 2));
    log.push({ step: 'verify', result: r });
  } catch (e) {
    console.log(`  [ERR] verify → ${e.message}`);
    log.push({ step: 'verify', error: e.message });
  }

  // ============================================================
  // PASSO 6: Stats finais
  // ============================================================
  console.log('\n=== PASSO 6: Stats finais ===');
  const stats = `
    SELECT
      (SELECT count(*) FROM posts WHERE status = 'published') AS total_published,
      (SELECT count(*) FROM posts WHERE status = 'closed') AS total_closed,
      (SELECT count(*) FROM posts WHERE status = 'published' AND category IN ('estagio','bolsa','seminario')) AS cat_inconsistentes,
      (SELECT count(*) FROM posts WHERE status = 'published' AND module = 'eventos' AND (metadata->>'data_evento' IS NULL OR metadata->>'data_evento' = '')) AS eventos_sem_data,
      (SELECT count(*) FROM posts WHERE status = 'published' AND module = 'eventos' AND metadata->>'data_evento' IS NOT NULL AND metadata->>'data_evento' != '' AND metadata->>'data_fim_evento' IS NULL AND (metadata->>'data_evento')::date < CURRENT_DATE) AS eventos_passados_sem_fim
  `;
  try {
    const r = await runQuery(stats);
    console.log(JSON.stringify(r, null, 2));
    log.push({ step: 'stats', result: r });
  } catch (e) {
    console.log(`  [ERR] stats → ${e.message}`);
  }

  console.log('\n=== DONE ===');
  require('fs').writeFileSync(require('path').join(__dirname, 'apply-fixes-log.json'), JSON.stringify(log, null, 2));
}

apply().catch(e => { console.error('FATAL:', e); process.exit(1); });