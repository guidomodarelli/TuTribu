# Matriz de cuotas, cadencia y validación local

T164 completada sobre el checkpoint `5774f3fb`. La auditoría final contrastó el criterio original íntegro y los cinco AC de US11: no encontró brechas funcionales pendientes. Se cierra únicamente T164; el recuento queda en 163 tareas completadas y 49 pendientes de 212. T165, T167 y los gates externos conservan sus criterios propios y siguen abiertos.

Los apartados siguientes conservan la secuencia de validación iniciada en `1eabf787`, incluidos los estados parciales y reportes fallidos anteriores. El contraste final y la auditoría de cierre registran el resultado vigente; ninguna prueba aislada acredita por sí sola la matriz completa.

## Incremento validado de tres canales

`tests/unit/modules/messaging/application/messaging-usage-and-abuse.test.ts` añade tres casos para correo, SMS y WhatsApp. Usa PostgreSQL propio, identidad/caso de uso actuales, dispatcher, preparación, SDK real y transporte controlado. Después de una entrega aceptada, reduce el cupo de verificación a cero y suspende la conexión; verifica localmente el código vigente, su replay y el replay de emisión sin nuevo envío. Conserva reserva consumida, intento aceptado y política ON, sin membresía ni verificación global de identidad.

La primera ejecución Native terminó con cero casos aprobados, tres fallidos y cero excluidos. Los tres casos intentaban abrir un envelope ya eliminado después de la entrega real: el error pertenecía al test y no justificaba restaurar material secreto en producción. Ese reporte permanece fallido.

Después del terminal se corrigió la prueba para capturar el código recibido por el transporte controlado sólo en una variable privada y efímera. También exige que el envelope transitorio se haya eliminado antes de validar localmente. El replay conserva el DTO original íntegro. Tipos y lint de esta versión pasaron; SHA256: `12FCA164B76D8D6C422DFD9EBE73E29EDF9E5900BB8699A2D17A9E26F2B8087B`. La revisión actualizada terminó sin hallazgos y la reejecución completa terminó con tres casos aprobados, cero fallidos y cero excluidos; cada caso confirmó también la limpieza de su rama propia. No se restaura el material secreto ni se modifica producción para el test.

La reejecución actual de cinco suites de contratos terminó con 37 casos aprobados, cero fallidos y cero excluidos: `reserve-messaging-usage`, `manage-messaging-usage-use-cases`, `read-messaging-usage-operation`, `message-dispatch` y `admission-policy-country-facts`. Ejercen casos de uso reales mediante puertos propios y temporizadores reales donde corresponde; este lote local no prueba contadores PostgreSQL ni transporte SDK.

Un segundo lote local terminó con 18 casos aprobados, cero fallidos y cero excluidos: rutas de políticas de uso, componente de configuración con UI compartida real, cliente HTTP propio, intent y continuación de reautenticación. Valida permisos/input/DTO, cambios de configuración y recuperación de la operación original con dobles en puertos propios; no sustituye el recorrido Next/Better Auth/PostgreSQL del owner de US6. Este primer incremento reunió 55 casos locales y tres Native nuevos aprobados; el siguiente apartado añade otros tres Native. En ese punto T164 permanecía abierta por el resto de su matriz original.

## Despacho nuevo con cupo cero

`messaging-zero-quota-admission.test.ts` añade tres casos de correo, SMS y WhatsApp mediante el owner actual. La solicitud confirmada se conserva, pero el worker debe diferir el despacho por cuota antes de preparar credenciales: cero llamadas al proveedor, intentos o reservas. La presentación real sin prueba sigue denegada por `additional_verification_required`; no se crean solicitud de ingreso ni membresía y la política ON conserva su versión y época.

El chequeo específico de tipos de tests, el chequeo de aplicación y lint pasaron. La revisión terminó sin hallazgos accionables; SHA256 `0296F3691E66586DDE9EFA4BEDC3A2B0508A187C7F689CAB5DB1C4B7D0442B41`. El lote Native terminó con tres casos aprobados, cero fallidos y cero excluidos, incluida la limpieza de sus ramas propias. Ese incremento sumó seis casos Native nuevos aprobados; todavía no acreditaba el resto de la matriz de T164.

