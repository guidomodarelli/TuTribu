# Historial visible de una solicitud

Incremento de T182 guardado y subido en `f850a82619a29c93eb266c777ed7b1bc3630f491`, sobre el owner interno `fa3a405fcf758027e0d334d510de698dfbbfe0c4`. La ruta y el recorrido están implementados y tienen validación local, funcional y CI exacto aprobado. El [manual final](admission-review-history-manual.md) está trazado a ese código y validado. Se cierra el alcance de T182: el inventario pasa a **175 completas y 37 pendientes de 212**. No se acredita US8 completa ni un gate operativo.

## Alcance comprobado

La entrada `app/(platform)/[slug]/academia/admissions/history/[requestId]/page.tsx` resuelve input una sola vez y compone datos iniciales en el servidor con una factory mínima. No necesita proveedor, keyring ni confirmación reciente de Google. Su límite de Suspense y su loading pertenecen al segmento; los errores propios se presentan en español dentro de un único contenido principal.

El enlace parte del detalle de la solicitud autorizada. Conserva búsqueda, estado —incluido todos—, origen, fechas y requisitos verdaderos o falsos, límite y selección de la bandeja. El historial usa un cursor independiente con separador `~`; no convierte los filtros de regreso en autorización ni en filtros de eventos. La tupla SQL conserva su precisión y el orden descendente. El regreso selecciona la misma solicitud y la misma bandeja.

Líder y guardián activos consultan únicamente el recurso permitido. El acceso general de auditoría sigue reservado al líder. Los hechos iniciales autorizados pueden mostrarse por SSR; las acciones de entrada y continuación esperan la cuenta nativa actual para evitar retirar un enlace durante su activación por teclado. Activity y la restauración desde bfcache retiran los hechos anteriores, cancelan la consulta de cuenta pendiente y vuelven a comprobar el acceso. La pérdida de rol o sesión no conserva una lista privada visible.

La presentación permite consultar eventos anteriores, volver a los más recientes y actualizar el historial. Conserva tipos y estados conocidos, fecha, versión y atribución mínima. Un tipo antiguo desconocido usa una descripción segura; una referencia de cuenta ausente significa atribución no disponible. No se muestran contactos, notas, metadata libre, actor interno, referencias de operaciones, causas ni diagnósticos del proveedor. Un tramo autorizado vacío no se presenta como prueba de que nunca existió actividad.

La validación de fechas de la bandeja también rechaza un inicio posterior al final cuando ambos caen en el mismo milisegundo. Compara el instante y la fracción conservada, incluidos offsets, fechas anteriores a epoch y fracciones más finas. No cambia ni recorta la entrada válida ni añade validación de schemas sobre PostgreSQL.

## Evidencia local final

| Comprobación | Resultado y alcance |
| --- | --- |
| Suites focales completas | 133 casos, doce archivos, cero fallos u omisiones. |
| Tipos de producto y tests | Ambos comandos terminan correctamente. |
| Lint focal | 26 archivos, cero errores, hashes estables. |
| Build aislado real | 1799 archivos de producto equivalentes, 2060 del overlay, 55/55 páginas, exit cero e inputs estables. |
| Arquitectura | Cuatro vistas y 36 regiones, Chromium/WebKit a 390/1280, sin desbordes ni errores de script y con hash estable. |

Recibos locales finales: `.git/codex-t182-review-history-page-reviewed-focused-{target,outcome}.json`, `-reviewed-build-{target,outcome}.json`, `-reviewed-types.log`, `-reviewed-test-types.log`, `-reviewed-lint-result.json` y `-docs-proof.json`. Las repeticiones anteriores no se suman a los 133 casos. Estos recibos privados identifican los comandos, archivos y hashes; las suites versionadas ejercen comportamiento público, aplicación, componentes reales y rutas.

## Cuatro recorridos reales, dos cohortes finales

La matriz final conserva **tres aprobados y un fallido**, sin omisiones. El fallo de Chromium1280 apareció después de comprobar la revocación: su exportador intentaba capturar todo el main y encontraba otras rutas conservadas por Next. Se cambió únicamente la selección de captura dentro de `if (recordFrames)` para exportar la región actual del historial. No se cambió el producto ni el recorrido funcional para esa repetición.

