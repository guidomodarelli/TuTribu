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

## Cohorte completa y observación del mismo bundle

El [resultado de `eeac7135`](admission-base-binding-node.json) conserva dos invocaciones terminales con el mismo SHA y bundle `5b5e9b10…`, Node 24.16.0, conexión directa, 2 CU y el pool máximo cien. Ambas completaron las cien solicitudes, cincuenta ingresos/cincuenta pendientes, cero fallos de comandos y stock/replay correctos: diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas. En ambas hubo 300 adquisiciones y 300 liberaciones, sin cola ni conexiones retenidas. Ninguna pasó el objetivo estricto inferior a 3.000 ms.

El modo ordinario dio p95 **9.255,57 ms** y sonda mínima de 2,95 ms. Preparación y warm-up excluidos duraron 2.922,13 y 3.888,56 ms. Registró 969,66 ms de CPU user+system y 8.304,06 ms idle del event loop. Las estadísticas acumuladas del compute registraron cien llamadas a `stage_admission_notification_obligation` con media de 784,76 ms; su alcance incluye la invocación completa, por lo que no equivale a una cronología por solicitud.

Ante ese resultado se habilitó únicamente el observador externo de backends. Esa segunda invocación dio p95 **5.398,40 ms** y sonda mínima de 7,86 ms; preparación y warm-up excluidos duraron 2.494,70 y 3.217,01 ms. Hubo once muestras sin errores, con hasta cien backends propios. Predominó `ClientRead`; una muestra contó cuarenta esperas `LWLock/LockManager` y otras registraron `BufferContent`. No se observó la clase `Lock`. Son muestras puntuales y timestamps de PostgreSQL frente a la ventana de pared de Node, con la limitación de relojes ya documentada.

La segunda corrida, instrumentada, no sustituye la aceptación ordinaria ni permite atribuir al cambio la diferencia entre 9,26 y 5,40 segundos. La misma función de avisos registró una media acumulada de 68,97 ms en esa invocación. La variación del servidor y las esperas `LockManager` requieren diagnóstico antes de otra modificación; no se declara una causa única ni una mejora causal de latencia. Fuente y runners permanecieron estables. Se retiraron los despliegues Node y las ramas de ambas invocaciones, y el inventario independiente confirmó las tres ramas anteriores preservadas. T200/T209 y las catorce tareas abiertas conservan sus criterios.

Los dos controles completos de CI del checkpoint `eeac7135` terminaron aprobados: [run 39131808695](https://github.com/guidomodarelli/TuTribu/actions/runs/39131808695) y [run 39131813581](https://github.com/guidomodarelli/TuTribu/actions/runs/39131813581). Complementan los casos SQL opt-in ejecutados arriba; no sustituyen la aceptación de rendimiento ni los gates operativos pendientes.
