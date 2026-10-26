# Cierre de persistencia, lote y preferencias de admisión

## Estado y criterio

Se completan exclusivamente **T181, T183 y T184**, con sus textos originales y sus veinticuatro cláusulas: siete, nueve y ocho respectivamente. El inventario queda en **185 completas, 27 pendientes y 212 totales**, con **71 temáticas aprobadas**. Las dependencias conservan sus IDs y criterios; una tarea de integración pendiente no se convierte en una carencia de un owner ya implementado y probado.

La auditoría corresponde al código alcanzable en `d0d361a057fbc3ffe1e0df60fd576324fe94a5ea`, cuyo último cambio de pruebas y arquitecturas es `b49dcf1c43eb79084bbc80d5232b649161cc5992`. La revisión terminó sin hallazgos accionables, con **126 inputs estables** y sesenta fuentes o pruebas propietarias sin cambios frente a sus auditorías previas. El dictamen privado `.git/codex-us8-storage-batch-settings-completion-review.json` tiene SHA256 `825773741966451a8a14d358028d15d087812c98254a0c29a6f71899f943d97f`. La verificación del registro conserva las 212 descripciones y las 71 aprobaciones; sólo cambia esas tres casillas.

## Persistencia T181

| Cláusula íntegra | Implementación y evidencia |
| --- | --- |
| Preferencia por receptor/tribu, versión y época precisas | Tabla y modelo Drizzle, repositorio propio y tres Native de preferencias: defaults, CAS concurrente, aislamiento, pérdida de autoridad y rollback por sesión vencida. |
| Grupos únicos por ventana/evento y una pertenencia lógica | Unicidad del grupo y del miembro en SQL, incluido el tratamiento de valores nulos; Native de grupos con replay concurrente y referencias cruzadas. |
| Recordatorio lógico único a tres días | Primitiva versionada con reloj vigente después de locks, ausencia de duplicados, exclusión de solicitudes vencidas y rollback. Tres Native de recordatorios. |
| Deadline, payload y manifest congelados | Guardas de congelación, fuentes originales vivas, plazo mínimo sin ampliación de veinticuatro horas y cierre irreversible. Native de grupos y preparación real del original. |
| FK compuestas con scope | Relaciones de grupo, obligación, aviso y outbox ligadas a tribu/cuenta; los Native rechazan referencias cruzadas. |
| RLS simple y aviso sin membresía | Tablas privadas con RLS/ACL y readers autorizados; los Native de inbox comprueban cuenta propia, rol actual, acceso ajeno denegado y ausencia de acceso comunitario por el aviso. |
| Artefactos reales instalados en rama propia | Journal real, fixtures de PostgreSQL con runtime y rol no-bypass, efectos y rollback observables. No se sustituyen con verificaciones de texto SQL o imports. |

El path previsto `20261005100000_add_admission_notification_groups.sql` no existe y se conserva en la descripción original como referencia del plan. Sus responsabilidades están implementadas mediante los artefactos reales `20261015140800_add_admission_notification_preferences.sql`, `20261015150300_add_admission_notification_groups.sql`, `20261015162200_materialize_admission_notification_reminders.sql` y `20261016104149_bind_notification_group_delivery_origins.sql`, en `database/migrations/`. Están registrados en el journal; complementan el core y los avisos internos ya versionados. Drizzle los representa en `src/modules/shared/infrastructure/database/schema.ts` y `src/modules/notifications/infrastructure/database/admission-notification-group-schema.ts`.

## Lote T183

| Cláusula íntegra | Implementación y evidencia |
| --- | --- |
| Selección DB-only de uno a cincuenta IDs/versiones únicos | Input propio confirmado, límite y selección explícita. El Native de cincuenta deja fuera la solicitud no seleccionada. |
| Cuenta, sesión y rol actuales; sin autorrevisión | Identidad derivada del servidor, guards de decisiones y recuperación. Casos locales, elegibilidad y HTTP Native con roles y sesiones reales. |
| Locks ordenados, CAS y reloj después de esperas | Writer y ledger compartidos; tests de atomicidad, versiones y conflictos actuales. No se realiza RPC bajo locks. |
| Motivos y elegibilidad actuales por fila | Excepción, rechazo, lista actual y restricciones nominativas revalidados; tres Native de elegibilidad y el dominio correspondiente. |
| Decisión, membresía, evento, aviso y resultado juntos | Writer transaccional y owner de membresía básica; Native de commit válido y rollback de efectos observados. |
| Conflicto esperado por fila, rollback total ante fallo inesperado | Savepoints y manejo tipado; el fallo SQL posterior revierte los éxitos staged y conserva únicamente progreso registrado. |
| Outcomes y contadores terminales exactos | Caso de uso y DTO propios; `all_rejected` es terminal y un resultado en curso no fabrica éxitos confirmados. |
| Ledger durable y recuperación sin otra decisión | Intent completo, namespace, canonicalización y original consultable. Native de respuesta de commit perdida y replay sin duplicados. |
| Ruta, composición y contratos privados reales | `request-decisions/route.ts`, caso de uso, writer y reader del original compuestos. HTTP Native de POST/GET propios y separación de mensajes internos y externos. |

