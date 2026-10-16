# Preparación y sender privados del correo de grupo

Incremento parcial de T185 sobre `10b7fbb651221fdb4c005cec72179a6b29153913`. Conserva las 212 tareas originales, 181 completas, 31 pendientes y las 71 aprobaciones. T185/T186 mantienen todo su alcance. **Pruebas actuales completadas: 241 locales y 17 Native. Los tres hallazgos están corregidos y la revisión del código final termina sin hallazgos accionables. T185/T186 siguen abiertas.**

## Contrato y responsabilidades

`NotificationDeliveryPreparation` conserva proveedor nativo, credencial transitoria y el correo original completo. `PostgresAdmissionNotificationDeliveryPreparation` repite el guard de grupo/marker, compara proveedor y wire intent antes/después del SecretStore real y mantiene la identidad, destinatario, asunto, texto, idempotencia y plazo originales. La autorización final del job ocurre antes de la revalidación nativa final. El owner del grupo verifica el MAC con el último snapshot, que también exige clave de credencial vigente, entorno/época y recovery compatibles. No se inscriben claves ni se cambia el intent para sortear una denegación.

`RegisteredNotificationDeliverySender` resuelve únicamente ese proveedor y su factory opcional de avisos por correo. `ZavuNotificationDeliverySender` usa asunto/texto genéricos sin código, plantilla o fallback. El transporte SDK extraído conserva el contrato de los códigos: cliente nuevo, endpoint/headers acotados, remitente e idempotencia originales, límites existentes, cancelación, cero retries y clasificación propia accepted/rejected/delivered/unknown. Una respuesta ambigua no autoriza otro POST.

La factory privada usa SecretStore real y transacciones cortas. No retiene locks durante el SDK. La última autorización asíncrona del job precede a la última comprobación del grupo; una preferencia omitida confirmada durante esa espera cierra la preparación. El reloj nativo y la vigencia de todos los límites del marker se comprueban después del owner completo, configuración y criptografía. El ajuste mueve la consulta de reloj existente, sin añadir otro checkout o consulta de reloj. La segunda comprobación completa del owner después de las lecturas genéricas es deliberada: no se afirma reducción del número de consultas ni mejora de latencia.

## Validación y revisión en curso

| Comprobación | Resultado observado | Alcance |
| --- | --- | --- |
| Local final | 241 aprobadas, cero fallidas y cero omitidas | Diez archivos completos, 2118 inputs estables; incluye los 68 casos del transporte/registro, sin sumarlos otra vez |
| Tipos de producto/tests y lint finales | Correctos | Checks reales del corte final de dieciocho TS; lint del repositorio completo |
| Native previo a los dos fixes | Nueve y cuatro aprobados, sin fallos u omitidos | Cuatro archivos completos, 2110 inputs por cohorte, fuentes estables y handles consumidos; no acredita el código corregido |
| Primera revisión | Dos P2 aceptados | Opt-out durante la autorización final y material del payload cambiado sólo en el último snapshot |
| Reproducciones anteriores al fix | Cero aprobadas, tres fallidas y cero omitidas | Un archivo completo, 2109 inputs estables, productor consumido; las tres operaciones continuaron en lugar de rechazar |
| PostgreSQL tras los dos primeros fixes | Dieciséis aprobados, sin fallos u omitidos | Nueve de preparación/OTP, cuatro guards y tres regresiones de preferencia/material; cinco archivos completos, fuentes estables y productores consumidos. Baseline anterior al ajuste de vigencia; excluido del resultado final |
| Segunda revisión | Los dos P2 anteriores corregidos; un P2 adicional | Mismo reviewer. La vigencia genérica se comprueba antes de la última pasada completa del owner |
| Primer ensayo de vigencia | Cero aprobados, uno fallido, sin omitidos | Rechazo de clase distinta de la esperada; no demuestra continuación del envío. Se conserva como intento inconcluso del fixture |
| Reproducción de vigencia con espera acotada | Cero aprobadas, una fallida y cero omitidas | Un archivo completo, 2109 inputs estables y productor consumido; la operación SDK continuó con el marker genuinamente vencido |
| PostgreSQL final | Diecisiete aprobados, cero fallidos y cero omitidos | Seis archivos completos: nueve de preparación/OTP, cuatro guards y cuatro regresiones; 2110 inputs estables por cohorte, sin filtros y productores consumidos |
| Revisión del código final | Cero hallazgos accionables | Mismo reviewer; dieciocho fuentes, siete normativos, sesenta de contexto y veintiséis recibos estables; no sustituye las cohortes Native separadas |
| Documentación y entorno | Doce vistas y 180 enlaces de arquitectura correctos; cero temporales propias | Chromium/WebKit a 390/1280, recursos heredados iguales y tres ramas originales conservadas según el inventario oficial; las ajenas se preservan |

