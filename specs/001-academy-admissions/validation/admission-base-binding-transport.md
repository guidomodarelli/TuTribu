# Transporte del vínculo de contacto base

T200/T209 siguen pendientes. La última cohorte completa, anterior a este cambio, conservó cien resultados correctos con p95 de 6.044,76 ms frente al objetivo estricto inferior a 3.000 ms. Esta validación funcional no acredita otra latencia.

## Cambio y límites

La migración `20261018132205_batch_base_admission_binding.sql` agrupa las lecturas de preparación y las escrituras del vínculo. `prepare_base_admission_contact_binding` conserva el orden advisory de contacto → fila del vínculo `FOR UPDATE` → existencia de filas minimizadas. El namespace advisory sigue siendo exactamente el `JSON.stringify` usado antes por el cliente; no se reconstruye con una representación JSON de PostgreSQL que pueda cambiar su hash.

Las consultas internas separadas de la función `VOLATILE` conservan snapshots nuevos en READ COMMITTED después de las esperas. El caso de borrado concurrente comprueba que una fila minimizada mientras se esperaba siga impidiendo otro reclamo del mismo contacto. El caller usa la observación de presencia de reservas de esa transacción; las rutas restantes de `assertUnreservedAdmissionContact` mantienen su búsqueda y comprobaciones anteriores.

`write_base_admission_contact_binding` inserta el vínculo cuando hace falta y luego actualiza la solicitud con su CAS, estado pendiente y vencimiento actuales. Son dos sentencias ordenadas dentro de la transacción original. Si el CAS no actualiza una fila, el owner arroja el conflicto y revierte también el vínculo recién insertado. La ruta que encuentra un vínculo propio conserva su referencia y no crea otro.

Ambas funciones son `SECURITY INVOKER`, con `search_path` fijo y tablas calificadas. No amplían grants de tablas ni reemplazan RLS. Las validaciones de contacto/captura, configuración externa, material HMAC original y actor nativo permanecen en sus owners anteriores. No se almacenan claves ni se altera login, recencia, ledger, decisiones, membresías, límites o envíos.

## Evidencia

La prueba nueva se ejecutó primero contra la implementación anterior: persistencia y conflicto pasaron, y falló únicamente el presupuesto con ocho llamadas frente al máximo de cinco. Después del cambio, tres casos Native completos aprobaron con `pg`, Web Crypto y PostgreSQL reales en ramas propias:

- `admission-base-binding-transport.test.ts`: presupuesto máximo de cinco llamadas, captura y fingerprint persistidos, contención comprobada sobre el namespace advisory original, CAS obsoleto, rollback del vínculo nuevo y la solicitud, funciones invoker/volatile y SQLSTATE `42501` con un rol sin privilegios de tablas.
- `admission-base-account-deletion-race.test.ts`: borrado físico del dueño anterior durante la espera, reserva minimizada conservada, reclamo rechazado y solicitud nueva sin efectos.
- `allowlist-admission-persistence.test.ts`: aprobación automática indivisible, vínculo y membresía únicos, lista intacta, auditoría y obligación de aviso originales, replay sin otra escritura.

Pasaron además 117 casos de elegibilidad/evidencia, tipos de producto y tests, lint y el build real de Next 16.3.4 con 56 páginas estáticas. El [resumen saneado](admission-base-binding-transport.json) conserva la referencia inicial fallida, los siete inputs funcionales y sus hashes, la estabilidad de fuente y runner durante el Native y el alcance de las verificaciones. El inventario independiente posterior confirmó sólo las tres ramas anteriores. No hubo SQL productivo ni mensajes reales.

La siguiente medición debe ejecutar las cien solicitudes originales sobre un checkpoint limpio, manteniendo el protocolo, las exclusiones y el mismo umbral de aceptación. Reducir ocho llamadas a un máximo de cinco en este tramo no demuestra que el flujo completo cumpla tres segundos.
