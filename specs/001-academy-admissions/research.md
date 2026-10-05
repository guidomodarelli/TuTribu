# Research: Academy Admissions and Tenant Messaging

**Fecha**: 2026-10-05. **Fuente local**: `73d289511ba1dcef13ae9204504e780fce421f4b`, más los artefactos locales de esta feature. **Alcance**: inspección estática de código/tipos y documentación pública; sin implementación, instalación de dependencias, consultas a bases reales, APIs autenticadas ni envíos.

La investigación resuelve las elecciones del diseño. Los gates operativos al final requieren evidencia posterior y no se presentan como recursos preparados o pruebas aprobadas. El contrato funcional de [spec.md](spec.md) y TC-001 a TC-027 de [technical-contract.md](technical-contract.md) siguen completos y normativos.

## R-01 — Arquitectura y composición

**Decisión.** Crear los módulos verticales `academy-admissions` y `messaging`; ampliar `auth`, `tribes`, `notifications` y los escritores de `subscriptions` que corresponda. Cada módulo tiene `domain/application/infrastructure`, constantes de su owner y `setup.ts`. Conservar `src/modules/setup.ts` como composition root entre módulos: es la convención concreta de [academy-access.htm](../../docs/architecture/academy-access.htm). Los casos de uso dependen de puertos propios y resultados internos, nunca de SDKs, repositorios concretos, `lib` ni un `src/server` genérico.

**Motivo.** Admisión decide pertenencia; mensajería transporta y custodia credenciales; auth acredita identidad; producto/pagos conservan sus derechos independientes. La composición ya permite colaboradores de infraestructura que comparten transacción sin importar repositorios ajenos desde application.

**Alternativas.** Reutilizar las verificaciones comerciales como OTP, colocar reglas en route handlers o crear un framework global de plugins: descartados por mezclar responsabilidades. Los recursos propuestos se describen en [data-model.md](data-model.md); sus paths futuros no implican código existente.

## R-02 — Inventario de escrituras y corte inmediato

**Decisión.** Aplicar una sola operación autoritativa de admisión a todas las nuevas altas/recuperaciones básicas gratuitas de academias protegidas. Conservar un marcador persistente de control activado y cierre seguro si falta política, falla el evaluador o se deshabilita el flag de ejecución. La activación de cada tribu depende del inventario completo, no de una única pantalla.

| Vía actual | Evidencia y brecha | Cambio requerido por el diseño |
| --- | --- | --- |
| `POST /api/tribes/[slug]/academy/join` | [route.ts](../../app/api/tribes/[slug]/academy/join/route.ts), `joinTribeAcademyAdmission`, [PostgresTribeAcademyAdmissionRepository](../../src/modules/tribes/infrastructure/repositories/postgres-tribe-academy-admission-repository.ts): alta básica directa sin lista/revisión/OTP | Delegar a admisión común; migrar `joinAcademy` y `AcademyHome` a resultado incremental `pending/admitted/already_member` validado |
| Invitación histórica `acceptInvitationAction` | `app/(platform)/[slug]/invitar/[token]/page.tsx:258`, `PostgresTribeInvitationRepository.accept:980`; la rama academia inserta/recupera membresía básica | Token histórico aporta llegada/atribución, nunca dispensa; usa política común. Producto `legacy` conserva su contrato |
| Ingreso gratuito histórico | `app/(platform)/[slug]/historia/page.tsx:103`, `PostgresTribeFreeJoinRepository.join:54`; SQL 20260928124000 lo cierra en academia | Mantener cierre autoritativo, también durante rollback; no reutilizar recuperación indiscriminada de `removed` |
| Policies de escritura directa | `20260928124000_scope_legacy_join_paths_by_product.sql:186`, policies de invitación/recuperación en `20260528120000_add_referral_metadata_to_invitations.sql:409/446` | Restringir rutas históricas en academia protegida; autorizar pertenencia mediante procedencia persistida, no un booleano `app.*` del caller |
| Checkout clásico abierto/invitado/reintento | `subscriptions/start/route.ts:145`, `PostgresTribeMemberSubscriptionRepository`; `tribe_open_join_id_by_slug` no comprueba modo/producto | Guardas explícitas de modo y producto en application y escritor; precio real `membership` y proveedor confirmado para vía paga legítima |
| Webhook clásico legítimo | `PostgresTribeMemberSubscriptionRepository.updateMembershipAccessForProviderSubscription:2447` ya filtra `membership` | Conservar pago verificado; si resuelve una pendiente, cancelar por `external_resolution`, sin aprobación ficticia ni liberar canje |
| Reconciliación por precio | `PostgresTribeSubscriptionPriceRepository.reconcileProviderSubscriberStatuses:3243`, UPDATE:3322 | El cálculo actual no filtra producto: corregir a `membership`; no restaurar moderación ni privilegios desde pagos de academia |
| Diagnóstico administrativo global | `reconcileTribeProviderSubscriberStatuses:3563`, UPDATE:3616; ruta `subscriber-diagnostics/reconcile` | Misma protección; probar la invocación directa de ambas rutas |
| Bootstrap de tribu | `createTribeWithLeaderMembership:82` bajo whitelist de creadores | Excepción de creación del propietario inicial, ajena a una admisión gratuita en tribu existente |

