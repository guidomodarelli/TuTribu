# Rutas y contratos de comprobación local

T097 completada sobre `12f7c09c`: 115 tareas completadas y 97 pendientes de 212. El cambio de producto corresponde al preflight de reenvío; las rutas, códigos públicos y permisos conservan su contrato.

## Regresión y corrección

La matriz local extiende los cuerpos arbitrarios a verify/resend/application: destination, sender, body, text, purpose, userId, sessionId, verified, apiKey y connectionId se rechazan antes de composición. Las proyecciones de los tres resultados omiten contacto ajeno, remitente, credencial, envelope y cuota de otra tribu. Las cuatro acciones cierran con public_contract_unusable ante progreso de otro UUID, sin divulgarlo. Sesión/origen, confirmación explícita, formato del código, mayúsculas de UUID, propósito y protección de referencias conservan sus casos anteriores. El conjunto final pasó 64 casos locales, tipos de tests y lint.

La prueba HTTP real conserva Next, Better Auth, PostgreSQL, crypto y SDK, con transporte del proveedor cerrado y datos sintéticos. Agrega treinta y dos cuerpos arbitrarios rechazados, otra cuenta/sesión y otra tribu con política/cupo propio. Comprueba verify/resend, recuperación original y attachment cruzados, DTO mínimo y ausencia de efectos o envíos; mantiene emisión/replay, cooldown real, sustitución del código, fallo confirmado/replay, validación independiente de cuota/preparación y adjunción a la misma pending sin renovar fechas o conceder membresía.

El primer Native fue rojo en 220,12 s: el oráculo esperaba 422 para challenge_invalidated, pero el contrato vigente y la respuesta real usan 409. Se corrigieron exclusivamente las expectativas, conservando el código público. La segunda corrida fue roja en 228,81 s y reprodujo un defecto real: aparecía una operación de la otra cuenta después del rechazo de un reenvío ajeno. `resend` entraba al claim antes de `challengeScope`, a diferencia de verify/issue; el rechazo interior dejaba el registro started según el contrato del ledger.

Ahora una operación nueva resuelve `challengeScope` antes de reclamar progreso. La recuperación de un original completed permanece anterior al preflight y la mutación conserva su revalidación protegida. No se completa artificialmente un resultado ni se borra una operación existente. El rechazo mantiene 409 y el DTO seguro, con cero operaciones/presupuesto/despachos para el intento ajeno.

La regresión directa PostgreSQL de scope terminó verde en 130,44 s: verify/resend cruzados por cuenta y tribu, counters y operaciones intactos, y código original todavía validable por el propietario. La repetición HTTP sobre el build del fix terminó verde en 506,79 s: un caso completo, cero fallos y cero omisiones. Servidor y rama propia se cerraron; los cuatro hashes del target revisado permanecieron estables. No se acredita el build anterior como validación del nuevo preflight.

## Alcance documental y validación

Arquitectura, CHANGELOG en Unreleased y manual temático/índices describen el rechazo previo a iniciar un envío nuevo, sin agregar pantallas, roles o mecanismos de reasignación. Los manuales conservan español/escritorio y sus capturas/scripts; los checks estáticos actuales no tienen errores, con las advertencias conocidas de documento local sin URL publicada y sin catálogo central de traducciones.

La revisión inicial de los dos tests cerró sin hallazgos accionables y confirmó la validez de los oráculos de privacidad/cero claims: HEAD `12f7c09c`, dos hashes estables, manifiesto `C7C74F6932F0B661399DBB106369259A181C229DA62D0986126C9E93674E7762`. El fix de producto y sus regresiones se revisaron como un target propio antes del cierre de T097.

La revisión del fix y las tres regresiones cerró sin hallazgos accionables, con los cuatro hashes estables en HEAD `12f7c09c`; manifiesto `F6FF485E85F1715BCAA2793DA8A08B7F76E9D580C06967B69598359430F46854`. Confirmó que el replay completed precede al preflight, que el scope se comprueba antes del claim nuevo y que el callback conserva su revalidación. Arquitectura y tres manuales/índices pasaron dieciséis renders Chromium/WebKit a 1280/390, con frames y navegación menú/regreso/ancla/recarga válidos y sin errores/desbordes.

