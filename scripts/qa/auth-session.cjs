const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const [branchFile, urlFile, authFile, output] = process.argv.slice(2);
if (!output || fs.existsSync(output)) throw Error('Indica una ruta de evidencia nueva.');
const branch = JSON.parse(fs.readFileSync(branchFile));
const database = fs.readFileSync(urlFile, 'utf8').trim();
const auth = JSON.parse(fs.readFileSync(authFile));
if (!branch.branch.name.startsWith('qa-pf-') || branch.branch.default || new URL(database).hostname !== branch.endpoints[0].host || !auth.base_url.includes(branch.endpoints[0].id)) throw Error('La conexión y autenticación deben pertenecer a la misma rama aislada.');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'electroagenda-auth-pf14-'));
const email = `qa-${crypto.randomUUID()}@example.invalid`;
const password = crypto.randomBytes(28).toString('base64url');
const base = 'http://127.0.0.1:4782';
const log = fs.openSync(path.join(scratch, 'servidor.log'), 'w');
const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '4782'], { cwd: root, detached: true, stdio: ['ignore', log, log], env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: database, POSTGRES_URL: '', NEON_DATABASE_URL: '', DATA_FILE: path.join(scratch, 'no-seed.json'), NEON_AUTH_BASE_URL: auth.base_url, NEON_AUTH_COOKIE_SECRET: crypto.randomBytes(48).toString('hex'), STAFF_EMAILS: email, AI_GATEWAY_API_KEY: '', NEXT_TELEMETRY_DISABLED: '1' } });
const jar = new Map();
const report = { id: 'PF-14', startedAt: new Date().toISOString(), branch: branch.branch.id, status: 'en ejecución', environment: 'Next.js local y Neon Auth real de una rama aislada, con PostgreSQL real', actor: 'Ejecución automatizada asistida por Codex', credentials: 'Cuenta sintética temporal; valores de acceso omitidos de la evidencia', steps: [], scope: 'Prueba de las rutas HTTP y del SDK real de sesión. No es una prueba visual del navegador ni usa cuentas de producción.' };
async function request(endpoint, body) {
  const r = await fetch(base + endpoint, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; ') }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  for (const cookie of r.headers.getSetCookie()) { const pair = cookie.split(';')[0]; const at = pair.indexOf('='); const name = pair.slice(0, at); const value = pair.slice(at + 1); if (!value || /max-age=0/i.test(cookie)) jar.delete(name); else jar.set(name, value); }
  const payload = await r.json().catch(() => ({}));
  report.steps.push({ endpoint, status: r.status });
  if (r.status >= 400 && r.status !== 401) throw Error(`${endpoint}: ${r.status} ${payload.message || payload.error?.message || payload.error || ''}`);
  return { status: r.status, body: payload };
}
(async () => {
  let ready = false;
  for (let i = 0; i < 60; i++) { if (server.exitCode !== null) throw Error('El servidor de prueba terminó antes de iniciar.'); try { const r = await fetch(base + '/login'); if (r.ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  assert(ready, 'El servidor no inició en el tiempo previsto.');
  const registered = await request('/api/auth/sign-up/email', { name: 'Personal sintético de laboratorio', email, password }); assert.equal(registered.status, 200);
  const first = await request('/api/appointments'); assert.equal(first.status, 200); const completed = first.body.appointments.find(item => item.status === 'Completada' && item.arrivedAt); assert(completed);
  assert.equal((await request('/api/auth/sign-out', {})).status, 200);
  assert.equal((await request('/api/appointments')).status, 401);
  assert.equal((await request('/api/auth/sign-in/email', { email, password })).status, 200);
  const reopened = await request('/api/appointments'); assert.equal(reopened.status, 200); const persisted = reopened.body.appointments.find(item => item.id === completed.id); assert(persisted);
  for (const field of ['folio', 'status', 'firstConfirmedAt', 'arrivedAt', 'arrivalScheduledAt', 'notes']) assert.equal(persisted[field], completed[field]);
  report.evidence = { persistedId: completed.id, status: persisted.status, reception: persisted.createdAt, firstConfirmedAt: persisted.firstConfirmedAt, arrivedAt: persisted.arrivedAt, arrivalScheduledAt: persisted.arrivalScheduledAt, rowsBefore: first.body.appointments.length, rowsAfter: reopened.body.appointments.length };
  assert.equal((await request('/api/auth/sign-out', {})).status, 200);
  report.status = 'aprobado'; report.observed = 'Una sesión real fue cerrada y abierta nuevamente; el servidor rechazó la consulta sin sesión y conservó los datos del servicio completado.';
})().catch(error => { report.status = 'fallido'; report.error = String(error.message).replaceAll(password, '[secreto]').replaceAll(database, '[conexión privada]').slice(0, 1500); process.exitCode = 1; }).finally(() => { report.finishedAt = new Date().toISOString(); fs.writeFileSync(output, JSON.stringify(report, null, 2)); try { process.kill(-server.pid, 'SIGTERM'); } catch {} fs.closeSync(log); console.log(JSON.stringify({ id: report.id, status: report.status, error: report.error, log: path.join(scratch, 'servidor.log') })); });
