# Contraste completo del criterio de T141

Auditoría del código `0bd9eb48`, con T136 y T140 completadas. Se conserva el criterio original completo: candidata/activa, confirmaciones de swap/dependencias/impacto, suspensión/compromiso, entrega unknown y recuperación autorizada, borrador/progreso y alerta dentro de TuTribu aun sin correo. Las rutas orientativas de la tarea se contrastan con los propietarios actuales, sin reducir el alcance a la recuperación nueva.

| Criterio original | Recorrido y evidencia observable | Resultado |
| --- | --- | --- |
| Candidata y activa; candidata defectuosa sin modificar la seleccionada | `messaging-connections-container.tsx` conserva el catálogo SSR y la seleccionada. La suite real del container incluye candidata inválida con activa previa y caída del check; las assertions se conservan en los 104 casos finales. Contraste original de T136 en `messaging-lifecycle-ui-completion-audit.md`. | Cubierto en UI/puertos propios; no se atribuye este borde a la matriz Native nueva. |
| Confirmación de swap, dependencias e impacto | El asistente muestra impacto, exige consentimiento y publica la nueva selección desde el resultado original. Los 41 casos del container heredado permanecen en la regresión actual; la dependencia se resuelve por reemplazo/política/pausa con las reglas ya auditadas en T136/T140. | Cubierto; los trabajos fijados y el aislamiento backend conservan sus pruebas propias, que T143 deberá reunir. |
| Suspensión y compromiso | Controles de lifecycle con recencia scoped, razón explícita y consentimiento renovado; el guardián ve la alerta sin controles de escritura. T136 conserva cuatro casos Native reales Chromium/WebKit a 1280/390 px sobre suspensión, respuesta perdida, original y desconexión independiente; los 41 casos DOM vigentes cubren sus variantes. | Cubierto; ninguna acción promete revocación externa. |
| Entrega unknown y recuperación autorizada | Catálogo mínimo sólo para líder, con lectura actual antes/después del I/O, sin nueva recencia ni claves. Unknown/accepted/delivered, child existente, plazo vencido, conexión igual o no preparada bloquean otra recuperación. La escritura exige Google sobre la entrega original y consentimiento nuevo; el resultado se liga al UUID/original/sustituta/versiones. | Cubierto por catálogo, HTTP, adapter, container y cuatro casos Native; no demuestra despacho externo. |
| Preservar borrador, progreso y operación original | Snapshot por cuenta/ruta; UUID/CAS guardados antes del POST, sin consentimiento/recencia persistidos. La respuesta perdida sólo habilita GET original; reanudar requiere consulta, consentimiento nuevo y el mismo intent. Conflicto started puede conservarse explícitamente en historial de diez referencias, sin cancelarlo ni cambiar CAS. La capacidad se comprueba antes de UUID/POST/Google. Almacenamiento corrupto/fallido y cuenta cambiada tienen feedback seguro. | Cubierto por store/container/adapter y ambos fixes de revisión con reproducción roja y regresión verde. |
| Alertar dentro de TuTribu aun sin correo | El presenter muestra incertidumbre, estado y consulta del original. Registro de recuperación y entrega externa se presentan separados; la alerta operativa del guardián no depende del envío por el canal averiado. | Cubierto por UI real y pruebas, con copy seguro en español. |

## Fuentes y composición actuales

- UI propietaria: `app/(platform)/[slug]/academia/admissions/messaging/connections/messaging-connections-container.tsx` y `notification-recovery-container.tsx`; presenter en `components/academy-admissions/messaging-notification-recovery/` con SCSS BEM y beez-ui real.
- SSR y resultado propio: `src/modules/messaging/application/use-cases/get-messaging-connections-page-use-case.ts`, catálogo en `read-notification-delivery-catalog-use-case.ts` y guards de DTO/props propios en `constants/`.
- Boundary y persistencia: GET `app/api/tribes/[slug]/messaging/notification-deliveries/route.ts`, handler de catálogo, reader PostgreSQL y composición del módulo. Entrada validada una vez; ningún schema revalida filas PostgreSQL o respuestas del proveedor.
- Navegador y conservación: `lib/messaging/notification-recovery-api-client.ts`, `notification-recovery-intent-store.ts`, `notification-recovery-local-snapshot-store.ts` y hook de snapshot de la ruta. No retries automáticos, refresh integral ni credenciales en almacenamiento.
- Índice versionado: `database/migrations/20261011103000_index_notification_delivery_catalog.sql`, journal y fixture SQL actualizados; cursor con microsegundos y lineage original/child comprobados en PostgreSQL real.

