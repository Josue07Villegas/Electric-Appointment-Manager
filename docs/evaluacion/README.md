# Evaluación funcional y preparación de JEV

El 31 de octubre de 2026 se comprobaron los 16 escenarios del Anexo C. El informe consolidado es `resultados-funcionales-2026-10-31.json`: 16 aprobados, 0 fallidos y 0 bloqueados al cierre. Los intentos iniciales y sus incidencias de laboratorio se conservan aparte.

## Alcance de la evidencia

PF-01 a PF-13 ejecutaron los handlers reales contra una rama PostgreSQL/Neon vacía e independiente, con autorización controlada por el arnés. PF-14 comprobó las rutas HTTP y el SDK reales con una cuenta sintética en Neon Auth de esa rama: consulta autenticada, cierre, rechazo sin sesión y reapertura con persistencia. PF-15 consultó JEV realmente y simuló una interrupción de red para comprobar el respaldo. PF-16 recuperó un snapshot administrado en otra rama y comparó los 17 registros y la restricción de intervalos.

Estas comprobaciones no son una evaluación visual integral, una firma de aceptación del personal ni una medición de las metas de tiempo y puntualidad con actividad real. No se insertaron escenarios ficticios en producción. La aplicación de producción no se modificó para ejecutar los ensayos.

## Los 30 casos de JEV

`jev-matriz-propuesta.json` contiene 30 escenarios simulados: seis por servicio. Las prioridades propuestas se distribuyen en seis Críticas, seis Altas, seis Normales y doce Bajas. Cada caso conserva descripción, inmueble, señales seleccionadas y justificación de la referencia propuesta.

Las referencias fueron propuestas con asistencia de IA. El técnico debe revisarlas, corregirlas y fijarlas antes de ver resultados de JEV. `reviewer` y `reviewedAt` permanecen vacíos; no se inventa su revisión. El evaluador existente rechaza ejecutar la matriz sin esos campos válidos. No se hicieron las 30 consultas ni se calculó un porcentaje de aciertos para esta matriz.

El campo `requestedService` se fija como «No especificado» para evaluar la clasificación de la descripción sin proporcionar la etiqueta esperada. Esta condición difiere del formulario público, donde se elige un servicio aproximado, y debe aprobarse o ajustarse antes de congelar la matriz. La distribución es intencional y no representa las frecuencias de operación de la empresa.

Si se conservan escenarios simulados, el Anexo B debe identificarlos como tales; no pueden presentarse como 30 solicitudes reales tomadas de la operación. Después de la revisión se guarda una copia inmutable de las referencias y se ejecuta el evaluador. Se necesitan 30 respuestas válidas de JEV y al menos 24 coincidencias por función; los respaldos y fallos no cuentan como aciertos.

## Reproducir los ensayos

Pruebas locales, sin usar datos de producción:

```bash
node --env-file=.env.local scripts/qa/functional-cases.cjs artifacts/nueva-ejecucion-local
```

El script fuerza SQLite temporal, no importa los datos JSON del repositorio y conserva evidencias por caso. Sin JEV configurado, PF-15 queda bloqueado. PF-14 y PF-16 necesitan las verificaciones adicionales reales; una reautorización simulada o una copia SQLite no se presentan como prueba completa de Neon.

Para PostgreSQL, el controlador exige `TEST_DATABASE_URL`, `TEST_NEON_PROJECT_ID` y `TEST_NEON_BRANCH_ID`. La conexión debe pertenecer a una rama aislada y la tabla debe estar vacía antes de ejecutar. Nunca se debe usar una conexión de producción. Los verificadores `auth-session.cjs` y `neon-recovery.cjs` comprueban la identidad de la rama QA y omiten credenciales de sus resultados.

El ensayo de recuperación usa exclusivamente datos sintéticos; conserva el primer intento y admite completar la verificación con `resumeFrom`. La caducidad o eliminación de recursos de laboratorio no altera la evidencia local.

Los dos entornos QA y el snapshot se eliminaron al concluir. `evidencias/limpieza-laboratorio.json` conserva la confirmación. El informe consolidado enlaza los archivos originales y sus hashes SHA-256.

## Complemento de PF-03

El 31 de octubre de 2026, en hora de Monterrey, se comprobó el retiro del permiso de una cuenta sintética existente en producción. Se agregó temporalmente su correo conservando el correo del personal, se desplegó, se creó la cuenta y se verificó acceso. Tras retirar únicamente el correo sintético y desplegar otra vez, el inicio y la sesión respondieron 200, `/api/appointments` respondió 401 sin lista de citas y `/` redirigió con 307 a `/login`. Se cerraron las sesiones del ensayo; la cuenta permanece para repetición manual. No se modificaron citas.

`complemento-pf03-2026-10-31.json` identifica los dos despliegues y los hashes de las evidencias de `evidencias/complemento-pf03`. El verificador `scripts/qa/staff-revocation.cjs` permite contrastar ambas etapas con credenciales locales, sin registrarlas en la evidencia. Esta comprobación no equivale a la constancia de revisión de pantallas del personal.
