# Cierre del productor, mantenimiento y disparadores

## Estado y procedencia

Se completan exclusivamente **T185, T186 y T187**, conservando sus textos originales y sus diecinueve cláusulas: ocho, siete y cuatro. El inventario queda en **188 tareas completas, 24 pendientes y 212 totales**, con **71 temáticas aprobadas**. Las 212 descripciones, dependencias y condiciones normativas permanecen intactas.

La auditoría corresponde a los owners alcanzables en `703e51e30637d09f14dc48094e62e3ece884dda7`. Terminó con cero hallazgos accionables y **131 inputs estables**. El dictamen privado `.git/codex-us8-producer-maintenance-trigger-completion-review.json` tiene SHA256 `7da789c65ebc4da2b397491499d4f12ae73e78f18940aa67a17b5c4ceb7283ea`; el registro verificado de las casillas está en `.git/codex-us8-maintenance-task-closure-proof.json`. El CI de ese commit y la nueva cohorte de interfaz conservan sus registros independientes y no se usan como éxito en esta auditoría.

## Productor T185

| Cláusula original | Owner y evidencia |
| --- | --- |
| Agrupado y diario, ventana original y corte sin pasado | Collector, progreso certificado, política/calendario y preparador del grupo completo. Veintisiete casos locales de grupos, calendario PostgreSQL y Native del productor compuesto; el Native agrupado no se presenta como un envío diario integral. |
| Recordatorio lógico único a tres días | Primitiva SQL con audiencia actual, solicitud pendiente no vencida y dedupe. Tres Native actuales; el mantenimiento no repite esta fase al preparar grupos. |
| Correo confiable actual y scope; teléfono sin autoridad de email | Reader privado de cuenta/captura o prueba email aplicada al original, revalidado después de locks. Tres Native actuales de correo; la ausencia de confianza conserva el aviso interno. |
| Obligación y outbox durables; fallo externo sin rollback del hecho | Writer transaccional, colección y preparador atómico. Native de pendiente y Native de rechazo real con SDK 503 y otro procesador: decisiones, obligaciones y originales permanecen. |
| Contenido mínimo y enlace autenticado pasivo | Trece casos actuales de contenido, proyección firmada y sender registrado; no se incluyen notas internas ni una acción por GET. |
| Rol, preferencia, habilitación y capacidad actuales | Guard del grupo entero antes del marker y de abrir el recurso. Los Native de autoridad/configuración distinguen detención definitiva e indisponibilidad reparable. |
| Plazo original de hasta veinticuatro horas e incertidumbre segura | Deadline mínimo del manifest, identidades y presupuesto originales; una materialización tardía no amplía el plazo. Ambos Native de caída conservan un único POST al recomponer. La recuperación explícita usa su ledger y autorización. |
| Autoaprobación sin correo de revisión; independencia de OTP | Audience de pendiente/recordatorio y propósito/presupuesto separados. Native de ingreso automático con actividad, métricas, replay y cero revisión o entrega. |

El recorrido es obligación de admisión → collector/progreso → política/calendario/preparador → outbox → autoridad vigente → routing por propósito y sender. `prepare-admission-email-notifications-use-case.ts` conserva su responsabilidad de aplicación. Los adapters reales incluyen `admission-notification-obligation-writer.ts`, `postgres-admission-notification-collection-progress.ts`, `postgres-admission-notification-producer.ts` y `postgres-admission-notification-group-preparation.ts` en notificaciones. El sender previsto en ese módulo está implementado en mensajería como `zavu-notification-delivery-sender.ts`, junto con `purpose-routed-message-delivery-sender.ts` y las raíces de composición de ambos módulos.

## Mantenimiento T186

