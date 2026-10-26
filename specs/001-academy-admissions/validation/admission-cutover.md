# Inventario cerrado y ensayo de admisión por tribu

Base de producto `2bb5920c`, cobertura común guardada en `1eabf787` y avances en `2e305517`. T163 conserva el inventario completo de entradas, seis AC y SC-019. La reejecución aislada terminó con cobertura efectiva de 116 casos y 39 fuentes de prueba estables. El ensayo usa PostgreSQL real, roles runtime y NOBYPASS y UI/API reales; no activa ni configura producción. Los reportes fallidos se conservan y sus casos afectados tienen repeticiones completas aprobadas. Antes del cierre: 161 completas/51 pendientes/212; el cierre exclusivo de T163 deja 162 completas/50 pendientes/212.

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
| Moderación, fuentes simultáneas y pending | Owner real remove/block, ambas fuentes revocadas, pendiente real cancelada, aprobación/pago posteriores denegados; resolución externa y rollback indivisibles. | Pending moderada, cuatro variantes de fuentes simultáneas, reconciliación manual, rollback y API real de membresía aprobados. |
| Salida/reingreso, modo/borrado y flags | Política vigente, plazo real, marker tras ausencia de policy/settings o flag, recovery lock y scope retirado sin resurrección. | Lote base/focal lifecycle, cuatro límites cerrados, reingresos/rollback y diez casos finales de retiro/API aprobados. |
| Preflight e historia sin resolver | Runtime actual, schema/ACL/path/RLS/triggers y gates, contadores NULL/privileged sin modificar filas; prepared no es permiso reutilizable. | Cuatro casos seleccionados SQL y tres HTTP/UI aprobados; históricos sin resolver conservados. |

## Criterios de aceptación y resultado permitido

US-10-AC-01 conserva el rol y estado de miembros activos o silenciados sin volver a admitirlos; AC-02 conserva conducta/remoción; AC-03 recupera sólo acceso básico; AC-04 evalúa histórico impersonal como common; AC-05 cancela pending por otra membresía legítima sin fingir aprobación; AC-06 cierra nuevas admisiones durante un rollback cuando la política no puede ejecutarse, sin restaurar el acceso gratuito abierto. SC-019 exige el conjunto, no una prueba aislada de tipos, fakes o un array vacío.

Un preflight completo y el ensayo aislado no completan los gates de hosting, canales reales, scheduler, latencia ni restore. Un histórico NULL o un rol comercial privilegiado se registra como pendiente de resolución autorizada/auditada por su owner; no se reconstruye por SQL del ensayo ni se habilita una pantalla ficticia. No se usan flags de actor/paid del cliente como autoridad.

| Criterio | Evidencia fresca disponible | Parte todavía pendiente |
|---|---|---|
| AC-01: conservar active/muted, rol y estado | Cutover, lifecycle y recuperación gratuita aprobados; transferencia canónica, entradas personales, puente actual y repetición manual WebKit aprobados. | Contraste del inventario completo realizado. |
| AC-02: conducta/remoción prevalecen | Pending moderada, owners del lifecycle, matriz active/muted × remove/block con ambas fuentes y API real de membresía aprobados. | Sin trabajo restante de este ensayo. |
| AC-03: recuperar sólo acceso básico | Recuperación gratuita, derechos de producto, entrada común automática/rollback y decisión manual/replay de su raíz actual aprobados. | Contraste del inventario completo realizado. |
| AC-04: invitación histórica como common | Cierre de vías anteriores/marker, lector, presentaciones OFF/ON y puente UI/API aprobados en ambos motores/tamaños. | Atribución y política contrastadas en la matriz completa. |
| AC-05: membresía externa cancela pending sin aprobación | Tres resoluciones pagas, reconciliación manual/original y rollback posterior aprobados. | Contraste del inventario completo realizado. |
| AC-06: rollback sin acceso gratuito abierto | Cutover, límites cerrados, preflight, retiro por modo/borrado, recency y API actuales aprobados. | Restore externo y habilitación operativa conservan sus tareas propias. |
| SC-019: conjunto de regresiones, activación y rollback | Unión completa de los terminales actuales y repeticiones, conservando filtros y reportes fallidos. | Ensayo aislado completo; no certifica gates operativos. |

## Ejecución vigente

El lote base terminó con 16 casos aprobados y uno fallido: `academy-membership-lifecycle.test.ts` completó las aserciones de transferencia y autorización, pero su limpieza no confirmó la ausencia de la rama propia. El reporte completo permanece fallido; no se convierte en un reporte verde por corregir después el entorno. La ausencia del identificador exacto quedó confirmada y la reejecución completa de ese caso terminó con un caso aprobado, cero fallidos y dos excluidos por el filtro declarado. Los otros dos casos conservan su evidencia aprobada del lote base.

El lote comercial terminó con 14 casos aprobados, cero fallidos y cero excluidos. Sus casos ejercen roles/NULL, recuperación gratuita y cancelación de solicitudes pendientes por moderación.

El nuevo caso de ingreso común automático por lista mediante Next, cookies nativas, PostgreSQL y UI/API reales terminó con un caso aprobado, cero fallidos y cero excluidos: recorrió Chromium y WebKit a 1280 y 390 px y comprobó cero efectos antes de confirmar, una membresía básica tras el POST y replay de la misma operación.

