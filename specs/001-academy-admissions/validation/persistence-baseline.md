# Base de persistencia de admisiones

**Feature**: `001-academy-admissions`. **Base publicada**: `36df2ddfcf7e7a98e321e4c34ecf0f3ccfe2b912`. Implementación parcial de T007/T021; no acredita OG-06.

## Alcance

El SQL versionado agrega política, lista, vínculos, invitaciones, desafíos/pruebas, solicitudes/decisiones, operaciones, importación, auditoría y obligaciones internas. Drizzle refleja columnas, defaults, índices y relaciones mediante una factory del owner, compuesta con las tablas existentes desde el schema compartido. Las FKs diferidas del ciclo solicitud/decisión/canje/prueba, FORCE RLS, grants y triggers siguen siendo autoridad del SQL.

Los recursos de lista e invitación comienzan en versión 1. Un trigger verifica incremento único ante cambios efectivos y conserva la versión ante no-op. La identidad de lista, invitación, vínculo y solicitud no puede reasignarse. Los roles SQL de request tienen lecturas propias y ninguna policy de escritura; el backend debe resolver autoridad actual en sus escritores.

El CHECK de alternativa SMS exige teléfono, WhatsApp principal y verificación ON, igual que la política de dominio. Se reprodujeron la combinación OFF incorrectamente permitida y el bypass por canal NULL; el CHECK ahora produce false para canal ausente. Sin alternativa, un borrador cerrado conserva la preparación incompleta permitida por el dominio hasta la validación de activación; no se agregó una regla más estricta para ese borrador.

La transición terminal y su decisión coinciden al terminar la transacción. Emitir una decisión requiere además la obligación de su resultado y un evento de auditoría del mismo recurso/tribu. La guarda se evalúa de forma diferida para permitir ambos órdenes de inserción; su validación inicial no renueva plazos ni impone conservar avisos materializados durante toda la historia.

## Evidencia ejecutada

El baseline sin la migración reprodujo `42P01`. En ramas Neon efímeras propias, el artefacto real pasó defaults cerrado/manual/correo/OFF, FK de invitación de misma tribu, pendiente única, vínculo no reasignable, versión de lista, rechazo de edición sin incremento y de incremento sin cambios, dos CAS con un solo ganador y lectura por Drizzle real. No se escribió membresía al insertar estos registros.

Se reprodujo el INSERT de decisión huérfana permitido y se agregó la guarda diferida. Pasó su rechazo y rollback del par solicitud/decisión, el rechazo incompleto sin obligación, el commit completo de rechazo con obligación/auditoría y la prohibición de reabrirlo. La operación lógica duplicada fue rechazada por su clave compuesta. El rol sin bypass leyó exclusivamente la solicitud propia y no pudo editarla directamente. Las suites de persistencia de auth siguieron pasando con el schema compuesto.

La migración de transición de evidencia exige desafío actual verificado de propósito admisión y coincidencia de cuenta/tribu/contacto/época/conexión/versión/fecha. Se reprodujo primero un diagnóstico convertido en prueba. La prueba disponible conserva origen y quince minutos de frescura, se aplica a una solicitud exacta y no puede volver a disponible. Pasó la aplicación conjunta solicitud/prueba sin crear membresía. El canje de nominativa y su solicitud usan referencias diferidas de cuenta/tribu: se valida commit conjunto, canje repetido, cuenta distinta y prohibición de reciclar el enlace.

La revisión agregó dos regresiones de invalidación formal: un desafío verificado con invalidación registrada no emite prueba; disponible/aplicada no puede tener campos de invalidación sin pasar a `invalid`. Ese estado exige fecha/motivo y conserva la referencia aplicada; tampoco se permite borrar o modificar su invalidación. Ambos fallos se reprodujeron por separado con PostgreSQL real antes de corregirlos.

Se ejecutan las suites con `RUN_ADMISSION_SQL_TESTS=1` y `APPLY_ADMISSION_MIGRATIONS=1`, exclusivamente mediante el helper protegido. Cada ejecución crea su propia rama, utiliza datos sintéticos y elimina esa rama en `finally`. No se aplica SQL en default/producción ni se accede a secretos del proveedor.

## Composición atómica ampliada

Sobre `1974e760`, el archivo de persistencia ejerce el ledger y el colaborador real de pertenencia en una academia sintética protegida. Una aprobación confirma solicitud versión 2, decisión, efecto consumido, miembro tribemate activo, obligación de aviso, auditoría ligada a la operación y DTO mínimo del ledger. Repetir el mismo intent devuelve el snapshot confirmado sin otra decisión, miembro, fuente, aviso o auditoría.

Los dos casos de obligación faltante llegan al COMMIT diferido real: sin aviso o sin auditoría se obtiene 23514. Se revierte solicitud/decisión/miembro/fuente/obligaciones/auditoría y finalización del ledger; sólo persiste el claim previo registrado, sin resultado público inventado. La consulta read-only acredita started y no repite la mutación. No se simula la base ni el colaborador de pertenencia.

La ejecución conjunta de persistencia, proof y canje pasó seis casos SQL en tres suites sin skips, en 116,11 segundos, con fixtures sintéticos y cleanup comprobado. Lint y ambos typechecks pasaron. La revisión nativa del bloque cerró sin hallazgos accionables, con dos hashes estables y todos sus comandos finalizados. Estas pruebas completan T007; T021/T025/T039 y los writers/rutas operables conservan sus obligaciones de integración y gates.

## Pendientes

T007 está completada en su alcance de pruebas estructurales; T021 mantiene sus dependencias y cobertura de integración pendientes. Canje/prueba tienen evidencia estructural; sus use cases y autorización vigente todavía deben completarse. Los repositorios, las rutas y la autorización compleja no se infieren de estas restricciones. T016/T017 ya están completadas; T009, T013, T022–T028, T038–T043 y T048 mantienen sus obligaciones completas.

No se habilitan academias ni mensajes. Los gates de [operational-gates.md](operational-gates.md) siguen pendientes; las pruebas estructurales aisladas no cierran la validación operativa ni convierten casillas de checklist en implementación terminada. `spec.md`, `technical-contract.md` y los identificadores normativos se conservan íntegros.
