# Reconciliación comercial y membresía básica

**Feature**: `001-academy-admissions`. **Base**: `567d53603702521c128bec87bc7291528147cec6`. Avance de T026; mantiene las dependencias, procedencia paga y OG-06 pendientes.

## Cambio y evidencia

Los métodos públicos de reconciliación por precio y diagnóstico general ahora actualizan membresía exclusivamente por suscripciones del producto `membership`. El método público de reconciliación del miembro usa el mismo cálculo. Se conservan silenciamientos, causas no comerciales, roles privilegiados, fecha y fundamento básico de admisión vigente; el estado comercial de academia sigue con su owner.

Se reprodujeron en PostgreSQL real dos defectos por ambas vías: una suscripción `academy` convertía `muted` en `active`; un UPDATE de suscripción a canceled se combinaba con la lectura anterior de esa misma fila y dejaba la membresía activa. El helper propio superpone las filas de RETURNING sobre el snapshot para calcular membresía y cantidad del precio con la misma información confirmada. No se revalidan schemas de filas ni payloads upstream.

La revisión señaló carreras entre precios actual/histórico y un orden inverso de locks en el escritor del miembro. Todos esos callers toman ahora el lock de tribu en una sentencia previa a modificar suscripciones/miembros; la sentencia siguiente obtiene un snapshot posterior a la espera. En webhook el lock se toma después de consultar al proveedor. La extracción no agrega pools ni RPC dentro de ese límite.

Se ejecutaron nueve casos SQL completos verdes y un caso concurrente adicional desde los métodos públicos. Cubren academia sin alterar muted, dato actual de suscripción, captura del estado legible antes de ocultarlo, método del miembro, conducta/remoción administrativa y fundamento básico no revocado por billing antiguo. Dos reconciliaciones públicas de precios actual/histórico cancelados terminaron sin revivir membresía. Cada escenario aplica SQL versionado sólo en una rama Neon propia, usa datos sintéticos y elimina esa rama con verificación.

Se agregó un undécimo escenario de oscilación real durante la lectura del proveedor en webhook. El replay usaba el estado anterior al lock y omitía reparar paused aunque el proveedor confirmara authorized. Se reprodujo `duplicate_webhook` con estado incorrecto; tras releer estado/motivo en una nueva sentencia bajo el lock, la misma operación produjo processed y persistió active sin otra RPC.

Los adapters de proveedor se inyectan en el puerto propio del repositorio; no se mockean librerías internas ni se realizan pagos, mensajes o llamadas reales al proveedor. Las 117 pruebas existentes conservaron sus expectativas y pasaron con los fixtures del executor propio ajustados a la consulta de bloqueo. Lint y ambos chequeos de tipos pasaron.

La documentación y los manuales relacionados se mantienen en el mismo trabajo. El validador de manuales no encontró errores; sus advertencias se deben a documentos locales sin URL de visor y a la ausencia de catálogo de traducciones. Chromium/WebKit a 390/1280 comprobaron enlaces y ausencia de desborde. Se conservan las ilustraciones existentes y su atribución, sin presentarlas como capturas nuevas.

## Alcance pendiente

T026 no queda completada por esta corrección. Faltan completar T025, la fuente paga propia consumible en academias ya protegidas y los casos restantes de todos los escritores/lifecycle. El control de admisión y su preflight permanecen sin habilitar; las guardas actuales no permiten restaurar una academia protegida mediante un flag del cliente. La recuperación histórica desconocida no se acredita desde estas pruebas ni se inventa una interfaz de resolución.

La entrega completa conserva sus 212 tareas, documentos normativos, matrices e identificadores. No se ejecutan migraciones en default/producción ni se configura un proveedor externo.
