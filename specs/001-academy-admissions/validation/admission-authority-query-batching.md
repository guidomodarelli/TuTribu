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

El [reporte saneado](admission-authority-query-batching.json) conserva la base, seis huellas de inputs, resultados previos/posteriores y el ajuste del arnés. Son once regresiones SQL funcionales distintas aprobadas: nueve de los archivos completos y dos de composición/recencia, con sus omisiones separadas. Una lectura independiente confirmó sólo las tres ramas preexistentes. La carga completa se repetirá sobre el commit publicado antes de dar por acreditada una mejora de latencia.
