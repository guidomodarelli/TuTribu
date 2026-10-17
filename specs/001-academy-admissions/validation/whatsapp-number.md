# WhatsApp declarado para revisión humana

FR-143–FR-146 y WA-01–WA-05 amplían el contrato. T213–T216 están completas; T217 conserva el cierre de recorridos reales y manuales pendientes. Las 71 aprobaciones originales no certifican esta ampliación.

## Contrato y decisiones implementadas

El nombre sigue perteneciendo a la cuenta; no hay campos nuevos de nombre/apellido. La política agrega `requiresWhatsappNumber`, inicialmente `false`. El número internacional se conserva en la solicitud, separado del contacto principal, su evidencia, binding y teléfono global. Cambiar sólo esta exigencia usa CAS de política sin iniciar época ni exigir disponibilidad de mensajería. Los clientes anteriores que omiten el flag al actualizar conservan su valor vigente; los snapshots históricos sin ese campo mantienen su ausencia.

La edición propia exige titular, sesión y tribu actuales, pendiente vigente, confirmación, versión observada y operación original. Un cambio efectivo incrementa versión y un no-op la conserva; no modifica fuente, prueba, estado ni fechas. Ledger y audit excluyen el número, que sólo aparece en consultas propias o de revisión autorizadas. Las proyecciones mantienen por separado los códigos todavía requeridos aunque también falte WhatsApp. La previsualización personal difiere únicamente completar el número; conserva identidad, destinatario, vínculo, prueba, lista y vencimiento. No sustituye al writer ni permite un canje.

## Comprobaciones locales

La focal final pasó **306 casos en dieciocho archivos, cero fallidos y cero omitidos**, con normalización/DTOs reales, aislamiento y resultados inciertos sin retry automático. Pasaron ambos tipos y lint. Registro `.git/codex-whatsapp-focused.json`. La regresión inicial quedó fallida: cuatro casos de pantalla detectaron `false` contra un campo ausente; se corrigió la comparación con el draft canónico. Tres expectativas detectaron la distinción entre defaults nuevos e historia anterior: se preservó la ausencia histórica y se actualizó la expectativa del default creado. La repetición completa de esos tres archivos pasó 27 casos; el resultado inicial no acredita un éxito global.

La arquitectura propietaria pasó cuatro vistas Chromium/WebKit a 390/1280 px, con 79 destinos locales por vista, sin desbordes ni errores y con hash estable (`.git/codex-whatsapp-architecture-qa.json`). Esta comprobación documental no acredita las pantallas de producto pendientes.

## SQL real y diagnóstico

La primera ejecución `.git/admission-whatsapp-native-04693071/` terminó con exit 1: un caso aprobado y otro fallido, sin omisiones y con 3.287 inputs estables. Retención pasó; la edición no pudo confirmar su operación. La inspección posterior usó `pg` directo en una rama propia migrada, transacción de sólo lectura, catálogo y `EXPLAIN` sin ejecución de filas. PostgreSQL confirmó `42703`: existe `whatsapp_number` y no existe `updated_at`. No se leyeron ni cambiaron filas de aplicación. Se eliminó el `SET updated_at` incorrecto del writer y se retiró la rama diagnóstica. Registro `.git/admission-whatsapp-database-diagnostic-268bbf54/outcome.json`.

La repetición `.git/admission-whatsapp-native-744d4e7a/` terminó con **exit 0, dos casos aprobados, cero fallidos y cero omitidos**, con 3.289 inputs estables, sin diferencias. Incluye exigencia sobre una pendiente anterior, respuesta de commit perdida, replay, contenido distinto con la misma clave, no-op, retiro impedido si es obligatorio, otra cuenta/líder sin autoridad para editar, consultas propias/revisor, resultados y audit sin número, decisión con versión anterior, aprobación posterior y terminal no editable. Conserva contacto, evidencia y fechas; SQL confirmó época 1, una membresía básica y cero entregas. El segundo caso minimiza dos terminales antiguos, conserva versiones y números de solicitudes frescas/pendientes y rechaza restaurar material minimizado.

La consulta final confirmó ausencia de ambas ramas de la repetición y de la diagnóstica y las tres originales conservadas, tres en total (`.git/codex-whatsapp-native-cleanup.json`). No hubo destinatarios reales ni envíos. Las dos revisiones del backend terminaron sin hallazgos accionables y conservan sus hashes.

## Concurrencia y conservación de la política: T215 completa

