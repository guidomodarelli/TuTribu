# Consolidación del guard actual de admisión

T200/T209 continúan pendientes. El caso completo anterior sobre `8094e9ef` conservó las cien respuestas correctas y falló el p95 con 7.013,18 ms. El umbral inferior a tres segundos no cambia y no se agregan exclusiones.

## Decisiones

- El control de actor nativo pasa de dos viajes SQL a una sentencia con `CASE`. La identidad ausente o distinta se rechaza antes de invocar el helper que bloquea tribu, sesión y pertenencia. El usuario devuelto se vuelve a comparar con el esperado.
- La presencia de cuenta del writer conserva el lock y una comprobación explícita de existencia del usuario. La proyección nativa comprueba sesión y autoridad vigentes, incluido el reloj posterior a esperas. Se retira la proyección completa de cuenta cuyo resultado sólo se usaba como booleano.
- La proyección Google y su vínculo se mantienen en los lectores de hechos que los consumen. El avance sensible de reintento conserva la lectura completa después del lock de recencia, con el mismo recurso, ventana, cuenta, sujeto y reloj. No se cachean permisos ni se alteran leases, roles, claves o clock.

La autorización y sus locks siguen en el owner de admisión; la proyección nativa existente conserva su responsabilidad de sesión y pertenencia. No hay cambios de schema, rutas ni flujo de cliente.

## Verificación

Antes de cambiar el código, la prueba de sesión pasó incluyendo eliminación del usuario después del commit de claim. La prueba adicional de actor ausente/cruzado devolvió ausencia frente a una tribu bloqueada, bajo rol sin bypass y un timeout local por sentencia. Los registros previos están en `.git/admission-authority-account-before.json` y `.git/admission-actor-guard-before.json`.

Después del cambio pasaron los nueve casos SQL reales de ambos archivos completos, sin omisiones: actor antes de locks, liderazgo canónico, no miembro y rol sin bypass, pertenencia insertada durante espera, rol/estado cambiados, vencimiento de sesión durante espera, alcance de recursos, aislamiento de cuenta y metadatos de conexión retirada; el caso de comandos conserva tres checkouts, replay sin duplicados y cierres por revocación, cambio de usuario/sesión y eliminación de cuenta. Registro privado: `.git/admission-authority-consolidated-native.json`.

Los 735 casos ordinarios seleccionados pasaron, con tres nativos omitidos en ese comando y contabilizados por separado cuando corresponde. Tipos de producto/tests, lint y build real de Next pasaron. La regresión de composición manual pasó también en SQL real.

La primera ejecución sensible detectó un acoplamiento del arnés al número de lecturas: retrasaba la segunda respuesta de cuenta y, después de retirar la proyección redundante, ese retraso ya no ocurría. Se conservan el resultado fallido y su observación en `.git/admission-authority-sensitive-regressions.json`. El observer sigue ejecutando cada consulta real y devolviendo sus filas originales; ahora retrasa la respuesta necesaria sin contar consultas previas. El servidor espera hasta superar el vencimiento real, y se conservan el rechazo `authentication_required`, metadata sin cambios, claim `started` sin resultado y ausencia de otra auditoría. La ejecución corregida pasó en `.git/admission-authority-sensitive-deadline-after.json`, incluido el posterior rechazo por invalidación de recencia. No se redujo el tiempo de espera ni se relajó el resultado esperado.

El [reporte saneado](admission-authority-query-batching.json) conserva la base, seis huellas de inputs, resultados previos/posteriores y el ajuste del arnés. Son once regresiones SQL funcionales distintas aprobadas: nueve de los archivos completos y dos de composición/recencia, con sus omisiones separadas. Una lectura independiente confirmó sólo las tres ramas preexistentes.

## Medición sobre el commit publicado

La [carga de dd551953](admission-authority-colocated-node.json) ejecutó el mismo protocolo y las cien llamadas originales sobre un árbol limpio, con runtime Node 24.16.0 cercano al endpoint PostgreSQL de 2 CU fijas verificadas en `aws-us-east-1`. El bundle pasó a `bfbf66c87e9871a5e59ad736a3c5b04bf1424e1980ff4e2fd314d31f0594fbd5`.

Se confirmaron cincuenta ingresos y cincuenta pendientes, cero fallos, diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas. El pool mantuvo máximo cien y 300 adquisiciones/liberaciones, con cero esperas y ninguna conexión retenida. La proyección completa de cuenta quedó en 400 llamadas frente a las 900 previas; su ejecución acumulada fue 194,91 ms y su promedio 0,49 ms. Se conservan los contadores acumulados como diagnóstico, sin tratarlos como latencia individual de aplicación.

El p95 fue **6.187,21 ms y no cumplió** el objetivo estricto inferior a 3.000 ms. La preparación y el calentamiento separados duraron 2.542,17 y 3.329,69 ms; la sonda mínima dio p95 de 2,53 ms. Las cien transacciones de cuenta tuvieron p95 de 340,72 ms y las doscientas de comando, 4.742,73 ms. Ingresos/pendientes registraron p95 de 6.187,86 y 6.177,39 ms, con event loop p95 de 101,32 ms.

El caso falló sólo por el umbral de latencia después de comprobar los efectos y el replay. Se retiraron función y rama propias; una lectura independiente confirmó las tres ramas preexistentes. Registros privados: `.git/admission-node-authority-measurement.json`, `.git/admission-node-authority-vitest.json` y `.git/admission-node-authority-cleanup.json`. Se conserva la evidencia previa y el gate sigue pendiente.

La CI ordinaria de ese mismo commit pasó en [push](https://github.com/guidomodarelli/TuTribu/actions/runs/39106698815) y [PR](https://github.com/guidomodarelli/TuTribu/actions/runs/39106701327). Se distingue del ensayo opt-in de latencia, cuyo resultado sigue siendo fallido; no cierra T200/T209 ni los demás gates.
