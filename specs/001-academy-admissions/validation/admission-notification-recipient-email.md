# Correo actual y confiable para un aviso original

Este incremento añade política, puerto y reader privados sobre la base guardada en 5944a8cd. Mantiene las 212 tareas originales: 174 completas y 38 pendientes. T185 y US8 conservan todo su alcance.

## Contrato implementado

- Cada lectura corresponde a un aviso existente con obligación, tribu, destinatario y audiencia exactos. El solicitante debe ser el dueño del pedido; el destinatario revisor debe conservar rol y estado activos. La preferencia de frecuencia no altera la confianza de identidad.
- La alternativa global exige captura vigente y vínculo actual de Google con el mismo usuario, cuenta, subject y correo normalizado. Solo acepta Gmail o Workspace. No infiere identidad desde emailVerified ni usa la duración del token OAuth como TTL de la captura.
- La alternativa local exige evidencia de admisión aplicada al pedido, usuario y tribu originales. El contacto del pedido y de la prueba debe ser correo e igual al correo actual de la cuenta. Verificación/aplicación no pueden estar en el futuro; prueba y versión fuente deben corresponder al ambiente y época actuales. No reinicia la ventana original consumida.
- Un teléfono y la prueba diagnóstica no acreditan otro correo. Una captura global independiente puede acreditar el correo actual aunque el pedido verificara teléfono. La alternativa local de un solicitante no se convierte en permiso revisor.
- El adapter usa la transacción privilegiada del owner, conserva el orden usuario/cuentas/capturas y fija rol, fuente y procedencia local antes de la proyección final. Solo usa cuentas efectivamente bloqueadas y repite hechos después de las esperas. No necesita sesión humana, SDK ni proveedor. Fallos de storage o del reader local de runtime se propagan.
- El resultado contiene únicamente ámbito y destino actual normalizado. No incluye notas, teléfono, claims, secretos ni datos de proveedor; no es DTO público ni token de envío. Capacidad, frecuencia, habilitación, lifecycle, recovery lock y destino congelado siguen en sus owners.

## Evidencia actual

Los rojos fueron errores de carga por política/modelo y luego reader inexistentes: **cero casos ejecutados y un archivo fallido** en cada fase. El fixture Native todavía no había corrido. No se presentan como fallos SQL ni se suman a los casos actuales.

La política completa pasó **41 casos**, sin filtros y con inputs registrados estables: autoridad global actual, vínculos y ámbitos cruzados, invalidación, tipo/purpose/estado de prueba, épocas/ambiente, fechas, roles y proyección mínima. El reader de PostgreSQL terminó el **2026-10-15T17:02:39.200Z** con **tres casos completos aprobados, cero fallos y cero filtrados**, y sus trece inputs registrados estables:

1. Correo capturado de la cuenta actual sin sesión humana, conservación de puntos/etiquetas y normalización cosmética. La misma instancia del reader rechaza la captura invalidada tras cambiar y revertir correo; el aviso revisor se vuelve insuficiente al perder el rol. Avisos de otra tribu o destinatario no entregan un destino.
2. Una prueba local aplicada mantiene su contexto original aun después de terminar la ventana de aplicación. El teléfono verificado con emailVerified genérico no habilita correo. Ambiente/época distintos y referencia cruzada se rechazan. Fechas, estado y aplicación del proof se conservan exactamente, sin membresía para los solicitantes.
3. El helper original observa un bloqueo real de PostgreSQL sobre la cuenta. La transición invalida la captura y confirma después de esa observación. El reader reconsulta tras la espera y devuelve ausencia; el holder, observer y contender terminan.

Son **44 casos distintos actuales** entre dominio y Native. Se usan pg, Drizzle, guards y journal reales, sin dobles de esas dependencias. La historia sintética se carga antes de instalar su primer guard mediante el helper existente; luego se completa el journal original. No se deshabilitan triggers ni reescriben fechas persistidas. Esto prueba lectura de metadata protegida y vínculos actuales, no otro recorrido de OAuth o verificación OTP.

Lint focal, tipos de producto y tipos de pruebas pasaron. La conciliación oficial posterior del **2026-10-15T17:04:31.632Z** conserva producción y el piloto original, con cero ramas temporales. No hubo envíos externos. La arquitectura se comprobó en cuatro vistas reales de Chromium/WebKit a 390 y 1280 px, sin overflow y con el enlace local disponible; se inspeccionaron visualmente Chromium de escritorio y WebKit móvil. La evidencia sanitizada está en [admission-notification-recipient-email-results.json](admission-notification-recipient-email-results.json).

## Alcance restante

Faltan composición del productor de grupos con este reader, habilitación y preferencias/capacidad actuales, intent completo sellado de outbox, dispatcher, recuperación y mantenimiento, recorridos públicos y mediciones. El dispatcher deberá repetir los hechos actuales y comparar el destino con el intent congelado; este reader no rerutea por sí solo una entrega existente.

El [CI completo de 5944a8cd](https://github.com/guidomodarelli/TuTribu/actions/runs/38770055543) aprobó 5314 casos y el build real de 53 páginas. Corresponde a la base anterior y no se atribuye a este incremento posterior. El siguiente commit mantiene su control completo; T185/US8, T211 y los gates operativos continúan pendientes.