Las cuatro cohortes finales suman **258 casos actuales distintos en dieciséis archivos completos**, con ordinal para los casos parametrizados y sin repetir archivos entre cohortes. No se suman los trece o dieciséis casos Native de los baseline anteriores, sus 241 locales ni el intento de vigencia inconcluso. Los tres procesos Native finales fueron consumidos; sus fuentes actuales coinciden.

El primer intento SDK tuvo 49 casos aprobados y 19 fallidos: cinco assertions nuevas usaban una propiedad inexistente `blocked` en lugar de `deniedRequests`. Se corrigieron sólo esos tests; la repetición pasó 68 casos en tres archivos, ya incluidos en los 241 locales. Ese fallo no acredita una reproducción SQL ni un defecto del transporte de producto.

Las reproducciones de revisión usan PostgreSQL, SecretStore y criptografía reales, con datos sintéticos. El primer caso cambia realmente la preferencia mientras la autorización final devuelve true; el transporte SDK controlado permite detectar un POST sin contactar al proveedor real. Los otros casos miden una preparación saludable y cambian sólo el último snapshot de su puerto propio, sin hardcodear su ordinal ni analizar el texto del código. Las assertions y recibos proyectan sólo clasificación segura; nunca material preparado o credenciales.

El primer ensayo de vigencia alcanzó el snapshot final y confirmó el lease vencido, pero obtuvo un rechazo diferente. La proyección inicial no guardó el código nativo: no acredita un SQLSTATE ni un POST fuera del plazo. Su espera larga ocurría dentro de la transacción y el guard compartido conserva treinta segundos de inactividad; esa protección se verificó en código, sin atribuirle un error nativo que no quedó capturado. El arnés corregido completa una entrega saludable mediante el SDK real controlado y crea otro marker legítimo. Después de que el SecretStore real libera su transacción, espera fuera de locks hasta dejar una ventana final inferior al guard original. Sólo la última lectura válida espera hasta el vencimiento. No se modifican fechas persistidas, configuración del pool o límites de producto. Las comprobaciones positivas de snapshot alcanzado y lease vencido preceden a la clasificación esperada y al contador de nuevas solicitudes del proveedor.

La reproducción corregida terminó con una operación SDK completada donde debía rechazar; el reporter abrevia el contador exacto y no se lo presenta como un dato independiente. Después se movió únicamente el reloj/lifetime del owner de preparación; el archivo de prueba y su constante conservan los bytes de ese rojo genuino. La cohorte final vuelve a ejecutar el archivo completo junto con los tres casos de preferencias y claves.

## Diseño y límites de la medición

El archivo principal del sender de códigos pasa de 79 a 54 líneas. Mensajería pasa de 9905 a 10043 y notificaciones de 4195 a 4291, con el mismo método de conteo que el baseline. No hay reducción del tamaño total: se agrega preparación y transporte privados de correo. Los seis owners compartidos de pool, autenticación y retry conservan sus bytes; una nueva búsqueda revisa diecisiete puntos del recorrido de producto y sus dependencias. El incremento usa los ejecutores guardados originales para las dos lecturas nativas y el SecretStore independiente, sin crear un pool, checkout directo o retry automático. La corrección de vigencia no añade otro executor. No se certifican p95, latencia o consultas SQL medidas.

## Alcance restante

La [arquitectura del sender privado](../../../docs/architecture/notifications.htm#admission-notification-delivery-sender) y el [contrato de extensión](../../../docs/architecture/tenant-messaging.htm#provider-extension) mantienen separados preparación de código y correo genérico. No hay migración, endpoint, scheduler o driver nuevos. Claims globales por propósito, productor protegido, selección entre tribus, recuperación auditada, mantenimiento, runs, purga y mediciones originales siguen pendientes. No cambia un recorrido público y no se altera la trazabilidad de manuales ajenos al incremento.

El [CI del checkpoint base](https://github.com/guidomodarelli/TuTribu/actions/runs/38931664745) terminó con 536 archivos/5702 casos aprobados, 301 archivos/852 casos omitidos y 55 páginas; está consumido y acredita únicamente `10b7fbb6`. El incremento actual conserva sus cohortes completas y separadas, revisión de código sin hallazgos, arquitectura validada y conciliación oficial de recursos. Los enlaces de la evidencia y el alcance original tienen su control propio. El contraste conjunto registra su dictamen aparte de estas pruebas y el nuevo checkpoint exige CI propio después de guardarlo y subirlo.