## Matriz original al inicio de la auditoría

| Requisito | Cobertura localizada | Estado para esta tarea |
|---|---|---|
| Cuenta/contacto/desafío/tribu/plataforma, canales, cadencia y diagnóstico | `code-request-budget`, `contact-budget-continuity`, `credential-validation-budget`, `contact-verification-channel-failure-limits`. | Auditar casos y ejecutar los faltantes; no afirmar matriz completa. |
| Último cupo entre cien competidores | `delivery-attempts-and-usage`. | Prueba real existente localizada; falta validación actual de T164. |
| Reducción de cupo/país antes y después del marker | `delivery-attempts-and-usage`, `admission-phone-dispatch-pipeline`, `messaging-usage-policy-configuration`, nuevo `messaging-zero-quota-admission`. | Tres canales con cuota cero y ON aprobados; contrastar el resto de la matriz de reducción/countries. |
| Código conocido válido con cupo agotado y caída/suspensión | Nuevo archivo y `contact-verification-persistence`. | Nuevo incremento de tres canales aprobado; el resto de la matriz conserva su alcance. |
| Configuración temprana/CAS independientes del consumo, conexión y época | `messaging-usage-policy-configuration`, sus use cases y UI real de US6. | Reusar el owner existente; auditar versión/no-op/replay/consumo y concurrencia. |
| Cinco AC, permisos y cero fugas de US11 | Contratos/owners/rutas/UI de T165/T167 y pruebas existentes. | No se acredita mediante filas PostgreSQL o un test de compilación. |

La cuota de envío se aplica a la autorización del marker/dispatch. No se infiere que emitir un desafío con cupo agotado deba rechazarlo antes de su creación. No hay cambios de producción, SDK, schema o configuración desplegada en este incremento.

## Brechas identificadas por la auditoría inicial

La auditoría no confirmó un fallo de producción. Identificó pruebas que deben aislar el techo horario de cuenta al cambiar contacto; conservar consumo al alternar conexión/canal y sesión; agotar el bucket de verificación compartido por admisión, diagnóstico y SMS alternativo sin consumir el de avisos; y autorizar un marker con país permitido por el líder pero prohibido por la plataforma.

Para los cinco AC originales también faltaba incluir una plantilla explícita en la matriz HTTP de campos prohibidos y observar el logger/traza finales ante credencial/código y error upstream. Las pruebas locales de alcance/propósito y snapshots de autenticación global cubren AC-05; este criterio no exige repetir un ensayo OAuth externo. La carrera real de cien competidores por el último cupo de avisos estaba localizada y debía verificarse junto al resto de la matriz, sin inventar otra carrera por el nombre de la tarea. Los apartados posteriores registran la resolución y validación completa de esas brechas.

La reducción a cero con trabajo ya en cola cuenta con una prueba real en `verification-delivery-pipeline.test.ts`; el nuevo recorrido de tres canales añade la raíz de admisión y la presentación sin proof, sin duplicar implementación de producto. La reejecución de cuatro suites existentes de presupuestos terminó con 18 casos aprobados, cero fallidos y cero excluidos: cinco de solicitudes/cadencia, tres de continuidad de contacto, siete de validación de credenciales y tres de fallos por canal. Las fuentes conservaron sus hashes y la limpieza propia quedó confirmada. Este lote acredita esos contratos existentes y no elimina las seis brechas observables de la auditoría.

## Avance posterior: cuenta aislada y campos de plantilla