## Validación terminal

La regresión actual reúne 104 casos aprobados/cero omitidos: container previo 41, container nuevo 10, presenter 6, store 7, adapter 17, catálogo 9, HTTP 7 y página 7. Los 17 focales posteriores al movimiento del guard también pasan. Tipos de producto/tests, lint y build final terminan con éxito. El reader nativo de precisión e índice pasa un caso/cero omitidos en 439335,8095 ms, sin nuevas reservas o envíos y con scope/session reales.

La matriz UI nueva tiene exactamente cuatro variantes aprobadas y distintas, con Next, Better Auth y PostgreSQL reales:

| Motor | Ancho | Duración | Reporte terminal |
| --- | --- | --- | --- |
| Chromium | 1280 px | 563457,2826 ms | `.git/codex-t141-native-ui-chromium-current.json` |
| Chromium | 390 px | 552303,3465 ms | `.git/codex-t141-native-ui-remaining-engines.json` |
| WebKit | 1280 px | 574015,241 ms | `.git/codex-t141-native-ui-remaining-engines.json` |
| WebKit | 390 px | 559565,2933 ms | `.git/codex-t141-native-ui-remaining-engines.json` |

Cada variante conserva una sola POST/recuperación/auditoría, consulta el original después de perder la respuesta y retirar la recencia, restaura sin consentimiento y mantiene cero requests al proveedor, reserva adicional, errores JS/hidratación o desbordes. No se cuentan los filtros como casos aprobados. Las ramas, pools, contextos, browsers y Next propios terminan antes de sus resultados. La prueba inicial roja usaba un nombre de tabla de auditoría incorrecto en su consulta final; se corrigió la prueba contra la tabla real, sin cambiar la funcionalidad ni relajar assertions.

La evidencia heredada de T136 conserva su scope y source `461E77D082FB2549CCD36ADAB918B324745ED8E96B64902B3FF435CB7CE5180C`. No se atribuyen swap o candidata invalidada a la matriz Native de recuperación de avisos. La pérdida controlada de respuesta no acredita corte TCP real, OAuth externo, envío efectivo de T185, restore ni rollout.

## Documentación y revisión

`docs/user-manual/tenant-messaging.htm` y los cuatro documentos internos enlazan el recorrido propietario `user-guides/tenant-messaging.html#notification-recovery`. Se conservan las referencias anteriores y la distinción entre registro, consulta, historial y entrega. Tres capturas reales nuevas con datos sintéticos se incorporan en `user-guides/assets/academy-admissions/notification-recovery-captures.json`, preservando los 23 templates anteriores. Fuente de los manuales: `0bd9eb48`; fechas anteriores y nuevas diferenciadas.

Check-manual registra cero errores; sus dos advertencias locales explicadas no bloquean. QA de los cuatro documentos internos: 16 renders, 28 navegaciones y cero errores/desbordes en ambos motores y anchos; cuatro renders adicionales del manual corto y 187 enlaces de seis documentos sin roturas. El menú local funciona como menú temático, sin presentarse como una réplica de la aplicación.

Revisión de producto final: 41 archivos estables, cero accionables, manifiesto `E1910054FC3F8F6F30B61CC8A9CB7EE8A8AB3F2FDA13DCBCDE4B62374530C0C3`. Revisión de los seis documentos de recorrido: cero accionables tras corregir la fecha, manifiesto `8397D7230B3848B0CF406794C32C9123BED49F625B297C2E12D5A6E6535AF335`. La revisión no se presenta como ejecución de tests.

La revisión final del criterio íntegro confirma cero hallazgos después de situar la introducción del baseline como checkpoint histórico. Los tres documentos de cierre conservan el manifiesto inicial/final `EB5CDC871A0AB1FFF7B1EFE5AF813ED78778381900191555CEEB7F7F1B99AAA8` antes de agregar este recibo. Se marca sólo T141: 149 completadas, 63 pendientes y 212 IDs/criterios originales intactos. La arquitectura añade cuatro renders finales correctos y los 187 enlaces se vuelven a comprobar sin roturas.

T142 conserva el conjunto más amplio de documentación, T143 debe reunir los seis AC con SQL/SDK real controlado, T185 conserva el despacho recuperado y los gates externos mantienen sus prerrequisitos y evidencias.
