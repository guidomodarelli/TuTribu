# Vinculación concurrente y originales de configuración

Incremento de T109 sobre `1cc7dae5`. Los cambios son pruebas de integración y evidencia; no cambian reglas de producto, API, UI, permisos o esquema. El objetivo general mantiene sus 212 tareas.

## Criterios y evidencia

| Criterio de T109 | Comprobación |
| --- | --- |
| Unicidad por contacto/tribu/owner | Carrera de dos cuentas nativas con pruebas locales reales del mismo teléfono; aislamiento separado de mismo correo entre tribus, sin transferir el primer owner. |
| Deshabilitar conserva vínculo y miembro | Nuevo caso concurrente y negativo previo verifican la fila de binding y la membresía básica después de cambiar la entrada a disabled. |
| Dos cuentas concurrentes | Se retiene el lock real de tribu y se observan ambos waiters mediante el grafo transitivo de `pg_blocking_pids`, antes de liberar la barrera. No se simulan SDK, ORM o filas. |
| Reimport/conflicto con edición reciente | `allowlist-import-authority-persistence.test.ts` registra conflicto después de cambiar nombre/version entre preview y confirmación; su resultado nativo aprobado está en `allowlist-import-persistence-baseline.md`. |
| Resultados por fila confirmados | SQL mixed y rollback posterior conservan veinticinco éxitos, reanudan sólo pending y concilian el original; evidencia de T115/T118 y auditoría T108/T110. |
| Dos writers CAS de la misma version | `allowlist-persistence.test.ts` ejecuta dos comandos competidores, confirma uno y conserva el rechazo original del stale; sin overwrites ni auditorías repetidas. |
| Replay tras commit perdido y cambios posteriores | El test ampliado conserva original versión uno después de editar y original versión dos después de otra edición a tres. Verifica la entrada actual independiente del resultado histórico. |
| Identidad reutilizada con otro version/payload | La misma operación con expectedVersion alterada produce `idempotency_conflict`; no reemplaza el original. |
| Input de versión no positivo | Handler con Zod real y HTTP Next nativo devuelven 400 antes de componer la mutación; evidencia `allowlist-http-baseline.md`. |

## Resultados terminales

- Tipos de tests y lint focal verdes. Tres suites locales de rutas, contrato de mutación y gestión: catorce casos verdes en 21,32 s.
- Configuración nativa previa: dos casos verdes en 191,28 s; el delta posterior se ejecuta por separado.
- Replay final ampliado: un caso seleccionado verde en 143,56 s, con el otro caso filtrado. Mantiene el resultado anterior y la entrada actual en versión tres.
- Aislamiento entre tribus: un caso verde en 106,66 s. El primer binding conserva owner tras cambiar su correo; otra cuenta con captura actual fija el mismo correo sólo en la segunda tribu y recibe conflicto al volver a la primera.
- Primera carrera: roja en 267,27 s porque el holder del arnés agotó el guard de inactividad de treinta segundos. Se conserva el guard productivo y la barrera realiza SQL periódico mientras se observan los waiters; no se amplía el límite de producción.
- Carrera con heartbeat: un caso verde en 220,79 s. Se observaron dos waiters reales del grafo de locks; sólo se confirma un propietario/membresía, el perdedor conserva prueba disponible y su rechazo original. Deshabilitar conserva el vínculo y el miembro ganador. La inspección metadata-only de la rama observó dos proofs, un request y un binding, sin waits activos al final; no se imprimieron conexión, cookies, códigos o contactos.

La revisión inicial confirmó dos P2 del arnés: heartbeat sin deadline independiente y `finally` capaz de sustituir el error primario. Se añade horizon SQL de sesenta segundos a holder/observador, statement timeout de diez segundos sólo en esas transacciones de test y rechazo de la espera inicial si falla el holder. Cleanup libera una vez y espera ambas promesas; conserva el error primario y agrega fallos de limpieza como causas separadas. No se cambia el guard idle productivo. Target inicial estable `C84F810899A4588713020D4B8D103BEE56B2128DD5CA4E8275B2C46E3FC6F435`; se repitieron revisión y carrera sobre los fixes antes del cierre de T109.

La revisión de los fixes cerró sin hallazgos accionables y tres hashes estables, target `A32AD18A989203DD3EF6F2207F0F2EE8B1D61EAB8123279D24BD724D25B302DA`. Verificó las ramas de deadline/adquisición fallida y preservación del error primario; no se afirma que la ejecución feliz por sí sola pruebe todas las fallas del arnés.

La carrera final terminó verde en 227,04 s, con cleanup de su rama propia. Los owners de configuración, importación y reporte permanecen sin cambios desde la evidencia nativa T115/T117/T118; sus pruebas de edición reciente, resultados confirmados y boundary de versiones siguen siendo aplicables. Todas las cláusulas de T109 cuentan con evidencia concreta en la tabla anterior y la tarea se marca completa: 106 completadas y 106 pendientes de 212.

Como este incremento modifica sólo tests/evidencia, no cambia changelog, arquitectura, manuales o capturas de producto. No se repite el build ni la CI completa del código productivo sin cambios; se ejecutaron tipos de tests, lint y las pruebas locales/nativas correspondientes. T107 conserva la muestra persistida de mil contactos, T111 la minimización/retención restante y T113 la matriz personal; no se cierran por esta validación de T109.

Los ensayos usan solamente ramas Neon efímeras propias y los comandos reales del módulo. Emisión/verificación/envelope/MAC son reales; no se hace un RPC de mensajería productiva ni se modifican login, recuperación o vinculación global. La prueba concurrente debe conservar la prueba disponible del perdedor, sin request, miembro o reasignación.
