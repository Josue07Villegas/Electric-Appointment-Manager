# ElectroAgenda

Plataforma web para recibir solicitudes de servicios eléctricos, priorizarlas y administrar la agenda de un técnico principal. El cliente indica sus preferencias; el personal autorizado estima la duración, asigna el horario y confirma cada cita manualmente.

## Flujo de atención

1. El cliente envía sus datos, descripción del servicio y hasta tres preferencias de fecha y hora. Enviar la solicitud no reserva un espacio ni confirma una cita.
2. JEV mediante Vercel AI Gateway clasifica únicamente el tipo de servicio y la prioridad. Si JEV no está configurado o no responde, se usa el clasificador local con los mismos campos.
3. Las solicitudes pendientes se muestran ordenadas por prioridad y después por fecha de recepción.
4. El personal inicia sesión, define duración y horario y confirma la cita. El servidor impide traslapes y limita la agenda a lunes a sábado, de 9:00 a 19:00, hora de Monterrey.

La clasificación es información de apoyo. El personal conserva la decisión de programación. JEV no recomienda especialidades ni estima duraciones.

## Funciones

- Portal público adaptable a celular y escritorio, sin cuentas de cliente.
- Registro de contacto, inmueble, ubicación, descripción, señales observadas y hasta tres preferencias de horario.
- Bandeja privada de despacho, archivo de solicitudes, filtros, estados y reclasificación manual.
- Estimación de duración y asignación definitiva de fecha y hora por el personal.
- Agenda de un técnico; los conflictos se verifican en la aplicación y con una restricción de base de datos para evitar confirmaciones simultáneas traslapadas.
- Acceso del personal con Neon Auth y una lista permitida de correos (`STAFF_EMAILS`). El registro público debe permanecer deshabilitado.
- PostgreSQL mediante Neon en despliegue; SQLite en desarrollo local. Los datos JSON se importan solo en desarrollo, nunca al iniciar producción.

No se incluyen cuentas de cliente, notificaciones automáticas, pagos, facturación, varios técnicos ni aplicaciones móviles nativas.

## Requisitos y desarrollo local

- Node.js 22.9 o posterior de las ramas 22 o 24.
- pnpm, Bun o npm.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

La aplicación queda disponible en `http://localhost:4173`; el formulario público está en `/solicitar` y el despacho en `/`.

## Variables de entorno

Copia `.env.example` a `.env.local` y configura:

| Variable | Uso |
| --- | --- |
| `NEON_AUTH_BASE_URL` | URL de la instancia Neon Auth del proyecto. |
| `NEON_AUTH_COOKIE_SECRET` | Secreto privado de al menos 32 caracteres para cookies de sesión. |
| `STAFF_EMAILS` | Correos autorizados separados por coma. El MVP autoriza `pepitovillegas07@hotmail.com`. |
| `AI_GATEWAY_API_KEY` | Clave del servidor para Vercel AI Gateway; sin ella funciona el clasificador local. |
| `JEV_MODEL` | Modelo JEV, por defecto `typesafe-ai/jev`. |
| `DATABASE_URL` | Cadena PostgreSQL de Neon para Vercel. |
| `SQLITE_DB_PATH` | Ruta SQLite de desarrollo; por defecto `data/electroagenda.db`. |

Configura las variables privadas en la configuración del proyecto de Vercel. No incluyas secretos en Git. Crea la cuenta de personal autorizada en Neon Auth y mantén deshabilitado el registro público.

## Persistencia

El almacén conserva la estructura de solicitudes existente y agrega preferencias, duración y validación de traslapes. La tabla se inicializa en la primera solicitud. En PostgreSQL se instala `btree_gist` y se crea una restricción de exclusión temporal; en SQLite se crean triggers equivalentes. Los registros existentes se normalizan al leerlos y se conserva su fecha confirmada.

## Contenedor Docker

La imagen usa la salida `standalone` de Next.js e instala dependencias durante la construcción:

```bash
docker build -t electroagenda .
docker run --rm -p 3000:3000 --env-file .env.local electroagenda
```

Para el contenedor se requiere PostgreSQL accesible desde ese entorno. Neon funciona como base administrada; el archivo SQLite local no es almacenamiento persistente adecuado para contenedores efímeros.

## Rutas API