**Motivo.** Una UI protegida no cierra SQL, acciones antiguas ni reconciliaciones. Se agregará una guarda estructural de procedencia para altas/recuperaciones protegidas y se migrarán los escritores, manteniendo la evaluación compleja en application/domain. El marcador monotónico de activación se almacena separado de la fila de política, en el registro durable de la tribu, y se confirma junto con la activación. El runtime documentado elude RLS ([academy-access.htm:106](../../docs/architecture/academy-access.htm)); la autorización explícita del escritor es obligatoria. RLS sigue cubriendo roles que no la eluden y debe probarse realmente.

**Alternativas.** Solo ocultar el botón, confiar en las policies antiguas o volver al writer abierto en rollback: descartados. No se promete protección frente a un superusuario de base comprometido.

## R-03 — Membresía, roles y acceso comercial

**Decisión.** `active/muted` devuelve estado existente antes de efectos, conservando rol/fecha/estado. Alta nueva produce `tribemate/active`. Recuperación gratuita exige `role=tribemate`, combinación `blocked/payment_blocked` o `removed/subscription_inactive` y estado legible de recuperación acreditado; restaura `active/muted` sin cambiar fecha ni grants. `conduct_blocked`, otros bloqueos/remociones y filas privilegiadas históricas deniegan recuperación automática. El líder canónico es la fila `role=leader` del índice único, no `tribes.created_by`; no se degrada ni reactiva desde admisión.

El mínimo persistido es `tribe_members.commercial_recovery_status`, nullable `active/muted`, capturado bajo lock antes de ocultar una membresía legible por billing y nunca sobrescrito desde un estado ya comercial. Históricos sin evidencia quedan desconocidos, sin backfill inventado. El preflight exige resolución autorizada/auditada de esos casos antes de habilitar recuperación automática; una decisión prospectiva de moderación se registra como tal, no como reconstrucción del pasado ni como una UI existente. El fundamento básico vigente de una decisión aplicada se conserva separadamente de la suscripción vieja: un webhook/reconcile inactivo no lo revoca. Remoción no comercial/conducta y salida del miembro sí lo extinguen por su owner; reingresar exige una decisión nueva.

**Motivo.** [tribe-page-access.ts](../../src/modules/tribes/constants/tribe-page-access.ts) aporta la clasificación actual. Las reconciliaciones también deben preservar `muted` y restricciones administrativas. La admisión no escribe `member_access_grants`, enrollments, pagos o verificaciones comerciales; concesiones vigentes/revocadas continúan evaluadas por sus owners.

**Alternativas.** Recuperar todo `removed`, conservar automáticamente un rol privilegiado dormido o crear grants junto con membresía: incompatibles con FR-012/122/123/124. El bootstrap y la recuperación paga con vínculo real son fuentes distintas, no un `paid=true` del cliente.

## R-04 — Evidencia base Google y autenticación reciente

**Decisión.** Extender `auth` mediante un plugin de infraestructura de Better Auth `1.6.11` que decora el proveedor Google existente, conserva OAuth/PKCE/sesión y verifica el mismo ID token antes de derivar evidencia. Reutilizar `verifyIdToken`, con chequeo mínimo previo del header `alg=RS256` y nonce del intento cuando corresponda. El verificador instalado valida issuer/audience/firma/max-age, pero su selección de algoritmo viene del header y su resultado es booleano; no inventar `cause` ni un diagnóstico de JWKS cuando devuelve `false`.