La repetición completa de Chromium1280 terminó con **un aprobado, cero fallos y tres escenarios fuera del filtro**. La consolidación cuenta cuatro journeys únicos completados; no declara una sola ejecución cuatro/cero y no suma el caso fallido ni sus repeticiones.

| Journey único | Rol | Cohorte aceptada |
| --- | --- | --- |
| Chromium, 390 px | Guardián | Matriz `current-native`: tres aprobados y un fallo; éste es un escenario aprobado. |
| WebKit, 390 px | Guardián | Misma matriz; escenario distinto. |
| WebKit, 1280 px | Guardián | Misma matriz; escenario distinto. |
| Chromium, 1280 px | Líder | Repetición completa `current-capture`, uno/cero y tres fuera del filtro. |

Cada recorrido usa el servidor real aislado y el artifact PostgreSQL actual. Comprueba entrada y continuación con teclado, regreso con filtros, rechazo del alcance incorrecto, contenido minimizado, tramo vacío, restauración y permiso actual retirado. Cada recibo final confirma **cero errores de página, cero escrituras HTTP de admisión, cero operaciones, cero entregas, dos solicitudes intactas, cuatro eventos del recurso y siete exposiciones de lectura originales**. No se enviaron mensajes externos.

Recibos: `.git/codex-t182-review-history-page-current-native-{target,outcome}.json`, `-current-capture-{target,outcome}.json`, los cuatro artifacts de motor/ancho y `-native-matrix-proof.json`. La comprobación de procedencia verifica cuatro escenarios distintos, los contadores y hashes, el mismo runtime de 1799 archivos y que el único cambio entre tests pertenece a la rama de captura de escritorio. Esa comprobación es procedencia, no un caso de producto adicional.

Después de Native se reemplazó sólo una firma de tipos derivada de una constante por el tipo propio `AdmissionErrorCode`. La compilación con SWC de Next 16.3.4 produce JavaScript idéntico; los otros 1798 archivos son idénticos y los tipos, lint, build y 133 casos finales son posteriores. Recibos `-type-alias-proof.json` y `-runtime-correspondence.json`; tampoco se cuentan como tests de producto.

## Fallos retenidos y correcciones

- La primera carga falló por la implementación ausente y luego por omitir campos de un schema Zod refinado. No se cuentan como casos aprobados; se reutiliza la forma de campos y se aplica una sola refinación de fechas en el boundary.
- Dos hallazgos de la primera revisión se aceptaron: el error del historial introducía un main dentro del main real de `SidebarInset`, y el oráculo de HTML confundía el correo propio permitido del menú con una filtración del historial. Se corrigieron el render embebido y la comprobación por región; no se amplió la información del historial.
- Las regresiones de fechas empezaron con ocho aprobados y cuatro fallidos; el helper de dominio conserva la precisión y los casos actuales pasan.
- La regresión de respuesta tardía desde bfcache empezó con nueve aprobados y uno fallido; se aborta el controlador original antes del refresh.
- Las regresiones SSR reprodujeron acciones visibles antes de comprobar la cuenta actual: treinta/uno en la entrada y diez/uno en la continuación. Los hechos SSR se conservan y las acciones se habilitan después de la comprobación.
- La primera matriz Native terminó cero/cuatro: un oráculo global de correo propio, dos activaciones WebKit durante la retirada del enlace y un fixture con estado `inactive` inválido. PostgreSQL informó `23514`; el fixture usa ahora el estado real `muted`, sin modificar el guard ni el schema.
- Una repetición WebKit llegó correctamente a la revocación y confundió el alert propio con el anunciador global de rutas de Next. Se verificó la implementación instalada y se acotó la aserción al historial. Las cohortes diagnósticas y sus fallos se conservan, sin sumarlas como journeys finales.

## Límites de cierre

La conciliación oficial posterior a todos los productores Native confirmó cero ramas temporales propias y conservó producción, piloto original y la rama ajena. No se aplicaron migraciones productivas ni se alteró el piloto original. La revisión final de Codex, sólo lectura, terminó con cero hallazgos accionables y hashes estables: treinta modificados, nueve normativos, quince contextos y catorce recibos. El commit normal conserva exactamente los treinta archivos revisados y el remoto confirmó su mismo head.