`account-code-request-budget.test.ts` crea seis desafíos sellados y persistidos para el mismo actor, con contactos y tribus diferentes y canales de correo/SMS/WhatsApp. La autorización de cada consumo comprueba su desafío propio actual en SQL. Los primeros cinco consumen una solicitud cada uno; el sexto se rechaza con `usage_limit_reached` cuando ningún contacto supera un evento. El replay conserva el consumo y el contacto nuevo sigue sin eventos. El fixture permite un teléfono opcional antes de crear el MAC, envelope y filas; sus defaults siguen iguales. El caso nuevo y los cinco anteriores de presupuesto terminaron con seis aprobados, cero fallidos y cero excluidos.

La matriz HTTP existente agrega `template`, `templateId` y `templateVariables` a los campos rechazados antes de la composición para emisión, validación, reenvío y aplicación de prueba. Los 76 casos del archivo terminaron aprobados, sin fallos o exclusiones. Ejercen el handler y schemas reales con dobles sólo en puertos propios; no se presentan como otro ensayo Next/PostgreSQL.

`platform-country-marker.test.ts` terminó con dos casos aprobados, cero fallidos y cero excluidos para SMS/WhatsApp: país permitido por el líder y prohibido por la plataforma antes del marcador real. Ambos observan `recipient_not_allowed`, supresión, cero preparación/RPC/intentos/reservas y desafío vigente; la configuración del líder conserva el país permitido.

Dos casos HTTP adicionales observan la salida final del logger y los headers de correlación reales ante un fallo tipado de dependencia y una excepción inesperada. Los canarios efímeros de credencial, código y causa upstream no aparecen en logs, trazas/headers ni respuesta. Se captura la consola como salida, sin mockear el logger o las librerías internas. El primer reporte de estos casos conserva un fallo de oráculo por un código inexistente del test; tras usar el contrato actual, los 78 casos del archivo pasaron sin fallos/exclusiones y los tipos específicos de tests pasaron. No se atribuye a ese lote local un envío por SDK real.

Al cierre de ese incremento seguían pendientes la continuidad del cupo al alternar conexión/canal/sesión y el bucket de verificación compartido con avisos independientes. El apartado siguiente registra el nuevo resultado del bucket. El borde final de observabilidad debe contrastarse con la integración de transporte, sin cerrar T164 por evidencia parcial.

La matriz existente `delivery-attempts-and-usage.test.ts` terminó completa con siete casos aprobados, cero fallidos y cero excluidos: países/versiones, credenciales de prueba/capacidad activa antigua, aislamiento, leases, países vacíos/prohibidos/retirados y cien competidores por el último cupo. La carrera autoriza exactamente uno y rechaza los otros 99 por cuota; después de perder al worker conserva el intento desconocido y la reserva consumida. Las fuentes permanecieron estables y la limpieza propia se confirmó. Su alcance se conserva separado de la continuidad entre conexiones/canales/sesiones y del caso de bucket que sigue a continuación.

## Bucket compartido y continuidad aprobados

`verification-quota-connection-session.test.ts` prepara dos candidatas con diagnósticos enviados realmente, activa la primera y reemplaza mediante el owner actual después de reducir el cupo al consumo observado. Una segunda sesión con binding y recencia propios intenta otro diagnóstico. El resultado esperado exige que alcance el marcador pero se difiera por cuota, sin otra preparación/RPC y sin modificar reservas, fechas o configuración de uso. No acredita por sí solo un cambio de canal.

`shared-verification-bucket.test.ts` empieza por un envío WhatsApp de admisión, verificación local y solicitud manual reales. El diagnóstico de email y la alternativa SMS explícita, después de la cadencia real observada en SQL, deben compartir el cupo agotado. Un aviso asociado a la obligación real del pedido comprueba separadamente la reserva del bucket de notificaciones; ese tramo valida el repositorio/marcador y no afirma una entrega de aviso por SDK.

Ambos archivos pasaron el chequeo específico de tipos de tests y lint y sus revisiones no encontraron hallazgos accionables. El bucket compartido terminó con un caso aprobado, cero fallidos y cero excluidos, incluida la limpieza propia: verificación queda en una reserva y el aviso añade únicamente una reserva de notificación.

