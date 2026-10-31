// Run each suite in its own process and expose the individual node:test results.
const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');
for (const file of readdirSync(path.join(__dirname, '../tests')).filter(file => file.endsWith('.test.cjs')).sort()) {
  const result = spawnSync(process.execPath, ['--require', path.join(__dirname, 'register.cjs'), path.join(__dirname, '../tests', file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
