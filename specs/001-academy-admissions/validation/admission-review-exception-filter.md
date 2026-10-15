# Filtro actual de excepción en la consulta de revisión

Avance parcial de T182 sobre `471e9e8fd47463fd268af8faab5a1eab14c7c4a8`. FR-109 exige distinguir excepción, fuente y requisitos pendientes. Este cambio completa la selección HTTP; no agrega todavía controles ni continuidad de filtros en la pantalla. T182/T189 y el objetivo general siguen abiertos, con **212 tareas, 174 completas y 38 pendientes**.

## Contrato y recorrido alcanzable

`GET /api/tribes/[slug]/admissions/requests?requiresExceptionReason=true|false` → `createAdmissionReviewHandlers.list` → `GetAdmissionReviewUseCases.list` → `PostgresAdmissionReviewReader.readList` → proyección propia `projectAdmissionReview`.

El parámetro opcional selecciona exactamente `restrictions.requiresExceptionReason` del detalle actual. No modifica la fuente `common|personal|legacy` ni describe una excepción histórica. El valor ausente no restringe; `true` y `false` se conservan por separado. Puede combinarse con estado, fuente, búsqueda, fechas y necesidad de verificación. Otro impedimento actual, como prueba faltante, pausa o recovery lock, conserva su prioridad: el filtro no inventa una excepción pendiente de motivo cuando el detalle aún no la presenta así.

El schema se mueve a `constants/admission-review-input.ts` y mantiene su reexport anterior. Input se valida una vez en HTTP y el DTO propio conserva su schema; no se validan filas ni payloads de proveedor. La implementación reutiliza la evaluación actual y no agrega reglas complejas a SQL/RLS, migraciones, permisos, escrituras, envíos ni gasto.

Cada consulta deriva autoridad de cuenta, sesión y rol actuales. Se conservan las comprobaciones antes/después y la restricción de tribu. El bloque examinado sigue acotado por `limit`; una página sin coincidencias puede devolver cursor. La continuación avanza por todos los registros examinados, manteniendo timestamp SQL e ID, sin saltarse un bloque ni iniciar un escaneo ilimitado.

## Validación focal terminada

La reproducción inicial dio **6 aprobados y 4 fallidos** en los dos archivos completos de HTTP y application: el boundary rechazaba el filtro y el caso de uso descartaba tanto `true` como `false`. Tras el cambio, esos mismos diez casos pasaron sin omisiones. Tipos de producto y tests, y lint de los ocho archivos TypeScript afectados, aprobaron.

La regresión ampliada de siete archivos completos pasó **50 casos**, sin fallos ni omisiones y con inputs estables. Incluye HTTP, application, proyección, snapshot SSR, transporte, contrato y componente de revisión con sus librerías reales. No se suman nuevamente los diez casos de la primera comprobación. Recibo privado: `.git/codex-t182-exception-filter-focused-current-{target,outcome}.json`.

El archivo PostgreSQL completo pasó **un caso Native**, sin filtros ni omisiones, con **2015 inputs estables** y resultado terminal consumido. Usó migraciones reales en su propia rama Neon y ambos roles runtime y non-bypass: orden y cursor, página vacía con continuación y fin, valores true/false, cambio de política manual a lista, combinación con búsqueda, fecha, fuente y verificación, recovery lock, prioridad de prueba faltante y pausa, alcance ajeno y revocación de rol/sesión. No creó operaciones, vínculos de contacto ni entregas. Recibo privado: `.git/codex-t182-exception-filter-native-current-{target,outcome}.json`. Son **51 casos distintos** entre ambas ejecuciones.

La sección de arquitectura pasó cuatro vistas, Chromium/WebKit a 390 y 1280 px, sin errores JavaScript ni desbordes y con hash estable; se inspeccionó además la captura móvil de WebKit. Los resultados de CI de commits anteriores no acreditan este cambio posterior. El manual de la bandeja conserva su recorrido actual porque este avance no agrega controles a esa pantalla.

La conciliación oficial de Neon de `2026-10-15T23:39:44.293Z` confirmó cero ramas temporales propias, conservando producción, el piloto y `dev-sandbox-guido`. Sólo se consultaron metadatos y recibos exactos; no hubo envíos externos.
