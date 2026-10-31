const { neon } = require('@neondatabase/serverless');
async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('Configura DATABASE_URL para verificar Neon.');
  const sql = neon(url);
  const rows = await sql.query("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'appointments'::regclass AND conname = 'appointments_scheduled_no_overlap'");
  if (rows.length !== 1 || !rows[0].definition.includes('EXCLUDE')) throw new Error('No se encontró la restricción de exclusión esperada.');
  const extension = await sql.query("SELECT extname FROM pg_extension WHERE extname = 'btree_gist'");
  if (!extension.length) throw new Error('Falta btree_gist.');
  console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), overlapConstraint: rows[0], btreeGist: true }, null, 2));
}
main().catch(() => { console.error('No se pudo verificar la integridad de agenda. Revisa conexión, tabla, restricción y extensión en Neon.'); process.exitCode = 1; });