El CI de `fa3a405f` pasó 528 archivos y 5516 casos, con 284 archivos y 818 casos omitidos y 54 páginas; pertenece al owner anterior y no valida esta página posterior. El [workflow automático de la UI guardada](https://github.com/guidomodarelli/TuTribu/actions/runs/38847886360) terminó correctamente para el head exacto `f850a826`: **530 archivos y 5563 casos aprobados**, **285 archivos y 822 casos omitidos**, build de **55/55 páginas**. Las omisiones no se cuentan como pruebas ejecutadas. El log completo tiene SHA256 `250d4a24514524fd72db54c5819ccbf952f00016b414cd37d9f98d20d140bd8c`; recibo `.git/codex-ci-t182-review-history-page-summary.json`.

<a id="t182-scope-audit"></a>

## Auditoría del alcance íntegro de T182

| Criterio | Implementación alcanzable | Evidencia inspeccionada |
| --- | --- | --- |
| Bandeja por tribu para líder y guardián activos, pendientes más antiguas primero | `GetAdmissionReviewUseCases`, `PostgresAdmissionReviewReader`, consulta SQL protegida y GET de solicitudes | `admission-review-reader.test.ts` ejerce ambos roles, orden, aislamiento y revocación; [base HTTP/SQL](admission-review-exception-filter.md). La consulta permanece separada del writer. |
| Búsqueda y filtros por estado, fecha, fuente, excepción y requisitos | Boundary real, proyección actual y controles de filtros | Suites de rutas y filtros actuales, incluidos false explícito, combinaciones y precisión temporal. Los [recorridos de filtros](admission-review-filters-ui.md) conservan su propia procedencia y cohortes. |
| Paginación estable y tramos vacíos | Cursor del bloque SQL examinado y continuación visible aunque el tramo filtrado esté vacío | Caso PostgreSQL anterior, `admission-review-filters.test.ts`, componentes reales y recorridos Native de filtros; no se sustituye una página vacía por el fin del historial. |
| Cuenta, contacto declarado, evidencia base o local, fecha, fuente y alcance distinguidos | `projectAdmissionReview`, DTO propio y detalle visible; base de cuenta Google frente a comprobación local de la solicitud | `admission-review-projection.test.ts`, contratos propios y componente de revisión reales. Se inspeccionaron las ramas de proyección y presentación; no se publican códigos ni secretos. |
| Razones actuales de elegibilidad | Evaluación de dominio al consultar y DTO de revisión; no convierte la prueba o la fuente en permiso | Casos de pausa, vencimiento, prueba revocada, excepción, autoaprobación y rechazo; estado y versión original se conservan. |
| Historial autorizado de la solicitud | SQL idx176, caso de uso y factory, segmento SSR y presentación mínima | [Owner interno](admission-review-history-query.md), 147 locales y un Native de integración de su checkpoint; 133 locales y cuatro journeys únicos de la página actual, documentados arriba. |
| Continuidad de filtros y selección | Enlace desde detalle, cursor histórico independiente y regreso al mismo request | Los cuatro journeys actuales comprueban el regreso y los booleanos explícitos sin confundir ambos cursores. |
| Permisos de guardián sin ampliación | Autoridad nativa por recurso, lectura actual antes/después, reautorización y cancelación al restaurar | SQL runtime/NOBYPASS y los Native de historial ejercen pérdida de rol, cuenta no revisora y recurso de otra tribu; cero efectos de decisión o envío. La auditoría general sigue reservada al líder. |
| Manuales y documentación propietarios actuales | Arquitectura, guía `.htm`, manual temático `.html` e índices, changelog Unreleased | [Manual final](admission-review-history-manual.md): 59 marcos, 55 preservados, doce vistas, cuatro recorridos, 184 enlaces, seis imágenes inspeccionadas y revisión de Codex sin hallazgos. |

Los paths previstos se satisfacen mediante owners separados de lectura y presentación, además del repositorio de comandos existente. Los filtros de la bandeja usan orden ascendente; los eventos del historial usan orden descendente. No se confunden esos dos requisitos ni sus cursores. La revisión documental conserva dos alcances: manual y flujos; después, actualización de evidencia e inventario. El checkpoint documental mantiene su propio workflow.

T176 y los demás criterios de lotes, preferencias, outbox, avisos, scheduler, mediciones y gates conservan sus tareas originales. T189 incluye todavía la UI de selección y decisión por lotes, T211 mantiene el control integral futuro y el objetivo completo sigue activo.
