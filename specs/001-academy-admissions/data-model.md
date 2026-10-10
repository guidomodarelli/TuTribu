# Data Model: Academy Admissions and Tenant Messaging

**Estado**: diseño de 2026-10-05, con implementación en curso. Evidencia global y primeras restricciones de admisión tienen SQL/reflejo Drizzle y pruebas en ramas Neon efímeras propias. Repositorios, recorrido de auth, integración de mensajería/pertenencia y restante cobertura siguen pendientes. Ver [auth-baseline.md](validation/auth-baseline.md) y [persistence-baseline.md](validation/persistence-baseline.md). [spec.md](spec.md) define todas las matrices, estados y límites; este modelo no los reduce.

## Owners y reglas transversales

| Owner | Responsabilidad de persistencia |
| --- | --- |
| `auth` | Evidencia global verificada e intenciones de autenticación reciente; no usa códigos BYOK |
| `academy-admissions` | Política, lista, vínculos, desafíos locales, pruebas, invitaciones, solicitudes, decisiones, operaciones/importación y auditoría de admisión |
| `messaging` | Conexiones/versiones/capacidades, diagnósticos, secretos privados, outbox, intentos y cupos agregados |
| `tribes` | Membresía canónica y procedencia de altas/recuperaciones; no concede academia comercial |
| `notifications` | Obligaciones/avisos internos propios del destinatario, con nuevos tipos de admisión |
| `subscriptions/product-access` | Fuentes pagas/concesiones existentes; sus escritores no pueden confundir `academy` con `membership` |

Todos los recursos tenant-scoped llevan `tribe_id`. Relaciones de recurso/conexión/versión/proof usan FK compuesta de misma tribu, no solo un UUID independiente. Identidad de cuenta es `user.id`; correo/teléfono no son identificadores globales. UUIDs y versiones se generan/controlan en servidor. Los estados se definen mediante tipos propios y constantes del owner. Una columna `eligible=true` no es autoridad: la elegibilidad se deriva de hechos vigentes.

La documentación actual confirma runtime con bypass de RLS. Cada consulta/escritura incluye autorización explícita; RLS simple, grants y funciones del writer se mantienen y se ensayan también con rol sin bypass. No se concede membership para permitir preadmisión ni se confía en un setting booleano enviado por cliente.

## A. Evidencia global de auth

### `GlobalIdentityEvidence` → `global_identity_evidence`

Campos privados: `id`, `user_id`, `account_id`, `provider_id`, `provider_subject`, `normalized_email`, `email_verified_claim`, `hosted_domain`, clasificación `gmail/workspace/insufficient`, issuer/audience verificados, `token_issued_at`, `token_expires_at`, `verified_at`, `version`, `invalidated_at/reason`. Relación con cuenta/usuario Google actualmente vinculados; una captura vigente por account/provider.

No almacena otro JWT, access/refresh token ni respuesta completa. El adapter verifica criptográficamente el mismo token del callback antes de derivar estos campos. Cuentas antiguas sin captura acreditada son insuficientes; no se hace backfill desde un booleano o token vencido. Antes de usarla se comprueban cuenta/sujeto/correo actuales e invalidación. La expiración del token se evalúa al verificarlo; una evidencia histórica válida no se convierte en una sesión de una hora ni exige OAuth en cada render.

### `GlobalSessionIdentityBinding` → `global_session_identity_bindings`

Relación privada de infraestructura entre el completion nativo y su sesión: `session_id`, `user_id`, `account_id`, `provider_subject`, `normalized_email`, `created_at`, `invalidated_at`. FK compuestas de la misma cuenta/usuario/sujeto y sesión/usuario; una fila por sesión. `account_id` queda nullable sólo para archivar el origen al desvincular esa cuenta: una FK escalar hace SET NULL, la relación compuesta se comprueba de forma diferida y la guarda retira el binding sin cambiar sujeto/correo/usuario. La fila permanece mientras la sesión siga viva; no se confunde con una sesión antigua sin relación ni se selecciona otra cuenta por fallback. No cambia el DTO público de Better Auth ni contiene JWT, nonce, rol o credenciales. La relación no se reasigna ni se reactiva tras invalidación. Una sesión antigua realmente sin relación sólo puede resolver una cuenta única, sin inventar captura ni autoridad de contacto.

La migración de integridad `20261005095000_guard_global_identity_context.sql` preserva el origen de las capturas y hace irreversible su invalidación. Un cambio efectivo de correo normalizado retira capturas, vínculos de sesión y recencia del usuario; restaurar el texto anterior no los revive. Un nuevo callback verificado y su nueva sesión pueden producir otra captura. Borrar sesión/cuenta sigue las relaciones existentes y extingue el ámbito relacionado, sin reinterpretar una renovación como autenticación reciente.

### `GlobalReauthenticationIntent` → `global_reauthentication_intents`

`id`, hash de nonce fijado al comenzar autorización, `user_id`, referencia de sesión original, account/sujeto esperado, operación/recurso/tribu permitidos, retorno same-origin allowlisted, `created_at`, `expires_at`, `consumed_at`, estado. Antes de autorizar el hash puede estar ausente; estado/versión impiden consumir un intento sin nonce emitido. La autorización global conserva OAuth/state/PKCE; `additionalData` solo transporta el id opaco. El intento es de un uso y se revalida contra sesión/rol/recurso, no una marca confiable del browser.

