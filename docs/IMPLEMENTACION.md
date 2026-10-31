# Entrega de ajustes de Electric Appointment Manager

El código respalda los campos y reglas de medición definidos para E3/E4. Este archivo es documentación técnica; no presenta resultados operativos ni reemplaza la metodología académica.

## Preparar el proyecto

1. Integra el contenido de este proyecto en tu repositorio local `/home/josuevillegas/pip-1` (en la subcarpeta que Vercel tenga configurada como raíz). Conserva el `.git` y las variables privadas de tu instalación.
2. Instala con el gestor configurado en Vercel. Se conserva `pnpm-lock.yaml` y se corrigió `package-lock.json`, que originalmente no contenía Neon Auth. Con npm: `npm ci`. Con pnpm: `pnpm install --frozen-lockfile`.
3. Usa Node.js 22.9 o posterior de las ramas 22 o 24. Ejecuta `npm test`, `npm run typecheck` y `npm run build`. El build necesita las variables de Neon Auth, aunque las pruebas aisladas no las usan.
4. Revisa los cambios, crea tu commit y súbelo a la rama conectada a Vercel. Confirma que el nuevo despliegue corresponde a ese commit.

El paquete de entrega omite `node_modules`, `.next`, `.git`, credenciales privadas y bases SQLite. Incluye `.env.example`. Los registros históricos incluidos en `data/appointments.json` provienen del ZIP original; se importan exclusivamente en desarrollo y no se validaron como evidencia real. Producción exige PostgreSQL y no importa ese archivo.

## Variables privadas

En el proyecto Vercel conserva `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `STAFF_EMAILS`, `DATABASE_URL`, `AI_GATEWAY_API_KEY` y, si aplica, `JEV_MODEL`. Revisa que correspondan al entorno correcto. No uses los valores de prueba de una compilación local como credenciales de producción.

Las operaciones de edición y reclasificación requieren `expectedRevision`, obtenido de la cita leída. La revisión aumenta al guardar; se rechazan fichas obsoletas con 409. Los registros antiguos comienzan en revisión cero.

Los nuevos campos se guardan en el JSON `payload` de cada cita; no se requiere rellenar fechas históricas ni ejecutar una migración de esos campos. Los registros previos sin primera confirmación/llegada quedan sin evidencia temporal suficiente. El arranque mantiene la creación de tabla, extensión y restricción que ya tenía el MVP; debe verificarse su existencia en la instancia efectiva.

## Comprobar agenda en Neon

1. Usa una rama de pruebas de Neon y una instalación de pruebas; evita ingresar escenarios ficticios en la muestra operativa.
2. Después de inicializar la aplicación contra esa rama, ejecuta `npm run check:database` con sus variables. El comando es de solo lectura y comprueba extensión y restricción de intervalos.
3. Intenta confirmar simultáneamente dos solicitudes distintas con intervalos superpuestos: solo una debe confirmarse y la otra responder 409. Prueba intervalos adyacentes: ambos deben admitirse.
4. Cancela una cita y comprueba que su espacio queda disponible. Reprograma una confirmada y verifica que conserva `firstConfirmedAt`.
5. Al llegar al domicilio, selecciona En servicio. Comprueba `arrivedAt` y `arrivalScheduledAt`. Después completa el servicio y verifica que sigue visible en Servicios.
6. Comprueba el acceso sin sesión a citas, métricas y reclasificación: debe rechazarse.

Las pruebas automatizadas incluidas verifican concurrencia e integridad con SQLite. No sustituyen esta validación contra PostgreSQL/Neon ni una prueba real de autenticación.

## Recuperación y dependencias externas

Antes de la entrega final, verifica los planes, límites y opciones de recuperación realmente habilitados para la cuenta de Neon. En un entorno aislado, realiza la recuperación disponible según ese plan y comprueba que reaparecen citas de referencia, estados y campos temporales. Guarda fecha, procedimiento y resultado. La recuperación ya fue comprobada en una rama aislada el 31 de octubre de 2026; la evidencia y sus límites se encuentran en `evaluacion/resultados-funcionales-2026-10-31.json`.

Verifica también las condiciones de uso y consumo de Vercel y AI Gateway y la disponibilidad real de JEV para la cuenta. No se presume un plan gratuito suficiente ni un costo fijo.

## Evidencias para evaluación

- Revisa con el técnico la selección de los 30 casos y sus referencias antes de ejecutar el evaluador. La propuesta `evaluacion/jev-matriz-propuesta.json` contiene escenarios simulados y no debe atribuirse a solicitudes reales. Conserva la matriz previa, la distribución, respuestas, coincidencias y subestimaciones. No se ha ejecutado esta evaluación con una clave real.
- Descarga `/api/metrics` durante el periodo operativo y al cierre. Puedes indicar `from` y `to`; el 6 de diciembre completo en Monterrey termina en `2026-12-07T00:00:00-06:00` (extremo exclusivo).
- El archivo exportado explica exclusiones por registro y por motivo. Para contar visitas, se consideran En servicio y Completada con llegada verificable. Las cancelaciones antes de la primera confirmación no cuentan para el promedio; las posteriores sí conservan ese tiempo.
- La llegada registrada es una marca manual en el momento de cambiar el estado. Un registro tardío afecta la medición; acuerda con el técnico el uso al llegar. La comparación histórica requiere el mismo criterio de puntualidad.
- Registra muestra, periodo y factores externos. Los resultados de pruebas de software o del clasificador local no demuestran el logro de los KPI ni los criterios de precisión de JEV.
