# Guard del ledger y proyección de ingreso

T200/T209 siguen pendientes. La cohorte ordinaria anterior terminó con cien resultados correctos y p95 de 5.063,22 ms, todavía superior al objetivo estricto inferior a 3.000 ms. Este cambio conserva la barrera nativa y reduce transporte; requiere otra medición completa.

## Cambio y límites

La composición backend de producto declara la capacidad `batchNativeSubmissionAuthorization`. No es un flag de petición ni de navegador. El ledger recibe únicamente el ámbito de sesión seleccionado por el servidor. Sólo para la operación de presentar ingreso agrupa su lectura de `current_app_user_id()` con la proyección de ámbito/cuenta/sesión ya existente.

La sentencia conserva un `CASE` cuyo predicado compara el actor SQL con el actor del comando antes de invocar `read_locked_admission_submission_actor`. Esa función `VOLATILE` toma los locks originales; no se invoca en la rama rechazada. La comparación independiente del ledger también se comprueba al recibir la fila, antes del callback de permiso del owner. La [evaluación condicional de PostgreSQL 17](https://www.postgresql.org/docs/17/functions-conditional.html) y la prueba de la tribu bloqueada respaldan ese orden en el runtime real.

La proyección se entrega una vez al callback del owner dentro de la misma transacción y del mismo guard. Cada guard y fase vuelve a consultarla: no se cachean actor, sesión, pertenencia, permisos, configuración o claves. Las comprobaciones de material HMAC, intención original, leases y autorización posterior al efecto permanecen. Las composiciones sin esa capacidad y las otras operaciones mantienen el camino separado. No se añaden funciones SQL, grants, políticas ni cambios de almacenamiento en este trabajo.

## Verificación

El [resumen saneado](admission-ledger-native-authorization.json) conserva dos cohortes y las huellas de producto idénticas entre ellas. La primera aprobó las dos regresiones existentes de sesión y aprobación, pero falló las pruebas nuevas por dos errores del test: la expansión de un array como registro SQL (`42846`) en la consulta final de stock y el uso de `error` en lugar del campo público `failure`. El presupuesto y los resultados positivos ya se habían contrastado antes del fallo de stock. Se corrigieron únicamente esas dos pruebas y se repitieron completas: dos aprobadas, cero fallidas. No se declara una única corrida cuatro/cero.

Los cuatro casos distintos aplicables al producto comprueban:

- Dos ingresos públicos controlados, con la composición separada y agrupada, conservan estado pendiente, stock y replay original. La agrupada ejecuta cinco sentencias menos, una por cada guard del ingreso; SQL confirma solicitudes y vínculos sin membresías o entregas nuevas.
- La composición de producto con un actor SQL diferente rechaza `permission_denied` mientras otra transacción mantiene `FOR UPDATE` sobre la tribu. El timeout local de una sentencia de un segundo expondría una espera accidental. Se verifican cero lecturas de configuración privada, cero claims y cero solicitudes del actor rechazado.
- La regresión existente conserva tres checkouts/liberaciones reales y rechaza revocación, borrado de cuenta e identidad/sesión cambiadas entre commits.
- La aprobación automática conserva vínculo, membresía básica, auditoría, aviso y replay indivisibles, sin modificar la entrada de la lista.

Pasaron tipos de producto y tests, lint y el build real de Next 16.3.4 con 56 páginas estáticas. Cada cohorte conservó fuente y runner estables. El inventario independiente final confirmó las tres ramas anteriores y ningún recurso de prueba adicional. No hubo SQL productivo ni mensajes reales. La siguiente carga conserva cien participantes, capacidad, timeouts, exclusiones y el umbral original.

## Cohorte ordinaria de `def0f9fd`

El [resultado completo](admission-ledger-native-node.json) conserva Node 24.16.0, conexión directa, 2 CU y pool máximo cien, sin profiler ni observadores adicionales. Las cien solicitudes terminaron con cincuenta ingresos/cincuenta pendientes y cero fallos de comandos. Stock y replay pasaron: diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas. El pool quedó en 300 adquisiciones/300 liberaciones, sin errores, cola ni conexiones retenidas.

La única aserción fallida fue el p95 **4.971,42 ms** frente al umbral estricto inferior a 3.000 ms. La sonda mínima dio 2,75 ms; preparación y warm-up excluidos duraron 2.928,44 y 3.627,67 ms. El proceso registró 1.521,37 ms de CPU user y 391,92 ms de system, con utilización del event loop 0,401. Los p95 de transacciones de cuenta y comando fueron 544,92 y 3.793,62 ms; no se suman como latencia individual ni prueban una causa única.

Fuente y runner conservaron sus huellas, se retiraron despliegue Node y rama propios y un inventario independiente confirmó las tres ramas anteriores. No hubo SQL productivo ni mensajes reales. La medición conserva el fallo, los criterios de T200/T209 y las catorce tareas pendientes; no se declara una mejora causal ni una aceptación de latencia.