### `RecentAuthenticationEvidence` → `recent_authentication_evidence`

`id`, intención, usuario/account/sujeto, sesión efectiva tras callback, `authenticated_at`, `verified_at`, `valid_until`, scope de operación/recurso, `invalidated_at`. Ventana de diez minutos desde autenticación acreditada, no desde verificación, renovación o keep-alive. Las operaciones sensibles hacen comprobación vigente antes de leer secretos. Captura request-scoped; no estado mutable global. Los intents/evidencias vencidos se minimizan y purgan, conservando auditoría sin claims/tokens.

## B. Política y lista

### `AdmissionPolicy` → `academy_admission_policies`

Una fila por tribu: `mode`, `contact_type`, `is_open`, `allow_common_exceptions`, `requires_additional_verification`, canal telefónico principal, SMS alternativo permitido, referencias autorizadas de conexión/capacidad, `verification_epoch`, `version`, `activated_at`, timestamps/actor del cambio. El marcador monotónico `tribes.admissions_control_activated_at` está separado de esta fila y se escribe en el mismo commit de primera activación. Admisión, conexión y correo de notificaciones siguen siendo configuraciones independientes.

`AdmissionPolicy` no almacena otra lista editable de países. Application obtiene la política de uso actual mediante el puerto propio `MessagingUsagePolicyReader`, definido en el dominio de admisión con una proyección interna mínima: `tribeId`, `version`, `allowedCountries` y restricciones de plataforma comprobadas necesarias para decidir. El dominio recibe hechos propios; no importa application/infrastructure de mensajería ni DTOs Zavu. La proyección se resuelve por tribu autorizada y no se usa como permiso aportado por el cliente. [Países y despacho](#country-policy).

- Defaults y combinaciones son exactamente la matriz del spec. Teléfono/lista/OFF es inválido; manual/teléfono/OFF admite enlace común con advertencia, sin nuevas invitaciones telefónicas.
- `contact_type` queda fijado al activar. Cambios restantes usan expected version y CAS. OFF→ON incrementa época; ON→OFF invalida desafíos/pruebas no aplicadas y no aprueba pendientes.
- Activar requiere confirmación e inventario; ON necesita capacidad preparada/probada y cuota positiva. Una política ausente/inválida en control activado no significa ingreso abierto.
- El marcador de la tribu no se elimina por flag/rollback ni por borrar la policy. Si faltan policy/settings después de activación, nuevas altas/recuperaciones quedan cerradas; no inferir `legacy` desde una ausencia accidental. Una salida legítima de modo tiene transición/auditoría del owner y cancela el ámbito pendiente. Restore requiere recovery lock externo y reconfirmación del estado, nunca selección del writer abierto.

### `AllowlistEntry` → `academy_allowlist_entries`

`id`, `tribe_id`, tipo/contacto normalizado, fingerprint protegido, `display_name` opcional, `enabled/disabled`, `version` entero positivo no nullable con valor inicial `1`, origen, importación/actor y timestamps. Único por tribu/tipo/contacto canónico. Índices de búsqueda/estado dentro de la tribu; no se colapsan puntos, etiquetas o alias. Teléfono requiere país inequívoco y E.164 mediante el `libphonenumber-js` ya declarado.

Nombre orientativo no es identidad. Cambiar nombre o `enabled/disabled` usa `expectedVersion` y CAS; un cambio efectivo incrementa `version` una vez por comando, mientras un no-op con versión vigente conserva el valor. Importar una entrada nueva crea versión `1`; duplicados conservan `unchanged/conflict`, sin editar/reactivar automáticamente. El vínculo pertenece a otra entidad: su aplicación no incrementa esta versión si la entrada no cambia. [Regla común de versiones](#resource-versioning). Deshabilitar no libera vínculo ni expulsa miembros. El lector de lista es líder activo; el solicitante no recibe coincidencias ni identidades ajenas. La importación no sustituye toda la lista ni reactiva filas.

### `AdmissionContactBinding` → `academy_admission_contact_bindings`

`id`, `tribe_id`, tipo/contacto o representación privada mínima, fingerprint, owner de cuenta estable, primera presentación/prueba que lo fijó, procedencia y timestamps. Unicidad de contacto por tribu con owner único; cancelar/rechazar/deshabilitar no reasigna. Escribir un dato o pedir un código no crea vínculo.

Un conflicto ofrece recuperación de la cuenta global original o asistencia autorizada; el código local no enlaza ni recupera identidades globales. V1 no ofrece una API de reasignación silenciosa ni finge una gestión de roles/recuperación general existente. Los conflictos sin autorización suficiente permanecen cerrados. Eliminación de cuenta/tribu exige minimización explícita y conservación de la referencia protegida mínima cuando todavía impida una reasignación ilegítima; no usar cascadas para liberar identidades sin evaluar su finalidad.

## C. Desafíos y pruebas locales

### `ContactVerificationChallenge` → `contact_verification_challenges`

`id`, cuenta, tribu, tipo/contacto normalizado, propósito `admission/connection_diagnostic`, época de política cuando aplica, conexión/versión, época de seguridad externa, canal, estado, `created_at/expires_at`, `failed_attempts`, `verified_at/invalidated_at`, MAC y `mac_key_id`, referencia de envelope transitorio y entrega. El contexto del MAC es inequívoco y versionado. No es una sesión ni modifica `user.emailVerified`, phone global, OAuth linking o recuperación.

Un desafío actual por cuenta/contacto/tribu/propósito; nuevo resend invalida el anterior en la misma transición y preserva contadores. Código de seis dígitos impredecibles, diez minutos y cinco fallos; acumulados exactos del spec en el limiter. La validación toma locks, comprueba reloj autoritativo/estado/contexto y consume una vez. `subtle.verify` usa clave independiente. Prueba de diagnóstico solo puede actualizar el diagnóstico de conexión.

### `AdmissionVerificationProof` → `academy_admission_verification_proofs`

`id`, desafío verificado, usuario/tribu/contacto, época, conexión/versión/época externa, `verified_at`, `apply_before`, estado disponible/aplicada/inválida, `applied_request_id/applied_at`, causa de invalidación. Una prueba se aplica a una sola presentación dentro de quince minutos; FK/unique impiden reutilización.

Tras aplicar puede sostener la pendiente hasta sus treinta días, sin renovar código en cada lectura. Rotación ordinaria no invalida evidencia ya adjuntada; compromiso o nueva época puede exigir recomprobación. Apagar el check no revive una prueba revocada. Adjuntar prueba no aprueba ni cambia `submitted_at`; contacto fijado no se sustituye. Si faltaba, se adjunta por primera vez con prueba y auditoría.

### `ConnectionDiagnostic`

Pertenece a `messaging`: actor líder, tribu, conexión/versión, canal/template/idioma exactos, desafío de propósito diagnóstico, fecha, resultado y `validated_at`. Destino protegido y únicamente metadata autorizada. Su resultado no es `AdmissionVerificationProof`. La política común de código se comparte mediante puertos/primitivas propios y composición, sin dependencias de application hacia otra infraestructura ni un plugin global OTP.

## D. Invitaciones y solicitudes

### `AdmissionTribeNamespace` → `academy_admission_tribe_namespaces`

Referencia privada del ámbito de tribu: `tribe_id`, `created_at` de registro y `retired_at` opcional. No contiene nombre, contacto, owner, token ni credencial. El registro conserva la identidad después de una eliminación física completada y bloquea su reutilización, liberación o reactivación; una eliminación rechazada revierte el cambio. El backfill y los triggers se instalan bajo bloqueo de DML de tribus en la misma transacción.

RLS forzado limita el registro al owner de persistencia; no existe DTO o control de UI que exponga la referencia retirada. La integración completa de eliminación y la secuencia de despliegue siguen pendientes en T111 y las tareas de persistencia/despliegue.

### `RetiredAdmissionProvenance`

Tres archivos privados ligados al namespace: `academy_admission_retired_bindings`, `academy_admission_retired_operations` y `academy_admission_retired_audit_events`. Conservan los UUID originales, huellas protegidas/keyId, referencias opacas de actor/owner, origen, estado/versión y fechas pertinentes. No conservan contacto normalizado, cuenta, resultado público, claim ni metadata libre. La relación operación/auditoría usa UUID/tribu; reutiliza la referencia opaca de actor sólo cuando los actores originales coinciden. No ofrece lectura pública ni transición a una admisión activa. La copia y eliminación de recursos operables se confirman en la misma transacción; el rollback no deja archivos retirados.

`messaging_usage_events`, `messaging_usage_policies` y `tenant_messaging_connections` referencian el namespace, no la fila operable de tribu. Eventos, sujetos protegidos, entregas, intentos y reservas originales sobreviven para conservar ventanas móviles y resultados tardíos sin permitir un nuevo envío. El retiro desconecta la conexión y purga bytes de credencial; elimina desafíos, pruebas y envelopes OTP. Cancela la cola sin intento y conserva el intento ya registrado. T171 sigue siendo responsable de mantenimiento bounded y plazos de retención; estas migraciones no acreditan su worker ni la integración del journal.

### `PersonalInvitation` → `academy_personal_invitations`

`id`, tribu, creador, nombre interno, tipo/destinatario normalizado, fingerprint, `requires_allowlist`, `expires_at` nullable, `active/revoked/expired/redeemed`, `version` entero positivo no nullable con valor inicial `1`, hash de token y keyId, timestamps, cuenta/solicitud de canje y revocación de autorización separada.

- Token de alta entropía; no plaintext ni ciphertext recuperable. Enlace completo solo en la respuesta inicial de creación. Si se pierde la respuesta/enlace, consultar metadata y revocar/reemitir; no reconstruir el token desde el historial.
- Una invitación utilizable no canjeada por destinatario/tribu. Reemplazo requiere confirmación. Solo nombre interno es editable; resto se revoca/reemite.
- Casilla de lista/defaults, vigencia propuesta siete días o sin vencimiento y todas las restricciones se conservan. Sin lista requiere reconocimiento explícito.
- Canje exige evidencia del destinatario/política y confirmación; apertura/preview/login/OTP no consume. Pendiente/membresía existente devuelve su estado antes de consumir otra.
- Canje y solicitud/decisión/vínculo/eventos son una transacción. Rechazo/cancelación/expiración no recicla enlace. Revocar autorización de canje con pendiente cancela esa solicitud; no expulsa después de admitir.
- Tabla distinta de la invitación comercial histórica: sus asociaciones y token recuperable no satisfacen este contrato.
- Renombrar, revocar, canjear y materializar `active → expired` son cambios efectivos: incrementan una vez por comando confirmado. Revocar la autorización canjeada incrementa la versión y conserva `redeemed`, atomizando la cancelación/notificación de una pendiente. Reemitir crea otro recurso en versión `1`. Leer el vencimiento deriva la disponibilidad sin escribir/incrementar; el mantenimiento materializa la transición una sola vez. Una canjeada no vence por el plazo antiguo del enlace.
- Las mutaciones administrativas exigen `expectedVersion`. El canje conserva el input público existente: el writer lee la versión de la invitación y aplica CAS interno bajo locks, junto a solicitud/decisión/vínculo/eventos. No requiere una nueva versión de invitación enviada por el solicitante. Una carrera revocación/canje permite una transición; si cambia el estado antes de una revocación administrativa, la versión antigua produce `409` y requiere lectura/confirmación nueva, sin convertir el intento en otra acción automáticamente. [Regla común](#resource-versioning).

### `AdmissionRequest` → `academy_admission_requests`

`id`, cuenta/tribu, fuente común/personal/histórica adaptada, contacto nullable cuando corresponde, procedencia declarada/base/local, prueba/evidencia aplicadas, vínculo, invitación y restricciones nominativas, snapshot mínimo de política original, mensaje del solicitante, `pending/approved/rejected/cancelled/expired`, `submitted_at/expires_at`, `version`, decisión y cancel reason. Único parcial para una pendiente por cuenta/tribu; índice de bandeja por tribu/estado/fecha ascendente.

No se escribe `tribe_members` al quedar pendiente. Contacto declarado no reclama vínculo. Cadencia, mensajes/motivos y plazos conservan todos los límites del spec. Expiración se decide autoritativamente tras obtener locks aunque mantenimiento no la haya materializado. Pausa impide presentar/aprobar, no consultar/rechazar/cancelar ni detiene el plazo. Cambios más permisivos/lista agregada nunca aprueban automáticamente una pendiente.

La elegibilidad combina política actual, época/evidencia, restricciones de invitación, lista, cuenta, rol/estado y plazo; se expone como razones calculadas. El solicitante ve exclusivamente lo propio y mensajes externos. Una membresía legítima por otra vía cancela por resolución externa, sin borrar canje. Salida de academia/eliminación/bloqueo no recuperable cancela y no resucita al volver.

### `AdmissionDecision` → `academy_admission_decisions`

`id`, solicitud/presentación, tribu/cuenta, resultado, actor usuario o sistema, regla/fundamento, versión/época de política evaluada, evidencia mínima, motivo interno, mensaje externo distinto, timestamp autoritativo y referencia de efecto de membresía. Única transición terminal por request/version. Aprobación automática también registra decisión; no genera tarea de revisión falsa.

El escritor confirma conjuntamente decisión, efecto básico, canje/vínculo cuando corresponda y obligación de notificar. Motivos internos no se exponen al solicitante. Aprobación sin lista por excepción exige motivo incluso en lote; una lista requerida por invitación nunca se dispensa desde Aprobar.

La evidencia mínima de las nuevas decisiones se representa como `AdmissionDecisionEvidence {kind, referenceId, verifiedAt}`. Es un snapshot privado separado, derivado de la presentación exacta y su versión; no incluye contacto, payload de proveedor, token ni código. Los writers manuales y los eventos SQL lo capturan una sola vez. Un replay no lo reemplaza y un dato histórico ausente permanece desconocido.

## E. Operaciones e importación

### `AdmissionOperation` → `academy_admission_operations`

Identidad opaca de cliente validada, actor/tribu/tipo, huella protegida del intent, claim/lease/version, estado iniciado/finalizado y resultado público mínimo. Unique `(actor,tribe,type,idempotency_key)`. El claim durable precede al trabajo; finalización y efecto de negocio son atómicos. La misma clave con otro intent es conflicto. Una pérdida de commit/HTTP se reconcilia antes de repetir; bloquear/consultar la fila impide competir por un efecto ya confirmado.

La implementación distingue el `id` interno del ledger del `idempotency_key` generado por cliente y conocido antes de un POST perdido. El resultado/progreso propio usa esa identidad cliente dentro del namespace actor/tribu/tipo; los callbacks usan el id interno para relaciones de auditoría. La lectura de reconciliación recibe el namespace y el intent original del owner, revalida autorización/huella y no crea ni renueva claims. El lookup HTTP por id aún requiere su composición de owner y no se habilita por esta primitive. Identidad/huella/origen y snapshot completado son inmutables; cambios efectivos de lease/finalización incrementan exactamente una versión, sin incremento por replay/no-op.

La metadata privada nullable `verification_purpose` distingue admisión de diagnóstico en los namespaces compartidos `issue_contact_challenge`/`resend_contact_challenge`. Se deriva del propósito conocido del intent firmado en el claim y no cambia UUID, namespace, huella, versión o resultado público. Es inmutable. El backfill de diagnósticos históricos exige linaje completo entre ledger, entrega, desafío y diagnóstico, incluido `delivery.idempotency_key = ledger.id`, actor/tribu/conexión/versión y resultado emitido consistente; started/denied históricos sin origen verificable conservan null. El reader HTTP de conexión filtra el propósito antes de contar ambigüedad y no expone metadata de admisión, claves, material HMAC o leases.

Lotes contienen máximo cincuenta IDs explícitos con versiones y motivos pertinentes. Se ordenan locks; cada fila tiene outcome de negocio. En una transacción DB-only pueden confirmarse éxitos junto con conflictos previstos. Una falla inesperada de persistencia revierte esa transacción: no publicar éxitos no confirmados. Resultado perdido se recupera por operación; repetir no duplica decisiones/avisos. No se agrega un framework de jobs para decidir cada solicitud.

### `AllowlistImport` / `AllowlistImportRow`

Vista previa temporal ligada a líder/tribu/tipo/versión, archivo/huella, selección explícita, vencimiento, validaciones y outcomes por fila. Máximo diez mil filas y cinco MiB, UTF-8/coma/header del spec. Vista previa sin mutar lista; confirmación revalida contra datos actuales. Unique por import/row y por entrada canónica.

Resultados `added/unchanged/skipped/conflict` preservados; reimport no borra, reactiva ni reasigna. HTML y fórmulas permanecen datos; neutralizar fórmulas al exportar reporte. Archivo/reporte transitorio se elimina en veinticuatro horas. El import puede procesar bloques pequeños con ledger y reanudar solo filas no confirmadas; los tamaños técnicos no modifican el límite de producto ni se presentan como otra feature.

## F. Conexiones y secretos

### `TenantMessagingConnection` / `MessagingConnectionVersion`

Conexión: `id`, tribu, proveedor allowlisted `zavu`, propietario líder, versión seleccionada/candidata, `draft/ready/active/degraded/suspended/disconnected`, causa, época externa y timestamps. Versión inmutable: configuración no secreta, referencia de secreto, sender por canal, template/idioma, requisitos/capacidades/diagnósticos y retiro. Validación de credencial separada: `credential_validation_status`, `credential_validated_at`, `is_test_mode` y referencias privadas de proyecto/equipo/key obtenidas por `me.retrieve`; un prefijo no acredita entorno. Índices/unique permiten máximo una seleccionada y una candidata por tribu, incluso seleccionada suspendida/degradada.

Editar datos efectivos crea versión y exige nuevas pruebas; candidata no reemplaza por guardarse. Activación exige capacidades dependientes probadas para la versión en las últimas veinticuatro horas. Retiro normal requiere reemplazo/política compatible/pausa; suspensión inmediata siempre disponible. Liderazgo transferido suspende antes de recuperar secreto; nuevo líder aporta su clave. Cuotas/historial no se reinician.

### `MessagingSecretEnvelope` → tabla privada

`secret_ref`, tribu/conexión/versión/entorno/época/propósito, formato, `key_id`, IV, ciphertext/tag, estado de retiro y fechas de purga. Sin acceso de solicitantes, guardianes o consulta normal de líder. Envelopes AAD ligan contexto y keyId; clave desconocida, retirada o época incorrecta cierra antes de descifrar.

La implementación conserva la referencia histórica al purgar: `purged_at` queda fijado y los bytes `iv/ciphertext` pasan juntos a NULL únicamente después del retiro. La fila mínima permanece para no romper la FK de la versión; no conserva material recuperable. Retiro/purga son irreversibles y `purge_after` no puede postergarse ni exceder veinticuatro horas desde el retiro. El scope/origen no se edita. Re-encriptar material vivo utiliza una operación backend privada con CAS sobre el keyId anterior y contexto completo; conserva BYOK, `secret_ref`, versión de conexión y consumos. SQL recibe solo el envelope nuevo, nunca plaintext ni keyrings. El productor de rotación y el driver operativo siguen pendientes de integración; las constraints no los acreditan.

Keyrings server-only externos a la base; no son `vars`, DTOs, fixtures reales ni `AUTH_SECRET`. Rotar clave de cifrado no es reemplazar BYOK. Copia operativa retirada se elimina en veinticuatro horas; borrador/candidata expira a siete días sin actividad y purga posterior dentro de veinticuatro horas. La revocación externa de Zavu es otra acción; no se ejecuta automáticamente.

`MESSAGING_SECURITY_EPOCH` externo y recovery lock de despachos/admisiones forman el protocolo de restauración de [research.md](research.md). Una fila antigua no puede autorizarse por el solo hecho de restaurar su tombstone/ciphertext. La apertura tras restore requiere nueva configuración/pruebas y validación de políticas protegidas; no se promete borrado retroactivo del proveedor ni cancelación de un mensaje aceptado.

## G. Entrega y cupos

### `MessageDelivery` / `MessageDeliveryAttempt`

Entrega: evento/desafío/diagnóstico autorizado, tribu, conexión/versión y época fijadas, `queued_usage_policy_version`, canal, destinatario por referencia privada, identidad lógica/idempotency key, huella del payload con `payload_mac_key_id`, datos mínimos congelados para el mismo intent, estado, due/deadline, `lease_token/lease_until/version` y último outcome. Intento: `attempt_id`, secuencia única, reserva, `send_authorized_at`, `authorized_usage_policy_version`, país telefónico normalizado cuando aplica y estado `in_flight` persistidos antes de RPC, fin, correlation id, provider message id cuando existe y razón técnica sanitizada. Un proceso muerto después del marcador es posible envío aunque haya muerto antes de llamar; nunca se interpreta como ausencia demostrada de despacho.

`queued/accepted/delivered/failed/unknown/suppressed/cancelled` conservan la semántica del spec. `sent/read` del proveedor solo informa transporte; jamás crea prueba ni membresía. Unique de evento/destinatario/propósito evita obligaciones duplicadas; ID del proveedor se correlaciona solo dentro de su conexión/tribu.

Claim `SKIP LOCKED`, transacción corta y CAS sobre lease. Revalidar permiso/preferencia/capacidad/época/desafío/cuota antes de cada intento. RPC fuera de locks. Lease vencida sin intento puede volver a cola; con inicio externo es `unknown`, no otra llamada. `accepted` no es `delivered`; respuesta tardía actualiza el mismo intento sin pisar uno nuevo. Incierto conserva cupo. Sin ventana dedup comprobada, no rePOST; consultar solo IDs propios.

El envelope OTP permanece separado, solo durante necesidad de despacho/reconciliación permitida y como máximo hasta diez minutos. Se elimina al no necesitarse o perder vigencia; MAC/contexto y contadores no contienen código recuperable. Retry técnico autorizado conserva desafío/identidad/payload; resend explícito crea desafío nuevo e invalida anterior. Notificaciones pueden recuperarse con otra conexión de la misma tribu solo por acción auditada, generando una entrega explícita y sin garantizar ausencia de duplicados externos.

### `MessagingUsagePolicy` / `MessagingUsageReservation`

Política por tribu: cupos separados de verificaciones/notificaciones, `allowedCountries` —campo persistido `allowed_countries`, única lista editable de países por tribu, inicialmente `[]`—, máximos de plataforma y `version` entero positivo no nullable con valor inicial `1`. Reservas/contadores por desafío, actor, fingerprint de contacto con `fingerprint_key_id`, tribu, propósito y ventana, con unique por intento externo. Ventanas horarias móviles y día UTC; agregado entre tribus para cuenta/contacto. Puentes de keyring mantienen comparación/consumo durante rotación. No hay consulta pública que revele dónde se consumió el límite.

Todas las cifras/defaults son las del spec. Diagnósticos/SMS alternativo comparten cuota de verificación; validación de credencial tiene su propio límite sin enviar. Reservar consistentemente el último cupo; revalidar reducción antes de despacho. Solo liberar con evidencia de ausencia de despacho. Clave/canal/versión no reinicia contadores. Rotación de la clave de índices debe conservar puentes/contadores durante todas las ventanas; si no se puede mantener continuidad, cerrar nuevos envíos hasta reconciliar o vencer esas ventanas, no empezar presupuesto desde cero.

<a id="country-policy"></a>

#### Países, configuración inicial y despacho (I1)

El owner `messaging` crea la política de uso con los defaults del spec y `version=1` durante una acción explícita de inicio de configuración; no requiere conexión ni `AdmissionPolicy`. La inicialización concurrente usa unicidad por tribu: si ya existe devuelve la política vigente, sin reemplazar defaults/países/cupos ni reiniciar versión/consumo. GET solo consulta: si aún no existe, retorna ausencia y defaults de presentación separados, sin persistir ni fingir una versión de recurso existente. La posterior elección de países se guarda con `expectedVersion`; el asistente ofrece este paso antes del primer diagnóstico SMS/WhatsApp y antes de activar teléfono.

`allowedCountries` es un conjunto normalizado de códigos de país inequívocos del normalizador adoptado, sin duplicados ni orden significativo. El teléfono se normaliza a E.164 y su país se comprueba coherente; el servidor no usa un país arbitrario del body para eludir una restricción. Comparar el conjunto normalizado permite distinguir cambios efectivos de reordenamientos/no-op.

Todo envío SMS/WhatsApp de `admission` o `connection_diagnostic`, incluido SMS alternativo, debe pertenecer a ese conjunto y cumplir restricciones de plataforma/cuenta/canal efectivamente comprobadas. No se inventa un endpoint/catálogo Zavu de países ni se infiere alcance por el país del sender, el prefijo de una key o una única entrega exitosa. Ausencia de una lista publicada no habilita envíos mundiales: la lista propia sigue siendo obligatoria y los requisitos de recurso/capacidad se comprueban según el contrato.

`[]` impide nuevos despachos telefónicos y la primera activación de verificación por teléfono. No impide correo preparado ni enlace común manual/teléfono/OFF con contacto declarado opcional; no vuelve canjeable una nominativa telefónica OFF ni dispensa otra condición.

Cada nuevo intento lee la política de uso vigente bajo el límite transaccional que autoriza reserva/marker, antes de SecretStore/RPC. La entrega conserva `queued_usage_policy_version` como dato de auditoría; el intento registra `authorized_usage_policy_version` vigente y país normalizado. Una copia en cola o enviada por cliente no autoriza el despacho. Si se retiró el país antes del marker, la entrega pendiente queda `suppressed` con razón segura, sin RPC ni presupuesto de intento externo consumido; los contadores de solicitud/abuso ya aplicados conservan su vigencia. Un intento iniciado/aceptado/`unknown` conserva su identidad/estado y cupo; no se promete cancelarlo ni se rePOSTea.

Cambiar países incrementa solo la versión de configuración de uso cuando cambia el conjunto. No modifica `verification_epoch` ni `connectionVersion`, no reinicia consumo y no invalida por sí solo un código vigente/prueba aplicada/solicitud/membresía. La validación local mantiene contexto/TTL/época y controles existentes; un nuevo envío/reenvío vuelve a comprobar la restricción actual.

## H. Notificaciones, auditoría y medición

### `AdmissionNotification` → obligación + `notifications` existente

Evento de pendiente/decisión/cancelación/recordatorio, cuenta receptora, recurso autorizado, clave lógica de dedupe y metadata mínima. Insertar junto al hecho. Preadmisión propia no exige contenido comunitario; aviso a reviewer exige rol activo actual. Externo opcional solo por correo confiable y capacidad probada, con preferencias individuales/grupo cinco minutos/diario/omitido y zona del spec. Habilitar correo no despacha todo el pasado.

La base T024 implementa `notifications.admission_obligation_id/admission_audience`: FK compuesta a `(obligation.id,tribe_id)`, fuente y destinatario inmutables, payload vacío y unique por obligación/destinatario además del dedupe general. La primitiva privada materializa en la transacción original, valida propietario/reviewer actual y conserva `read_at` durante replay. SELECT/UPDATE aplican destinatario y recurso propio o rol activo; los tipos comunitarios conservan su permiso de contenido. La integración con reader/DTO/copy y casos de uso pertenece a T057; no se atribuye ese recorrido a la migración.

Las entregas externas viven en outbox; fallarlas no revierte el hecho. Agrupar por receptor/tribu/preferencia/ventana y congelar intent al despachar, respetando cancelación de preferencia y rol. Reminder lógico único a tres días. No enviar nota interna ni links que decidan por GET. Polling focal visible de quince segundos e invalidación inmediata de acciones propias satisfacen el diseño de aparición; su p95 y scheduler se miden antes de activar.

### `AdmissionAuditEvent` / métricas

Actor/tribu/recurso, operación/regla, causa, versión, transiciones y tiempo; metadata allowlisted, sin API key, ciphertext, cuerpos OTP o payloads completos. Auditoría de seguridad 365 días. Métricas agregadas por tribu de admisión/revisión/verificación/intentos/entregas/antigüedad/errores/consumo, sin labels de cuenta/contacto o datos de otra tribu. Medir queue age, unknown, leases, last successful run y tiempos SC; no una métrica por excepción/ID.

La procedencia de operación se liga por FK compuesta `(operation_id,tribe_id)` a `academy_admission_operations(id,tribe_id)`, con unique de ese ámbito. `operation_id` puede ser NULL para un evento sin ledger; una referencia presente no cruza tribus ni apunta a una operación ausente. El borrado es RESTRICT mientras la auditoría conserve esa relación: la minimización o eliminación autorizada del registro dependiente precede a purgar el ledger, sin cascada que pierda procedencia.

## I. Cambios sobre tablas existentes y guards

- `tribes.admissions_control_activated_at`: marcador monotónico independiente de policy/settings; perder esas filas no abre una academia previamente protegida. El liderazgo canónico se obtiene de `tribe_members.role=leader`, no del creador histórico.
- `tribe_members.commercial_recovery_status`: nullable `active/muted`, propiedad de `tribes`. Se captura bajo lock antes de ocultar un estado legible por causa comercial y no se sobrescribe desde un estado comercial. Backfill solo de estado observado/evidencia acreditada; `NULL` histórico es desconocido, no un permiso para inventar active/muted. El preflight bloquea recuperación automática de esos casos hasta resolución autorizada/auditada; no se presenta una UI general inexistente.
- Recuperación gratuita solo para `role=tribemate`, causa comercial exacta y snapshot conocido; conserva rol/fecha y restaura el estado legible. Fila comercial `guardian/leader` no se degrada ni reactiva automáticamente. Fuente paga legítima se evalúa por su propio owner y preserva moderación.
- `tribe_members` conserva referencia a un fundamento básico vigente derivado de la decisión, asociado a cuenta/tribu/instancia de pertenencia, con aplicación/revocación y consumo único. No es una concesión comercial. Reconciliar una suscripción antigua inactiva no revoca ese fundamento. Salida o remoción no comercial lo extingue; una decisión antigua no autoriza otro reingreso.
- FK/unique y orden diferido resuelven el ciclo decisión/membresía. Una nueva alta/recuperación protegida requiere procedencia distinta de una admisión previa. La guarda estructural comprueba relación/consumo del efecto, no reemplaza la máquina de decisión de application.
- Writers de `tribes` consumen decisión válida en la misma transacción. Bootstrap y pago real `membership` usan procedencia propia; un booleano público no la crea. Guardas de modo/producto se ejecutan también bajo el rol de runtime.

La procedencia paga implementada utiliza `subscription_membership_effects`, privada del owner `subscriptions`: referencia de suscripción nullable sólo para archivo, tribu/cuenta/instancia, referencia privada del proveedor, `source_updated_at` exacto, destino legible y fechas de consumo/revocación. FK compuestas y unique `(subscription_id,member_id,source_updated_at)` impiden cruce y reutilización de ese estado confirmado. La fuente nueva se consume junto al `tribe_members.subscription_membership_effect_id`; no es una decisión ni un derecho básico independiente de billing. El writer toma hechos actuales después del UPDATE de proveedor y conserva moderación, rol/fecha y snapshot conocido. El borrado archiva la instancia tras revocar todas sus fuentes históricas. Source timestamps se leen como texto para preservar microsegundos de PostgreSQL, sin schema-validar filas.
- Actualizar funciones/policies históricas para cerrar academia protegida, conservando casos `legacy`. Dos reconciliaciones administrativas y checkout clásico directo se incluyen expresamente; no borran moderación ni producen pertenencia por `academy`.
- `notifications`: ampliar tipos/payloads propios, predicado de visibilidad para solicitante, productores y DTOs/copy; mantener contratos existentes para otros tipos. Referencias a recursos retirados conservan estado propio mínimo sin abrir datos.
- Ninguna tabla existente se presupone ya provista de esos campos. Todas las modificaciones requieren migraciones versionadas y adaptación de schema/repositorios/pruebas en la implementación.

<a id="resource-versioning"></a>

## Versionado de recursos mutables (U1)

`AllowlistEntry`, `PersonalInvitation` y `MessagingUsagePolicy` tienen `version` server-side, entero positivo seguro, no nullable, inicial `1`. Se define como entero positivo en el schema SQL futuro y en el DTO propio; body/query no pueden fijar la versión del recurso. Sus lecturas y resultados autorizados exponen la versión correspondiente al recurso. Crear usa operación estable y unicidad, sin pedir una versión inexistente ni un sentinel `0`.

Para una operación nueva sobre recurso existente, `expectedVersion` es obligatorio, entero positivo, y se compara con la fila bloqueada en el writer. Una diferencia produce conflicto `409`, sin escritura/efecto/notificación ni actualización automática del token del cliente, incluso si los valores deseados coinciden con el estado actual. Con versión vigente, un comando que cambia campos/estado incrementa una sola vez dentro del mismo commit; cambiar varios campos no suma varias versiones. Un no-op devuelve `unchanged` con la versión vigente, sin duplicar efectos.

Orden semántico de recuperación: autorización actual → identidad/huella normalizada de operación → replay confirmado del mismo intent → CAS para trabajo nuevo. El ledger conserva el resultado y la versión del commit original. El replay con el mismo `operationId`/intent recupera ese resultado aunque su `expectedVersion` ya sea antiguo; no ejecuta otro CAS/cambio ni incrementa. Modificar `expectedVersion` o el intent con esa misma identidad produce `idempotency_conflict`. Resultado indeterminado se reconcilia antes de repetir. La versión del resultado histórico no se presenta como versión actual: obtener una proyección autorizada vigente por consulta separada y no sobrescribir estado más nuevo en UI.

Dos comandos nuevos con la misma versión inicial y cambios efectivos distintos permiten como máximo un commit; el otro recibe conflicto y necesita nueva lectura/confirmación con otra identidad de operación. La comprobación de actor/rol no se omite para recuperar un resultado. El ledger de creación de invitación devuelve solo metadata al reintentar; no conserva/reconstruye URL secreta.

En la política de uso solo cambios efectivos de cupos/países/configuración incrementan `version`. Reservas, contadores, consultas, envíos e intentos no la incrementan ni reinician consumos. Esta versión es independiente de `verification_epoch` y `connectionVersion`; el dispatcher evalúa límites/países actuales y registra la versión utilizada al autorizar cada intento.

## Orden transaccional y recuperación

Orden común documentado para evitar deadlocks: tribu y políticas aplicables (incluida política de uso) → actor/sesión/evidencia necesaria → operación → solicitudes y miembros ordenados → invitaciones/pruebas/vínculos → efectos/eventos. Revalidar reloj después de esperas por lock. Cada writer conserva el mismo orden y usa el helper de checkout protegido. Admisión no mantiene locks mientras consulta proveedor.

Decisión persistida, membresía, vínculo/canje y eventos deben aparecer juntos o no aparecer. Unicidad/CAS resuelven la carrera; lectura previa no basta. Al cambiar política se toman los mismos locks y época. El resultado desconocido de un commit se consulta por identidad estable antes de repetir. Los handlers/clientes reciben solo resultados propios mínimos validados.

## Conservación y eliminación

Se conservan habilitaciones/vínculos mínimos mientras sostengan autorización o prevengan reasignación ilegítima. Solicitudes terminales y sus mensajes: 180 días y posterior minimización; auditoría: 365. CSV/reportes y secretos operativos retirados: 24 horas. Material OTP: menor plazo de necesidad y TTL del desafío. Borradores: siete días más purga dentro de 24 horas. Los límites no se inventan como cumplimiento legal.

Eliminación/salida de academia cancela pendientes, invalida invitaciones y detiene entregas antes de purgar. History privada conserva mínimos dentro de finalidad y retención, con asociaciones archivadas que no conceden permisos ni liberan un vínculo por cascada accidental. La implementación debe conciliar deletion/privacy existentes y ensayar cuenta/tribu eliminadas y restore. Proyectos, facturación e historial del proveedor permanecen fuera de esta feature.

## Validación posterior requerida

Constraints/índices/FK/RLS y writers se ejercen contra el SQL real en una rama efímera Neon; rollback, timeout/abandonos, actores concurrentes, flags y rol efectivo se prueban con fixtures sintéticos. Los mismos casos de negocio usan puertos propios y reloj inyectable; crypto real y SDK real en su transporte. Ninguna casilla documental acredita esas pruebas. [quickstart.md](quickstart.md) define casos y [traceability.md](traceability.md) conserva todas las obligaciones individuales.