Los owners son `decide-admission-requests-batch-use-case.ts`, `postgres-admission-request-repository.ts`, `postgres-admission-operation-repository.ts`, `postgres-admission-operation-reader.ts` y el entrypoint `app/api/tribes/[slug]/admissions/request-decisions/route.ts`. Se conservan cinco Native de atomicidad, tres de elegibilidad y uno HTTP, además de los nueve casos locales del caso de uso. Sus cohortes y excepciones se describen abajo.

La exclusión terminal de SC-005 mantiene los locks, CAS y unicidad del writer compartido. Esta cohorte no es una nueva muestra de cien competidores; las muestras globales y sus baselines de T145/T152 conservan su alcance histórico.

## Preferencias T184

| Cláusula íntegra | Implementación y evidencia |
| --- | --- |
| Sólo el líder habilita correo, con confirmación del propósito | Owner independiente de ajustes y guard de sesión/rol/recencia. Native de habilitación y límites HTTP/SSR propios. |
| Capacidad de correo probada y recurso actual | Readiness de la conexión seleccionada y versión, credencial, época y claves actuales; no se utiliza un recurso global de respaldo. |
| Correo separado de OTP, países, cupos y política | Habilitar modifica ajustes de correo; no envía ni activa verificación adicional o cambia `AdmissionPolicy`. Native de habilitación independiente. |
| Cuatro preferencias y defaults propios | Individual, agrupado, diario y omitido; líder agrupado y guardián omitido. Políticas, casos de uso y tres Native de preferencias. |
| Cinco minutos, 09:00 y zona propia/default | Calendario nativo con zona `America/Argentina/Buenos_Aires` por defecto, offsets y cambios de horario estacional; un Native dedicado y políticas actuales. |
| Sin envíos retroactivos | Cortes precisos de habilitación y cambio efectivo; un no-op conserva su época. Casos de grupos, preferencias y ajustes. |
| CAS, ledger, replay y rollback final | Original estable después de una respuesta perdida y recuperación sin presentar una versión histórica como configuración actual. Native de ajustes y sus límites propios. |
| SSR/API y composición alcanzables | Página de notificaciones, contenedor, rutas propias de ajustes/preferencias, input validado y DTO propio. Las fronteras actuales también aprobaron en el CI de `b49dcf1c`. |

Los ajustes pertenecen a `postgres-admission-notification-email-settings-repository.ts` y `20261015172500_manage_admission_email_settings.sql`. La preferencia usa su repositorio propio y el calendario `postgres-admission-notification-calendar.ts`, llamado por el collector real. La ruta `email-settings/route.ts` está separada de `notification-preferences/route.ts`. El owner de política de admisión permanece en su módulo y no se traslada a notificaciones.

## Cohortes, excepciones y límites

La [matriz de US8](notifications-and-scheduler.md) conserva las cohortes actuales: 296 casos locales, 25 aprobados y un omitido en `sql-remaining`, diecisiete complementarios y el HTTP posterior aprobado por separado. Los tres de elegibilidad se acreditan mediante sus dos primeros resultados originales y la repetición del tercero: el fallo inicial de limpieza y su retirada posterior confirmada permanecen registrados. El HTTP omitido no se cambia a aprobado en su informe anterior. Los casos citados en varias cláusulas no se suman nuevamente.

La auditoría verificó además veintidós casos de fronteras de ajustes, seis de intent y cuatro de SSR mediante el [CI exacto de `b49dcf1c`](https://github.com/guidomodarelli/TuTribu/actions/runs/39021410830). Esas cifras no se añaden otra vez a las cohortes locales ni se presentan como Native ejecutados si CI los omitió.

La nueva cohorte `notification-scenarios` queda fuera de este cierre y de sus cifras. T176–T179, T185–T191 y las tareas finales conservan sus criterios íntegros. No se certifican los seis AC integrales de US8, p95, driver saludable, canales, OAuth, restore o gates operativos. No hubo nuevos mensajes reales, despliegue ni migración productiva por este registro.