| Método | Ruta | Acceso | Uso |
| --- | --- | --- | --- |
| `GET` | `/api/availability` | Público | Horarios de referencia para preferencias del cliente. |
| `POST` | `/api/appointments` | Público | Crear solicitud pendiente. |
| `GET` | `/api/appointments` | Personal | Consultar y filtrar solicitudes. |
| `GET`, `PATCH` | `/api/appointments/:id` | Personal | Consultar o administrar solicitud y cita. |
| `POST` | `/api/appointments/:id/reclassify` | Personal | Repetir clasificación de tipo y prioridad. |
| `GET` | `/api/metrics` | Personal | Exportar indicadores, periodos y exclusiones sin datos de contacto. |
| `GET` | `/api/stats`, `/api/config` | Personal | Indicadores operativos y configuración visible al despacho. |
| `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | `/api/auth/*` | Neon Auth | Inicio y cierre de sesión. |

## Comprobaciones locales

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Ajustes de medición y agenda

- `createdAt` se registra al recibir la solicitud, antes de consultar JEV.
- `firstConfirmedAt` se asigna en la primera confirmación y se conserva en cancelaciones posteriores y reprogramaciones. No se reconstruye a partir de `updatedAt` en registros antiguos.
- Pasar a **En servicio** registra la llegada actual en `arrivedAt` y congela el último inicio acordado en `arrivalScheduledAt`. El personal debe hacerlo al llegar al domicilio. No es geolocalización ni detección automática de presencia.
- Una visita iniciada o cerrada no permite cambiar el horario. Las citas completadas y canceladas permanecen en el historial. Debe pasarse por En servicio antes de completar una visita nueva.
- El panel muestra promedios, porcentajes, muestras válidas y exclusiones. Sin observaciones válidas se muestra «Sin datos»; nunca se presume una mejora.
- El listado API y el archivo usan prioridad y recepción para pendientes, y horario para el resto. Los folios nuevos usan un sufijo aleatorio para evitar competir por el mismo consecutivo.
- Cada operación persiste solamente su cita y comprueba atómicamente el registro leído; el navegador envía `expectedRevision` en actualizaciones y reclasificaciones. Una ficha obsoleta o una modificación simultánea responde 409; sin versión responde 428. Las restricciones de intervalos siguen siendo la última defensa ante traslapes.
- Los formularios administrativos interpretan horarios en Monterrey y las preferencias disponibles deben terminar antes de las 19:00.

### Exportación de evaluación

`GET /api/metrics` requiere sesión del personal y descarga JSON sin nombres, teléfonos ni domicilios. Contiene tiempos, estados, causas de exclusión y resumen de los indicadores; los folios siguen siendo identificadores seudónimos.

Se puede limitar el periodo con `from` y `to` ISO, con extremo final exclusivo, por ejemplo:

```text
/api/metrics?from=2026-11-22T00:00:00-06:00&to=2026-12-07T00:00:00-06:00
```

Sustituye el inicio de ejemplo por la fecha real de puesta en operación. El tiempo de agendamiento selecciona solicitudes por recepción. La puntualidad selecciona visitas por llegada; para informar exclusiones usa el horario asignado o, si falta, la recepción. El archivo indica si cada registro pertenece a cada grupo.

La puntualidad considera llegada anterior o igual al inicio acordado, sin tolerancia añadida. Confirma que este criterio coincide con el utilizado en los registros históricos antes de comparar. Las referencias 30.4 minutos y 75% proceden de la especificación proporcionada; el software no certifica su origen ni la validez del Excel histórico. Las metas son máximo 19.5 minutos y mínimo 90%.

### Evaluación real de JEV

1. Copia `docs/jev-matriz-plantilla.json` a una matriz privada y completa las 30 descripciones. No contiene casos ni referencias inventadas.
2. El técnico establece las referencias, su nombre y la fecha de revisión antes de ejecutar el modelo. Deben estar representadas las cinco categorías y los cuatro niveles de prioridad; la distribución aparece en el informe.
3. Configura `AI_GATEWAY_API_KEY` y ejecuta:

```bash
npm run evaluate:jev -- matriz-privada.json resultados-jev.json
```

El comando utiliza la misma integración que la aplicación, consume el servicio y puede generar cargos. No lo ejecutes como parte del build. No envía datos a la agenda. La matriz se conserva antes de llamar al modelo y se guarda cada intento; se permite un reintento por fallo técnico y se conserva la primera respuesta válida. El informe compara la prioridad original de JEV (`rawPriority`), antes del ajuste local por señales de riesgo. Los fallbacks no cuentan como respuestas JEV. Solo acepta la evaluación si hay 30 respuestas genuinas y al menos 24 aciertos por función; informa por separado la subestimación de prioridad. Una prueba con respuestas simuladas valida el cálculo, no demuestra la precisión real de JEV.

### Despliegue y evidencias pendientes

Consulta `docs/IMPLEMENTACION.md` para instalar, redesplegar y comprobar Neon, restauración y evidencias de evaluación. Actualizar el código descargado no modifica automáticamente el sitio en Vercel.

La comparación con el documento y el alcance de las comprobaciones se encuentran en [docs/VERIFICACION.md](docs/VERIFICACION.md).

Los 16 escenarios funcionales del Anexo C y la matriz propuesta de 30 escenarios simulados para JEV están documentados en [docs/evaluacion/README.md](docs/evaluacion/README.md). La matriz JEV sigue pendiente de revisión técnica antes de ejecutar su evaluación.
