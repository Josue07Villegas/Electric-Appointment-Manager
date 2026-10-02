# ElectroAgenda

Sistema de citas y despacho para servicios eléctricos, construido con **Next.js** y preparado para operar inicialmente con un solo técnico sin cerrar el camino a una futura cuadrilla.

El proyecto combina un portal de reservaciones para clientes, una mesa de control para el técnico y un motor de clasificación que puede trabajar con la API de **Jev** o con reglas locales de respaldo.

## Problema que resuelve

Los servicios eléctricos suelen recibirse por llamadas o mensajes dispersos. Esto provoca horarios duplicados, poca información antes de la visita y dificultad para distinguir una instalación normal de una posible emergencia.

ElectroAgenda centraliza ese proceso:

1. El cliente describe la falla y selecciona un horario disponible.
2. El sistema evita cruces con otras visitas.
3. Jev —o el clasificador local— determina servicio, prioridad y especialidad.
4. El técnico recibe la orden en una mesa de despacho y actualiza su estado.

## Funcionalidades

### Portal del cliente

- Consulta de horarios disponibles en tiempo real.
- Captura de contacto, inmueble, ubicación y descripción del problema.
- Registro de señales de riesgo: chispas, humo, olor a quemado o pérdida total de energía.
- Generación inmediata de folio.
- Diseño adaptable a computadora y celular.

### Mesa de despacho

- Ruta del día y próxima orden destacada.
- Indicadores de visitas, prioridades, revisiones y cierres.
- Bandeja de triaje y archivo completo de órdenes.
- Búsqueda y filtros por estado o prioridad.
- Creación manual de órdenes.
- Estados: `Pendiente`, `Confirmada`, `En camino`, `En servicio`, `Completada` y `Cancelada`.
- Reclasificación bajo demanda.

### Clasificación inteligente

- Tipo de servicio.
- Nivel de prioridad.
- Especialidad eléctrica sugerida.
- Duración estimada.
- Indicador de revisión humana.
- Respaldo local cuando no existe una clave de Jev.

> [!IMPORTANT]
> La clasificación apoya la decisión del técnico, pero no sustituye una evaluación profesional. Humo, chispas u olor a quemado fuerzan prioridad crítica y revisión humana, incluso si el servicio externo devuelve otra clasificación.

## Tecnologías

| Capa | Tecnología |
| --- | --- |
| Aplicación | Next.js 16 · App Router |
| Interfaz | React · TypeScript · CSS |
| API interna | Route Handlers de Next.js |
| Inteligencia | API de Jev + clasificador local |
| Persistencia del prototipo | Archivo JSON |

## Arquitectura

```text
Cliente ──► /solicitar ──► API de citas ──► Agenda JSON
                                │
                                ├──► Validación de disponibilidad
                                └──► Jev / clasificador local

Técnico ──► Mesa de despacho ──► Estados, filtros y reclasificación
```

```text
app/                    Páginas y rutas del servidor
components/             Interfaz del despacho y reservaciones
lib/                    Reglas, clasificación y almacenamiento
data/appointments.json  Datos de demostración
```

## Instalación

Requisitos:

- Bun 1.3 o superior.
- Node.js 20.9 o superior (requerido por Next.js).

```bash
git clone git@github.com:Josue07Villegas/Electric-Appointment-Manager.git
cd Electric-Appointment-Manager
bun install
bun run dev
```

Abre las siguientes direcciones:

- Mesa del técnico: <http://127.0.0.1:4173>
- Portal del cliente: <http://127.0.0.1:4173/solicitar>

## Configuración de Jev mediante Vercel AI Gateway

La aplicación funciona sin credenciales mediante el clasificador local. Para utilizar Jev a través de Vercel AI Gateway, copia la plantilla y agrega tu clave:

```bash
cp .env.example .env.local
```

```env
AI_GATEWAY_API_KEY=tu_clave_de_vercel
JEV_MODEL=typesafe-ai/jev
```

El gateway usa el modelo `typesafe-ai/jev` y la ruta TypeSafe-compatible de Vercel. La clave se utiliza únicamente en el servidor y no se entrega al navegador. `.env.local` está excluido de Git.

## Comandos

| Comando | Función |
| --- | --- |
| `bun run dev` | Inicia el entorno de desarrollo en el puerto 4173 |
| `bun run typecheck` | Valida TypeScript sin generar archivos |
| `bun run build` | Crea la versión optimizada de producción |
| `bun run start` | Ejecuta la compilación de producción |

## API interna

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET / POST` | `/api/appointments` | Consultar o crear órdenes |
| `GET / PATCH` | `/api/appointments/:id` | Consultar o actualizar una orden |
| `POST` | `/api/appointments/:id/reclassify` | Volver a ejecutar el triaje |
| `GET` | `/api/availability` | Consultar horarios libres |
| `GET` | `/api/stats` | Obtener indicadores operativos |
| `GET` | `/api/config` | Consultar configuración pública |

## Persistencia y escalabilidad

El proyecto usa una capa de persistencia dual:

- En local, `@libsql/client` guarda las órdenes en SQLite en `data/electroagenda.db`.
- En Vercel, si existe `DATABASE_URL`, `POSTGRES_URL` o `NEON_DATABASE_URL`, usa Postgres mediante Neon.
- Si la base está vacía, importa automáticamente las órdenes de `data/appointments.json` una sola vez.

Para desarrollo local:

```env
SQLITE_DB_PATH=data/electroagenda.db
```

Para Vercel, crea una base Postgres/Neon y configura:

```env
DATABASE_URL=postgresql://usuario:password@host/base?sslmode=require
```

La base se inicializa automáticamente al recibir la primera solicitud. El archivo SQLite local está excluido de Git. Para una versión con varios técnicos todavía conviene incorporar:

- Base de datos transaccional.
- Autenticación y perfiles por rol.
- Calendario individual por técnico.
- Asignación automática por zona, disponibilidad y especialidad.
- Recordatorios por correo o WhatsApp.
- Historial de cambios y respaldos.

## Validación

Antes de publicar cambios ejecuta:

```bash
bun run typecheck
bun run build
```

## Autor

Proyecto de innovación desarrollado por [Josue07Villegas](https://github.com/Josue07Villegas).