La selección ampliada inicial `.git/admission-whatsapp-concurrency-native-cba6e0ff/` terminó con tres casos aprobados y uno fallido, fuentes estables. El caso previo de auditoría detectó que la proyección SQL de una tribu retirada descartaba el nuevo flag. Se agregó la migración versionada `20261017191000_preserve_declared_whatsapp_audit.sql`: selecciona el campo sólo si existía y admite el motivo seguro de WhatsApp obligatorio, sin conservar causas o campos arbitrarios ni inventar defaults históricos.

La repetición `.git/admission-whatsapp-concurrency-native-bef6a8d2/` terminó con **exit 0, cuatro casos seleccionados aprobados, cero fallidos**, 3.291 inputs estables, cero diferencias y herramientas estables. Los dieciocho casos ajenos al filtro no se ejecutaron y no se presentan como aprobados. Los cuatro seleccionados incluyen las dos integraciones previas ampliadas, política con cliente anterior/canal caído y auditoría con respuesta perdida y retiro físico.

Se ejercieron simultáneamente edición y aprobación: sin número obligatorio la revisión no aprobó datos incompletos; con requisito opcional y la misma versión, sólo una acción confirmó el incremento y la otra detectó conflicto. También se comprobó que el flag aislado funciona sin readiness de mensajería, conserva época y entregas en cero, mantiene un valor exigido ante un cliente que lo omite y rechaza al líder degradado. La auditoría retirada conserva los snapshots actuales, preserva la ausencia histórica y descarta diagnósticos desconocidos.

La comprobación oficial posterior confirmó **tres ramas originales y ninguna temporal de validación** (`.git/codex-whatsapp-concurrency-cleanup.json`), después de consumir el productor. No se usó SQL de producción ni se enviaron mensajes. T215 queda completa; el inventario pasa a **200 completas, 17 pendientes, 217 totales**.

## Avance de interfaz y alcance pendiente

La interfaz tiene controles de política, presentación común/personal, revisión con nombre y número, y edición propia mediante el motor de recuperación existente. La suite local de cinco archivos pasó 115 casos y la ampliada 1.138; 408 integraciones fuera de esa corrida permanecieron omitidas. Son cohortes anteriores al cierre de la revisión de privacidad al restaurar desde bfcache; sus recibos no sustituyen la repetición final. La revisión encontró dos exposiciones visuales del número ante fallo de cuenta; se corrigieron y se agregaron escenarios de ocultación/recuperación.

El cierre de interfaz pasó **121 casos actuales en cinco archivos, sin fallos ni omisiones**, con 3.132 inputs congelados y sin diferencias (`.git/admission-whatsapp-ui-unit-dc2d1cd6/`). Incluye presentaciones común/personal, edición propia y recuperación, cambios de cuenta, bfcache y Activity real con fallo de observación nativa: el número no reaparece hasta validar la cuenta y no se repite un POST. Los dos owners retiran la frescura al limpiar sus efectos, sin desactivar reglas de lint; la restauración por pageshow también la invalida. Tipos, tipos de tests y lint pasan. La revisión final conserva treinta hashes estables y cero hallazgos (`.git/codex-whatsapp-ui-final-activity-review.json`).

La compilación de este cierre terminó con **exit 0 y 3.683 inputs estables**, sin diferencias (`.git/admission-whatsapp-ui-build-cc52bb76/`). Las exportaciones de capturas esperadas están excluidas expresamente de los inputs; no se excluye código de aplicación. Las compilaciones anteriores conservan su alcance histórico. Un auxiliar de copia anterior encontró el límite del buffer al inspeccionar un HTML grande; se comprobó la paridad del código, se sincronizaron las cuarenta y cuatro rutas propias contra el manifiesto nativo y se volvió a compilar el conjunto final.

El primer recorrido real `.git/admission-whatsapp-ui-native-f164f556/` terminó con exit 1, cero casos aprobados y uno fallido, sin omisiones y fuentes estables. Obtuvo las capturas de política, formulario común y corrección propia en Chromium móvil, pero agotó la espera del texto exacto del número en el detalle del revisor. Esa lectura comparte un elemento con su explicación; se ajustó el selector al dato dentro del detalle y se preparó la repetición, incorporando ida/vuelta real con fallo temporal de observación de cuenta. No se presenta aquella ejecución como aprobación de los cuatro tamaños/motores.

T216 queda completa y el inventario pasa a **201 completas, 16 pendientes, 217 totales**. T217 mantiene la repetición real Chromium/WebKit 390/1280 y la validación final de manuales/capturas/source-trace. T198/T208 y los demás gates originales permanecen abiertos.
