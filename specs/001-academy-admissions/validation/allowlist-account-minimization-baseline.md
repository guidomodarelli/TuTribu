# Reserva de contacto después de eliminar una cuenta

Incremento de T111/T171 sobre `29c36d2c`. Ambas tareas permanecen abiertas: todavía falta completar la eliminación de tribu y el mantenimiento general de retención. El objetivo conserva sus 212 tareas, con 112 completadas y 100 pendientes.

## Comportamiento implementado

La migración `20261010100000_minimize_deleted_admission_contact_owners.sql` permite la eliminación física autorizada de una cuenta vinculada. La guarda comprueba la ausencia real del propietario y minimiza el vínculo: elimina contacto normalizado, cuenta y referencias personales a solicitud/prueba; conserva huella HMAC/keyId, referencia opaca, identidad del vínculo, ámbito, procedencia y fechas. Una actualización normal no puede simular la eliminación ni reactivar el vínculo. La entrada de lista conserva su estado y versión.

La operación referida por auditoría permanece con actor opaco y resultado minimizado. El efecto de membresía pierde cuenta/miembro y se retira. Las claves históricas retenidas permiten reconocer el contacto sin reconstruirlo; si falta una clave necesaria, el ámbito queda cerrado. Se protege la presentación, la emisión personal y la escritura base/local; una vista previa personal mantiene ausencia genérica ante conflicto.

Los escritores consultan la reserva después de `SELECT FOR UPDATE`. Una eliminación que termina durante esa espera no habilita otro vínculo. El escritor local confirma un rechazo en el ledger y recupera el mismo resultado al reintentar, sin consumir prueba ni modificar la solicitud.

## Evidencia ejecutada

- PostgreSQL real en ramas propias: la eliminación original falló con `23503` en `admission_binding_user_fkey`; al conservar el vínculo aparecieron las restricciones `admission_audit_operation_fkey` y `academy_admission_membership_effects_user_id_fkey`. La migración cambia los tres propietarios relacionados y preserva la referencia de auditoría. Nunca se ejecutó sobre la rama por defecto.
- `allowlist-binding-account-deletion.test.ts`: un caso verde en 99,94 s. Eliminación real, minimización irreversible, cuenta nueva con el contacto anterior rechazada, cero nueva membresía/vínculo, clave sucesora con la anterior retenida y cierre seguro al retirar una clave necesaria.
- `allowlist-local-proof-admission.test.ts`: dos casos verdes en 296,53 s. Email y teléfono ON consumen prueba local nativa, mantienen replay/entrada/versión/decisión/aviso, y permiten eliminar la cuenta conservando una reserva minimizada. No se sustituyen SDK, ORM o criptografía.
- La revisión inicial aceptó un P2: el chequeo anterior al bloqueo podía perder la minimización confirmada durante la espera. Se trasladó la comprobación después del bloqueo en los dos escritores.
- `admission-base-account-deletion-race.test.ts`: un caso final verde en 41,38 s. `pg_blocking_pids` confirma la espera real antes del commit de eliminación; el intento base rechaza el contacto, mantiene la solicitud original y deja un solo vínculo minimizado.
- `admission-proof-account-deletion-race.test.ts`: un caso final verde en 132,75 s. Emisión/verificación local reales y espera PostgreSQL; reserva única, cuenta eliminada, solicitud idéntica, prueba disponible, cero auditoría de aplicación/membresía y replay del rechazo confirmado. El primer intento detectó una expectativa incompleta de recuperación: el throw dejaba el claim started. Se preservó el contrato original de rechazo completed en el escritor, en lugar de debilitar el oráculo a progreso.
- Tipos de producto/tests y lint verdes. Tres suites focales de aplicación: dieciocho casos verdes. La CI previa al ajuste de concurrencia terminó exit 0 con 451 suites/4.621 tests verdes y build; sus 162 suites/499 casos omitidos por gates propios no acreditan integración SQL.
- Arquitectura y tres manuales modificados: Chromium/WebKit a 1280/390, dieciséis renders sin errores ni desbordes, enlaces menú/regreso/ancla/recarga, Inicio, hoja del índice, acordeones y puntos/vuelta comprobados. Los 129 enlaces locales resuelven archivo y ancla. Los verificadores estáticos de manuales terminan sin errores; las advertencias son la ausencia deliberada de URL publicada y de catálogo central de traducciones.
- Revisión final sin hallazgos accionables: HEAD `29c36d2c`, dieciséis hashes estables al inicio/final, manifiesto `16F366579FE1D3A5E6CC7D04C78530FECACEF524C82FFAA8A76682A51AAEF375`. Confirma el fix de orden y la recuperación completed del rechazo; no se lanzaron tests desde el reviewer.
- CI final exit 0 sobre el fix congelado: lint, tipos de producto/tests, 451 suites/4.621 casos verdes en 604,52 s y build exitoso; 164 suites/501 casos omitidos por gates propios. Las dos carreras PostgreSQL se ejecutaron explícitamente antes de esa CI y no se cuentan como probadas por su omisión en la suite general. Los dieciséis hashes permanecieron estables hasta su finalización.

No hay un nuevo formulario público de eliminación o reasignación, purga programada ni eliminación de tribu. Esta evidencia no cierra T111/T171 ni acredita la matriz de administración WebKit pendiente.
