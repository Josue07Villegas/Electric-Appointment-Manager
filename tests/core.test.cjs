const test = require('node:test');
const assert = require('node:assert/strict');
const { computeKpis, compareAppointments } = require('../lib/metrics.ts');
const { lifecycleUpdate } = require('../lib/lifecycle.ts');
const { summarizeEvaluation } = require('../lib/evaluation.ts');
function appointment(overrides = {}) {
  return { id: 'a', folio: 'ELEC-a', createdAt: '2026-11-02T14:00:00.000Z', firstConfirmedAt: null, arrivedAt: null, arrivalScheduledAt: null, scheduledAt: '2026-11-03T15:00:00.000Z', durationMin: 60, preferredSlots: [], clientName: 'Prueba', phone: '', email: '', address: '', propertyType: 'Casa', requestedService: 'Diagnóstico', description: 'Prueba', riskSignals: { sparks: false, smoke: false, burningSmell: false, totalPowerLoss: false }, classification: { serviceType: 'Diagnóstico', priority: 'Normal', source: 'local' }, status: 'Pendiente', technician: '', notes: '', completedAt: null, ...overrides };
}
test('first confirmation survives rescheduling; arrival freezes the last agreed time', () => {
  const pending = appointment();
  const first = '2026-11-02T14:19:30.000Z';
  const confirmed = { ...pending, ...lifecycleUpdate(pending, 'Confirmada', pending.scheduledAt, 60, first), status: 'Confirmada' };
  assert.equal(confirmed.firstConfirmedAt, first);
  const rescheduled = { ...confirmed, ...lifecycleUpdate(confirmed, 'Confirmada', '2026-11-03T16:00:00.000Z', 60), scheduledAt: '2026-11-03T16:00:00.000Z' };
  const arrived = { ...rescheduled, ...lifecycleUpdate(rescheduled, 'En servicio', rescheduled.scheduledAt, 60, '2026-11-03T15:59:00.000Z'), status: 'En servicio' };
  assert.equal(arrived.firstConfirmedAt, first);
  assert.equal(arrived.arrivalScheduledAt, rescheduled.scheduledAt);
  assert.equal(typeof lifecycleUpdate(arrived, 'En servicio', pending.scheduledAt, 60), 'string');
  assert.equal(typeof lifecycleUpdate(pending, 'Completada', pending.scheduledAt, 60), 'string');
  assert.equal(lifecycleUpdate(appointment({ status: 'Confirmada' }), 'En camino', pending.scheduledAt, 60).firstConfirmedAt, null);
});
test('KPIs include confirmed-then-cancelled requests and exclude incomplete visits', () => {
  const confirmedAt = '2026-11-02T14:19:30.000Z';
  const items = [appointment({ firstConfirmedAt: confirmedAt, status: 'Cancelada' }), appointment({ id: 'b', firstConfirmedAt: confirmedAt, status: 'Completada', arrivedAt: '2026-11-03T14:59:00Z', arrivalScheduledAt: '2026-11-03T15:00:00Z' }), appointment({ id: 'c', status: 'Completada' }), appointment({ id: 'd', status: 'Cancelada' })];
  const result = computeKpis(items);
  assert.equal(result.scheduling.averageMinutes, 19.5);
  assert.equal(result.scheduling.valid, 2);
  assert.equal(result.scheduling.excluded, 2);
  assert.equal(result.scheduling.targetMet, true);
  assert.equal(result.punctuality.percent, 100);
  assert.equal(result.punctuality.valid, 1);
  assert.equal(computeKpis([]).punctuality.percent, null);
  assert.equal(computeKpis([appointment({ firstConfirmedAt: '2026-01-01T00:00:00Z' })]).scheduling.valid, 0);
});
test('pending queue uses a consistent priority/FIFO order even with mixed states', () => {
  const items = [appointment({ id: 'closed', status: 'Completada' }), appointment({ id: 'normal' }), appointment({ id: 'critical', classification: { priority: 'Crítica' } }), appointment({ id: 'older', createdAt: '2026-11-01T14:00:00Z' })];
  assert.deepEqual(items.sort(compareAppointments).map(a => a.id), ['critical', 'older', 'normal', 'closed']);
});
test('JEV evaluation uses raw priority and cannot pass with fallback results', () => {
  const row = { expectedService: 'Reparación', expectedPriority: 'Crítica', result: { source: 'Jev', serviceType: 'Reparación', priority: 'Crítica', rawPriority: 'Normal', safetyOverride: true } };
  const report = summarizeEvaluation(Array.from({ length: 30 }, () => row));
  assert.equal(report.priorityCorrect, 0);
  assert.equal(report.underestimated, 30);
  assert.equal(report.accepted, false);
  const good = { ...row, result: { ...row.result, rawPriority: 'Crítica' } };
  assert.equal(summarizeEvaluation(Array.from({ length: 30 }, () => good)).accepted, true);
  assert.equal(summarizeEvaluation([...Array.from({ length: 29 }, () => good), { ...good, result: { source: 'respaldo local' } }]).accepted, false);
});
module.exports = { appointment };
test('measurement periods use reception for requests and arrival for visits', () => {
  const item = appointment({ firstConfirmedAt: '2026-11-02T14:10:00Z', status: 'Completada', arrivedAt: '2026-11-03T15:00:00Z', arrivalScheduledAt: '2026-11-03T15:00:00Z' });
  const result = computeKpis([item], { from: '2026-11-03T06:00:00Z', to: '2026-11-04T06:00:00Z' });
  assert.equal(result.scheduling.valid, 0);
  assert.equal(result.punctuality.valid, 1);
});

test('punctuality uses zero tolerance and excludes inconsistent arrival times', () => {
  const makeVisit = overrides => appointment({ status: 'Completada', firstConfirmedAt: '2026-11-02T14:10:00Z', arrivedAt: '2026-11-03T15:00:00Z', arrivalScheduledAt: '2026-11-03T15:00:00Z', ...overrides });
  const result = computeKpis([makeVisit({}), makeVisit({ id: 'late', arrivedAt: '2026-11-03T15:00:01Z' }), makeVisit({ id: 'bad', arrivedAt: '2026-11-01T15:00:00Z' })]);
  assert.equal(result.punctuality.valid, 2);
  assert.equal(result.punctuality.percent, 50);
  assert.equal(result.punctuality.exclusionReasons.tiempos_invalidos, 1);
});
