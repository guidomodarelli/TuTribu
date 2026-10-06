# Base de procedencia de membresía

**Feature**: `001-academy-admissions`. **Base de trabajo**: `52359c458bc22f78721dd57e9f5277d66822dbf5`. Avance de T009/T023; no acredita OG-06 ni habilita la activación de una tribu.

## Alcance

La migración `20261005093000_guard_academy_membership_sources.sql` agrega el marcador monotónico de la tribu, el snapshot nullable `active/muted` y la referencia a un efecto básico de admisión. El owner `tribes` conserva la tabla privada de efectos mediante una factory compuesta con las tablas de decisiones y membresía; Drizzle refleja sus relaciones soportadas y SQL define consumo, revocación, RLS y tiempos diferidos.

Una primera activación necesita el marcador y la política con el mismo instante en el commit. El marcador no se borra ni cambia posteriormente; falta de policy/settings y flags del caller no restauran la vía abierta. La comprobación del marcador toma `SHARE` sobre la tribu, incompatible con la actualización de activación, y lee el tuple vigente tras esperar. Una identidad que cambia de tribu evalúa y bloquea ambos ámbitos en orden de UUID.

La guarda de membresía consume una fuente prospectiva una sola vez. El efecto coincide con decisión, solicitud, cuenta, tribu e instancia de miembro; el ciclo completo se confirma de forma diferida junto a aviso/auditoría del resultado. Una fuente no consumida no puede confirmar una aprobación y una fuente aplicada o revocada no habilita otro ingreso.

El snapshot se captura al pasar de un estado legible a una causa comercial exacta y no se sustituye desde un estado ya comercial. Los históricos NULL permanecen desconocidos. La recuperación básica exige `tribemate`, causa comercial y snapshot conocido, conservando fecha y estado legible. Un fundamento básico vigente impide que una reconciliación comercial antigua oculte esa membresía. La remoción no comercial lo revoca; borrar la instancia también lo revoca y archiva su referencia nullable, conservando la decisión.

Los selectores de academia e ingreso abierto no encaminan una tribu activada al writer legacy. El selector pago preserva el producto `membership` y excluye `academy`; esto verifica elegibilidad del selector, no un cobro real ni los writers pagos. Los predicados históricos de invitación/academia evitan subconsultas RLS recursivas sin conceder lectura o escritura de fuentes privadas.

## Reproducciones y evidencia

El baseline sin el artefacto reprodujo `42703` por los campos ausentes. La primera versión expuso un FK inmediato que impedía crear fuente y miembro en el mismo commit; se difirió esa relación manteniendo su archivo por SET NULL al borrar la instancia.

Los tres casos iniciales pasaron con PostgreSQL real. La ampliación mostró `42P17` bajo rol sin bypass: las policies de INSERT de membresía consultaban `tribes`, cuya policy de SELECT volvía a `tribe_members`. La metadata `pg_policies` de la rama propia confirmó el ciclo. Se trasladaron esos predicados a helpers de ámbito y se dieron al rol temporal únicamente los permisos de las dependencias que las policies necesitan. El caso pasó sin conceder acceso al efecto privado.

La revisión nativa detectó y se reprodujeron dos P2 adicionales: trasladar una fila histórica protegida a una tribu sin activar cambiaba identidad/fecha; una activación concurrente terminaba mientras un alta legacy seguía abierta. Se incorporaron OLD/NEW y el bloqueo SHARE, respectivamente. Las pruebas usan dos transacciones y `pg_stat_activity` filtrado por un nombre único propio para observar el bloqueo real, sin leer queries ni datos de personas.

La suite `academy-admission-cutover.test.ts` aplica los artefactos versionados, fixtures sintéticos y el helper protegido sólo en ramas Neon propias, con cleanup verificado. El export real de Drizzle emitió las relaciones compuestas entre decisión, fuente e instancia; no se usó `push` ni se aplicó SQL en default/producción.

## Pendientes completos

T009/T023 permanecen abiertos hasta completar todos sus casos y sus dependencias. Los writers de admisión/pertenencia, los dos reconciliadores, la procedencia paga legítima, el corte de todas las entradas y el preflight no se infieren de estas guardas. Las resoluciones autorizadas de históricos desconocidos, permisos de moderación, eliminación/retención y salida legítima de modo requieren sus owners y auditoría; no se agrega una UI general inexistente.

No hay una ruta de activación de este control ni un nuevo recorrido disponible. Los manuales actuales siguen describiendo los flujos operables, y la documentación arquitectónica distingue este almacenamiento de su integración pendiente. El gate de activación sigue cerrado y las tablas no conceden contenido, cursos, pagos, grants, roles ni mensajes externos.

Se conservan `spec.md`, `technical-contract.md`, checklists, identificadores normativos y las 212 tareas de la entrega completa.
