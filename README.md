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

- Node.js 20.9 o superior.
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
| `GET` | `/api/stats`, `/api/config` | Personal | Indicadores operativos y configuración visible al despacho. |
| `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | `/api/auth/*` | Neon Auth | Inicio y cierre de sesión. |

## Comprobaciones locales

```bash
pnpm typecheck
pnpm build
```