La revisión independiente detectó que contar sólo documentos no prueba la ausencia de un refresco RSC de Next. Tras terminar esa ejecución, el test se amplió para observar también solicitudes RSC a la ruta actual después de estabilizar la carga inicial. Tipos y lint de la versión corregida pasaron; su reejecución completa terminó con un caso aprobado, cero fallidos y cero excluidos, y la revisión final no dejó hallazgos accionables. La versión comprobada tiene SHA256 `46C22719E069C39064E2863734F250FA0B45B474557037D1C47217E14CAFFF6B`.

El lote de cuatro suites de navegador terminó con 14 casos aprobados, un caso fallido y cero excluidos. Pasaron el puente anterior de Next/UI/API, los cuatro casos personales OFF y los ocho casos personales ON de correo/teléfono, además del recorrido manual de Chromium. El recorrido manual de WebKit completó sus comprobaciones de negocio, pero falló al confirmar la limpieza de su rama propia. El reporte completo permanece fallido. Se verificó su identidad exacta y su ausencia después de la limpieza externa; la repetición completa de WebKit terminó con un caso aprobado, cero fallidos y un caso excluido por el filtro declarado. El caso excluido de Chromium conserva su terminal aprobado del lote anterior.

El lote SQL de entradas terminó con 46 casos aprobados, cero fallidos y cero excluidos en sus 19 archivos: bootstrap, entradas clásicas/pagas, lector/presentaciones legacy, lista común/local proof, entrada personal/manual/denegaciones/lista/rollback, resoluciones pagas, fuentes combinadas, límites cerrados y salida/reingreso/rollback. Las fuentes conservan sus hashes originales y las ramas propias de ese lote quedaron eliminadas. Las filas de preflight, decisión manual actual, retiro y API sin nuevo terminal conservan su estado pendiente.

El nuevo preflight SQL terminó con cuatro casos seleccionados aprobados, cero fallidos y catorce excluidos por el filtro declarado. Verifica el evaluador y runtime actuales, activación de policy/marker por su composición real, protecciones de cutover y conservación de históricos desconocidos/privilegiados sin backfill. El chequeo específico de tipos de tests también pasó; el chequeo de aplicación por sí solo excluye esas fuentes.

El preflight HTTP/UI terminó con tres casos seleccionados aprobados, cero fallidos y quince excluidos: configuración/pausa/recuperación original mediante HTTP real y la vista de impacto en Chromium y WebKit a ambos tamaños. Los históricos desconocidos y privilegiados aparecen como pendientes de resolución, sin backfill; al editar se limpia el resultado anterior. Las dos capturas regeneradas se conservaron en el registro privado y los assets originales del manual se restauraron tras el terminal.

La decisión manual actual terminó con seis casos seleccionados aprobados, cero fallidos y dieciséis excluidos. Ejercen la raíz de aplicación con identidad vigente, teléfono manual OFF sin verificación ficticia, presentación/replay/pending únicos, aprobación básica, cancelación por membresía externa sin fingir aprobación y rollback por dos obligaciones omitidas.

El último lote de retiro/API terminó con diez casos aprobados, cero fallidos y cero excluidos: modo/settings, material queued/in_flight/verified, canje/binding personales, owner de salida/borrado, recencia firmada y dos rutas HTTP reales de lifecycle/membresía. Confirma retiro de autoridad sin resurrección, rollback y recuperación de la operación original después del borrado físico.

Los jobs posteriores a los lotes iniciales usan `maxWorkers=1`, `maxConcurrency=1`, archivos secuenciales y limpieza propia; los iniciales no tenían casos concurrentes y usaron un worker sin paralelismo de archivos. Se conservan exactamente resultados, filtros y fallos de cada alcance; los excluidos no se cuentan como aprobados.

## Cierre y trazabilidad del ensayo

| Alcance efectivo | Casos aprobados | Exclusiones declaradas y resultados anteriores |
|---|---:|---|
| Cutover/lifecycle/acceso + recuperación/roles/moderación | 31 | Base 16 aprobados/1 fallo de limpieza; repetición de ese caso 1 aprobado/2 excluidos. Lote comercial 14 aprobados sin exclusiones. |
| Entradas SQL restantes | 46 | Cero fallos o exclusiones, 19 archivos. |
| Puentes y manual/personal UI | 15 | Matriz 14 aprobados/1 fallo de limpieza; repetición completa WebKit 1 aprobado/1 excluido. |
| Entrada común automática Next/UI/API | 1 | Versión reforzada RSC aprobada; no se cuenta otra vez su ejecución anterior. |
| Preflight SQL/HTTP/UI | 7 | SQL 4 aprobados/14 excluidos; HTTP/UI 3 aprobados/15 excluidos. |
| Decisión manual vigente | 6 | 16 excluidos; sólo se acreditan los seis casos seleccionados. |
| Retiro/API | 10 | Cero fallos o exclusiones, siete archivos. |

La suma efectiva es 116, sin sumar repeticiones ni exclusiones. Las 39 fuentes del inventario conservan sus hashes; manifiesto SHA256 `615CED563D27F98DD0A54582AA417DC8D1A08818EADF98AF17BCF65F077C12DF`. Las protecciones se comprobaron bajo runtime con bypass y el rol NOBYPASS real en los casos estructurales; no se atribuye ejecución con ambos roles a cada prueba de interfaz.

Los históricos NULL/privilegiados siguen registrados como pendientes de recuperación autorizada, sin valores inventados ni cambios del ensayo. OG-06 operativo, autorización productiva, hosting, canales reales, scheduler, latencia y restore externo no se certifican desde estos resultados. El cierre cambia exclusivamente T163 y conserva el alcance de las tareas restantes.
