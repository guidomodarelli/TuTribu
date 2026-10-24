# Antigüedad visible de solicitudes pendientes

## Alcance

Este incremento de T179/T189 implementa la distinción visual de FR-119 en la bandeja y el detalle autorizados. No cierra esas tareas, sus dependencias, la producción de recordatorios ni los gates de entrega y programación.

`projectAdmissionReview` deriva `pendingAgeThresholdReached` de `review.now`, la presentación original y el límite existente de tres días. Una pendiente vigente alcanza la marca exactamente en el umbral. La pausa conserva la marca; una solicitud terminal o una pendiente ya vencida la excluyen. El cálculo no escribe datos ni modifica la versión, presentación o vencimiento.

El DTO de revisión exige el booleano; la proyección de la solicitud propia lo omite. El contrato rechaza una marca positiva con estado terminal o vencimiento actual. La UI muestra texto visible y una señal de estilo, conserva SSR y primer render deterministas y recibe la actualización por su owner contextual existente. No agrega un reloj ni consultas. Una decisión confirmada limpia la marca mediante la transición mínima, sin refrescar la ruta completa.

## Fuente comprobada

El código de producto y sus pruebas quedaron guardados en `098d62c74a346a145e586f98b00b3b994e23a47c`. Los manuales y sus índices registran ese mismo commit. El CI anterior de `46219e08a7859e915073cb3d4f26f9f289d0d6f8` pasó con 5893 casos y 878 omitidos; corresponde a esa revisión anterior y no sustituye las cohortes locales de este indicador.

## Validación local

- 115 casos pasaron en siete archivos: límites anterior/exacto/posterior al umbral, reloj anterior a la presentación, los cuatro estados terminales, pausa y vencimiento, allowlist del DTO propio, contrato público inválido, SSR de lista/detalle, cambio contextual de la marca sin otra versión y conciliación de una decisión. Las pruebas de revisión, lotes, rutas y adaptadores usan bibliotecas reales y dobles sólo de sus puertos propios.
- Otros 48 casos pasaron en cuatro archivos de regresión de decisiones por lote, carga de la revisión, permisos y rutas de lote. Son una cohorte separada y no se suman a una ejecución de CI.
- Tipos de producto y pruebas, lint y build real de Next.js 16.3.4 terminaron con salida cero; el build generó 56 páginas. Se usó Node 24.21.0.
- La revisión aislada del código verificó los 2193 inputs y los quince archivos del incremento. Detectó una incompatibilidad del exportador con los IDs de checkboxes en una captura; se redujo el fragmento a nombre, marca y fecha de la fila, conservando los assertions del recorrido completo. La segunda revisión terminó sin hallazgos accionables.

## Matriz funcional

La ejecución real pasó: un caso funcional ejerció las cuatro combinaciones de Chromium/WebKit y 390/1280, con PostgreSQL y Next reales en una rama propia de Neon. Cada vista comprobó la marca en el HTML inicial y en la fila antigua, su ausencia en la fila reciente, su continuidad en el detalle, una única aprobación, su retirada tras la decisión y la recarga, y la ausencia de un refresco completo durante la interacción. Cada recorrido registró dos cargas de documento: entrada y recarga deliberada.

Las cuatro vistas terminaron sin errores de JavaScript o hidratación y sin desbordes; se confirmaron cuatro solicitudes y cero entregas externas. Los 2193 inputs conservaron sus hashes durante la ejecución. Se consumió el resultado terminal y se comprobó la limpieza de la única rama propia: las tres ramas originales permanecen, sin ramas adicionales. No se alteraron los relojes, guards, timeouts ni transportes para obtener el resultado. Las dos capturas provienen de la vista de Chromium a 1280 con datos sintéticos y el exportador habilitado.

## Documentación y límites

El manual conserva las 69 capturas anteriores con el mismo HTML y orden de CSS, y agrega dos fragmentos reales del indicador. Conserva los pasos anteriores y agrega 64 y 65. El menú y el índice enlazan el recorrido propietario. La marca de antigüedad no acredita que un recordatorio haya sido producido, aceptado o entregado.

El inventario permanece en 181 completas, 31 pendientes y 71 revisiones temáticas aprobadas. El fallo intermitente histórico del control de recuperación de lotes conserva su investigación independiente; este cambio no lo da por resuelto. Los ensayos externos y operativos mantienen sus condiciones originales.
