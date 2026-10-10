# Contraste de cobertura UI de T124/T129/T130

Checkpoint sobre `77992a2e`; tareas abiertas mientras falta la matriz administrativa terminal. Las historias y sus criterios se mantienen completos.

## Contratos locales actuales

Siete suites terminaron exit 0, 79 casos verdes y cero omitidos (`.git/codex-t124-current-ui-contracts.json`). Ejercen containers, presenters, shared controls, storage y schemas reales; los dobles corresponden sólo a puertos propios. Incluyen formulario y consentimiento, enlace inicial en memoria, recuperación de operación, cuenta incorrecta genérica, retorno de inicio/cambio de cuenta, elección separada de vía común, código local ON y ausencia de OTP/refresh ocultos OFF.

La auditoría identifica una brecha concreta de regresión DOM: lista utilizable marcada inicialmente y vencimiento UTC no se ejercían en el formulario, aunque el preparador de commands sí tenía sus contratos. Se añaden tres casos a `academy-invitation-management.test.tsx` para cubrir:

- Lista utilizable marcada, siete días propuestos, etiqueta inequívoca UTC y otra fecha futura enviada como instante UTC, sin dispensa ficticia.
- Fecha vencida bloqueada antes del write, foco en el error y limpieza de feedback/consentimiento tras corregirla.
- Fecha deshabilitada al elegir sin vencimiento, advertencia separada obligatoria y nueva confirmación antes de un único write con expiry null.

La primera corrida de esa suite terminó con 15 verdes/cero omitidos en 10,08 s. Tipos detectó una opción de Playwright no admitida en Testing Library; se retira sólo después del terminal, conservando el matcher por nombre. Tipos de tests y lint pasan sobre ese delta. La repetición final termina exit 0, 15 verdes/cero omitidos en 10,14 s (`.git/codex-t124-expiry-form-final.json`), SHA256 `AE399C64153304C847F7E17BD1BF8CD5101924F190D697B956862CEA4A5DDBFB`. No se cambia código de producto, reglas de fecha, espera ni validación para obtener verde.

## Evidencia nativa y límites

La carga focal WebKit ya pasó sin escrituras, errores JS ni desbordes sobre `96750d56`, después de la composición de identidad por petición con SQL fresco. La matriz administrativa original recorre Chromium/WebKit a 1280/390, crea/renombra/reemite tras pérdida de respuesta/revoca, comprueba URL efímera, recuperación por GET, cero OTP/presentaciones y una sola navegación. Se ejecuta primero email y luego teléfono para mantener como máximo dos ramas propias simultáneas, incluida la importación máxima activa. Sus etapas parciales no se cuentan como aprobación terminal.

La página de solicitante conserva la matriz nativa previa documentada en `personal-invitation-ui-baseline.md`, separada del formulario administrativo. No se atribuye a ninguna de estas evidencias entrega real de proveedor, activación externa, legacy, retención o toda US4. T124/T129/T130 se marcarán sólo tras contrastar cada requisito y las dependencias con evidencia suficiente.