La primera ejecución de continuidad terminó por timeout de validación de diez minutos y se conserva fallida. Una inspección directa con `pg` de la rama propia observó dos diagnósticos enviados, dos reservas consumidas y la segunda verificación registrada como `started`; no encontró waits de locks. Esa observación localiza la etapa, sin demostrar una causa de producto. La identidad de la rama terminada se verificó y su limpieza confirmó la ausencia. La repetición agregó fases seguras y usó el presupuesto de quince minutos de los escenarios existentes de activación; terminó con un caso aprobado, cero fallidos y cero excluidos, incluida la limpieza propia. Completó preparación, reemplazo, segunda sesión y despacho por cuota sin cambiar reservas, fechas o versión de uso. No se cambiaron deadlines del producto, producción, configuración desplegada ni estructura de base de datos.

El sender SDK real tiene además tres nuevos casos de error HTTP 503 por correo/SMS/WhatsApp, con credencial, OTP y canario privado del upstream. Capturan la consola final y comprueban el receipt y registro del transporte sin esos valores; los 16 casos del archivo terminaron aprobados, sin fallos/exclusiones, y los tipos específicos de tests pasaron. Junto al logger HTTP final ya validado, acreditan ambos bordes de salida sin mockear SDK ni logger.

`admission-dispatch-final-logger-native.test.ts` añade el borde asíncrono conectado de `createAdmissionContactVerificationRequestModule`: Next, cookie nativa, PostgreSQL y SDK reales. El transporte propio instala después del marcador un fallo de completion con canarios generados de credencial/OTP/causa en la rama de prueba; la consola final del root se observa completa y sólo se conserva su proyección safe y el resultado booleano de ausencia de canarios. La primera ejecución terminó aprobada, sin fallos/exclusiones. Verifica request/trace, `complete`/`operation_unresolved`, keys allowlisted, reserva consumida y cero membresía; no se exporta el reporter ni se modifica producción para probarlo.

La revisión encontró que el observer debía proteger también su rama negativa: ante una fuga podía copiar el valor privado al JSONL o stderr del arnés. Se corrigió para redactar scalars/keys, no reenviar ninguna salida con canarios y descartar argumentos no string como objetos `Error` con campos no enumerables. Un test local ejecuta el preload real con fugas deliberadas en JSON, strings, `Error` y objetos; terminó aprobado sin fallos/exclusiones, comprobando archivo/stdout/stderr. La reejecución del root con la versión final terminó con un caso aprobado, cero fallidos y cero excluidos. Los verdes de versiones anteriores se conservan separados y no sustituyen ese terminal final.

Las matrices actuales de configuración de uso, dispatch de verificación y países/receipts telefónicos terminaron con 23 casos aprobados, cero fallidos y cinco excluidos por el gate de navegador: ocho de configuración/CAS/recuperación, siete de verificación/SecretStore/SDK/cuota en cola y ocho de SMS/WhatsApp con países antes/después del marcador y receipts sent/delivered. Sus fuentes permanecieron estables. El mismo lote de rutas y UI de configuración temprana terminó con cinco casos aprobados, cero fallidos y ocho excluidos por el gate SQL. Comprueba entrada sin inicialización implícita, países/CAS/conflictos en Chromium y WebKit a 1280/390, recuperación original y cierre de sesión global vencida. Las cuatro capturas regeneradas se conservaron privadas y se restauraron los assets originales tras el terminal. Las exclusiones de cada fase no se cuentan como aprobadas ni se usa una fase para acreditar casos que no ejecutó.

## Contraste final del alcance original

