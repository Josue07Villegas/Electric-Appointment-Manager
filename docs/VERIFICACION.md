# Verificación de la integración

La actualización integra el ZIP de Descargas fechado el 28 de octubre con el repositorio existente. El ZIP grande de la carpeta superior coincide con el código original del repositorio. Se usó como referencia de producto `Regio Instalaciones Electricas - Documento Final(8).docx`; no se modificó el documento.

## Funciones integradas

| Requisito del documento | Implementación |
| --- | --- |
| Tiempo hasta primera confirmación | `createdAt` se toma antes de JEV; `firstConfirmedAt` se conserva al reprogramar o cancelar después de confirmar. |
| Llegada y puntualidad | En servicio registra `arrivedAt` y el horario acordado `arrivalScheduledAt`; se aplica tolerancia de cero minutos. |
| Muestras y exclusiones | Panel y `/api/metrics` muestran denominadores, exclusiones, periodo y ausencia de datos. |
| Conflictos de agenda | Validación del servidor, exclusión de intervalos PostgreSQL y triggers SQLite. |
| Ediciones desde dos sesiones | Revisión enviada por el navegador y escritura atómica; una ficha obsoleta devuelve 409. |
| Observaciones e historial básico | Observaciones editables; las solicitudes y servicios cerrados permanecen consultables. |
| Evaluación separada de JEV | Prioridad original antes del ajuste por riesgo, referencias previas, persistencia por intento y un reintento máximo. Los respaldos no cuentan como aciertos. |
| Zona horaria | Formularios y visualización en hora de Monterrey. |

No se completan fechas históricas ausentes ni se convierten solicitudes antiguas en evidencia verificada.

## Comprobaciones realizadas

- 12 pruebas automatizadas: clasificación simulada, ciclo de atención, KPI, periodos y exclusiones, evaluación simulada, permisos de rutas, notas, versiones y concurrencia SQLite.
- Revisión de tipos TypeScript.
- Compilación en Vercel con las variables ya configuradas en el servicio.
- Vista previa: formulario público 200; horarios desde Neon 200; indicadores sin sesión 401; panel sin sesión 307 hacia inicio de sesión.
- Next.js actualizado de 16.3.6 a 16.4.3 y archivo de dependencias pnpm sincronizado. El runtime se limita a Node 22/24 para evitar actualizaciones automáticas a una versión mayor no probada.

Las pruebas automatizadas usan datos ficticios aislados y no son resultados operativos ni una evaluación de precisión real de JEV. No se insertaron solicitudes ficticias en producción.

## Pendientes externos

- JEV: después de la recarga realizada por el usuario el 31 de octubre de 2026, la integración respondió correctamente a una solicitud sintética: origen JEV, servicio Mantenimiento y prioridad Baja. Se configuró la clave como secreto de producción en Vercel. Esta comprobación de conexión no sustituye la evaluación humana de 30 casos. El respaldo local se conserva para indisponibilidad del proveedor.
- La muestra de 30 solicitudes del técnico sigue pendiente. La matriz incluida está vacía deliberadamente; no hay resultados reales ni metas operativas acreditadas.
- Neon: la disponibilidad respondió correctamente. Falta verificar restauración y concurrencia PostgreSQL en una rama aislada; las pruebas SQLite no sustituyen esas evidencias.
- Autenticación: se comprobó el rechazo de accesos anónimos. La sesión real del personal debe verificarse con su cuenta; no se modificaron usuarios ni contraseñas.
- El análisis de npm conserva alertas transitivas en el SDK beta de Neon Auth y sus dependencias. La aplicación delega la autenticación en Neon y no configura un servidor Better Auth propio. Las alertas no certifican por sí solas la exposición del flujo desplegado; queda pendiente una actualización compatible del SDK y su verificación de inicio de sesión. No se aplicaron actualizaciones forzadas que cambiaran la autenticación existente.

## Reproducción

Usar pnpm como gestor principal, igual que Vercel:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

La compilación necesita las variables Neon Auth. En Vercel ya están configuradas. El evaluador JEV se ejecuta aparte y requiere créditos y una matriz real revisada; no forma parte de la compilación.
