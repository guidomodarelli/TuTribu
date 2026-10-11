# Contraste completo de T154: reconciliación paga y beneficios existentes

T154 exige SQL real de webhook clásico y ambas reconciliaciones administrativas con productos membership/academy y fuentes simultáneas, suscripción antigua inactiva con fundamento básico nuevo, snapshot actual frente a histórico desconocido y grants/acceso a cursos intactos. Se mantiene ese alcance completo. T153/T155 y OG-06 no se cierran por esta auditoría.

## Matriz del criterio

| Cláusula original | Recorrido y evidencia |
| --- | --- |
| Webhook clásico y dos reconciliaciones administrativas | `PostgresTribeMemberSubscriptionRepository.handleWebhook`, `PostgresTribeSubscriptionPriceRepository.reconcileProviderSubscribers` y `reconcileSubscriberDiagnostics`; los casos usan ejecutores y PostgreSQL reales, con el puerto propio de lectura del proveedor controlado. El owner de resolución externa es el mismo colaborador que compone producción en `src/modules/setup.ts`. |
| Productos membership y academy | Los casos distinguen qué producto afecta pertenencia, conservan muted y rol, y no recuperan membresía desde academy. La cobertura nueva atraviesa ambas variantes en las tres entradas. |
| Fuentes simultáneas y procedencia consumida | Suite actual de reconciliación: cada fuente paga se consume una vez, conserva instancia y plazos, y se archiva tras remoción no comercial. Los bloqueos por conducta, administración, privilegios o historia desconocida quedan cerrados. |
| Old inactive / new basic | Reconciliación de precio/diagnóstico preserva el fundamento básico ya consumido cuando expira una suscripción membership anterior; la fecha y estado no se reconstruyen desde el pago antiguo. |
| Snapshot actual frente a historia desconocida | Casos de captura de muted antes de restricción comercial, actualización visible en un statement nuevo, replay/concurrencia y snapshot NULL cerrado; no se inventa historia de leader/guardian ni se elimina moderación. |
| Grants, matrícula y acceso a cursos sin cambios | `admission-membership-sources.test.ts` añade seis casos: bonificación manual y matrícula existentes, un curso básico y otro de academia realmente disponibles; reads por `PostgresProductAccessRepository` y `PostgresCourseRepository` bajo el integrante actual, y comparaciones de identidades/fechas/revocación/estado antes/después. No basta un array vacío o comparar sólo la fila de membresía. |
| Resultado de resolución externa y atomicidad | Tests existentes de las tres entradas cancelan la pendiente por resolución legítima sin crear aprobación ficticia, respetan el plazo vencido y revierten pago/decisión/avisos si falla el colaborador propio. |

Las pruebas se ubican en las suites específicas existentes y en el archivo `admission-membership-sources.test.ts` previsto por la tarea; la diferencia de nombre del módulo anterior no reduce ninguna cláusula. Los asserts observan PostgreSQL y contratos públicos reales, sin leer fuentes/SQL como oráculo ni mockear ORM, framework, plataforma o bibliotecas internas.

## Cambio y validación actual

La ejecución previa de cinco suites termina con 69 verdes/cero omitidos (once dominio y 58 SQL), incluidos 26 SQL de reconciliación. Su receipt es `.git/codex-t153-t155-current-membership-lifecycle.json`. Se conserva como evidencia anterior a mover los dos helpers; no se anuncia como regresión posterior de la fixture nueva.

La brecha de beneficios/cursos detectada se cubre con seis casos reales nuevos. `seedSubscriptionMembershipReconciliation` y `createSubscriptionMembershipReconciliationRepository` se comparten desde `tests/support/subscription-membership-reconciliation-fixture.ts`; preservan productos, cantidades, estados, actor, migraciones y el colaborador real. Las constantes del escenario pertenecen a `tests/support/constants/subscription-membership-reconciliation.ts`; el comportamiento del producto permanece en `0bd9eb48`. Tipos de tests y lint final pasan. Una extracción inicial quitó un import type aún usado por el caso de rollback; se restauró y ambas comprobaciones posteriores terminaron correctamente.

El focal nuevo `.git/codex-t154-grants-first-native.json` pasa un caso en 34360,4176 ms con cinco variantes filtradas. Se conserva como focal, sin sumarlo a la matriz. La ejecución completa `.git/codex-t154-current-product-access-and-shared-fixture.json` termina exit 0 con 32 aprobados/cero omitidos: seis nuevos y los 26 de regresión tras extracción. Todas las ramas y conexiones propias se retiran antes del terminal. maxWorkers=1 y sin paralelismo de archivos; las fuentes se mantuvieron congeladas.

| Producto | Entrada | Duración del caso nuevo |
| --- | --- | --- |
| membership | price | 33343,8644 ms |
| membership | diagnostics | 32329,9603 ms |
| membership | member | 30467,2160 ms |
| academy | price | 33029,3297 ms |
| academy | diagnostics | 32590,1109 ms |
| academy | member | 31665,7747 ms |

La suite de regresión termina en 779364,8374 ms y la nueva en 193427,7747 ms. No se suman sus 26 casos solapados con el reporte anterior de 69 ni el focal inicial para inflar resultados. Ambos productos conservan beneficios, matrícula, rol/silenciamiento y acceso realmente disponible a los dos cursos, sin cambiar fechas, identidad o revocación.

La revisión de los cuatro archivos de código confirma cero hallazgos accionables y contrato de fixture conservado, con manifiesto inicial/final estable `3F6FD91B6E57607200B466058BEA691F6DD8A3D4E8327E320689FB90B6BD31C2`. Los dos helpers se comparten entre dos suites; el módulo anterior pasa de 331 a 306 líneas. Esa revisión no ejecutó tests ni acredita el lote todavía activo. El checkpoint de código conserva T154 abierta.

## Documentación y límites

`docs/conventions/admission-testing.htm#payment-product-access` explica la comparación mediante repositorios públicos y la distinción entre guarda antigua y puente positivo. `docs/architecture/subscriptions.htm` corrige el estado obsoleto de T026: sus tres escritores y procedencia paga están integrados; otros owners y OG-06 conservan sus obligaciones. No se cambia UI o copy del producto ni se requieren capturas/manuales de flujos ajenos al cambio. No hay entrada nueva en changelog para tests/refactor de fixtures.

Los dos documentos HTML pasan ocho renders en Chromium/WebKit a 1280/390 px, sin errores o desbordes y con fuentes locales de respaldo. La revisión documental inicial confirma cero hallazgos tras corregir un estado histórico del focal, con manifiesto `6FD6EAB066713E95A0448812C66AAB1EBAF8AEEAE434CE4F550B78AB73CA1EC9`. La revisión final del criterio íntegro y los 32 casos actuales también termina sin accionables, con manifiesto estable de los dos documentos `E88EB91F6917469C8F5BEDEE73520CE97A4709E55287B8A3A17C909D4A8018E6` antes de agregar este recibo. El reviewer no ejecutó pruebas.

Se marca exclusivamente T154: 152 completadas, 60 pendientes y 212 IDs/criterios originales intactos. Estas pruebas no validan cobros/proveedor externo, activación de producción, OG-06 ni los puentes históricos y ciclo completo de otros owners correspondientes a T153/T155/T159/T160.
