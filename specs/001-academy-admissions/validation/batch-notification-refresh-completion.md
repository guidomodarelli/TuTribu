# Cierre de pruebas de lotes, avisos y refresco

## Estado y procedencia

Esta auditoría cerró únicamente **T176, T177 y T188**, con sus **31 cláusulas originales**: nueve, trece y nueve. Su registro inicial quedó en **191 tareas completas, 21 pendientes y 212 totales**, con **71 temáticas aprobadas**. El [cierre posterior](us8-functional-completion.md) registra el inventario actual de 196/16. Se conservan las descripciones, dependencias y referencias normativas de todas las tareas.

La revisión Codex corresponde al producto de 144dd8427e9a55e508cf44688fe8d5511795c099. Contrastó también las ocho cláusulas de T178, que conserva una brecha de evidencia y no se cierra aquí. Los 315 inputs permanecieron estables. El dictamen privado es .git/codex-us8-remaining-tests-refresh-review.json, SHA256 a0a52207f7aadf38009cde771497f718dfd3fa3c2b81bb009abed105ac388e20; sus veredictos distinguen implementación de evidencia y no identifican defectos de producto.

## Cobertura completa acreditada

| Tarea | Alcance original y evidencia |
| --- | --- |
| T176 — nueve cláusulas | Los seis AC tienen correspondencia explícita. El lote conserva hasta cincuenta IDs/versiones y confirmación nominativa, motivos internos requeridos, resultados individuales, conflictos esperados, rollback inesperado sólo de base de datos, ledger tras perder la respuesta, all_rejected terminal y ausencia de éxitos repetidos. La [persistencia y lote](storage-batch-settings-completion.md), los handlers y casos locales actuales, SQL de atomicidad y los [resultados reales](admission-outcomes-and-notifications.md) sustentan el recorrido. |
| T177 — trece cláusulas | Se acreditan audiencia propia y de reviewer, dedupe del evento y obligación, confianza actual del correo separada del teléfono, rol/preferencia actuales, ausencia de clave global o pasado retroactivo, grupos/calendario diario/recordatorio y fallo/reinicio/plazo original. El contenido excluye la nota interna y sus enlaces son pasivos. El [productor y envío](producer-maintenance-trigger-completion.md), los casos locales y las cohortes SQL actuales conservan sus alcances; no se presenta un Native agrupado como un envío diario integral. |
| T188 — nueve cláusulas | El contexto visible comparte poll de quince segundos, coalescing, igualdad y cancelación; la acción propia reconcilia inmediatamente. La lista abierta, badge y solicitud propia se actualizan, blur/background detienen el refresco y un fallo conserva datos con aviso. Fuera de admisión sigue la política ordinaria. Los hooks, contenedores, DTOs propios y cuatro recorridos reales Chromium/WebKit a 390/1280 sustentan el flujo y sus límites. |

Las cohortes conservan sus recibos en la [matriz general de US8](notifications-and-scheduler.md). Los 296 casos locales y los Native reutilizados no se suman otra vez por aparecer en varias cláusulas. El CI de 703e51e30637d09f14dc48094e62e3ece884dda7 terminó correctamente con 5.934 casos aprobados y 882 omitidos; no sustituye los Native omitidos por su gate SQL.

## Comprobación adicional de T178

La primera revisión exigió evidencia del adapter vigente para la cuota modificada mientras una entrega espera. El caso existente de verification-delivery-pipeline.test.ts reduce a cero la política real antes del marker y exige quotaDeferred, cero llamadas SDK, intentos o reservas, y código/original intactos. La repetición focal quota-current estaba en ejecución al registrar este cierre. Su resultado aprobado y limpieza se contrastaron después en el [dictamen final](us8-functional-completion.md); el primer dictamen no cerró T178 por la expectativa del test ni por el caso histórico.

## Límites

La cohorte ui-current de bandeja y preferencias conserva su resultado terminal en el cierre posterior. T179, T189, T190 y T191 se evaluaron allí con sus criterios íntegros. El refresco funcional no certifica un driver saludable, p95 operativo o recepción externa: SC-015, RG-08 y OG-05 mantienen sus gates. Este cierre no envía mensajes reales, no despliega y no migra producción.
