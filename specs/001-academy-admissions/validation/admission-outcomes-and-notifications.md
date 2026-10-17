# Admisión automática y resolución ante una caída del correo

## Alcance

Esta cohorte complementa la [matriz integral de US8](notifications-and-scheduler.md). Ejercita US-08-AC-06 y la variante de resolución de US-08-AC-03 mediante los casos de uso, repositorios, primitivas SQL, contratos públicos y SDK reales. Cada caso crea una rama Neon propia con el journal vigente y conserva sus límites de autorización. La conexión original sólo selecciona el nombre de base y rol; sus credenciales y host no se reenvían al proceso de prueba.

El código de producto sigue siendo el del checkpoint `b49dcf1c43eb79084bbc80d5232b649161cc5992`; `d0d361a057fbc3ffe1e0df60fd576324fe94a5ea` guarda únicamente documentación y el cierre de T180. Los dos archivos nuevos son `tests/unit/modules/notifications/infrastructure/admission-notifications.test.ts` y `tests/support/admission-notification-resolution-fixture.ts`. No se modifica código de producto.

## Recorridos observados

| Escenario | Preparación y acción reales | Resultado comprobado |
| --- | --- | --- |
| Ingreso automático y repetición del original | Cuenta sintética con captura confiable actual, entrada habilitada creada mediante el writer propio y política activa. El submit compuesto confirma la admisión; los readers privados devuelven la actividad y las métricas propias. | Una solicitud aprobada, una decisión de sistema con regla automática y una obligación de aprobación. La actividad contiene una sola aprobación y las métricas distinguen una automática de cero manuales. No hay pendiente de revisión, aviso a reviewer ni entrega externa. Repetir el mismo original conserva sus hechos, actividad y contadores. |
| Rechazo confirmado y caída del correo opcional | Política manual, recurso de correo sintético preparado y habilitación anterior al evento. Submit y decisión de rechazo reales; el collector reúne la fuente de la cuenta solicitante y el preparador congela el grupo y crea su outbox. El SDK recibe un 503 mediante el único transporte permitido. | El rechazo, la decisión, la obligación y la ausencia de membresía sobreviven a la caída. Se conserva un original `unknown`, un intento y una reserva consumida. Un procesador compuesto nuevamente sobre la misma base no reclama ni envía otra vez. Permanecen la identidad, el grupo y el plazo original de hasta veinticuatro horas. El resultado no incluye el mensaje privado del upstream. |

La preparación sintética de una capacidad permite ejercer el dispatch sin contactar a Zavu; no acredita onboarding, un destinatario real ni un recurso operativo del proveedor. El reinicio es la composición de un procesador nuevo sobre hechos durables, sin restaurar el sistema operativo, el hosting o una copia de base. La prueba anterior de [solicitud pendiente y caída](admission-notification-outage-restart.md) conserva su alcance independiente.

## Ejecuciones y procedencia

La primera ejecución terminó con **un caso aprobado, cero fallidos y cero omitidos**, con **3.602 inputs estables**. Contenía sólo el ingreso automático. Sus recibos se conservan como `first-notification-scenarios-{target,outcome,results}.json` y su log bajo `.git/us8-fd20dd9d/`.

La segunda ejecución terminó con **dos casos aprobados, cero fallidos y cero omitidos**, con **3.603 inputs estables**. Sus recibos `second-notification-scenarios-{target,outcome,results}.json` y su log se conservan separados. Durante esa ejecución, el control de tipos detectó que el runtime nuevo omitía el callback obligatorio `report`. La versión final agrega ese callback y registra solamente la etapa y el nombre del error. Lint y tipos de tests terminaron después con código cero; el diagnóstico inicial permanece en `.git/codex-us8-notification-scenarios-static.json`.

La repetición de la versión final terminó con **un archivo completo, dos casos aprobados, cero fallidos y cero omitidos o sin ejecutar**, con **3.603 inputs estables**. Mantiene sus recibos `notification-scenarios-{target,outcome,results}.json` y log separados de las dos ejecuciones anteriores. Ambos archivos nuevos coinciden por hash con la versión final del checkout principal. El contraste de los 3.081 inputs de runtime, migraciones y pruebas seleccionados frente a ese checkout encontró 2.891 coincidencias exactas y 190 diferencias sólo de saltos de línea, sin diferencias sin explicar. El recibo `.git/codex-us8-notification-scenarios-final-proof.json` conserva ese contraste y los resultados observados. Son dos casos distintos; las repeticiones no se suman de nuevo.

En la versión final, el primer procesador de resolución registró un reclamado, un autorizado y un `unknown`, sin pendientes de conciliación local. El siguiente registró cero reclamados y cero nuevos envíos. El transporte controlado recibió un único POST y no se registraron diagnósticos inesperados. Esas duraciones y contadores describen el ensayo funcional, sin certificar tiempos de operación o rendimiento externo.

## Límites

Estos escenarios no certifican por sí solos todas las cláusulas de T176, T177 o T191 ni las variantes restantes de US8. Preferencias, roles cambiantes, agrupación, diario, recordatorios, expiración e integración de interfaz conservan sus evidencias específicas en la matriz general. Tampoco acreditan latencia operativa, rendimiento, restore, visibilidad física de pestañas ni los gates de canales y scheduler.

No hubo mensajes reales ni gasto de mensajería, despliegue o migración productiva. Después de consumir todos los productores, Neon confirmó las tres ramas originales conservadas, cero ramas temporales propias y ninguna rama sin clasificar. El recibo `.git/codex-us8-notification-scenarios-neon-final.json` registra esa consulta; los snapshots anteriores del ensayo HTTP y del momento en que esta ejecución estaba activa conservan sus momentos históricos.
