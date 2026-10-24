# Auditoría de UI/UX, mutaciones, boundaries y rendimiento del flujo de academia

Inventario de cada segmento, subflujo y acción de la academia, auditado con las skills `ui-ux-flow-patterns`, `optimistic-action-mutations`, `nextjs-route-ui-boundaries` y `measured-performance-optimization` de golfo-kit. Cada fila termina en **cumple** o en el PR que la corrigió. Los hallazgos que no se corrigen quedan con la decisión que los justifica.

- **Base:** `feature/academy-admissions-spec` en `292677b6` (guidomodarelli/TuTribu#93).
- **Next.js:** 16.3.4 con `cacheComponents: true`. Toda ruta valida instant navigation en desarrollo.
- **Entorno de verificación:** `https://dev.tutribu.app` con portless, sobre una rama Neon efímera propia con el journal real de migraciones. El login de desarrollo (`DEV_SIGN_IN`) entra como líder, y las demás identidades usan las sesiones sintéticas de `tests/support`. Chromium y WebKit, a 390 px y a 1280 px.
- **Medición:** el protocolo de [admission-leader-flow-queries.md](admission-leader-flow-queries.md) (build de producción, preload `admission-query-counter.mjs`, mediana de tres muestras) para viajes a la base por request. Lighthouse y `performance` en Playwright para LCP, CLS e INP.

## Leyenda

| Estado | Significado |
|---|---|
| cumple | Revisado contra las cuatro skills; no requiere cambios. |
| PR | Corregido por el PR enlazado, mergeado en `feature/academy-admissions-spec`. |
| pendiente | Hallazgo verificado en el código, todavía sin PR. |
| decisión | No se corrige; la fila cita la decisión del usuario. |

## Estructura transversal

| Segmento | Layout | `loading.tsx` | `error.tsx` | Lectura de `params`/`searchParams`/`cookies()`/`headers()` |
|---|---|---|---|---|
| `app/(platform)/layout.tsx` | Shell `AppRailShell` (cliente) | — | — | `cookies()` y `headers()` dentro de su propio `<Suspense>` |
| `app/(platform)/[slug]/layout.tsx` | Monta `TribePresenceHeartbeat` en `<Suspense>` | Skeleton del fogón | — | No lee `params` en el servidor (cumple) |
| `app/(platform)/[slug]/academia/admissions/layout.tsx` | `AdmissionWorkspaceFrame` (cliente), slug con `useParams` dentro de `<Suspense>` | — | — | No lee `params` en el servidor (cumple) |
| `app/(admission)/admissions/**` | Solo `app/layout.tsx` | Propio por segmento | Propio salvo `legacy/[token]` | Dentro del `<Suspense>` del propio segmento (cumple) |

## 1. Solicitante

### Segmentos

| Ruta | Subflujo | Contenedor y componentes | Endpoints y casos de uso | Boundaries |
|---|---|---|---|---|
| `/admissions/[slug]` | Enlace de admisión, formulario, código por correo o SMS, confirmación | `admission-container.tsx` (cliente), `AdmissionScreen`, `AdmissionRequestSteps`, `AdmissionForm`, `ContactVerification`, `RequestStatus` | `POST submissions` → `SubmitAdmissionUseCase`; `challenges`, `challenges/current`, `challenges/[id]/{verify,resend}`; `requests/[id]/{cancel,proof,whatsapp}`; `operations/[id]` | `loading.tsx` y `error.tsx` propios |
| `/admissions/[slug]/legacy/[token]` | Enlace heredado | `legacy-admission-container.tsx` envuelve el contenedor de admisión | Los mismos | `loading.tsx` re-exporta al padre; sin `error.tsx` propio |
| `/admissions/invitations/[token]` | Invitación personal | `personal-invitation-container.tsx`, `PersonalInvitation`, `ContactVerification` | `GET /api/admissions/invitations/[token]/overview`; `POST submissions` con `invitationToken` | `loading.tsx` y `error.tsx` propios |
| `/admissions/requests/[requestId]?tribe=` | Estado de la solicitud | `request-container.tsx` re-exporta el contenedor de admisión | `own-request`, `requests/[id]/cancel` | `loading.tsx` y `error.tsx` propios |

### Acciones

| Acción | Clase actual | Clase que corresponde | Doble envío | Error, timeout y resultado incierto | Idempotencia en el servidor | Estado |
|---|---|---|---|---|---|---|
| Enviar solicitud | Pending-first, confirmada por el servidor | La misma | `busy`, `pending`, botón con `loading` | Sin deadline: un request colgado deja `writing` sin salida (SOL-05) | `operationId` persistido antes del POST; ledger con huella firmada | pendiente (SOL-05) |
| Pedir código | Confirmada por el servidor | La misma (envío real de Zavu) | `busy` y `record.pending` | Deadline de 120 s y una lectura del original | Ledger de operaciones | cumple |
| Verificar código | Confirmada por el servidor | La misma | Ídem | Ídem; errores de campo junto al input | Ledger | cumple |
| Reenviar código o pasar a SMS | Confirmada por el servidor, con cooldown | La misma | Ídem | Ídem | Ledger | cumple |
| Aplicar prueba | Confirmada por el servidor | La misma | Ídem | Ídem | Ledger | cumple |
| Descartar una operación ausente | Lectura de `operations/[id]` | La misma | `busy` | 120 s | — | cumple |
| Cancelar solicitud | Confirmada por el servidor, con casilla | La misma | Casilla y `busy` | Sin deadline (SOL-05) | Ledger | pendiente (SOL-05) |
| Actualizar WhatsApp | Confirmada por el servidor, atada a la versión | La misma | `busy`, versión | Sin deadline (SOL-05) | Versión esperada | pendiente (SOL-05) |
| Aceptar invitación | Confirmada por el servidor | La misma | `busy`, `pending`, `ready` | 120 s; éxito duplicado en toast e inline (SOL-07) | Ledger | pendiente (SOL-07) |
| Cambiar de cuenta | Confirmada por el servidor | La misma | `busy` | Sin deadline en el contenedor de admisión (SOL-05) | — | pendiente (SOL-05) |

### Hallazgos

| Id | Skill | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|
| SOL-01 | boundaries, estados | El `loading.tsx` de invitación y de solicitud muestra el encabezado «Solicitar ingreso» y un texto «Consultando estado…» en lugar de un skeleton con la forma de cada pantalla. | `components/academy-admissions/admission-screen/index.tsx` (`AdmissionLoading`) | pendiente |
| SOL-02 | boundaries | `AdmissionRouteError` reintenta con `reset`, que no vuelve a pedir el RSC; Next 16.3 recomienda `retry`. | `components/academy-admissions/admission-route-error/index.tsx` | pendiente |
| SOL-03 | estados | El estado `unavailable` del enlace y de la solicitud no ofrece reintento: solo «Ir al inicio». | `admission-screen/index.tsx` | pendiente |
| SOL-04 | estados | Un parámetro de seguimiento (`?utm_source`, `?fbclid`) hace que el enlace de admisión muestre «No podemos mostrar esta admisión», porque la query se valida con `z.strictObject({})`. | `src/modules/academy-admissions/infrastructure/composition/admission-page.ts`, `personal-invitation-page.ts` | pendiente; el usuario decidió que las páginas ignoren los parámetros desconocidos y las APIs sigan estrictas |
| SOL-05 | mutaciones | Enviar, cancelar, actualizar WhatsApp, leer y cambiar de cuenta no tienen deadline: un request colgado deja la fase `writing` y el toast de carga sin fin. | `app/(admission)/admissions/[slug]/admission-container.tsx`, `lib/academy-admissions/admission-api-client.ts` | pendiente |
| SOL-06 | estados | Un resultado incierto muestra el mismo texto dos veces, en el aviso de incierto y en la alerta de error. | `admission-container.tsx`, `admission-screen/index.tsx` | pendiente |
| SOL-07 | estados | Aceptar una invitación muestra el éxito en línea y en un toast a la vez. | `components/academy-admissions/personal-invitation/hooks/use-personal-invitation.ts` | pendiente |
| SOL-08 | boundaries | Falta `metadata` (`robots` noindex y `referrer` no-referrer) en `/admissions/[slug]` y en `/admissions/requests/[requestId]`; legacy e invitación la tienen. | `app/(admission)/admissions/[slug]/page.tsx`, `requests/[requestId]/page.tsx` | pendiente |
| SOL-09 | validación | Los errores del formulario y de cancelar terminan en una sola alerta al pie de la página, lejos del paso o de la casilla que los produjo. | `admission-container.tsx` pasa `errorMessage={null}` a `AdmissionForm` y `RequestStatus` | pendiente |
| SOL-10 | copy | Los vencimientos se muestran en segundos crudos («Vence en 587 segundos»). | `components/academy-admissions/contact-verification/index.tsx` | pendiente |
| SOL-11 | estados | Un token heredado con formato inválido ofrece «Reintentar», que no puede funcionar porque el error es determinista. | `app/(admission)/admissions/[slug]/legacy/[token]/legacy-admission-container.tsx` | pendiente |

## 2. Líder

### Segmentos

Todas las hojas de `academia/admissions/**` envuelven un componente async en `<Suspense fallback={<Loading/>}>`, esperan `params` y `searchParams` dentro de ese boundary y cargan un snapshot en el servidor. Cada hoja tiene `loading.tsx` (`AdmissionPageSkeleton`) y `error.tsx` (`AdmissionRouteError embedded`).

| Ruta | Subflujo | Contenedor | Endpoints y casos de uso |
|---|---|---|---|
| `/[slug]/ajustes` | Activación de la academia | `components/academy/academy-activation` | Activación de la academia |
| `/[slug]/academia/admissions/settings` | Política y reglas (países, cupos, teléfono), pausa y reanudación, comprobación previa, membresías comerciales | `settings/policy-container.tsx`, `use-commercial-membership-review.ts` | `policy`, `policy/{activate,pause,preflight}`, `commercial-memberships/**` |
| `/[slug]/academia/admissions/allowlist` | Allowlist: alta y baja | `allowlist/allowlist-container.tsx`, `use-allowlist-workflow.ts` | `allowlist`, `allowlist/[entryId]` |
| `/[slug]/academia/admissions/allowlist/imports` | Importación CSV con vista previa, selección, confirmación y reporte | `allowlist-import-container.tsx`, `use-allowlist-import-workflow.ts` | `allowlist/imports/**` |
| `/[slug]/academia/admissions/invitations` | Invitaciones personales: crear, revocar, reemitir, renombrar | `invitations-container.tsx`, `use-personal-invitation-management.ts` | `invitations/**` |
| `/[slug]/academia/admissions` | Bandeja y revisión: aprobar, rechazar, en lote, ver más, filtros; guía de configuración | `admission-review-container.tsx`, `AdmissionSetupGuide` | `requests`, `request-decisions`, `requests/[id]/decision`, `operations/[id]`, `overview` |
| `/[slug]/academia/admissions/history/[requestId]` | Historial de una solicitud | `history-container.tsx` | Lectura del historial |
| `/[slug]/academia/admissions/notifications` | Avisos: preferencias y correo de la tribu | `notification-settings-container.tsx` | `notification-preferences`, `email-settings` |
| `/[slug]/academia/admissions/activity` | Actividad y métricas | `admission-activity-container.tsx`, `AdmissionMetrics` | `activity`, `activity/snapshot`, `metrics` |

### Acciones

Todas las escrituras son pending-first y confirmadas por el servidor, que es la clase que corresponde: cambian permisos de ingreso, mandan avisos o son irreversibles. La intención se persiste con un `operationId` antes del POST, un resultado incierto ofrece «Consultar operación original» sin reenvío automático y el servidor deduplica por `(actor, tribe, operationType, idempotencyKey)` con huella (`postgres-admission-operation-repository.ts`).

| Acción | Confirmación | Timeout | Reconciliación | Estado |
|---|---|---|---|---|
| Activar academia | Diálogo | Sin deadline | `router.refresh()` | pendiente (LID-09) |
| Guardar y activar reglas | Casilla | Sin deadline | Relectura del recurso | pendiente (LID-09) |
| Pausar y reanudar admisiones | Motivo y botón de peligro para pausar | Sin deadline | Relectura antes de escribir | pendiente (LID-09) |
| Volver a comprobar | — | — | Lectura | cumple |
| Alta y baja en la allowlist | Casilla | 120 s | Relectura | cumple |
| Importar CSV | Selección y confirmación | 120 s | Reanudar y conciliar | pendiente (LID-10) |
| Crear, reemitir, renombrar y revocar invitaciones | Motivo y reconocimiento si ya se canjeó | 120 s | Relectura; enlace de un solo uso | pendiente (LID-01) |
| Decidir una solicitud o un lote | Casilla; motivo para rechazar | Sin deadline | Recuperación del lote por `operation` | pendiente (LID-09) |
| Decidir una membresía comercial | Casilla | Sin deadline | Relectura | pendiente (LID-09) |
| Guardar avisos | — | Sin deadline | Cadena correo → preferencia con progreso parcial | pendiente (LID-09) |

### Hallazgos

| Id | Skill | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|
| LID-01 | estados, mutaciones | Volver a la ventana (`focus`) borra el enlace de invitación de un solo uso antes de copiarlo y muestra «La cuenta o el acceso cambió». | `use-personal-invitation-management.ts` (listener de `focus`) | pendiente |
| LID-02 | estados | La actividad oculta su contenido cada vez que la pestaña vuelve a estar visible, y al filtrar o paginar reemplaza todo por un texto de carga. | `activity/admission-activity-container.tsx` | pendiente |
| LID-03 | boundaries, estados | La bandeja y el historial ocultan los datos del SSR al hidratar y los vuelven a mostrar tras el chequeo de viewer (contenido, vacío, contenido). | `admission-review-container.tsx`, `history/[requestId]/history-container.tsx` | pendiente |
| LID-04 | estados, a11y | El error de la bandeja no usa `embedded`: anida un `<main>` y duplica el `<h1>`. | `admission-review-container.tsx` | pendiente |
| LID-05 | estados | «Reintentar» recarga el documento (`window.location.reload()`) y pierde el estado del cliente. | review, policy, activity, notifications, allowlist, import, invitations | pendiente |
| LID-06 | estados | Allowlist, importación e invitaciones muestran la pérdida de acceso solo con un texto, sin acción de salida. | `allowlist-management`, `allowlist-import`, `invitation-management` | pendiente |
| LID-07 | estados | «Ver más» en allowlist, invitaciones y actividad reemplaza la página en lugar de sumarla. | `use-allowlist-workflow.ts`, `invitations-container.tsx`, `admission-activity-container.tsx` | pendiente |
| LID-08 | copy | Fechas ISO/UTC crudas en invitaciones e importación, y «día UTC» en métricas. | `invitation-management`, `allowlist-import`, `admission-metrics` | pendiente |
| LID-09 | mutaciones | Bandeja, reglas, avisos, membresías comerciales y activación no tienen deadline: un request colgado deja la acción en curso sin salida. | `lib/academy-admissions/admission-api-client.ts` | pendiente |
| LID-10 | estados | La importación de hasta 10.000 filas no permite seleccionar todas las válidas. | `allowlist-import`, `use-allowlist-import-workflow.ts` | pendiente |
| LID-11 | validación | La zona horaria de los avisos es un campo de texto libre. | `admission-notification-settings` | pendiente |
| LID-12 | boundaries | `/[slug]/academia/gestionar` no tiene `error.tsx` y cualquier fallo de carga termina en `notFound()`. | `app/(platform)/[slug]/academia/gestionar/page.tsx` | pendiente |
| LID-13 | boundaries | `AdmissionPageSkeleton` usa el mismo cuerpo (tres datos y tres filas) para formularios con pasos. | `admission-page-skeleton` | pendiente |

## 3. Mensajería

### Segmentos

| Ruta | Subflujo | Contenedor y controladores | Endpoints y casos de uso | Boundaries |
|---|---|---|---|---|
| `/[slug]/academia/admissions/messaging` | Uso (países y cupos) | `messaging-usage-container.tsx`, `MessagingUsage` | `usage-policy`, `usage-policy/operations/[id]` → `manage-messaging-usage` | `loading.tsx` y `error.tsx` propios; datos en el `<Suspense>` de la hoja |
| `/[slug]/academia/admissions/messaging/connections` | Conexión, clave, canales, diagnóstico, activación, retiro, recuperación de originales y de avisos | `messaging-connections-container.tsx` y los controladores `messaging-*-controller.ts`, `notification-recovery-container.tsx` | `messaging/connections/**`, `deliveries/[id]/recover`, `notification-recovery-operations/[id]`, `messaging/configuration`, `messaging/operations/[id]` | Ídem |

### Acciones

Todas son pending-first y confirmadas por el servidor; ninguna anticipa un envío real de Zavu. La intención se guarda con `operationId` antes del POST y el servidor reproduce el resultado original (`replayed`).

| Acción | Confirmación | Timeout | Estado |
|---|---|---|---|
| Guardar conexión | Casilla | Sin deadline | pendiente (MEN-08) |
| Comprobar credencial | Casilla | Sin deadline | pendiente (MEN-08) |
| Reemplazar clave candidata | Casilla con alcance; botón de peligro | Sin deadline | pendiente (MEN-08) |
| Consultar remitentes y plantillas | — | Sin deadline; botones sin `loading` | pendiente (MEN-07) |
| Configurar canal | Casilla | Sin deadline | pendiente (MEN-08) |
| Enviar, reenviar y verificar prueba | Casilla de destino y consumo | Sin deadline | [PR #178](https://github.com/guidomodarelli/TuTribu/pull/178) (MEN-01, MEN-02); pendiente (MEN-08) |
| Activar conexión | Casilla con alcance | Sin deadline | pendiente (MEN-08) |
| Suspender y desconectar | Casilla con alcance y motivo | Sin deadline; suspender sin tono de peligro | pendiente (MEN-10) |
| Reanudar o archivar original | Casilla | Sin deadline; las pruebas se archivan, nunca se reanudan | [PR #178](https://github.com/guidomodarelli/TuTribu/pull/178) (timeout: MEN-08) |
| Recuperar aviso | Casilla; «Dejar de observar» | Observación cancelable | pendiente (MEN-11) |
| Guardar uso | Casilla | Sin deadline | pendiente (MEN-08) |

### Hallazgos

| Id | Skill | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|
| MEN-01 | estados, mutaciones | Una prueba o verificación pendiente que quedó `started` o ausente bloquea todas las acciones: no se puede reanudar ni archivar y solo queda «Consultar guardado» en bucle. | `messaging-connections-container.tsx` (`recover`) | [PR #178](https://github.com/guidomodarelli/TuTribu/pull/178) |
| MEN-02 | estados | Después de 20 pruebas la pestaña no puede emitir más: el historial no se puede limpiar. | `messaging-connections-container.tsx`, `messaging-diagnostic-history` | [PR #178](https://github.com/guidomodarelli/TuTribu/pull/178) |
| MEN-03 | estados | Un `sessionStorage` corrupto deja la página en «no disponible» y «Reintentar» relee el mismo dato. | `messaging-intent-store`, `messaging-connections-container.tsx` | [PR #178](https://github.com/guidomodarelli/TuTribu/pull/178) |
| MEN-04 | estados | Un parámetro de query extra rompe las dos páginas de mensajería (`z.strictObject({})`). | `messaging-usage-page.ts`, `messaging-connections-page.ts` | pendiente; misma decisión que SOL-04 |
| MEN-05 | estados | Sin sesión o sin permiso se muestra el error genérico con «Reintentar», sin acción para iniciar sesión. | `messaging-usage-container.tsx`, `messaging-connections-container.tsx` | pendiente |
| MEN-06 | validación | «Guardar conexión» queda deshabilitado sin explicar qué falta; los mensajes de validación nunca se ven. | `messaging-connections` | pendiente |
| MEN-07 | estados | Un resultado vacío de remitentes o plantillas solo se avisa con un toast; después el select vuelve a pedir que se consulten. Los botones de consulta no muestran carga. | `messaging-resource-controller.ts`, `messaging-connection-resources` | pendiente |
| MEN-08 | mutaciones | Conexiones y uso no tienen deadline: un request colgado deja la acción ocupada sin salida. | `lib/messaging/messaging-browser-api-client.ts`, `messaging-usage-container.tsx` | pendiente |
| MEN-09 | rendimiento | Dos timers de 1 s vuelven a renderizar el contenedor de conexiones aunque no haya prueba en curso. | `messaging-activation-controller.ts`, `messaging-diagnostic-controller.ts` | pendiente (medir) |
| MEN-10 | estados | Uso anuncia cada resultado dos veces (texto en línea y toast), y suspender la conexión activa no usa el tono de peligro. | `messaging-usage-container.tsx`, `messaging-connection-lifecycle` | pendiente |
| MEN-11 | estados | «Ver avisos anteriores» reemplaza la página, y con el plazo vencido el botón de recuperar sigue habilitado y muestra un error que no corresponde. | `notification-recovery-container.tsx` | pendiente |

## 4. Integrantes

### Segmentos

| Ruta | Subflujo | Contenedor | Endpoints y casos de uso | Boundaries |
|---|---|---|---|---|
| `/[slug]/academia` | Estado de acceso (gratuito, suscrito, líder, sin permiso), contratar, actualizar cobertura, cancelar renovación, ingresar gratis | `components/academy/academy-home` (cliente) | `academy/checkout`, `academy/reconcile`, `academy/join`, `subscriptions/current` | `loading.tsx` re-exporta el skeleton del fogón; sin `error.tsx` |
| `/[slug]/academia/verificacion` | Solicitar verificación | `components/academy/academy-verification` | `verifications` | Ídem |
| `/[slug]/academia/gestionar` | Oferta, disponibilidad, proveedores, verificaciones, integrantes, bonificaciones | `components/academy/academy-management` | `academy/settings`, `academy/availability`, `verification-providers`, `verifications/[id]`, `academy/bonuses/**` | Ídem |
| `/[slug]/suscripcion` | Cancelar suscripción y reintentar el pago | `tribe-subscription-self-management`, `tribe-subscription-payment-status` | `subscriptions/current`, `subscriptions/start` | Ídem |
| `/[slug]` | Fogón: leer, publicar y reaccionar, para gratuitos y suscritos | `components/tribe-round/tribe-round` | `messages`, `messages/[id]/like` | Skeleton propio del fogón |
| `/[slug]/canales` | Canales | `tribe-channel-management` | `channels`, `channels/[id]` | `loading.tsx` re-exporta el skeleton del fogón; sin `error.tsx` |
| `/[slug]/historia` | Ingreso gratis desde la historia | Server action con `free-join-submit-button` | `joinTribeFree` | — |

### Acciones

| Acción | Clase actual | Clase que corresponde | Hallazgo | Estado |
|---|---|---|---|---|
| Contratar (checkout) | Confirmada por el servidor | La misma (pago) | INT-07, INT-13 | pendiente |
| Cancelar renovación | Confirmada, con diálogo | La misma | INT-05, INT-13 | pendiente |
| Actualizar cobertura | Confirmada | La misma | INT-09 | pendiente |
| Ingresar gratis (academia) | Confirmada + `router.refresh()` | La misma | INT-12 | pendiente |
| Ingresar gratis (historia) | Confirmada (server action) | La misma | INT-10 | pendiente |
| Cancelar suscripción y reintentar pago | Confirmada | La misma (pago) | INT-13 | pendiente |
| Publicar en el fogón | Optimista con rollback | La misma | INT-15 | pendiente |
| Reaccionar | Optimista con coalescencia | La misma | INT-15 | pendiente |
| Crear, editar y borrar canales | Confirmada | La misma | INT-13 | pendiente |
| Guardar oferta y disponibilidad | Confirmada con versión | La misma | INT-04 | pendiente |
| Guardar proveedor | Confirmada | La misma | — | cumple |
| Decidir verificación | Confirmada con versión | La misma | INT-08 | pendiente |
| Otorgar bonificación | Confirmada con clave idempotente | La misma | INT-02 | pendiente |
| Revocar bonificación | Confirmada, sin guard | La misma, con diálogo y guard | INT-03 | pendiente |
| Solicitar verificación | Confirmada | La misma | INT-08 | pendiente |

### Hallazgos

| Id | Skill | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|
| INT-01 | boundaries | Un fallo transitorio de carga en academia, gestionar, verificación, canales y fogón se muestra como 404 y no hay `error.tsx` por debajo del shell: lo que no se captura cae en `app/error.tsx` y se pierde el sidebar. | `academia/page.tsx`, `gestionar/page.tsx`, `verificacion/page.tsx`, `canales/page.tsx`, `[slug]/page.tsx`, `tribe-page-access.ts` | pendiente |
| INT-02 | mutaciones | La lista de integrantes no se actualiza después de otorgar o revocar una bonificación. | `academy-management` (`MembersSection`, `loadedQueryKeyRef`) | pendiente |
| INT-03 | estados, mutaciones | Revocar una bonificación usa `window.prompt`, sin diálogo accesible, pending ni guard de doble envío. | `academy-management` (`handleRevoke`) | pendiente |
| INT-04 | estados | Cambiar la disponibilidad o un 409 al guardar la oferta pisan el título, la descripción y los beneficios sin guardar. | `academy-management` (`applySettings`) | pendiente |
| INT-05 | validación | El diálogo de cancelar renovación muestra un error viejo de otra acción. | `academy-home` | pendiente |
| INT-06 | estados | El resultado de varias acciones se anuncia dos veces, en línea y en toast. | `academy-home`, `academy-verification`, `academy-management` | pendiente |
| INT-07 | mutaciones | Mientras se confirma el pago, «Contratar» sigue disponible y el estado no tiene salida. | `academy-home` | pendiente |
| INT-08 | estados | Cambiar el correo de una verificación aprobada la reabre sin confirmación, y revocar una verificación tampoco pide confirmación. | `academy-verification`, `academy-management` | pendiente |
| INT-09 | estados | La respuesta `throttled` de actualizar cobertura nunca se muestra y una relectura fallida queda en silencio. | `academy-home` (`handleRefresh`) | pendiente |
| INT-10 | estados | El ingreso gratis desde la historia falla en silencio: redirige sin mensaje. | `app/(platform)/[slug]/historia/page.tsx` | pendiente |
| INT-11 | a11y | `<main>` anidados dentro del `<main>` del shell. | `academy-home`, `academy-management`, `academy-verification`, `suscripcion/page.tsx`, `canales/page.tsx`, `[slug]/page.tsx` | pendiente |
| INT-12 | seguridad | Ingresar gratis a la academia usa la conexión de mantenimiento en un request de usuario. | `app/api/tribes/[slug]/academy/join/route.ts` | pendiente; el usuario decidió pasar a la conexión de request |
| INT-13 | mutaciones | Ninguna mutación de integrantes tiene deadline: si se cuelga el checkout, el botón queda en «Abriendo el pago…» y no se puede reintentar. | `lib/academy/academy-api-client.ts` | pendiente |
| INT-14 | estados | Paginar y filtrar en gestionar no muestran carga, y decidir deja el ítem en «pendientes». | `academy-management` | pendiente |
| INT-15 | mutaciones | Publicar no lleva clave idempotente y el like es un toggle: un reintento tras una respuesta perdida puede duplicar o invertir el resultado. | `tribe-round`, `messages/[id]/like` | pendiente; el usuario decidió corregirlo en el servidor sin cambiar quién puede publicar o reaccionar |
| INT-16 | boundaries | Academia, gestionar, verificación, suscripción y canales re-exportan el skeleton del fogón, que no tiene su forma. | `loading.tsx` de cada segmento | pendiente |

## 5. Rendimiento

La línea base y el después de cada optimización se registran acá y en su PR, con el mismo protocolo, build y rama efímera por revisión.

| Id | Flujo | Métrica | Antes | Después | PR |
|---|---|---|---|---|---|
| PERF-01 | Páginas de integrantes (`resolveTribePageAccess`) | Viajes secuenciales por request | pendiente | pendiente | pendiente |
| PERF-02 | Gestionar academia | Viajes secuenciales por request | pendiente | pendiente | pendiente |
| PERF-03 | Conexión de mensajería (MEN-09) | Renders por segundo en reposo | pendiente | pendiente | pendiente |