| Cláusula original | Owner y evidencia |
| --- | --- |
| Siete owners bounded e idempotentes | Expiración, retención de admisión/CSV, retención de mensajería, recordatorios, preparación de grupos/outbox, dispatch y reconciliación. Se rota la fase inicial dentro de la ventana total. |
| Bearer actual y ámbito privado | Handler y composición protegidos antes del checkout; la autoridad se revalida en las transacciones. El retiro tardío del bearer revierte el turno observado. |
| Lease, CAS, deadline y evidencia tardía | Lease de noventa segundos y ventana original de cuarenta y cinco; un replay completado conserva su historia. El resultado tardío no inicia más trabajo ni pierde efectos confirmados. |
| RPC fuera de locks y reconciliación sin claves de envío | Native con SDK y transporte cerrado verifica locks libres con `NOWAIT`. La reconciliación compone el owner SQL sin crear un sender. |
| Outcome por paso y contadores confirmados | Se distinguen trabajo no iniciado, diferido, configuración ausente e incertidumbre. Una observación fallida no borra contadores ni fabrica rollback. |
| Último éxito y edad de cola nativos | Sólo una ejecución con todas sus fases confirmadas avanza el éxito; cambiar ámbito reinicia la salud. La consulta indexada distingue cola observada vacía de observación no disponible. |
| Configuración ausente o trabajo omitido visibles | Native compuesto sin claves expira solicitudes y crea avisos internos, mientras informa el dispatch no configurado y el run incompleto mediante un DTO propio. |

El entrypoint `app/api/maintenance/admission-messaging/route.ts` conecta el handler y el módulo de request con `RunAdmissionMessagingMaintenanceUseCase`, `OriginalAdmissionMessagingMaintenanceWork` y sus siete owners. Los tres Native actuales de composición, dispatch y progreso están en `sql-remaining`; la [evidencia histórica del mantenimiento](admission-messaging-maintenance.md) conserva sus fallos iniciales, correcciones y límites.

## Disparadores T187

| Cláusula original | Owner y evidencia |
| --- | --- |
| Minuto sólo con target opt-in | `wrangler.jsonc` conserva sus tres crons anteriores y activación base falsa. El entorno optativo agrega el minuto, assets y autorreferencia del mismo Worker. |
| Catch-up autorizado, portable y sin retry automático | Workflow cada cinco minutos con activación explícita y CLI Node 24. Se validan origen, bearer, timeout y ausencia de redirect; sólo un 200 confirma el recorrido. |
| Builds y ejecución reales | OpenNext compilado en Ubuntu/WSL y Wrangler local con las dos configuraciones. Los fallos de symlink de Windows y memoria del primer probe se conservan como tales. |
| Vercel Hobby y operación saludable pendientes | La integración no despliega ni contrata. El Worker cerrado acredita invocación y fallo seguro; el driver autorizado y medido permanece en OG-05/SC-015/RG-08/T206. |

El contrato ejecutable está en `admission-maintenance-config.mjs` y `admission-maintenance-trigger.mjs`, consumido por `cloudflare/worker.ts` y `scripts/run-admission-maintenance.mjs`; no se importa TypeScript desde el ejecutable Node. La [evidencia de los disparadores](admission-maintenance-trigger.md) conserva **48 casos distintos en tres archivos**, los mismos 48 aprobados en Windows y Linux. No se cuentan como 96 casos. El contraste del snapshot Linux de 3.600 fuentes y los 31 inputs de código ya revisados no identificó cambios ejecutables que invaliden su build o sus ejecuciones.

## Cohortes y límites

La [matriz general de US8](notifications-and-scheduler.md) conserva las cohortes locales, SQL, HTTP, navegador y caída por separado. No se suman de nuevo los casos usados en varias cláusulas. La ejecución de interfaz `ui-current`, posterior a la cohorte de resultados y avisos, no forma parte de esta auditoría ni recibe aquí un resultado o una limpieza anticipados.

Se cierra la implementación completa de estas tres tareas. Las verificaciones integrales T176–T179/T188–T191 y las finales conservan su alcance. Un transporte controlado, un cronfile, un Worker con configuración cerrada o un 200 aislado no prueban recepción externa, deduplicación del proveedor, driver saludable, p95 menor a treinta segundos o aceptación del agrupado en cinco minutos. No hubo mensajes reales, despliegue ni migración productiva en este cierre.
