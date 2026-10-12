# Inventario cerrado y ensayo de admisión por tribu

Base `2bb5920c`; 161 completas/51 pendientes/212. T163 conserva el inventario completo de entradas, seis AC y SC-019. El ensayo se ejecuta en ramas propias con PostgreSQL real, roles runtime y NOBYPASS y UI/API reales; no activa ni configura producción. Los receipts anteriores sirven para localizar cobertura, no reemplazan las ejecuciones nuevas exigidas aquí.

## Matriz de entradas y owners

| Entrada o condición | Recorrido real que debe acreditarse en esta reejecución | Estado actual |
|---|---|---|
| Bootstrap de tribu nueva | createTribe/whitelist/repositorio: sólo creador como líder; inserts posteriores de roles/paid bloqueados en runtime y NOBYPASS. | Un caso SQL aprobado. |
| Ingreso anterior clásico, gratuito y pago | Entry points open/invited/retry, invitación revocada/concurrente, rol/fecha/estado y cambio de modo antes de reserva; conservar contratos fuera del corte. | Once casos SQL aprobados. |
| Entrada pública de academia/historia y checkout directo | UI común en ambos motores/tamaños, login/preview sin efectos, API rechaza paid/old token y precio membership real, cero provider RPC o miembros antes de confirmar. | Puente Next/UI/API aprobado: un caso recorre ambos motores/tamaños. |
| Enlace histórico de academia | Llegada legacy bajo política común, manual/lista/OFF/ON sin dispensa, atribución conservada, pendiente/replay y aprobación vigente. | Lector y tres presentaciones legacy aprobados; ON correo/teléfono común/legacy aprobado en cuatro casos compartidos; puente UI/API aprobado. |
| Entrada común con lista y código | Identidad base o prueba local, lista vigente, fuente common y aprobación/fundamento atómicos; contacto declarado no concede acceso. | Common base/Next/UI/API aprobado con oráculo RSC reforzado; persistencia/denegaciones y matriz SQL ON aprobadas. |
| Entrada personal | Destinatario, canje/binding, dispensa/lista requerida, manual/lista/OFF/ON y resultados pending/existing/admitted; no liberar token al salir, pagar o cancelar. | UI OFF: cuatro casos aprobados; UI ON correo/teléfono: ocho casos aprobados. Persistencia/manual/denegaciones/lista/rollback SQL aprobados. |
| Fuentes comerciales y acceso a cursos | Tres owners pagos por productos membership/academy, grants/matrícula intactos y billing antiguo sin revocar fundamento básico. | Acceso de producto: seis casos aprobados; tres resoluciones pagas y un rollback adicional aprobados. |
| Estado active/muted, NULL y roles privilegiados | Instancia/rol/fecha/silenciamiento, recuperación gratuita/paga según historia y cierre de guardian/leader/NULL sin backfill. | Catorce casos aprobados en lote comercial, incluidos nueve de roles/NULL, tres de recuperación gratuita y dos de pending moderada. |
| Moderación, fuentes simultáneas y pending | Owner real remove/block, ambas fuentes revocadas, pendiente real cancelada, aprobación/pago posteriores denegados; resolución externa y rollback indivisibles. | Pending moderada aprobada; cuatro variantes de fuentes simultáneas y rollback de los owners aprobados. Reconciliación manual/API pendiente. |
| Salida/reingreso, modo/borrado y flags | Política vigente, plazo real, marker tras ausencia de policy/settings o flag, recovery lock y scope retirado sin resurrección. | Lote base terminal/focal lifecycle aprobado; cuatro límites cerrados, dos reingresos y rollback SQL aprobados; retiro/API pendiente. |
| Preflight e historia sin resolver | Runtime actual, schema/ACL/path/RLS/triggers y gates, contadores NULL/privileged sin modificar filas; prepared no es permiso reutilizable. | Nueva ejecución SQL/HTTP/UI en curso, sin terminal acreditado. |

## Criterios de aceptación y resultado permitido

US-10-AC-01 conserva el rol y estado de miembros activos o silenciados sin volver a admitirlos; AC-02 conserva conducta/remoción; AC-03 recupera sólo acceso básico; AC-04 evalúa histórico impersonal como common; AC-05 cancela pending por otra membresía legítima sin fingir aprobación; AC-06 cierra nuevas admisiones durante un rollback cuando la política no puede ejecutarse, sin restaurar el acceso gratuito abierto. SC-019 exige el conjunto, no una prueba aislada de tipos, fakes o un array vacío.

Un preflight completo y el ensayo aislado no completan los gates de hosting, canales reales, scheduler, latencia ni restore. Un histórico NULL o un rol comercial privilegiado se registra como pendiente de resolución autorizada/auditada por su owner; no se reconstruye por SQL del ensayo ni se habilita una pantalla ficticia. No se usan flags de actor/paid del cliente como autoridad.

