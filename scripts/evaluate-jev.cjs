require('./register.cjs');
const fs = require('node:fs/promises');
const { classifyAppointment } = require('../lib/classifier.ts');
const { summarizeEvaluation } = require('../lib/evaluation.ts');
const { PRIORITIES } = require('../lib/types.ts');
const services = ['Diagnóstico', 'Instalación', 'Mantenimiento', 'Reparación', 'Cotización'];
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Uso: npm run evaluate:jev -- matriz.json resultados.json');
  if (require('node:path').resolve(input) === require('node:path').resolve(output)) throw new Error('La matriz y el informe deben ser archivos distintos.');
  try { await fs.access(output); throw new Error('El informe de salida ya existe. Elige otro nombre.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Configura AI_GATEWAY_API_KEY antes de ejecutar la evaluación real.');
  const matrix = JSON.parse(await fs.readFile(input, 'utf8'));
  if (!matrix.reviewer?.trim() || !Number.isFinite(Date.parse(matrix.reviewedAt)) || Date.parse(matrix.reviewedAt) > Date.now()) throw new Error('Indica el técnico revisor y la fecha real de revisión previa.');
  const cases = matrix.cases;
  if (!Array.isArray(cases) || cases.length !== 30 || new Set(cases.map(c => c.id)).size !== 30) throw new Error('Se requieren 30 casos con identificadores únicos.');
  for (const c of cases) {
    if (!c.id || !c.description?.trim() || !services.includes(c.expectedService) || !PRIORITIES.includes(c.expectedPriority) || !c.riskSignals || ['sparks', 'smoke', 'burningSmell', 'totalPowerLoss'].some(key => typeof c.riskSignals[key] !== 'boolean')) throw new Error('Completa descripciones, señales y referencias del técnico antes de evaluar.');
  }
  if (services.some(s => !cases.some(c => c.expectedService === s)) || PRIORITIES.some(p => !cases.some(c => c.expectedPriority === p))) throw new Error('La muestra debe cubrir las cinco categorías y los cuatro niveles de prioridad.');
  const startedAt = new Date().toISOString();
  const rows = [];
  const report = {
    status: 'running', startedAt, reviewer: matrix.reviewer, reviewedAt: matrix.reviewedAt,
    model: process.env.JEV_MODEL || 'typesafe-ai/jev',
    catalogVersion: 'electroagenda-v2', priorityScale: PRIORITIES,
    references: cases,
    distribution: {
      service: Object.fromEntries(services.map(s => [s, cases.filter(c => c.expectedService === s).length])),
      priority: Object.fromEntries(PRIORITIES.map(p => [p, cases.filter(c => c.expectedPriority === p).length])),
    },
    rows,
  };
  // Retain the selected references before contacting JEV and checkpoint each attempt.
  await fs.writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
  for (const c of cases) {
    const row = { ...c, attempts: [] };
    rows.push(row);
    const input = { clientName: '', phone: '', email: '', address: '', notes: '', preferredSlots: [], propertyType: c.propertyType || 'Casa', requestedService: c.requestedService || 'Diagnóstico eléctrico', description: c.description, riskSignals: c.riskSignals };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await classifyAppointment(input);
      row.attempts.push({ at: new Date().toISOString(), result });
      row.result = result;
      await fs.writeFile(output, JSON.stringify(report, null, 2));
      if (result.source === 'Jev') break;
    }
    console.log(`${rows.length}/30: ${c.id} (${row.result.source})`);
  }
  report.status = 'finished';
  report.finishedAt = new Date().toISOString();
  report.summary = {
    ...summarizeEvaluation(rows),
    attempts: rows.reduce((sum, row) => sum + row.attempts.length, 0),
    failedAttempts: rows.reduce((sum, row) => sum + row.attempts.filter(a => a.result.source !== 'Jev').length, 0),
  };
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
