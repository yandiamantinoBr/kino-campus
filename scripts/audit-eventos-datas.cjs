// scripts/audit-eventos-datas.cjs
// Verifica corretamente eventos vencidos usando data_fim_evento (ou data_evento como fallback)
const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'eventos-meta.json');
let raw = fs.readFileSync(INPUT, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const eventos = JSON.parse(raw);

const now = new Date('2026-06-22T11:18:58-03:00');

const results = {
  semData: [],
  inicioPassadoSemFim: [],  // data_evento no passado mas sem data_fim_evento
  fimPassado: [],           // data_fim_evento no passado (evento realmente acabou)
  fimHojeOuFuturo: [],      // ainda está rolando
  incoerenciaData: []       // data_evento > data_fim_evento ou outros problemas
};

for (const e of eventos) {
  const id = e.id;
  const titulo = (e.title || '').slice(0, 80);
  const de = e.data_evento;
  const df = e.data_fim_evento;
  const dl = e.deadline_date;

  if (!de) {
    results.semData.push({ id, titulo });
    continue;
  }

  const dataInicio = new Date(de + 'T00:00:00-03:00');
  const dataFim = df ? new Date(df + 'T00:00:00-03:00') : null;

  if (dataFim) {
    // Evento tem range de datas
    if (dataFim < now) {
      results.fimPassado.push({ id, titulo, data_evento: de, data_fim_evento: df });
    } else {
      results.fimHojeOuFuturo.push({ id, titulo, data_evento: de, data_fim_evento: df });
    }

    // Coerência: início não pode ser depois do fim
    if (dataInicio > dataFim) {
      results.incoerenciaData.push({ id, titulo, motivo: 'data_evento > data_fim_evento', de, df });
    }
  } else {
    // Só tem data_evento (data pontual)
    if (dataInicio < now) {
      // Passou e não tem data_fim — provavelmente deveria estar encerrado
      results.inicioPassadoSemFim.push({ id, titulo, data_evento: de });
    } else {
      results.fimHojeOuFuturo.push({ id, titulo, data_evento: de });
    }
  }
}

console.log(`Total eventos: ${eventos.length}`);
console.log(`Sem data_evento: ${results.semData.length}`);
console.log(`Com data_fim_evento passado (acabaram): ${results.fimPassado.length}`);
console.log(`Com data_evento passado e SEM data_fim: ${results.inicioPassadoSemFim.length}`);
console.log(`Futuros/hoje: ${results.fimHojeOuFuturo.length}`);
console.log(`Incoerências (data_evento > data_fim): ${results.incoerenciaData.length}`);
console.log();

if (results.fimPassado.length > 0) {
  console.log('=== EVENTOS QUE JÁ ACABARAM (data_fim_evento passada) ===');
  results.fimPassado.forEach(e => console.log(`  ${e.id.slice(0,8)} ${e.data_evento} → ${e.data_fim_evento}  ${e.titulo}`));
}
if (results.inicioPassadoSemFim.length > 0) {
  console.log('\n=== EVENTOS PASSADOS SEM data_fim_evento (suspeitos) ===');
  results.inicioPassadoSemFim.forEach(e => console.log(`  ${e.id.slice(0,8)} ${e.data_evento} ${e.titulo}`));
}
if (results.semData.length > 0) {
  console.log('\n=== EVENTOS SEM data_evento ===');
  results.semData.forEach(e => console.log(`  ${e.id.slice(0,8)} ${e.titulo}`));
}
if (results.incoerenciaData.length > 0) {
  console.log('\n=== INCOERÊNCIAS (data_evento > data_fim) ===');
  results.incoerenciaData.forEach(e => console.log(`  ${e.id.slice(0,8)} ${e.motivo} ${e.de} → ${e.df}  ${e.titulo}`));
}

// Salvar
fs.writeFileSync(path.join(__dirname, 'eventos-datas-report.json'), JSON.stringify(results, null, 2), 'utf8');
console.log('\n→ scripts/eventos-datas-report.json');