| Criterio | Evidencia fresca disponible | Parte todavía pendiente |
|---|---|---|
| AC-01: conservar active/muted, rol y estado | Cutover, lifecycle y recuperación gratuita aprobados; repetición de la transferencia canónica aprobada con limpieza; entradas personales, puente actual y repetición manual WebKit aprobados. | Contraste final del inventario. |
| AC-02: conducta/remoción prevalecen | Dos casos de pending moderada, owners del lifecycle y matriz active/muted × remove/block con ambas fuentes aprobados. | API real de los owners de membresía. |
| AC-03: recuperar sólo acceso básico | Tres variantes de recuperación gratuita, seis variantes de derechos de producto y entrada común automática/rollback aprobadas. | Decisión manual/replay vigente de su raíz actual. |
| AC-04: invitación histórica como common | Cierre de vías anteriores/marker, lector, presentaciones OFF/ON y puente UI/API aprobados en ambos motores/tamaños. | Contraste final de atribución y política en la matriz completa. |
| AC-05: membresía externa cancela pending sin aprobación | Tres resoluciones pagas reales y rollback posterior aprobados. | Reconciliación manual y su respuesta original. |
| AC-06: rollback sin acceso gratuito abierto | Cutover y cuatro límites cerrados verifican marker durable, pérdida de política/settings, flag falso y recovery lock. | Retiro por modo/borrado, recency y preflight actuales. |
| SC-019: conjunto de regresiones, activación y rollback | Resultados parciales anteriores preservados con sus filtros y fallos. | Todas las filas del inventario y preflight actuales deben terminar antes de cerrar T163. |

## Ejecución vigente

El lote base terminó con 16 casos aprobados y uno fallido: `academy-membership-lifecycle.test.ts` completó las aserciones de transferencia y autorización, pero su limpieza no confirmó la ausencia de la rama propia. El reporte completo permanece fallido; no se convierte en un reporte verde por corregir después el entorno. La ausencia del identificador exacto quedó confirmada y la reejecución completa de ese caso terminó con un caso aprobado, cero fallidos y dos excluidos por el filtro declarado. Los otros dos casos conservan su evidencia aprobada del lote base.

El lote comercial terminó con 14 casos aprobados, cero fallidos y cero excluidos. Sus casos ejercen roles/NULL, recuperación gratuita y cancelación de solicitudes pendientes por moderación.

El nuevo caso de ingreso común automático por lista mediante Next, cookies nativas, PostgreSQL y UI/API reales terminó con un caso aprobado, cero fallidos y cero excluidos: recorrió Chromium y WebKit a 1280 y 390 px y comprobó cero efectos antes de confirmar, una membresía básica tras el POST y replay de la misma operación.

La revisión independiente detectó que contar sólo documentos no prueba la ausencia de un refresco RSC de Next. Tras terminar esa ejecución, el test se amplió para observar también solicitudes RSC a la ruta actual después de estabilizar la carga inicial. Tipos y lint de la versión corregida pasaron; su reejecución completa terminó con un caso aprobado, cero fallidos y cero excluidos, y la revisión final no dejó hallazgos accionables. La versión comprobada tiene SHA256 `46C22719E069C39064E2863734F250FA0B45B474557037D1C47217E14CAFFF6B`.

El lote de cuatro suites de navegador terminó con 14 casos aprobados, un caso fallido y cero excluidos. Pasaron el puente anterior de Next/UI/API, los cuatro casos personales OFF y los ocho casos personales ON de correo/teléfono, además del recorrido manual de Chromium. El recorrido manual de WebKit completó sus comprobaciones de negocio, pero falló al confirmar la limpieza de su rama propia. El reporte completo permanece fallido. Se verificó su identidad exacta y su ausencia después de la limpieza externa; la repetición completa de WebKit terminó con un caso aprobado, cero fallidos y un caso excluido por el filtro declarado. El caso excluido de Chromium conserva su terminal aprobado del lote anterior.

El lote SQL de entradas terminó con 46 casos aprobados, cero fallidos y cero excluidos en sus 19 archivos: bootstrap, entradas clásicas/pagas, lector/presentaciones legacy, lista común/local proof, entrada personal/manual/denegaciones/lista/rollback, resoluciones pagas, fuentes combinadas, límites cerrados y salida/reingreso/rollback. Las fuentes conservan sus hashes originales y las ramas propias de ese lote quedaron eliminadas. Las filas de preflight, decisión manual actual, retiro y API sin nuevo terminal conservan su estado pendiente.

Dos lotes nuevos ejecutan ahora los cuatro casos seleccionados de preflight SQL, seis casos de decisión manual y diez de retiro/API, además de tres casos de preflight HTTP/UI. Los filtros de los archivos amplios se conservan en sus reportes; ninguna exclusión aporta evidencia aprobada. No tienen todavía terminal acreditado en este checkpoint.

Todos los nuevos jobs usan `maxWorkers=1`, `maxConcurrency=1`, archivos secuenciales y limpieza propia. Se conservan exactamente resultados, filtros y fallos de cada alcance; los excluidos no se cuentan como aprobados. T163 permanece abierta y el recuento sigue en 161 completas/51 pendientes/212.
