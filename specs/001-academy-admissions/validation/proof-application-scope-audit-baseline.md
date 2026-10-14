# Aplicación de prueba y retiro de ámbito auditados

Avance de T169/T170 sobre `ce3a4c34`. Se conservan 212 tareas: 164 completadas y 48 pendientes. Este avance no cierra los otros productores, métricas, actividad, retención ni gates.

## Contrato y responsabilidades

- La aplicación conserva el registro de adjunción de la solicitud y agrega la transición propia de la prueba. El UPDATE RETURNING suministra la fecha real de aplicación, mientras desafío/canal y estado previo proceden de los locks existentes. Actor y ledger pertenecen al comando. Ambos registros usan un batch privado en la transacción original. Se conserva versión nula de la prueba, sin contacto, código, sobre, credencial o payload.
- La migración idx157 actualiza sólo la función de cierre para seleccionar los hechos de pruebas efectivamente invalidadas. Conserva lock order, predicados, ACL, search_path y los efectos originales de solicitudes/invitaciones/desafíos/entregas. La CTE captura el estado anterior y el canal de su desafío, y el audit comparte el reloj SQL persistido de invalidación.
- El actor procede del contexto SQL actual, admitiendo su ausencia. El ledger de admisión es nulo porque la función no recibe uno. Las operaciones de tribu pertenecen a otro registro y no se introducen como FK de admisión. Su conexión de procedencia sigue pendiente: no se presenta una ausencia de referencia como trabajo terminado.
- La regla conserva el motivo real academy_unavailable o tribe_deleted, con causa privada scope_retired. Aplicación y cierre no añaden labels de métricas ni validación completa de filas PostgreSQL. La repetición de cierre sólo registra nuevos efectos, y un rollback revierte audit y mutaciones juntos.
- Vencimiento de prueba disponible a quince minutos sigue siendo elegibilidad derivada; no se encontró un productor persistido de expiración. No se fabrica un evento de transición sin efecto. El mantenimiento y su integración quedan pendientes en el alcance original.

## Evidencia

- Cuarenta contratos locales aprobaron sin fallos ni omisiones. Tipos de producto, tipos de tests y lint terminaron con exit 0; los dos últimos se repitieron después de corregir la preparación de los fixtures.
- La primera ejecución Native terminó con 10 aprobados, 3 fallos y ninguna omisión, sobre 13 casos. Dos fallos eran de preparación SQL y uno fue un timeout administrativo de Neon antes de crear el fixture. El diagnóstico directo con `pg` y savepoints identificó SQL42703 por el marcador de control ausente y SQL23502 por la versión de política ausente en la decisión; el probe temporal conservó 0 aprobados, 1 fallo deliberado y 7 filtrados.
- La repetición focal de los tres casos terminó con 2 aprobados, 1 fallo y 7 filtrados. Eligibilidad de evidencia revocada y contabilidad queued aprobaron. Los dos probes posteriores de cierre conservaron cada uno 0 aprobados, 1 fallo deliberado y 6 filtrados; el segundo mostró el SQL42883 exacto: faltaba `public.enqueue_admission_notification(uuid, text, unknown)`. Se incorporaron las migraciones reales y una política vigente al fixture; se retiró todo el diagnóstico temporal sin debilitar las aserciones.
- La última repetición de cierre/rollback terminó con 1 aprobado, 0 fallos y 6 filtrados sobre siete casos del archivo. En conjunto quedan aprobados los 13 casos Native distintos, no una nueva ejecución completa. Los ocho archivos de migración/producto/tests congelados coincidían al terminar. La secuencia real conserva 57 migraciones, comando, replay y comprobaciones de procedencia.
- Build aprobado en copia administrada aislada sobre `ce3a4c34`, con configuración sintética independiente y sin copiar secretos reales. Las dos fuentes de producto coincidieron antes y después; permanecieron iguales durante las correcciones de fixtures. La copia quedó archivada mediante la operación oficial y sus metadatos lo confirman.
- QA de arquitectura aprobó cuatro vistas: Chromium/WebKit con anchos de 390 y 1280, sin overflow ni errores y con vínculo local y ancla únicos. Las dos capturas móviles fueron inspeccionadas. La sección de arquitectura no cambió después de esa comprobación.
- Los receipts delimitan 21 ramas propias, todas del proyecto/parent autorizados, no default y con nombre verificado. La consulta oficial confirmó que no permanece ninguna; conserva `br-wispy-sun-anwpxm2x`. El piloto HTTPS respondió 200, con cero mensajes externos conocidos. No se desplegó idx157 al piloto ni a producción.
- La revisión de cierre usa el manifest exacto de doce archivos, incluidos fixtures, migración y documentación. La revisión inicial de diez archivos estables se conserva como antecedente y no acredita los fixtures modificados después. El cierre exige cero hallazgos aceptados sobre el target final.

Este avance modifica el registro privado, conservando acciones, permisos y estados visibles del flujo; no requiere reescribir manuales de otros recorridos.

## Alcance original restante

Se mantienen pendientes la procedencia del original de ciclo de vida en el cierre, el vencimiento persistido, otros productores de desafío/entrega/despacho/reconciliación/exposición/pertenencia, readers/endpoints/logger, agregados efectivos, pantallas por rol, retención, rollout y gates. T169/T170 permanecen abiertas; no se cambian marcadores.
