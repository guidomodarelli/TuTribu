# Inventario cerrado y ensayo de admisión por tribu

Base `2bb5920c`; 161 completas/51 pendientes/212. T163 conserva el inventario completo de entradas, seis AC y SC-019. El ensayo se ejecuta en ramas propias con PostgreSQL real, roles runtime y NOBYPASS y UI/API reales; no activa ni configura producción. Los receipts anteriores sirven para localizar cobertura, no reemplazan las ejecuciones nuevas exigidas aquí.

## Matriz de entradas y owners

| Entrada o condición | Recorrido real que debe acreditarse en esta reejecución | Estado actual |
|---|---|---|
| Bootstrap de tribu nueva | createTribe/whitelist/repositorio: sólo creador como líder; inserts posteriores de roles/paid bloqueados en runtime y NOBYPASS. | Lote SQL restante en ejecución. |
| Ingreso anterior clásico, gratuito y pago | Entry points open/invited/retry, invitación revocada/concurrente, rol/fecha/estado y cambio de modo antes de reserva; conservar contratos fuera del corte. | Lote SQL restante en ejecución. |
| Entrada pública de academia/historia y checkout directo | UI común en ambos motores/tamaños, login/preview sin efectos, API rechaza paid/old token y precio membership real, cero provider RPC o miembros antes de confirmar. | Pendiente. |
| Enlace histórico de academia | Llegada legacy bajo política común, manual/lista/OFF/ON sin dispensa, atribución conservada, pendiente/replay y aprobación vigente. | Pendiente. |
| Entrada común con lista y código | Identidad base o prueba local, lista vigente, fuente common y aprobación/fundamento atómicos; contacto declarado no concede acceso. | Common base/Next/UI/API aprobado con oráculo RSC reforzado; matriz SQL ON y denegaciones en ejecución. |
| Entrada personal | Destinatario, canje/binding, dispensa/lista requerida, manual/lista/OFF/ON y resultados pending/existing/admitted; no liberar token al salir, pagar o cancelar. | Pendiente. |
| Fuentes comerciales y acceso a cursos | Tres owners pagos por productos membership/academy, grants/matrícula intactos y billing antiguo sin revocar fundamento básico. | Acceso de producto: seis casos aprobados en lote base; resoluciones/rollback adicionales en ejecución. |
| Estado active/muted, NULL y roles privilegiados | Instancia/rol/fecha/silenciamiento, recuperación gratuita/paga según historia y cierre de guardian/leader/NULL sin backfill. | Catorce casos aprobados en lote comercial, incluidos nueve de roles/NULL, tres de recuperación gratuita y dos de pending moderada. |
| Moderación, fuentes simultáneas y pending | Owner real remove/block, ambas fuentes revocadas, pendiente real cancelada, aprobación/pago posteriores denegados; resolución externa y rollback indivisibles. | Pending moderada aprobada; fuentes simultáneas y rollback adicionales en ejecución. |
| Salida/reingreso, modo/borrado y flags | Política vigente, plazo real, marker tras ausencia de policy/settings o flag, recovery lock y scope retirado sin resurrección. | Lote base terminal y repetición focal de lifecycle aprobada; matriz SQL restante en ejecución y retiro/API pendientes. |
| Preflight e historia sin resolver | Runtime actual, schema/ACL/path/RLS/triggers y gates, contadores NULL/privileged sin modificar filas; prepared no es permiso reutilizable. | Pendiente de nueva ejecución. |

## Criterios de aceptación y resultado permitido

US-10-AC-01 conserva el rol y estado de miembros activos o silenciados sin volver a admitirlos; AC-02 conserva conducta/remoción; AC-03 recupera sólo acceso básico; AC-04 evalúa histórico impersonal como common; AC-05 cancela pending por otra membresía legítima sin fingir aprobación; AC-06 cierra nuevas admisiones durante un rollback cuando la política no puede ejecutarse, sin restaurar el acceso gratuito abierto. SC-019 exige el conjunto, no una prueba aislada de tipos, fakes o un array vacío.

