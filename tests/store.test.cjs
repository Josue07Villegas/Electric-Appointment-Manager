const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'electroagenda-test-'));
process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';
process.env.NEON_DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.SQLITE_DB_PATH = path.join(tmp, 'test.db');
process.env.DATA_FILE = path.join(tmp, 'missing.json');
const { saveAppointment, readAppointments, getAvailableSlots } = require('../lib/store.ts');
const base = { id: 'a', folio: 'A', createdAt: '2026-11-02T14:00:00.000Z', scheduledAt: '2026-11-03T15:00:00.000Z', durationMin: 60, preferredSlots: [], status: 'Confirmada', classification: { serviceType: 'Diagnóstico', priority: 'Normal', source: 'local' } };
test('database prevents overlaps, stale edits, and loss of unrelated rows', async () => {
  await saveAppointment(base);
  const a = (await readAppointments())[0];
  await saveAppointment({ ...base, id: 'b', folio: 'B', scheduledAt: '2026-11-03T16:00:00.000Z' });
  await assert.rejects(saveAppointment({ ...base, id: 'c', folio: 'C', scheduledAt: '2026-11-03T15:30:00.000Z' }), /appointment time conflict/);
  await saveAppointment({ ...a, notes: 'Primera edición' }, a);
  await assert.rejects(saveAppointment({ ...a, notes: 'Edición obsoleta' }, a), /STALE_APPOINTMENT/);
  assert.equal((await readAppointments()).length, 2);
  const current = (await readAppointments()).find(row => row.id === 'a');
  await saveAppointment({ ...current, status: 'Cancelada' }, current);
  await saveAppointment({ ...base, id: 'c', folio: 'C' });
  assert.equal((await readAppointments()).length, 3);
  const competing = await Promise.allSettled([
    saveAppointment({ ...base, id: 'd', folio: 'D', scheduledAt: '2026-11-03T18:00:00.000Z' }),
    saveAppointment({ ...base, id: 'e', folio: 'E', scheduledAt: '2026-11-03T18:30:00.000Z' }),
  ]);
  assert.equal(competing.filter(r => r.status === 'fulfilled').length, 1);
});
test('available slots stay inside business hours including full duration', () => {
  const slots = getAvailableSlots([], '2030-11-04', 120);
  assert(slots.length > 0);
  assert.equal(new Date(slots.at(-1).value).getUTCHours(), 23);
});