| Criterio de T164 | Evidencia actual comprobada | Límites del resultado |
|---|---|---|
| Cinco AC de US11, cuota/cadencia/fallos por cuenta/contacto/tribu/propósito/plataforma | Presupuestos SQL 18, cuenta aislada 1 más regresión 5, matrices de canales y owners actuales. | La regresión no se vuelve a sumar a los presupuestos; el resto de tareas de seguridad/retención mantiene su criterio propio. |
| No reset al alternar conexión/canal/sesión | Reemplazo por owner actual y segunda sesión con reservas/fechas/configuración intactas; bucket admisión/diagnóstico/SMS alternativo real. | El timeout anterior se conserva rojo; sólo la repetición completa de 726,19 s acredita continuidad. |
| Reducción al despachar, países y límites efectivos | Pipeline de cuota cero en cola, países reducidos antes/después del marker, país permitido por líder pero prohibido por plataforma y ambos canales SMS/WhatsApp. | No se atribuye control de un mensaje ya iniciado ni respuesta privada del proveedor. |
| Cupo cero conserva ON y código vigente | Tres canales sin preparación/RPC ante cupo cero y presentación nativa sin prueba denegada; tres códigos realmente enviados válidos después de suspensión/cupo cero. | La admisión no modifica identidad global ni concede membresía por agotamiento. |
| Última reserva entre cien competidores | Matriz SQL real de despachos: una autorización y 99 rechazos, reserva consumida tras pérdida del worker. | No certifica latencia, tarifas ni infraestructura productiva. |
| Configuración temprana US6 y CAS separado de consumo/conexión/época | Ocho SQL del owner de uso, cinco Next/UI/HTTP, 55 contratos locales previos. | Ausencia, inicio, no-op, replay, conflicto y consumo UTC permanecen separados de la versión editable. |
| Campos de envío prohibidos y privacidad final | 78 HTTP con plantilla y logger real, 16 SDK con tres canales, root asíncrono conectado Native 1 y negativo del observer local 1. | Los canarios no llegan a archivos/stdout/stderr del arnés; no se infiere un ensayo externo de proveedor. |

Todos los lotes de esta tarea tienen terminal propio; quedan registrados los rojos iniciales del oráculo de envelope/código y timeout, las correcciones del observer y sus repeticiones completas verdes. Las exclusiones declaradas siguen fuera del recuento de casos aprobados.

## Auditoría final y cierre

| AC original de US11 | Evidencia contrastada para T164 |
|---|---|
| AC-01: conservar los límites al cambiar cuenta, contacto, tribu, canal, credencial o sesión | Presupuestos persistidos, techo aislado de cuenta, continuidad de contacto y versiones, reemplazo real de conexión, segunda sesión y bucket compartido de admisión/diagnóstico/SMS alternativo. |
| AC-02: aplicar la configuración vigente antes de despachar trabajo en cola | Cuota cero antes del marcador, países reducidos antes/después del marcador y restricciones de plataforma; un intento ya iniciado conserva su consumo. |
| AC-03: rechazar sender, destino, plantilla y contenido arbitrarios | Schemas y handlers HTTP reales rechazan los campos prohibidos antes de la composición y los puertos de envío. |
| AC-04: conservar secretos y códigos fuera de respuestas, logs, trazas y artefactos | Logger HTTP final, consola del SDK real, reporter asíncrono observado desde Next y prueba negativa del observer que protege archivo/stdout/stderr. |
| AC-05: mantener la confianza local separada de la autenticación global y otros scopes | Aislamiento por cuenta, tribu y propósito; snapshots de identidad global y credenciales BYOK sin autoridad de autenticación global. |

La revisión independiente confirmó cero brechas pendientes para el criterio completo de T164. Contrastó además el código vigente tras agotar el envío, cuota cero sin dispensar ON, una autorización entre cien competidores y configuración temprana US6 con CAS separado de reservas, consumo, conexión y época. Los 34 archivos de evidencia auditados conservaron sus hashes; el manifiesto final tiene SHA256 `37D75E8DC72B75D16AE19E22F1ACC4765C6F96396F9AD2E4588EB71457485BE3`.

El cierre no modifica comportamiento de producto ni activa producción. Los gates de hosting, proveedor, scheduling y restore siguen sujetos a sus tareas originales; T165 y T167 conservan su alcance independiente. Sólo se cambia el marcador de T164 a completada.