CI terminal exit 0 sobre los cuatro archivos congelados: lint, tipos de producto/tests, 451 suites/4.658 casos verdes en 627,75 s y build exitoso. Los 168 suites/506 casos omitidos por gates propios no acreditan integración SQL/HTTP. Los 162 enlaces internos de arquitectura y manuales resuelven archivo y ancla. El HTTP verde adicional usa este build del fix.

La corrida adicional de interacción documental terminó con exit 0: dieciséis renders y los controles reales de menú/regreso/ancla/recarga, acordeones, Inicio, hoja de contenido móvil y puntos de captura funcionan en Chromium y WebKit a 1280/390. No hay errores de JavaScript, desbordes ni frames inválidos. Esta prueba acredita los documentos; no sustituye los gates de la aplicación en WebKit.

## Matriz de cierre de T097

| Cláusula | Evidencia comprobada |
| --- | --- |
| Challenges/verify/resend/request proof reales | HTTP actual Next/Better Auth/SQL/crypto/SDK verde: emisión 201, replay y original 200, reenvío 201 después de la espera real, validación 200 y adjunción 200 a la misma pending. Dos envíos totales, una proof, una auditoría de adjunción y cero miembros; fechas originales intactas. |
| Destination/sender/purpose/operation | Las cuatro rutas rechazan sender/destination/purpose y autoridad arbitraria antes de los puertos; el propósito de salida distinto de admission y progreso de otro operationId producen fallo público seguro. UUID válidos en mayúsculas se normalizan y conservan el original. SMS alternativo sólo se deriva del desafío original y de la confirmación explícita. |
| Cuerpo/texto/verified/llaves arbitrarias; FR-064 y US-11-AC-03 | 64 casos locales incluyen las diez claves no autorizadas en las cuatro escrituras; HTTP ejecuta treinta y dos propuestas arbitrarias contra las rutas reales, con 400 y cero desafíos, entregas, operaciones, eventos o POST al proveedor antes de la emisión válida. |
| Contactos ajenos y cuota de otra tribu | Verify/resend por cuenta cruzada, verify por tribu cruzada y GET original ajeno devuelven sólo code/message/requestId; cero operaciones ajenas, contadores intactos y límite de la otra tribu aún 7. Adjunción con otra sesión rechaza proof_unavailable sin efectos ni datos del contacto. Proyecciones locales omiten destino, remitente, credencial, envelope y cuota privados; respuestas sin cache ni referrer. |
| US-05-AC-01/02/03 | Envío expresamente confirmado por conexión propia, código local de admission y alcance cuenta/tribu/desafío/propósito: HTTP actual y regresión SQL de scope. T095 conserva la prueba nativa de que verificar no crea sesión, marca global ni prueba de diagnóstico. |
| US-05-AC-04/05 | HTTP actual conserva fallo confirmado, replay y original sin duplicar, invalida el código previo al reenviar y valida aun con cuota 0 y conexión suspendida. La matriz nativa T095 acredita quinto fallo, expiración y presupuestos entre canales/propósitos; su baseline de alternativa WhatsApp→SMS prueba mismo teléfono, espera y dos envíos. T097 acredita además el contrato explícito de esa alternativa, sin sustituir el gate UI de T098. |
| US-05-AC-07 | El contrato seguro de conflicto y las carreras de owner único ya probadas en T095/T096 conservan su evidencia: rechazo sin identificar al dueño y sin reasignación. Esta tarea comprueba la proyección HTTP mínima y el rechazo de proof/request cruzados; UI de recuperación y gates externos permanecen en sus tareas. |

El cierre acredita rutas y contratos de T097. No completa T098–T106, la historia US5, los gates externos ni la matriz de aplicación WebKit pendiente. Todas las ejecuciones nuevas citadas tienen resultado terminal.

La auditoría final de cierre no encontró hallazgos accionables: 212 IDs y criterios intactos, siete hashes documentales y cuatro de código estables, manifiesto `FE4AD2C843C33411B30548A0F53B078E2799049AC0D81BE77EE88B0E84B4F82D`. El checkpoint `6de9d05c` quedó commiteado y subido. Los tres manuales registran ese commit real, conservando exactamente sus 79/89/86 rutas de fuente y sus scripts, estilos y capturas.
