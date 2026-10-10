# Contratos públicos de admisión y mensajería

**Feature**: `001-academy-admissions`. **Base**: `dc9479db759481455349aef936573967b2b14a0a`. T044/T045 completan sus definiciones y boundaries; rutas, consumidores de historias y composición se completan después.

## Responsabilidades

Los schemas de input pertenecen a infrastructure/api: params de tribu/recurso, consultas paginadas y acotadas, selección/versiones/motivos explícitos, creación/configuración/importación y verificación local. Cada body es estricto y rechaza actor, email autenticado, rol, verified, host de proveedor, epoch o versión elegida para crear. El boundary real reclama cada parte antes de leerla; no valida dos veces el mismo body/query/params.

Los DTOs propios pertenecen a application/results. Sus campos allowlisted se parsean antes de response/props/consumer. Request/overview del solicitante excluyen contacto completo, contexto de revisión, evidencia detallada y motivos internos. La proyección reviewer separa declaración, captura Google y código local por kind/source/time/scope; conserva restricciones nominativas mínimas sin token, nombre interno de invitación o destinatario ajeno. La audiencia la selecciona el owner después de comprobar permisos actuales, nunca un input del browser.

Outcome, operación, lote, estado de uso y verificación tienen discriminantes propios. Una admisión nueva sólo puede producir tribemate; un miembro existente conserva su rol/estado legible. Started no lleva result; completed conserva el commit original y replay, sin fingir snapshot actual. Los counts de lote/importación coinciden con filas; preview no puede acreditar outcomes/versiones confirmados. Un diagnóstico no contiene proof de admisión. Delivered pertenece al transporte y no verifica un contacto.

El catálogo incluye los catorce DTOs principales y ReviewDto del contrato HTTP; los tipos son propios. Las familias se separan en flow/management/fields para conservar responsabilidades. Params/query/CSV/página tienen límites nombrados; páginas usan default 25 y máximo 50, independientes de 10.000 filas/5 MiB de CSV. Versiones son positivas y ausencia de política de uso conserva policy NULL y defaults separados. El initialURL de invitación se liga al origen de configuración y ruta pública, sin credenciales/query/hash; sólo creación version 1 puede publicarlo, nunca replay/metadata.

No se aplica ninguno de esos schemas a filas Postgres o respuestas SDK. Los adapters consumen campos mínimos de upstream según status/estructura/discriminantes; su mapping produce resultados propios. La rule canónica permanece como única fuente de esta separación.

## Errores y progreso

Los owners conservan sus catálogos/copy español y mappings de HTTP. Allowlist/invitation/usage conflicts son 409; país no autorizado 422 antes de envío y suppressed antes de marker. El mapping SDK usa status antes del texto, conserva cause real privada y distingue rechazo definitivo de envío unknown. Operación indeterminada sólo puede proyectar 202 con identidad realmente registrada/started aportada por su owner; un objeto sin esa evidencia se rechaza como contrato inutilizable. El boundary shared conserva correlación/no-store/no-referrer y diagnósticos cerrados sin valores rechazados, stack, SDK body o causa pública. Cancelación intencional se propaga.

## Evidencia ejecutada

El primer rojo fue la ausencia del archivo de nuevos flow contracts; no se atribuye a SQL. Los ocho casos iniciales NativeRequest/Response/Zod pasaron. La ampliación de metadata/propósito/importación llegó a 75 casos con las fronteras existentes. La revisión encontró dos P2: ReviewDto eliminaba evidence/restrictions requeridas y preview aceptaba added/version/counts confirmados. Ambos se reprodujeron mediante respuestas reales; tras corregirlos pasaron 76 casos y tipos de tests. El mismo review confirmó los dos fixes y cerró T044/T045 sin hallazgos accionables, con 22 hashes estables, sin ejecutar tests/SQL ni editar.

La suite final pasó 83 casos en cuatro archivos sin skips/fallos en 2,24 segundos. Incluye los siete nuevos contratos de error/correlación/progreso/cancelación. Los casos de 202 prueban la estructura de metadata aportada por el owner, no constituyen prueba de registro SQL por sí solos; ese registro está cubierto por el ledger real en T039. La revisión adicional de esos tests confirmó T045 sin hallazgos y 23 hashes estables del target final. La regresión de versiones/diagnóstico pasó treinta locales en 1,57 segundos; una SQL opt-in quedó excluida explícitamente, con su evidencia anterior separada y sin atribuirle ejecución nueva. Se usaron Zod, Request/Response, SDK y DOMException reales, sin mocks de plataforma/SQL/SDK ni tests de strings de fuente.

Tipos de producto/tests y lint pasaron. Build normal con configuración original y variables sintéticas de proceso/SQL hacia loopback inaccesible: Node 24.21.0/Next 16.3.4, compilación 9,4 s, tipos 3,6 s y cuarenta páginas. Las tres páginas propietarias pasaron doce renders Chromium/WebKit a 390/1280 sin overflow horizontal, enlaces locales rotos ni errores JavaScript; se cerraron ambos browsers. Changelog y arquitectura actualizados; los manuales de recorridos disponibles no se reescriben para estas definiciones aún sin entrypoints nuevos.

## Alcance pendiente

T047 compone factories; T058/T060/T070/T086/T093/T102/T128 y otras historias conectan las definiciones con entrypoints, presenters, browser adapters y casos de uso. Un schema no prueba autorización ni una mutación implementada. No se inventan pantallas o recorridos para documentar estas definiciones; sus manuales se actualizan al integrar el flujo real. No se enviaron mensajes, se configuró un proveedor, se desplegaron endpoints o se aplicaron migraciones a default/producción.

Decisiones: [academy-admissions.htm](../../../docs/architecture/academy-admissions.htm), [tenant-messaging.htm](../../../docs/architecture/tenant-messaging.htm), [contrato HTTP](../contracts/http-api.md) y [rule del proyecto](../../../docs/conventions/payload-validation-boundaries.htm).
