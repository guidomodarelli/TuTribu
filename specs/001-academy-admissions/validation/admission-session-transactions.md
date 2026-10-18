# Transacciones de sesión en la confirmación

## Alcance

T200 y T209 permanecen pendientes. El cambio conserva la proyección inicial de cuenta del caso de uso y las revalidaciones SQL del writer dentro de las fases originales de claim y efecto. Evita abrir otra transacción de cuenta antes de cada fase: los identificadores se obtienen de la fuente nativa del servidor y se comparan con usuario/sesión del ámbito original.

La composición mantiene el ejecutor backend seleccionado por el owner y su guard de abandono. El contexto mínimo no usa un correo cacheado ni acepta identificadores del cuerpo HTTP. Los proveedores alternativos del puerto de cuenta conservan la proyección completa. No se modifican leases, timeouts, clocks, política, cuota ni criterios de aceptación.

## Protocolo nativo

`tests/unit/modules/academy-admissions/infrastructure/admission-request-session-transactions.test.ts` usa el journal real y una rama Neon propia. Contrasta el resultado confirmado con los eventos nativos del pool, recupera el original sin duplicar solicitudes y revoca o cambia la identidad de sesión después del commit de claim. Las comprobaciones del writer deben impedir todo efecto posterior en esos tres casos. Las cuentas son sintéticas y no se hacen envíos reales.

La primera ejecución detectó una expectativa incorrecta del test sobre la forma del resultado: la respuesta pública contiene `value.state` y `value.result`, y el replay tiene su indicador propio. Se corrigió el test contra ese contrato existente, sin cambiar el producto. El registro se conserva en `.git/admission-session-transactions-before.json`.

La reproducción previa corregida falló con `expected 5 to be 3`, en `.git/admission-session-transactions-red.json`. La ejecución posterior pasó: tres adquisiciones y tres liberaciones para la solicitud original, replay del mismo resultado y rechazo por sesión revocada, cambio de usuario y cambio de sesión después del claim. SQL confirmó una sola solicitud, ninguna membresía de esos participantes y cero entregas. Registro privado: `.git/admission-session-transactions-after.json`.

Los 719 casos ordinarios seleccionados pasaron, con cuatro casos nativos omitidos en ese comando. Por separado pasaron cuatro regresiones SQL reales: rol y estado después de esperar una pertenencia modificada, sesión vencida durante ese lock, revocación de sesión dentro del mismo request y presentación manual telefónica OFF desde la composición real. El mismo comando repitió la prueba ordinaria de coalescencia de identidad, dando cinco casos aprobados y veintiséis fuera del filtro; no se cuentan los omitidos como ejecutados. Ambos tipos y lint pasaron.

El [reporte saneado](admission-session-transactions.json) conserva base e inputs con huella, la reproducción roja y las ejecuciones verdes. El build real de Next pasó, con registro privado en `.git/admission-session-build.log`. La carga completa se repetirá sobre el commit publicado; el gate de latencia conserva su validación independiente y este avance no cierra T200/T209.
