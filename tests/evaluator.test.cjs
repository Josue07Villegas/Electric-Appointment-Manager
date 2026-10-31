const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('evaluation preserves references, checkpoints attempts and retries once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'electroagenda-evaluation-'));
  try {
    const input = path.join(dir, 'matrix.json');
    const output = path.join(dir, 'report.json');
    const mock = path.join(dir, 'mock.cjs');
    const services = ['Diagnóstico', 'Instalación', 'Mantenimiento', 'Reparación', 'Cotización'];
    const priorities = ['Crítica', 'Alta', 'Normal', 'Baja'];
    const cases = Array.from({ length: 30 }, (_, i) => ({
      id: `TEST-${i}`, description: `${services[i % 5]}|${priorities[i % 4]}`,
      expectedService: services[i % 5], expectedPriority: priorities[i % 4],
      riskSignals: { sparks: false, smoke: false, burningSmell: false, totalPowerLoss: false },
    }));
    const matrix = { reviewer: 'Prueba automatizada', reviewedAt: '2026-01-01T00:00:00Z', cases };
    fs.writeFileSync(input, JSON.stringify(matrix));
    fs.writeFileSync(mock, `
      const fs = require('node:fs');
      let calls = 0;
      global.fetch = async (url, options) => {
        const report = JSON.parse(fs.readFileSync(process.env.TEST_REPORT, 'utf8'));
        if (report.references.length !== 30) throw new Error('References not saved');
        if (++calls === 1) return new Response('', { status: 503 });
        const [service, priority] = JSON.parse(options.body).state.description.split('|');
        return Response.json({ model: 'mock-model', answers: { service_type: { choice: service }, priority: { choice: priority } } });
      };
    `);
    const args = ['--require', mock, path.resolve(__dirname, '../scripts/evaluate-jev.cjs'), input, output];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, AI_GATEWAY_API_KEY: 'mock-only', TEST_REPORT: output } });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.deepEqual(report.references, cases);
    assert.equal(report.summary.attempts, 31);
    assert.equal(report.summary.failedAttempts, 1);
    assert.equal(report.summary.accepted, true);
    assert.equal(report.rows[0].attempts.length, 2);
    assert.equal(report.rows[0].result.model, 'mock-model');
    assert.deepEqual(JSON.parse(fs.readFileSync(input, 'utf8')), matrix);
    assert.notEqual(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
