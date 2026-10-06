# Colaborador de pertenencia con decisión aprobada

**Feature**: `001-academy-admissions`. **Base de trabajo**: `2e88ae4cd0eb7eef2fa4ec34582c7b58c625c64f`. Avance de T025; conserva sus dependencias, la integración de admisión y OG-06 pendientes.

## Responsabilidad y transacción

El puerto propio `AcademyApprovedMembershipWriter` recibe únicamente tribu, cuenta y decisión. Su factory de infraestructura se liga a la transacción protegida del escritor de admisión; no obtiene otra conexión ni inicia otra transacción. `PostgresTribeAcademyAdmissionRepository.applyApprovedDecision` delega en ese colaborador. El método histórico `join` y las rutas existentes no se sustituyen en este avance.

El colaborador conserva primero una pertenencia legible `active/muted`, incluido su rol y fecha. Una nueva pertenencia es `tribemate/active`. Recupera exclusivamente `tribemate` con `blocked/payment_blocked` o `removed/subscription_inactive` y snapshot observado no nulo; restaura ese `active/muted` sin cambiar identidad ni fecha. Conducta, remoción administrativa, privilegios comerciales históricos y snapshot desconocido permanecen bloqueados.

Para crear o recuperar exige actor vigente, política activada y abierta, marcador persistente, decisión aprobada del mismo scope, versión/época actuales y solicitud aún vigente. La decisión manual pertenece al líder/guardián activo que ejecuta la operación, sin autoaprobación; una decisión de sistema corresponde a la cuenta solicitante. Los identificadores del comando no son permiso.

Toma locks sobre tribu, política, miembros y solicitud/decisión. Después de esas esperas lee settings bajo `FOR SHARE` y mantiene el modo academy hasta commit. El reloj de vencimiento se obtiene después de los locks. La fuente básica y el miembro se escriben en esa misma transacción; las guardas SQL versionadas consumen la fuente y exigen las relaciones diferidas con los demás efectos. No se crea ninguna concesión comercial.

## Evidencia ejecutada

Once casos puros de elegibilidad pasaron junto a los 111 casos existentes de admisión. Los doce casos SQL iniciales pasaron en ramas Neon propias: actor ausente o ajeno, decisión ausente, alta básica indivisible, miembro legible, recuperación de snapshot muted, restricciones no recuperables y cierre por pausa, política perdida, salida de modo o pérdida de liderazgo. La omisión de una fuente para una aprobación staged hace fallar el commit completo por FK diferida y revierte solicitud y miembro.

La revisión detectó una carrera reproducida con PostgreSQL real: otra transacción retuvo el miembro líder, cambió settings a legacy y confirmó mientras el colaborador esperaba. La primera lectura conservaba `is_academy=true` y el baseline confirmó `joined`. Después de mover la lectura protegida de settings al final de las esperas, el mismo caso devuelve `admission_closed`, revierte el staged completo y no crea miembro ni fuente. La prueba observa `pg_stat_activity` por un nombre propio y drena todos los workers antes del cleanup.

La suite completa corregida pasó sus trece casos SQL en 210,05 segundos, con eliminación comprobada de cada rama propia. La regresión conjunta pasó 164 casos: los 122 de elegibilidad y los dos archivos de componentes señalados por el usuario. Lint y ambos chequeos de tipos pasaron. La CI del HEAD base también terminó correctamente; ese resultado corresponde a la base y no sustituye la CI del siguiente commit.

## Alcance pendiente

T025 conserva pendiente la integración con el escritor autoritativo de admisión y sus dependencias. Este colaborador no evalúa por sí solo contacto, allowlist, invitación, proof, replay, recovery lock externo ni todos los efectos del dominio de admisión. El caller debe autorizar y confirmar esos efectos en el mismo commit, y manejar explícitamente el rollback de un staged rechazado. No hay un nuevo endpoint ni un flujo público habilitado.

T009/T023/T026, procedencia paga, preflight y gates operativos no quedan acreditados por estos casos. Se preservan los documentos normativos, las checklists y los identificadores. No se ejecuta SQL en default/producción ni se envían mensajes reales.
