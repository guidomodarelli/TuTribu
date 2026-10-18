# Ámbito y actor actuales en un viaje

T200/T209 siguen pendientes. La última observación del bundle anterior mantuvo cien resultados correctos y p95 instrumentado de 5.528,54 ms, todavía superior al objetivo estricto inferior a 3.000 ms. Esta validación funcional no reemplaza la próxima cohorte completa.

## Cambio y límites

La migración `20261018134746_read_submission_actor_with_scope.sql` extrae la sentencia original del fence a `lock_academy_admission_membership_scope`. Conserva actor nativo no vacío, tribu compartida y advisory por solicitante para ingreso propio, y tribu exclusiva para otro beneficiario. El adapter sigue proporcionando el namespace canónico de `ACADEMY_ADMISSION_APPLICANT_LOCK_DOMAIN`; se conserva su representación `jsonb_build_array(... )::text`, sin convertirla al JSON del cliente usado por otros locks.

`read_locked_admission_submission_actor` toma ese mismo fence, el lock compartido de cuenta y luego el contexto actual de sesión/pertenencia. Sus sentencias `VOLATILE` conservan snapshots nuevos después de las esperas en READ COMMITTED. Ambas funciones son `SECURITY INVOKER`, con `search_path` fijo y referencias calificadas; no añaden grants de tablas ni excepciones de RLS. El resultado distingue ámbito ausente de autenticación no disponible y contiene únicamente el actor que ya consumía el writer.

La composición de producto usa esa lectura para cada autorización de una presentación. Las composiciones que sólo aportan el fence conservan la ruta separada, y las acciones administrativas mantienen su lock y evaluación anteriores. El ledger sigue comprobando por separado el actor SQL antes de invocar al owner: no se omite esa barrera ni se cachean cuenta, sesión, pertenencia, permisos, configuración o claves. Identidad Google, recencia sensible y elegibilidad permanecen con sus owners actuales.

## Verificación

Se ejecutaron seis casos Native completos con `pg`, sesiones, transacciones y locks reales en ramas propias. Diez casos del archivo de autorización quedaron fuera del filtro; no se presentan como ejecutados. El [resumen saneado](admission-submission-actor-context.json) conserva la selección exacta y los ocho inputs funcionales con fuente y runner estables.

- La referencia separada hizo dos llamadas; la lectura agrupada devolvió el mismo actor en una. Conservó el namespace advisory original y observó una pertenencia confirmada durante sus esperas advisory y de cuenta. Cerró ámbito ausente, sesión cruzada y sesión vencida durante la espera; un rol sin privilegios recibió SQLSTATE `42501`. Se comprobaron invoker y volatilidad de ambos helpers.
- Los tres casos del fence conservaron serialización del mismo solicitante, bloqueo de cambios de tribu, fence exclusivo administrativo, ausencia cerrada y liberación al rollback.
- La regresión de sesión conservó tres checkouts/liberaciones reales y rechazo de revocación, borrado de cuenta o identidad/sesión cambiadas entre commits.
- La aprobación automática conservó vínculo y membresía únicos, auditoría, obligación de aviso, lista intacta y replay del original.

Pasaron tipos de producto y tests, lint y el build real de Next 16.3.4 con 56 páginas estáticas. El inventario independiente posterior confirmó sólo las tres ramas anteriores. No hubo SQL productivo ni mensajes reales. La reducción de viajes de este tramo no acredita por sí sola el p95 del flujo completo, los otros criterios de T200/T209 ni los gates operativos.

## Cohorte ordinaria sobre `ab59ae0e`

La [medición completa](admission-submission-actor-node.json), sin profiler ni observadores adicionales, conservó Node 24.16.0, conexión directa, 2 CU y pool máximo cien. Las cien solicitudes terminaron con cincuenta ingresos/cincuenta pendientes y cero fallos de comandos. SQL confirmó diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas; stock y replay pasaron antes del gate de latencia. El pool quedó en 300 adquisiciones/300 liberaciones, cero errores, cero cola y cero conexiones retenidas.

El único fallo fue el p95 **5.063,22 ms** frente al mismo límite estricto inferior a 3.000 ms. La sonda mínima dio 2,26 ms; preparación y warm-up excluidos duraron 2.837,86 y 3.223,15 ms. El proceso registró 1.333,63 ms de CPU user, 328,09 ms de system y utilización del event loop 0,315. Los p95 de transacciones de cuenta y comando fueron 549,70 y 3.699,87 ms. Esos percentiles y acumulados no se suman para explicar una solicitud ni prueban una causa única de la demora.

Fuente y runner conservaron sus huellas. Se retiraron despliegue Node y rama propios; un inventario independiente confirmó las tres ramas anteriores. No se cambiaron participantes, capacidad, timeouts, exclusiones o umbral. La aceptación de latencia y las catorce tareas abiertas siguen pendientes.

Los dos controles completos de CI del código `ab59ae0e` terminaron aprobados: [run 39134204048](https://github.com/guidomodarelli/TuTribu/actions/runs/39134204048) y [run 39134208120](https://github.com/guidomodarelli/TuTribu/actions/runs/39134208120). Complementan los seis casos Native seleccionados; no sustituyen el benchmark fallido ni los gates operativos.