Un preflight completo y el ensayo aislado no completan los gates de hosting, canales reales, scheduler, latencia ni restore. Un histórico NULL o un rol comercial privilegiado se registra como pendiente de resolución autorizada/auditada por su owner; no se reconstruye por SQL del ensayo ni se habilita una pantalla ficticia. No se usan flags de actor/paid del cliente como autoridad.

| Criterio | Evidencia fresca disponible | Parte todavía pendiente |
|---|---|---|
| AC-01: conservar active/muted, rol y estado | Cutover, lifecycle y recuperación gratuita aprobados; repetición de la transferencia canónica aprobada con limpieza. | Contrastar entradas UI/API restantes con sus resultados terminales. |
| AC-02: conducta/remoción prevalecen | Dos casos de pending moderada y owners del lifecycle aprobados. | Matriz active/muted × remove/block con ambas fuentes y API real. |
| AC-03: recuperar sólo acceso básico | Tres variantes de recuperación gratuita y seis variantes de derechos de producto aprobadas. | Entradas automáticas/manuales restantes y rollback de sus owners. |
| AC-04: invitación histórica como common | Lote base conserva cierre de vías anteriores y marker. | Reejecutar presentación legacy OFF/ON, lector y puente UI/API real. |
| AC-05: membresía externa cancela pending sin aprobación | No se acredita todavía un nuevo terminal de este criterio; la cancelación por moderación pertenece a AC-02. | Tres resoluciones pagas reales, reconciliación manual y rollback posterior. |
| AC-06: rollback sin acceso gratuito abierto | Cutover verifica marker durable, pérdida de política y flag falso. | Cuatro límites cerrados, retiro por modo/borrado, recency y recovery lock actuales. |
| SC-019: conjunto de regresiones, activación y rollback | Resultados parciales anteriores preservados con sus filtros y fallos. | Todas las filas del inventario y preflight actuales deben terminar antes de cerrar T163. |

## Ejecución vigente

El lote base terminó con 16 casos aprobados y uno fallido: `academy-membership-lifecycle.test.ts` completó las aserciones de transferencia y autorización, pero su limpieza no confirmó la ausencia de la rama propia. El reporte completo permanece fallido; no se convierte en un reporte verde por corregir después el entorno. La ausencia del identificador exacto quedó confirmada y la reejecución completa de ese caso terminó con un caso aprobado, cero fallidos y dos excluidos por el filtro declarado. Los otros dos casos conservan su evidencia aprobada del lote base.

El lote comercial terminó con 14 casos aprobados, cero fallidos y cero excluidos. Sus casos ejercen roles/NULL, recuperación gratuita y cancelación de solicitudes pendientes por moderación.

El nuevo caso de ingreso común automático por lista mediante Next, cookies nativas, PostgreSQL y UI/API reales terminó con un caso aprobado, cero fallidos y cero excluidos: recorrió Chromium y WebKit a 1280 y 390 px y comprobó cero efectos antes de confirmar, una membresía básica tras el POST y replay de la misma operación.

La revisión independiente detectó que contar sólo documentos no prueba la ausencia de un refresco RSC de Next. Tras terminar esa ejecución, el test se amplió para observar también solicitudes RSC a la ruta actual después de estabilizar la carga inicial. Tipos y lint de la versión corregida pasaron; su reejecución completa terminó con un caso aprobado, cero fallidos y cero excluidos, y la revisión final no dejó hallazgos accionables. La versión comprobada tiene SHA256 `46C22719E069C39064E2863734F250FA0B45B474557037D1C47217E14CAFFF6B`.

Ahora se ejecutan los recorridos manual, personal OFF/ON y puentes anteriores, mientras el lote SQL de entradas continúa en paralelo. La nueva cobertura automática común queda acreditada; las demás filas conservan su estado pendiente hasta tener resultado propio.

Todos los nuevos jobs usan `maxWorkers=1`, `maxConcurrency=1`, archivos secuenciales y limpieza propia. Se conservan exactamente resultados, filtros y fallos de cada alcance; los excluidos no se cuentan como aprobados. T163 permanece abierta y el recuento sigue en 161 completas/51 pendientes/212.
