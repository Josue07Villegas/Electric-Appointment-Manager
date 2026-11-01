// Complemento PF-03: autenticar una cuenta real y comprobar su autorización.
// No cambia variables, cuentas, citas ni despliegues; solo inicia/cierra sesión.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const [phase, credentialsFile, deploymentFile, output] = process.argv.slice(2);
if (!['allowed', 'revoked'].includes(phase) || !output || fs.existsSync(output)) {
  throw Error('Uso: node scripts/qa/staff-revocation.cjs allowed|revoked credenciales.json despliegue.json evidencia-nueva.json');
}
const credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
if (!/^qa-pf03-[a-f0-9]+@example\.invalid$/.test(credentials.email) || !credentials.password) {
  throw Error('Se requiere la cuenta sintética reservada para PF-03.');
}
const base = 'https://electroagenda.vercel.app';
const jar = new Map();
const report = {
  id: 'Complemento PF-03', phase, startedAt: new Date().toISOString(),
  deployment: { id: deployment.id, url: deployment.url }, domain: base,
  status: 'en ejecución', steps: [],
  scope: 'Rutas HTTP reales del dominio de producción, cuenta sintética y lectura administrativa. Sin capturas de navegador ni constancia humana.',
  expected: phase === 'allowed'
    ? 'Inicio y sesión válidos; consulta administrativa y despacho permitidos.'
    : 'Inicio y sesión válidos; consulta administrativa 401 y despacho redirigido al login.',
};
async function request(endpoint, body) {
  const r = await fetch(base + endpoint, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; ') },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const cookie of r.headers.getSetCookie()) {
    const pair = cookie.split(';')[0]; const at = pair.indexOf('=');
    const name = pair.slice(0, at); const value = pair.slice(at + 1);
    if (!value || /max-age=0/i.test(cookie)) jar.delete(name); else jar.set(name, value);
  }
  const step = { endpoint, method: body === undefined ? 'GET' : 'POST', status: r.status };
  if (r.headers.has('location')) step.location = r.headers.get('location');
  report.steps.push(step);
  return { response: r, step };
}
(async () => {
  const login = await request('/api/auth/sign-in/email', credentials);
  assert.equal(login.response.status, 200, 'El inicio debe autenticar, no rechazar la contraseña.');
  const loginData = await login.response.json();
  assert.equal(loginData.user?.email?.toLowerCase(), credentials.email);
  login.step.authenticatedSyntheticUser = true;
  const session = await request('/api/auth/get-session');
  assert.equal(session.response.status, 200);
  const sessionData = await session.response.json();
  assert.equal(sessionData.user?.email?.toLowerCase(), credentials.email);
  session.step.activeSyntheticSession = true;
  const appointments = await request('/api/appointments');
  assert.equal(appointments.response.status, phase === 'allowed' ? 200 : 401);
  const data = await appointments.response.json();
  if (phase === 'allowed') {
    assert(Array.isArray(data.appointments));
    appointments.step.readAllowed = true;
  } else {
    assert(!Array.isArray(data.appointments));
    appointments.step.noAdministrativeData = true;
  }
  const dashboard = await request('/');
  if (phase === 'allowed') assert.equal(dashboard.response.status, 200);
  else {
    assert([302,303,307,308].includes(dashboard.response.status));
    assert.equal(new URL(dashboard.response.headers.get('location'), base).pathname, '/login');
  }
  await dashboard.response.body?.cancel();
  report.status = 'aprobado';
})().catch(error => {
  report.status = 'fallido';
  report.error = String(error.message).replaceAll(credentials.password, '[secreto]').replaceAll(credentials.email, '[cuenta sintética]').slice(0, 600);
  process.exitCode = 1;
}).finally(async () => {
  try { const logout = await request('/api/auth/sign-out', {}); await logout.response.body?.cancel(); }
  catch { report.logoutWarning = 'No se pudo confirmar el cierre HTTP.'; }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, phase, error: report.error }));
});
