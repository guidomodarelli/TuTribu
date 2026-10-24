# Transacciones de sesión en la confirmación

## Alcance

T200 y T209 permanecen pendientes. El cambio conserva la proyección inicial de cuenta del caso de uso y las revalidaciones SQL del writer dentro de las fases originales de claim y efecto. Evita abrir otra transacción de cuenta antes de cada fase: los identificadores se obtienen de la fuente nativa del servidor y se comparan con usuario/sesión del ámbito original.

La composición mantiene el ejecutor backend seleccionado por el owner y su guard de abandono. El contexto mínimo no usa un correo cacheado ni acepta identificadores del cuerpo HTTP. Los proveedores alternativos del puerto de cuenta conservan la proyección completa. No se modifican leases, timeouts, clocks, política, cuota ni criterios de aceptación.

## Protocolo nativo

`tests/unit/modules/academy-admissions/infrastructure/admission-request-session-transactions.test.ts` usa el journal real y una rama Neon propia. Contrasta el resultado confirmado con los eventos nativos del pool, recupera el original sin duplicar solicitudes y revoca o cambia la identidad de sesión después del commit de claim. Las comprobaciones del writer deben impedir todo efecto posterior en esos tres casos. Las cuentas son sintéticas y no se hacen envíos reales.

La primera ejecución detectó una expectativa incorrecta del test sobre la forma del resultado: la respuesta pública contiene `value.state` y `value.result`, y el replay tiene su indicador propio. Se corrigió el test contra ese contrato existente, sin cambiar el producto. El registro se conserva en `.git/admission-session-transactions-before.json`.

La reproducción previa corregida falló con `expected 5 to be 3`, en `.git/admission-session-transactions-red.json`. La ejecución posterior pasó: tres adquisiciones y tres liberaciones para la solicitud original, replay del mismo resultado y rechazo por sesión revocada, cambio de usuario y cambio de sesión después del claim. SQL confirmó una sola solicitud, ninguna membresía de esos participantes y cero entregas. Registro privado: `.git/admission-session-transactions-after.json`.

Los 719 casos ordinarios seleccionados pasaron, con cuatro casos nativos omitidos en ese comando. Por separado pasaron cuatro regresiones SQL reales: rol y estado después de esperar una pertenencia modificada, sesión vencida durante ese lock, revocación de sesión dentro del mismo request y presentación manual telefónica OFF desde la composición real. El mismo comando repitió la prueba ordinaria de coalescencia de identidad, dando cinco casos aprobados y veintiséis fuera del filtro; no se cuentan los omitidos como ejecutados. Ambos tipos y lint pasaron.

El [reporte saneado](admission-session-transactions.json) conserva base e inputs con huella, la reproducción roja y las ejecuciones verdes. El build real de Next pasó, con registro privado en `.git/admission-session-build.log`.

## Cien cuentas en el Node cercano

La carga completa sobre `a4540ec1b3e5584b01d9e635c0b176a1247e4fa0`, sin cambios de árbol, conservó las cien llamadas originales y las diez mil entradas. El [resultado saneado](admission-session-colocated-node.json) identifica el SHA256 del bundle, Node 24.16.0 y endpoint `aws-us-east-1` con mínimo/máximo de 2 CU verificados.

Se confirmaron cincuenta ingresos y cincuenta pendientes, cero fallos, cien solicitudes, cincuenta miembros básicos y cero entregas. Las adquisiciones y liberaciones bajaron de 500 a 300, con cien transacciones de cuenta y doscientas de comando. El pool conservó máximo cien, pico de espera cero y ninguna conexión retenida. La preparación duró 2.971,01 ms y el warm-up 4.009,75 ms, ambos fuera de la medición original conforme al protocolo existente.

El p95 fue 7.165,90 ms y **no cumplió** el objetivo estricto inferior a 3.000 ms. La sonda mínima dio 3,44 ms; el p95 de las transacciones de cuenta fue 452,15 ms y el de comandos 5.197,70 ms. Las cohortes de ingresos y pendientes tuvieron p95 de 7.166,15 y 7.164,16 ms. El event loop dio p95 de 101,78 ms. La reducción comprobada de transacciones no acredita el gate ni identifica por sí sola la causa de la latencia restante; corresponde profundizar el diagnóstico de las fases de comando.

El caso nativo falló únicamente en la aserción de latencia después de verificar efectos y replay del original. Su `finally` retiró la función y la rama propias; una consulta independiente confirmó que sólo permanecían las tres ramas preexistentes, conservadas. Registros privados: `.git/admission-node-host-session-measurement.json`, `.git/admission-node-host-session-vitest.json` y `.git/admission-node-host-session-cleanup.json`. T200/T209 siguen pendientes; los otros criterios y las catorce tareas abiertas conservan su alcance.