**Evidencia local.** `auth/infrastructure/better-auth/auth.ts:128` configura Google con consentimiento; el callback instalado descarta `res.data` y no invoca `verifyIdToken` en el canje OAuth. `account.idToken` es server-only y no sustituye una captura propia acreditada. `AuthenticatedMember` no contiene autoridad ni antigüedad; la sesión es deslizante de 180 días. El plugin dispone de `AuthContext.socialProviders`, hooks con `newSession` y `getOAuthState`; no se modifica `node_modules` ni se agrega otra librería JWT por duplicación.

**Motivo.** Persistir solamente evidencia propia mínima de usuario/cuenta/sujeto/correo/procedencia e invalidarla por cambios relevantes. Gmail o Workspace acreditado puede sostener coincidencia; correo externo o claims insuficientes conserva login pero no autoridad de contacto. [Verificación de Google ID tokens](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

La operación sensible exige intención server-side y `auth_time` firmado dentro de diez minutos. Su obtención requiere preparar Security Bundle; Google no ofrece un parámetro que fuerce una nueva autenticación de su cuenta. Missing/stale mantiene la operación cerrada y no se sustituye por `iat`, sesión renovada, consentimiento ni OTP del líder. [Google Security Bundle](https://developers.google.com/identity/siwg/security-bundle).

**Alternativas.** `user.emailVerified`, JWT decodificado, refresh/keep-alive o un código BYOK global: descartados. Un autenticador global adicional forzable, como passkey, cambiaría alcance; no se presume existente ni se agrega en este plan.

## R-05 — Preadmisión y avisos propios

**Decisión.** Páginas de solicitante fuera del layout que exige pertenencia y puertos de consulta por cuenta/solicitud. No crear una membresía `pending`. Ampliar `notifications` con tipos propios de admisión y predicados de destinatario/recurso para los avisos del solicitante; los demás avisos mantienen sus permisos comunitarios. Los reviewers se revalidan por rol activo en cada decisión y despacho.

**Evidencia.** `getTribePageAccess:117–123`, verificaciones comerciales y el predicado de notificaciones actual exigen membresía/acceso comunitario. El nuevo acceso no puede reutilizarlos concediendo permisos falsos. Los avisos se insertan con el hecho dentro de la transacción; existe dedupe por destinatario/evento en `notifications`.

**Alternativas.** Abrir contenido a pendientes, ampliar todo `can_read_tribe_content` o crear una segunda bandeja global de identidad: descartados. El estado propio y los mensajes externos nunca incluyen nota interna o destinatarios ajenos.

## R-06 — SDK y capacidades reales de Zavu

**Decisión.** Planificar SDK oficial `@zavudev/sdk@0.57.0`, fijado para la primera integración, sin instalarlo en esta fase. Revisión pública `ecd7329a08a03f7751afe319a5d5f170af1f48a9`: compatibilidad documental con Node/TypeScript del proyecto y runtimes server/Workers; build real pendiente. El adapter recibe contexto autorizado, clave/base explícitos, `maxRetries:0`, `logLevel:'off'`, timeout y transporte controlado. No confiar en defaults de entorno, custom headers globales o idempotencia implícita del cliente. [SDK oficial](https://github.com/zavudev/sdk-typescript/tree/ecd7329a08a03f7751afe319a5d5f170af1f48a9), [cliente](https://github.com/zavudev/sdk-typescript/blob/ecd7329a08a03f7751afe319a5d5f170af1f48a9/src/client.ts).

| Necesidad | Contrato verificado |
| --- | --- |
| Clave y entorno sin enviar | `me.retrieve()` → `GET /v1/me`; `isTestMode` no demuestra canal probado |
| Remitentes/plantillas | `senders.list/retrieve`, `templates.list/retrieve`; `items/nextCursor`, máximo 100 por página; recorrer continuación |
| Envío | `messages.send`; `'Zavu-Sender'`, `channel` explícito, `fallbackEnabled:false`, body `idempotencyKey` |
| Correo | `subject/text`, origen del recurso preparado; sin `from` arbitrario |
| SMS | E.164, `channel:sms`, texto y capacidad efectiva; no sustituir por `sms_oneway` |
| WhatsApp OTP | Plantilla `AUTHENTICATION` aprobada, `content.templateId` y `templateVariables['1']`; idioma de `Template.language`, no un campo inventado de envío |
| Consulta | `messages.retrieve(id)` retorna `{message}`; solo ID de una entrega propia registrada |

**Motivo.** Tipos/código versionados corrigen ejemplos antiguos con `zavuSender`, `retrieve({messageId})` o `result.id`. Seleccionar campos para DTOs públicos; el recurso sender puede incluir `webhook.secret`. [Senders](https://docs.zavu.dev/api-reference/list-senders), [mensajes](https://github.com/zavudev/sdk-typescript/blob/ecd7329a08a03f7751afe319a5d5f170af1f48a9/src/resources/messages.ts), [plantillas](https://github.com/zavudev/sdk-typescript/blob/ecd7329a08a03f7751afe319a5d5f170af1f48a9/src/resources/templates.ts).

**Alternativas.** HTTP propio sin incompatibilidad comprobada, Smart Routing o stubs productivos de otros proveedores: descartados. El ensayo sandbox hace envíos reales y no acredita sender productivo/email/SMS. [Authentication](https://docs.zavu.dev/authentication), [Smart Routing](https://docs.zavu.dev/guides/sending-messages/smart-routing).

## R-07 — Entrega incierta, deduplicación y errores

**Decisión.** Registrar intención, identidad lógica, conexión/versión, huella protegida y cada intento antes de RPC. `409` solo recupera aceptación con evidencia del mismo mensaje/intento; no basta el status. No hay ventana de deduplicación ni regla de payload cambiado publicada en las fuentes consultadas. Hasta comprobarlas, timeout/desconexión/lease de intento iniciado queda `unknown`, sin nuevo POST automático. Consultar únicamente por ID propio conocido; no listar historia ni inventar lookup por idempotency key. [Authentication](https://docs.zavu.dev/authentication), [OpenAPI](https://docs.zavu.dev/openapi.json).

**Motivo.** Una lease o una clave local no garantiza una sola entrega externa. Definir códigos propios y DTOs seguros en [contrato de errores](contracts/errors-and-recovery.md), con status/código estructurado antes de heurísticas. Rechazos 4xx orientan a corregir causa; un texto que diga timeout no los vuelve indisponibilidad. El SDK no decide retries ni escribe copy público.

**Alternativas.** Repetir todo job, devolver cupo por timeout, copiar `error.message` o prometer exactamente una vez: descartados. Recepción de un código tardío no revive un desafío invalidado/vencido. Estado de entrega nunca decide admisión.

## R-08 — SecretStore, código y contacto protegido

**Decisión.** `PostgresEncryptedSecretStore` privado y Web Crypto: AES-256-GCM con IV de 96 bits, tag de 128 y AAD inequívoco de environment/época/tribu/conexión/versión/propósito/formato. Keyrings fuera de DB en secretos del hosting, IDs de clave y escritor activo. Claves distintas para credenciales, sobre OTP, HMAC verificador, token de invitación e índices protegidos de contacto. No usar `AUTH_SECRET` ni reutilizar el cipher histórico sin AAD/keyId.

**Motivo.** El transporte debe recuperar credencial; un hash irreversible no sirve. El HMAC OTP incluye el contexto completo y se verifica mediante `subtle.verify`; el emisor recibe un envelope separado, con TTL máximo igual a los diez minutos del desafío y purga tras despacho/invalidación. La fuente permite las primitivas en ambos runtimes: [Node Web Crypto](https://nodejs.org/download/release/v24.13.0/docs/api/webcrypto.html), [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), [secretos Workers](https://developers.cloudflare.com/workers/configuration/secrets/), [variables sensibles Vercel](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

**Alternativas.** Texto plano, key junto al ciphertext, hash de API key, MAC/cifrado ad hoc o caché mutable global de clientes: descartados. Preferir clientes por operación; cualquier caché futura necesita contexto completo y retirada efectiva. Los contadores no se reinician al rotar claves.

## R-09 — Retiro y restauración cerrada

**Decisión.** Separar estado operativo de retiro y época de seguridad externa `MESSAGING_SECURITY_EPOCH`. Toda restauración debe cerrar despachos en todos los targets, retirar/rotar claves y cambiar la época antes de reabrir. Filas restauradas con época antigua son inutilizables; suspender conexiones, invalidar pruebas afectadas y no reproducir outbox histórico. Reconexión explícita del líder y ensayo de restore son obligatorios. La recuperación también mantiene cerradas las nuevas admisiones hasta validar el estado de protección/política; no restaura un writer abierto.

**Motivo.** Una tombstone dentro de la misma DB puede retroceder junto con el backup. La selección mínima es recuperación cerrada y global, no recuperación automática selectiva. [Neon restore](https://neon.com/docs/postgres/backup-restore/branch-restore).

**Alternativas.** Ledger de revocación externo en R2, separado de lifecycle y snapshots: técnicamente posible con integración S3 existente, pero falta adapter/permisos comprobados; no se elige ni se declara configurado. Sin procedimiento/control externo aprobado se bloquea la activación de secretos. La época no modifica membresías ya admitidas ni constituye un factor global de identidad.

## R-10 — Outbox y límites de ejecución

**Decisión.** Outbox en Postgres, claim de trabajo vencido con filas/`SKIP LOCKED`, lease y compare-and-set. Reusar `runWithGuardedTransaction/withRequestContext`. Claim, preflight/reserva y finalización son transacciones cortas; RPC Zavu ocurre fuera. Defaults iniciales a medir: timeout externo 15 s, lease 90 s, dos despachos concurrentes y presupuesto 45 s; se reclama solo trabajo que puede comenzar dentro del presupuesto, con equidad por tribu. [Locking PostgreSQL](https://www.postgresql.org/docs/current/sql-select.html).

**Motivo.** El código actual guarda la liberación del pool y el timeout de transacción abandonada; no añadir otro `pool.connect()/finally`. Una lease vencida antes de intento externo permite reclamar; después del inicio exige estado incierto. El pooler en modo transacción excluye coordinación por sesiones persistentes; usar unicidad/locks transaccionales. [Neon pooling](https://neon.com/docs/connect/connection-pooling), [PgBouncer](https://www.pgbouncer.org/features.html).

**Alternativas.** Cola externa, `after()/waitUntil` como única durabilidad, transacción abierta durante envío o retry por saturación del pool: descartados. La cuota se reserva antes del intento y lo incierto permanece consumido; los índices de contacto no revelan consumo de otra tribu.

Barrido estático de pools del repositorio: el checkout explícito está en el helper protegido; profile-image refresh y thumbnail backfill usan ese helper. Better Auth administra su checkout y recibe el mismo `createPostgresPool/onConnect` con guarda de transacción abandonada. Se reutilizan estas protecciones; el diseño nuevo no agrega un bare checkout ni requests Zavu en render. Capacidad/adquisición/abandonos se medirán en los ensayos, sin afirmar prueba runtime de estos paths por esta inspección.

## R-11 — SC-015 y scheduler

**Decisión.** Dispatcher portable por HTTP protegido y ejecución por minuto en el target Cloudflare cuando esté habilitado. En Vercel Hobby se requiere un disparador frecuente autorizado y medido; el workflow actual es solo catch-up, no evidencia del objetivo. No contratar recursos ni cambiar target durante planificación. Se habilita correo agrupado únicamente tras medir cierre de ventana→aceptación dentro del objetivo. [Targets actuales](../../docs/architecture/deployment-targets.htm), [Vercel cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Workers cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

**Motivo.** El disparador actual es cada cinco minutos, puede demorarse y el workflow omite la llamada si faltan secretos. Persistir catch-up y estado operativo, no declarar éxito del trabajo omitido. Para avisos in-app, insertar transaccionalmente y actualizar contextos de admisión activos cada 15 s con foco/visibilidad, AbortController y reconciliación incremental; mantener polling ordinario en otros contextos. La lista abierta también se refresca, no solo su badge; servidor decide visibilidad por cuenta/recurso.

**Alternativas.** Reducir indiscriminadamente el polling global, asumir Workers desplegado o dar por certificado un cron por existir en un archivo: descartados. Retención/expiración se comprueba en el comando aunque mantenimiento esté atrasado.

## R-12 — Interfaces y UI

**Decisión.** Server-first, presenters con props y containers de sesión/mutación. Preadmisión propia, administración por rol, campos secretos efímeros y formulario limpio tras guardar. Resultados mínimos validados; navegación compartida, feedback localizado persistente y toast complementario. Nada se envía/canjea por GET, preview, login o edición de un campo. Cada nuevo segmento dispone de loading/Suspense propios; layouts no resuelven params server-side, ni se apaga validación instant. [DESIGN.md](../../DESIGN.md), guía instalada `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`.

**Alternativas.** Cards nuevas, DTO SDK en UI, fetch disperso, claves en props/storage, reloj aleatorio en primer render o refresh global por cada escritura: descartados. La política de payloads se rige exclusivamente por `~/.agents/rules/payload-validation-boundaries.md`; los contratos describen inputs y resultados propios, no una segunda validación del proveedor.

## R-13 — Idempotencia de admisión, lotes e importación

**Decisión.** Ledger de operaciones por actor/tribu/clave y huella de intent, más unicidad de pendiente, vínculo e invitación. Un comando DB-only finaliza decisión/membresía/eventos en una transacción; un resultado perdido se consulta por la misma identidad. Los lotes de hasta 50 conservan outcomes individuales; una falla de persistencia revierte esa transacción y se reconcilia su ledger antes de repetir. No inventar resultados parciales que nunca fueron confirmados. CSV se previsualiza sin mutar y la confirmación revalida filas elegidas, preservando resultados y sin reactivar/reasignar.

**Motivo.** El contrato exige progreso seguro, no necesariamente un sistema nuevo de jobs para cada decisión. Errores de validación/estado por fila pueden convivir con éxitos confirmados; desconocido de commit no equivale a rechazo. Tokens nominativos tienen hash y un único canje, nunca ciphertext recuperable como la tabla histórica.

**Alternativas.** Repetir selección completa, aprobar filas ocultas, reciclar enlaces terminales, heurísticas de correo/país o borrar toda la lista al reimportar: descartados.

## R-14 — Validación, trazabilidad y documentación

**Decisión.** TDD por owner: reglas puras, contratos HTTP/SDK real con transporte inyectado propio, SQL ejecutado en rama efímera Neon, UI real con beez-ui, E2E Chromium/WebKit y ensayos autorizados por canal. Conservar el cuerpo normativo; extender trazabilidad individual con diseño/casos previstos, sin crear `tasks.md` ni resultados observados ficticios. Actualizar los documentos y manuales propietarios junto con implementación, en sus formatos actuales.

**Motivo.** Las fuentes públicas y la revisión estática no prueban permisos de una cuenta, envío, rol real, restauración o p95. Un mock de una librería interna y un test de texto de archivo no acreditan la feature. [quickstart.md](quickstart.md) define los ensayos posteriores.

**Alternativas.** Certificar sandbox como producción, marcar la checklist temática completa o implementar antes de generar/revisar tareas: descartados. MCP `memory` no está disponible; se usó evidencia versionada y fuentes primarias.

## Gates operativos conocidos

| Gate | Evidencia requerida antes de activar la capacidad | Resultado mientras falta |
| --- | --- | --- |
| OG-01 — Identidad y autenticación reciente | Verificador Google integrado y probado; claim firmado/cliente preparado, vinculación e intención correctas | Login existente utilizable; evidencia insuficiente nunca autoautoriza y operaciones sensibles permanecen cerradas |
| OG-02 — Secretos y recuperación | Keyrings separados en hosting, contexto/época correctos en ambos runtimes, retiro y restore cerrados ensayados | No guardar/activar credenciales operativas ni despachar |
| OG-03 — Zavu por canal/versión | Producción, recursos, acceso efectivo, código recibido y ausencia de fallback no permitido | Canal dependiente no activable; revisión manual compatible e interacción interna siguen disponibles |
| OG-04 — Deduplicación incierta | Ventana, scope y payload/409 comprobados con autorización y evidencia | `unknown`, sin rePOST automático; consulta solo por ID propio conocido |
| OG-05 — Scheduler y latencia | Driver autorizado activo, sin omisiones silenciosas; capacidad y p95 medidos, polling focal y visibilidad propios | Avisos internos disponibles; no certificar ni habilitar correo agrupado dependiente sin preparación |
| OG-06 — Persistencia y activación | Rol real y no-bypass ensayados; inventario cerrado, concurrencia y regresiones de vías antiguas/pagas | Ninguna academia se activa como protegida; rollback posterior mantiene cierre de nuevas admisiones |

Estos gates son dependencias verificables, no decisiones abiertas ni autorizaciones para ejecutar servicios. La planificación puede generar tareas; la activación productiva necesita sus evidencias.
