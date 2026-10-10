# Contraste de cobertura UI de T124/T129/T130

Contraste iniciado sobre `77992a2e`; se conservan sus etapas parciales y se registran los terminales actuales por separado. Las historias, criterios y dependencias permanecen completos; el ensayo humano SC-014 corresponde a T207 y no se acredita mediante una implementación UI.

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

## Primer terminal administrativo actual

La variante email termina exit 0 en 1703,14 s (28 min 23 s), un caso verde y la variante phone filtrada, no acreditada en esa corrida (`.git/codex-t124-management-email-identity.json`). Su loop interno completa las cuatro combinaciones Chromium/WebKit a 1280/390: creación, rename, replacement con respuesta perdida, recuperación por GET y revoke; conserva una navegación, cero códigos/presentaciones y estados SQL finales exactos. Source SHA256 `3B10DB6E9633EDF107622E08B2136EA74BD249F76951BF8963A570095316B8EB` permanece idéntico durante el ensayo. Next, contexts, browsers, pool y rama propia completan sus finally antes del terminal.

La variante phone se inicia sólo después de ese terminal y cleanup, con el mismo archivo inmutable y otra rama propia. T124/T129/T130 siguen abiertas mientras falta su resultado. Las capturas email reales se conservan para QA documental; no se modifica ni se publica una captura como prueba de toda la matriz.

## Capturas y manual del primer terminal

Se incorporan al manual las tres capturas email reales y sanitizadas, conservando sus 41 estados. La comparación source-trace desde df2f4a hasta `27d04837` verifica los cambios de storage/retirement, journal y composición de identidad; no se inventan controles públicos para el adapter T139 aislado. El owner y su menú apuntan al código comprobado, con enlaces y temas conservados. La captura issued es transitoria: muestra la emisión confirmada mientras se consulta el historial; su pie explica Guardando y el bloqueo temporal, sin alterar la imagen para aparentar otro estado.

Check-manual: 15 secciones, 41 capturas, cero errores; quedan dos avisos propios del manual local sin URL compartida/catálogo externo. El aviso inicial de navegación era sólo CRLF frente a LF: la comparación normalizada acredita el mismo script canónico, conservado al refrescar. QA: 28 renders Chromium/WebKit a 1280/390 con cero errores o desbordes, navegación de menú/regreso/enlace con ancla y recarga. Se verifican 130 enlaces/anclas en owner, menú e índice detallado, sin roturas; inspección visual de la captura issued en ambos tamaños. No se usa este QA como prueba Native phone ni cierre de T131.

Después de aclarar el pie transitorio y registrar la fuente del menú, el QA focal del owner termina con cuatro renders adicionales Chromium/WebKit a 1280/390, cero errores/desbordes y la misma navegación real. Check-manual sigue con cero errores y los mismos dos avisos locales; la comprobación de 130 enlaces/anclas se repite sin roturas. Las fuentes de la matriz y de la importación máxima permanecen inmutables.

## Segundo terminal y matriz administrativa completa

La variante phone termina exit 0 en 1716,90 s (28 min 37 s), un caso verde y email filtrado en esa corrida (`.git/codex-t124-management-phone-identity.json`). Se observan 24 etapas con revocación final en las cuatro combinaciones Chromium/WebKit a 1280/390. Junto al terminal email acredita ocho combinaciones completas, no los skips de cada filtro. El source hash original permanece idéntico; Next, contexts, browsers, pool y rama propia completan limpieza antes del terminal. Ningún engine se sustituye por headers HTTP o por un test de componente.

Los tres casos DOM nuevos completan la brecha de lista/vigencia/UTC/feedback. La matriz personal anterior acredita ON local, OFF sin OTP oculto, cambio de cuenta/retorno y vía común separada; su scope y snapshot se conservan en `personal-invitation-ui-baseline.md`. La revisión final contrasta T124/T129/T130 individualmente con esas evidencias y dependencias, sin atribuir entrega externa, SC-014 humano, toda US4 ni los gates.

El build posterior a los dos terminales y al adapter aislado T139 termina exit 0, sin lanzar una compilación sobre un servidor Next activo. El loader, presenters y shared controls mantienen el snapshot probado; el ensayo de diez personas SC-014 y el cierre documental completo de T131 conservan tareas propias.

## Cierre individual de las tres tareas UI

| Tarea | Criterio completo y evidencia |
| --- | --- |
| T124 | Formulario nominativo, lista por defecto, vigencia/UTC, dispensa y advertencias, URL inicial única, reemplazo/revocación, foco/feedback y ausencia de refresh ordinario: quince casos DOM y ocho combinaciones administrativas reales. Cuenta/retorno y elección separada de vía común: contratos actuales y matriz personal anterior, sin canje o código ocultos por abrir/cambiar cuenta. |
| T129 | Página SSR con loading/error y container/presenter propios, props privadas minimizadas, identidad equivocada genérica y retorno interno; ON completa el paso local antes de confirmar canje, OFF no inicia OTP. Se mantienen los Native personales previos y la recuperación original sin rePOST; T128 y T124 están cerradas. |
| T130 | Administración SSR/loading/container con shared controls y SCSS/BEM, destinatario/nombre, lista/dispensa, UTC/vigencia, confirmaciones de reemplazo/revocación y URL sólo en memoria inicial. Las ocho combinaciones administrativas y los controles DOM verifican el recorrido; se cierra después de T129. |

La revisión Codex final no identifica hallazgos accionables ni brechas obligatorias de estos criterios individuales. Manual, menú y asset mantienen sus hashes; el audit incorpora los terminales declarados y conserva sus diferencias frente a los filtros. Las 38 templates anteriores se preservan junto a tres administrativas sanitizadas, sin cambiar el runtime ni transformar el estado transitorio en uno ficticio.

Se marcan T124, T129 y T130 en orden de dependencias, sin editar su descripción, archivos propuestos o trazabilidad. El conteo pasa a 133 completadas y 79 pendientes; los 212 IDs quedan intactos. T131/T132, SC-014/T207, entrega externa, legacy, retención y gates siguen pendientes. Este cierre no afirma toda US4 ni el resultado de la importación máxima.
