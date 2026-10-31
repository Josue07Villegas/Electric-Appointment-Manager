const test = require('node:test');
const assert = require('node:assert/strict');
process.env.AI_GATEWAY_API_KEY = 'test-only-key';
const { classifyAppointment } = require('../lib/classifier.ts');
const input = { requestedService: 'Reparación', description: 'Chispas', propertyType: 'Casa', riskSignals: { sparks: true, smoke: false, burningSmell: false, totalPowerLoss: false } };
test('JEV keeps raw priority before safety override and rejects malformed output', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => Response.json({ answers: { service_type: { choice: 'Reparación' }, priority: { choice: 'Normal' } } });
    const result = await classifyAppointment(input);
    assert.equal(result.source, 'Jev');
    assert.equal(result.rawPriority, 'Normal');
    assert.equal(result.priority, 'Crítica');
    global.fetch = async () => Response.json({ answers: {} });
    assert.equal((await classifyAppointment(input)).source, 'respaldo local');
    global.fetch = async () => { throw new Error('Offline'); };
    assert.equal((await classifyAppointment(input)).source, 'respaldo local');
  } finally { global.fetch = originalFetch; }
});
