require('../register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const startedAt = new Date().toISOString();
const out = path.resolve(process.argv[2] || path.join(root, 'artifacts', `functional-${startedAt.replaceAll(':', '-')}`));
if (fs.existsSync(path.join(out, 'resultados.json'))) throw Error('El informe ya existe. Usa otro directorio.');
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'electroagenda-pf-'));
const liveKey = process.env.AI_GATEWAY_API_KEY || '';
const testUrl = process.env.TEST_DATABASE_URL || '';
if (testUrl && (!process.env.TEST_NEON_BRANCH_ID || !process.env.TEST_NEON_PROJECT_ID)) throw Error('La ejecución Neon requiere identificar explícitamente el proyecto y la rama aislada.');
const backend = testUrl ? 'PostgreSQL/Neon en rama de pruebas' : 'SQLite aislado';
Object.assign(process.env, { DATABASE_URL: testUrl, POSTGRES_URL: '', NEON_DATABASE_URL: '', NODE_ENV: 'test', DATA_FILE: path.join(scratch, 'sin-semillas.json'), SQLITE_DB_PATH: path.join(scratch, 'pruebas.db'), AI_GATEWAY_API_KEY: '' });
let authorized = true;
const authPath = require.resolve('../../lib/auth.ts');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { isAuthorizedStaff: async () => authorized } };
const { NextRequest } = require('next/server');
const collection = require('../../app/api/appointments/route.ts');
const detail = require('../../app/api/appointments/[id]/route.ts');
const reclassify = require('../../app/api/appointments/[id]/reclassify/route.ts');
const metrics = require('../../app/api/metrics/route.ts');
const stats = require('../../app/api/stats/route.ts');
const config = require('../../app/api/config/route.ts');
const store = require('../../lib/store.ts');
const { computeKpis } = require('../../lib/metrics.ts');
const { createClient } = require('@libsql/client');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const report = { startedAt, finishedAt: null, commit: revision, harnessSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), node: process.version, environment: backend, neonBranch: process.env.TEST_NEON_BRANCH_ID || null, actor: 'Ejecución automatizada asistida por Codex; revisión humana pendiente', dataNature: 'Datos sintéticos de laboratorio; sin registros operativos ni datos personales reales', authScope: 'Se ejecutan los handlers reales con autorización de personal controlada por el arnés. No se suplanta una sesión Neon real.', records: [] };
function checkpoint() { fs.writeFileSync(path.join(out, 'resultados.json'), JSON.stringify(report, null, 2)); }
const req = (url, method = 'GET', body) => new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
const ctx = id => ({ params: Promise.resolve({ id }) });
const valid = label => ({ clientName: `Cliente sintético ${label}`, phone: '0000000000', address: 'Domicilio ficticio de laboratorio', propertyType: 'Casa', requestedService: 'Diagnóstico eléctrico', description: `Solicitud sintética ${label}`, preferredSlots: ['2030-11-04T15:00:00Z'], riskSignals: { sparks: false, smoke: false, burningSmell: false, totalPowerLoss: false } });
async function create(label, overrides = {}) {
  const r = await collection.POST(req('/api/appointments', 'POST', { ...valid(label), ...overrides }));
  assert.equal(r.status, 201, await (r.status === 201 ? Promise.resolve('') : r.text()));
  return (await r.json()).appointment;
}
async function read(id) { return (await store.readAppointments()).find(row => row.id === id); }
async function patch(item, body) {
  const r = await detail.PATCH(req(`/api/appointments/${item.id}`, 'PATCH', { expectedRevision: item.revision, ...body }), ctx(item.id));
  return { status: r.status, ...(await r.json()) };
}
function fixture(overrides = {}) {
  const id = crypto.randomUUID();
  return { id, folio: `PF-${id}`, createdAt: '2027-01-04T15:00:00Z', revision: 0, updatedAt: undefined, scheduledAt: null, durationMin: null, ...valid('KPI'), preferredSlots: [], classification: { serviceType: 'Diagnóstico', priority: 'Normal', source: 'fixture sintético' }, status: 'Pendiente', technician: 'Técnico sintético', notes: '', completedAt: null, firstConfirmedAt: null, arrivedAt: null, arrivalScheduledAt: null, ...overrides };
}
async function run(id, scenario, steps, expected, operation) {
  const row = { id, scenario, steps, expected, startedAt: new Date().toISOString(), status: 'en ejecución' };
  report.records.push(row); checkpoint();
  try { const result = await operation(); Object.assign(row, { status: 'aprobado', ...result }); }
  catch (error) { Object.assign(row, { status: 'fallido', observed: String(error.message).slice(0, 1400) }); }
  row.finishedAt = new Date().toISOString(); checkpoint();
  console.log(`${id}: ${row.status}`);
}
let publicRequest, confirmed, concurrentWinner, arrived;
async function main() {
  if (testUrl) {
    const sql = require('@neondatabase/serverless').neon(testUrl);
    const rows = await sql.query('SELECT COUNT(*)::int AS count FROM appointments');
    if (rows[0].count !== 0) throw Error('La rama debe comenzar con la tabla appointments vacía. No se modifica una base con datos existentes.');
    report.emptyDatabaseVerified = true;
  }
  await run('PF-01', 'Registrar solicitud válida sin cuenta', ['Desactivar autorización del arnés.', 'Enviar datos sintéticos válidos.', 'Leer la fila persistida.'], 'HTTP 201, recepción conservada, solicitud pendiente sin cita confirmada.', async () => {
    authorized = false; const before = Date.now(); publicRequest = await create('PF01'); const after = Date.now();
    const saved = await read(publicRequest.id); assert(saved); assert.equal(saved.status, 'Pendiente'); assert.equal(saved.scheduledAt, null); assert.equal(saved.firstConfirmedAt, null); assert(Date.parse(saved.createdAt) >= before && Date.parse(saved.createdAt) <= after);
    return { observed: 'Solicitud recibida sin cuenta; recepción dentro del intervalo de ejecución.', evidence: { id: saved.id, status: saved.status, createdAt: saved.createdAt, scheduledAt: saved.scheduledAt, firstConfirmedAt: saved.firstConfirmedAt } };
  });
  await run('PF-02', 'Rechazar datos obligatorios incompletos', ['Omitir cada campo obligatorio en una solicitud.', 'Comparar el número de registros antes y después.'], 'Cada intento responde 400 y no persiste filas.', async () => {
    const count = (await store.readAppointments()).length; const responses = [];
    for (const field of ['clientName', 'phone', 'address', 'propertyType', 'description']) { const body = valid('PF02'); delete body[field]; const r = await collection.POST(req('/api/appointments', 'POST', body)); assert.equal(r.status, 400); responses.push({ omitted: field, status: r.status }); }
    assert.equal((await store.readAppointments()).length, count); return { observed: 'Cinco omisiones rechazadas; sin incremento de filas.', evidence: responses };
  });
  await run('PF-03', 'Rechazar operaciones administrativas sin autorización', ['Solicitar listado, detalle, cambios, reclasificación, métricas, estadísticas y configuración sin autorización.'], 'HTTP 401 en las siete operaciones.', async () => {
    authorized = false;
    const responses = await Promise.all([collection.GET(req('/api/appointments')), detail.GET(req('/api/appointments/a'), ctx(publicRequest.id)), detail.PATCH(req('/api/appointments/a', 'PATCH', {}), ctx(publicRequest.id)), reclassify.POST(req('/api/appointments/a/reclassify', 'POST', {}), ctx(publicRequest.id)), metrics.GET(req('/api/metrics')), stats.GET(), config.GET()]);
    responses.forEach(r => assert.equal(r.status, 401)); authorized = true; return { observed: 'Se rechazaron las siete operaciones.', evidence: { statuses: responses.map(r => r.status), scope: report.authScope } };
  });
  await run('PF-04', 'Ordenar pendientes por prioridad y recepción', ['Persistir cinco pendientes sintéticos con cuatro prioridades.', 'Consultar únicamente sus folios mediante el filtro.'], 'Crítica, Alta, Normal antigua, Normal nueva, Baja.', async () => {
    const marker = `orden-${crypto.randomUUID()}`;
    const cases = [['Baja', '2027-01-04T14:00:00Z'], ['Normal', '2027-01-04T14:10:00Z'], ['Crítica', '2027-01-04T14:20:00Z'], ['Normal', '2027-01-04T14:05:00Z'], ['Alta', '2027-01-04T14:30:00Z']];
    const items = cases.map(([priority, createdAt]) => fixture({ clientName: marker, createdAt, classification: { serviceType: 'Diagnóstico', priority, source: 'fixture sintético' } }));
    for (const item of items) await store.saveAppointment(item);
    const response = await collection.GET(req(`/api/appointments?status=Pendiente&q=${marker}`)); const rows = (await response.json()).appointments;
    assert.deepEqual(rows.map(r => r.id), [items[2], items[4], items[3], items[1], items[0]].map(r => r.id)); return { observed: 'Orden de prioridad y FIFO verificado.', evidence: rows.map(({ id, createdAt, classification }) => ({ id, createdAt, priority: classification.priority })) };
  });
  await run('PF-05', 'Confirmar un horario disponible', ['Crear un pendiente.', 'Confirmar el 4 de noviembre de 2030 a las 09:00 de Monterrey por 60 minutos.'], 'HTTP 200, primera confirmación y horario persistidos.', async () => {
    const item = await create('PF05'); const r = await patch(item, { status: 'Confirmada', scheduledAt: '2030-11-04T15:00:00Z', durationMin: 60 }); assert.equal(r.status, 200); confirmed = r.appointment; assert(confirmed.firstConfirmedAt); assert.equal((await read(item.id)).firstConfirmedAt, confirmed.firstConfirmedAt); return { observed: 'Cita confirmada y persistida.', evidence: { id: confirmed.id, firstConfirmedAt: confirmed.firstConfirmedAt, scheduledAt: confirmed.scheduledAt, durationMin: confirmed.durationMin } };
  });
  await run('PF-06', 'Rechazar un intervalo superpuesto', ['Intentar confirmar otro pendiente a las 09:30 durante la cita anterior.', 'Comparar ambos registros.'], 'HTTP 409; la cita original y el pendiente se conservan.', async () => {
    const item = await create('PF06'); const before = await read(confirmed.id); const r = await patch(item, { status: 'Confirmada', scheduledAt: '2030-11-04T15:30:00Z', durationMin: 60 }); assert.equal(r.status, 409); assert.equal((await read(item.id)).status, 'Pendiente'); assert.deepEqual(await read(confirmed.id), before); return { observed: 'Conflicto rechazado sin modificar las citas.', evidence: { status: r.status, message: r.error, pendingId: item.id } };
  });
  await run('PF-07', 'Confirmar simultáneamente intervalos superpuestos', ['Crear dos pendientes distintos.', 'Lanzar dos PATCH concurrentes para intervalos superpuestos.', 'Comprobar las filas definitivas.'], 'Exactamente una respuesta 200 y una 409; solo una confirmación persistida.', async () => {
    const a = await create('PF07-A'); const b = await create('PF07-B'); const results = await Promise.all([patch(a, { status: 'Confirmada', scheduledAt: '2030-11-05T15:00:00Z', durationMin: 60 }), patch(b, { status: 'Confirmada', scheduledAt: '2030-11-05T15:30:00Z', durationMin: 60 })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); const saved = [await read(a.id), await read(b.id)]; assert.equal(saved.filter(r => r.status === 'Confirmada').length, 1); concurrentWinner = saved.find(r => r.status === 'Confirmada'); return { observed: 'Solo una confirmación concurrente se conservó.', evidence: { backend, statuses: results.map(r => r.status), records: saved.map(({ id, status, scheduledAt }) => ({ id, status, scheduledAt })) } };
  });
  await run('PF-08', 'Reprogramar conservando la primera confirmación', ['Mover PF-05 a las 11:00 de Monterrey.', 'Intentar moverla al intervalo ocupado de PF-07.', 'Intentar un domingo.'], 'La reprogramación válida conserva firstConfirmedAt; conflicto 409 y domingo 400.', async () => {
    const r = await patch(confirmed, { scheduledAt: '2030-11-04T17:00:00Z' }); assert.equal(r.status, 200); assert.equal(r.appointment.firstConfirmedAt, confirmed.firstConfirmedAt); confirmed = r.appointment;
    const busy = await patch(confirmed, { scheduledAt: concurrentWinner.scheduledAt }); assert.equal(busy.status, 409);
    const sunday = await patch(confirmed, { scheduledAt: '2030-11-03T15:00:00Z' }); assert.equal(sunday.status, 400); assert.equal((await read(confirmed.id)).scheduledAt, confirmed.scheduledAt);
    return { observed: 'Reprogramación válida conservada; dos horarios inválidos rechazados.', evidence: { id: confirmed.id, firstConfirmedAt: confirmed.firstConfirmedAt, scheduledAt: confirmed.scheduledAt, rejected: [busy.status, sunday.status] } };
  });
  await run('PF-09', 'Cancelar y liberar el intervalo', ['Cancelar PF-05.', 'Confirmar un pendiente nuevo en el mismo intervalo.', 'Comparar la primera confirmación del cancelado.'], 'Ambas operaciones 200; el cancelado conserva firstConfirmedAt.', async () => {
    const cancelled = await patch(confirmed, { status: 'Cancelada' }); assert.equal(cancelled.status, 200); assert.equal(cancelled.appointment.firstConfirmedAt, confirmed.firstConfirmedAt);
    const item = await create('PF09'); const booked = await patch(item, { status: 'Confirmada', scheduledAt: confirmed.scheduledAt, durationMin: 60 }); assert.equal(booked.status, 200); confirmed = booked.appointment; return { observed: 'Intervalo liberado y reutilizado.', evidence: { cancelledId: cancelled.appointment.id, firstConfirmedAt: cancelled.appointment.firstConfirmedAt, replacementId: confirmed.id, scheduledAt: confirmed.scheduledAt } };
  });
  await run('PF-10', 'Registrar llegada y conservar el horario acordado', ['Pasar la cita a En servicio.', 'Comparar llegada con las marcas de inicio y fin del ensayo.', 'Intentar reprogramar después de llegar y completar la visita.'], 'Llegada actual y horario congelado; reprogramación 400; conservación al completar.', async () => {
    const before = Date.now(); const r = await patch(confirmed, { status: 'En servicio' }); const after = Date.now(); assert.equal(r.status, 200); arrived = r.appointment; assert(Date.parse(arrived.arrivedAt) >= before && Date.parse(arrived.arrivedAt) <= after); assert.equal(arrived.arrivalScheduledAt, confirmed.scheduledAt);
    assert.equal((await patch(arrived, { scheduledAt: '2030-11-04T18:00:00Z' })).status, 400); const completed = await patch(arrived, { status: 'Completada' }); assert.equal(completed.status, 200); assert.equal(completed.appointment.arrivedAt, arrived.arrivedAt); arrived = completed.appointment;
    return { observed: 'Llegada real del ensayo registrada; horario y llegada conservados al completar.', evidence: { id: arrived.id, arrivedAt: arrived.arrivedAt, arrivalScheduledAt: arrived.arrivalScheduledAt, completedAt: arrived.completedAt } };
  });
  await run('PF-11', 'Calcular KPI y exclusiones con datos mixtos', ['Preparar seis registros sintéticos de enero de 2027.', 'Consultar métricas para ese periodo.', 'Comprobar promedio, puntualidad, exclusiones y ausencia de contactos.'], 'Promedio 20 minutos (3 válidos, 3 excluidos); puntualidad 50% (2 válidos, 4 excluidos).', async () => {
    const rows = [fixture({ status: 'Cancelada', firstConfirmedAt: '2027-01-04T15:10:00Z' }), fixture({ status: 'Completada', firstConfirmedAt: '2027-01-04T15:20:00Z', arrivedAt: '2027-01-05T15:00:00Z', arrivalScheduledAt: '2027-01-05T15:00:00Z' }), fixture(), fixture({ status: 'Cancelada' }), fixture({ status: 'Completada', firstConfirmedAt: '2027-01-04T15:30:00Z', arrivedAt: '2027-01-05T15:00:01Z', arrivalScheduledAt: '2027-01-05T15:00:00Z' }), fixture({ status: 'Completada' })];
    const direct = computeKpis(rows); assert.equal(direct.scheduling.averageMinutes, 20); assert.equal(direct.punctuality.percent, 50);
    for (const row of rows) await store.saveAppointment(row);
    const response = await metrics.GET(req('/api/metrics?from=2027-01-04T15:00:00Z&to=2027-02-01T06:00:00Z')); assert.equal(response.status, 200); const exported = await response.json();
    assert.equal(exported.kpis.scheduling.averageMinutes, 20); assert.equal(exported.kpis.scheduling.valid, 3); assert.equal(exported.kpis.scheduling.excluded, 3); assert.equal(exported.kpis.punctuality.percent, 50); assert.equal(exported.kpis.punctuality.valid, 2); assert.equal(exported.kpis.punctuality.excluded, 4); assert(exported.records.every(r => !('clientName' in r) && !('phone' in r) && !('address' in r)));
    return { observed: 'Cálculo y denominadores verificados con una llegada un segundo tarde.', evidence: exported.kpis };
  });
  await run('PF-12', 'Calcular KPI sin registros válidos', ['Consultar un periodo futuro vacío.'], 'Promedios y porcentajes null; muestras cero; sin división por cero.', async () => {
    const response = await metrics.GET(req('/api/metrics?from=2040-01-01T06:00:00Z&to=2041-01-01T06:00:00Z')); const r = await response.json(); assert.equal(r.kpis.scheduling.averageMinutes, null); assert.equal(r.kpis.punctuality.percent, null); assert.equal(r.kpis.scheduling.valid, 0); assert.equal(r.kpis.punctuality.valid, 0); return { observed: 'Sin datos válidos; no se informa cero como porcentaje de éxito.', evidence: r.kpis };
  });
  await run('PF-13', 'Detectar edición desde dos sesiones', ['Leer dos copias de la misma revisión.', 'Guardar observaciones con la primera copia.', 'Intentar guardar y reclasificar con la copia obsoleta.'], 'Primera operación 200; copia obsoleta 409; notas nuevas conservadas.', async () => {
    const a = await read(arrived.id); const b = await read(arrived.id); const saved = await patch(a, { notes: 'Nota de la primera sesión sintética' }); assert.equal(saved.status, 200); const stale = await patch(b, { notes: 'Nota obsoleta' }); assert.equal(stale.status, 409); const reclassified = await reclassify.POST(req('/api/appointments/a/reclassify', 'POST', { expectedRevision: b.revision }), ctx(b.id)); assert.equal(reclassified.status, 409); assert.equal((await read(a.id)).notes, saved.appointment.notes); return { observed: 'No hubo sobrescritura silenciosa.', evidence: { statuses: [saved.status, stale.status, reclassified.status], revisionBefore: b.revision, revisionAfter: saved.appointment.revision, authScope: report.authScope } };
  });
  await run('PF-14', 'Conservar datos al cerrar y abrir sesión', ['Desautorizar y volver a autorizar el arnés.', 'Consultar el historial.', 'Leer el mismo almacenamiento desde un proceso nuevo.'], 'Datos conservados y sesión real de Neon Auth comprobada.', async () => {
    authorized = false; assert.equal((await collection.GET(req('/api/appointments'))).status, 401); authorized = true;
    const restored = (await (await collection.GET(req(`/api/appointments?q=${arrived.folio}`))).json()).appointments; assert.equal(restored.length, 1); assert.equal(restored[0].status, 'Completada');
    const child = spawnSync(process.execPath, ['--require', path.join(root, 'scripts/register.cjs'), '-e', "require('./lib/store.ts').readAppointments().then(rows=>console.log(JSON.stringify(rows.map(r=>({id:r.id,status:r.status}))))).catch(()=>process.exitCode=1)"], { cwd: root, encoding: 'utf8', env: process.env }); assert.equal(child.status, 0, child.stderr); assert(JSON.parse(child.stdout).some(r => r.id === arrived.id && r.status === 'Completada'));
    return { status: 'bloqueado', observed: 'Persistencia y reautorización del arnés aprobadas. Falta cerrar y abrir una sesión real del personal en Neon Auth.', evidence: { id: arrived.id, persistedAcrossProcesses: true, authorizedHistoryVisible: true, missing: 'Sesión real del personal; no se usaron credenciales de usuario.' } };
  });
  await run('PF-15', 'Distinguir JEV real y respaldo ante indisponibilidad', ['Consultar JEV con una descripción sintética.', 'Interrumpir la red del clasificador dentro de ese proceso de prueba.', 'Comprobar los dos orígenes.'], 'Respuesta real JEV y respaldo local identificado, sin almacenarlos en la agenda.', async () => {
    if (!liveKey) return { status: 'bloqueado', observed: 'Falta AI_GATEWAY_API_KEY en el entorno de ejecución.' };
    const code = `const {classifyAppointment}=require('./lib/classifier.ts'); const input={requestedService:'Mantenimiento',description:'Revisión preventiva de tablero sin fallas ni señales de peligro.',propertyType:'Casa',riskSignals:{sparks:false,smoke:false,burningSmell:false,totalPowerLoss:false}};(async()=>{const live=await classifyAppointment(input);global.fetch=async()=>{throw Error('Interrupción simulada de red')};const offline=await classifyAppointment(input);console.log(JSON.stringify({live,offline}));})().catch(()=>process.exitCode=1)`;
    const child = spawnSync(process.execPath, ['--require', path.join(root, 'scripts/register.cjs'), '-e', code], { cwd: root, encoding: 'utf8', env: { ...process.env, AI_GATEWAY_API_KEY: liveKey }, timeout: 30000 }); assert.equal(child.status, 0, child.stderr); const r = JSON.parse(child.stdout); assert.equal(r.live.source, 'Jev'); assert.equal(r.offline.source, 'respaldo local'); assert(r.live.rawPriority); assert(!r.offline.rawPriority); return { observed: 'JEV real respondió; el fallo de red produjo respaldo local distinguible. No es la evaluación de 30 casos.', evidence: r };
  });
  await run('PF-16', 'Recuperar información en un entorno aislado', ['Crear una copia del almacenamiento de ensayo.', 'Eliminar un registro exclusivamente en el laboratorio.', 'Recuperar en otro archivo aislado y comparar los registros y restricciones.'], 'Recuperación de Neon verificada en rama aislada, con límites documentados.', async () => {
    if (testUrl) return { status: 'bloqueado', observed: 'El laboratorio ya usa una rama Neon. La recuperación se comprobará con una operación independiente de Neon y su evidencia se adjuntará.', evidence: { branch: process.env.TEST_NEON_BRANCH_ID } };
    const client = createClient({ url: `file:${process.env.SQLITE_DB_PATH}` }); const backup = path.join(scratch, 'respaldo.db'); const recovered = path.join(scratch, 'recuperada.db');
    try {
      const before = await client.execute('SELECT id, payload FROM appointments ORDER BY id'); const digest = rows => crypto.createHash('sha256').update(JSON.stringify(rows.map(r => [r.id, r.payload]))).digest('hex'); const hash = digest(before.rows);
      await client.execute(`VACUUM INTO '${backup.replaceAll("'", "''")}'`); await client.execute({ sql: 'DELETE FROM appointments WHERE id=?', args: [arrived.id] }); assert.equal((await client.execute({ sql: 'SELECT id FROM appointments WHERE id=?', args: [arrived.id] })).rows.length, 0);
      fs.copyFileSync(backup, recovered); const restored = createClient({ url: `file:${recovered}` });
      try { const after = await restored.execute('SELECT id, payload FROM appointments ORDER BY id'); assert.equal(digest(after.rows), hash); const triggers = await restored.execute("SELECT name FROM sqlite_master WHERE type='trigger'"); assert.equal(triggers.rows.length, 2);
        return { status: 'bloqueado', observed: 'Recuperación SQLite aprobada: registros idénticos y dos restricciones de traslape conservadas. Falta ejecutar el mecanismo de recuperación de Neon.', evidence: { count: after.rows.length, sha256Before: hash, sha256Recovered: digest(after.rows), overlapTriggers: triggers.rows.map(r => r.name), missing: 'Recuperación administrada de Neon en rama aislada.' } };
      } finally { restored.close(); }
    } finally { client.close(); }
  });
  report.finishedAt = new Date().toISOString(); report.summary = Object.fromEntries(['aprobado', 'fallido', 'bloqueado'].map(status => [status, report.records.filter(r => r.status === status).length])); checkpoint();
  console.log(JSON.stringify({ output: out, ...report.summary })); if (report.summary.fallido) process.exitCode = 1;
}
main().catch(error => { report.fatalError = String(error.message).slice(0, 1200); checkpoint(); console.error(report.fatalError); process.exitCode = 1; });
