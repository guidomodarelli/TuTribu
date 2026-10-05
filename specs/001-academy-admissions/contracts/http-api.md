# HTTP Contracts: Academy Admissions and Tenant Messaging

**Estado**: contrato propuesto para implementación. No hay endpoints nuevos desplegados. Owners: `academy-admissions`, `messaging`, `auth`, `notifications`. [Modelo](../data-model.md), [errores/recuperación](errors-and-recovery.md), [UI](ui-flows.md).

## Reglas del boundary

- Validar una vez params/query/body propios mediante Zod antes de application; el usuario/correo/sesión y la tribu autoritativos provienen del servidor. Nunca aceptar permisos, `verified=true`, rol, API host o proveedor alternativo desde browser.
- Publicar exclusivamente DTOs propios allowlisted y validarlos en response/props y consumer. DTOs SDK, tokens/claims, secretos/ciphertext, nota interna de otro audience y `cause/stack` no cruzan. El contrato canónico de payloads es la única fuente para esa separación.
- `x-request-id/x-trace-id` se manejan por la infraestructura vigente. Operaciones de escritura llevan identidad UUID estable e intent protegido; repetir el mismo intent recupera resultado, cambiarlo con la misma clave es conflicto.
- GET, prefetch, preview, login y cambio de campos no envían códigos, crean solicitudes ni canjean. Headers de recursos privados/intents/tokens: no-store y política de referrer que no difunda el token. Logs usan operación/path template, nunca URL con token.
- Confirmación explícita en cada escritura; versiones esperadas en cambios/decisiones. Fechas públicas ISO con zona/UTC, IDs opacos, ints seguros, enums cerrados y límites del spec. Duplicados o selección mayor a cincuenta se rechazan antes de efectos.
- El nuevo resultado de admisión migra `joinAcademy` y la rama academia del canje histórico en el mismo trabajo. El producto `legacy` conserva su contrato. Stale clients no reciben una aprobación ficticia ni pueden usar el writer anterior como bypass.

## Audiences

`account`: sesión global válida y recurso propio; no exige membership. `leader`: rol/estado actuales y tribu. `reviewer`: líder/guardián activo de esa tribu. `sensitiveLeader`: leader más autenticación global reciente aplicable, revalidada antes de secreto/configuración sensible. `maintenance`: bearer validado y conexión/funciones de mantenimiento del servidor; no es un rol del browser.

## DTOs públicos principales

| DTO | Campos y significado |
| --- | --- |
| `AdmissionOverviewDto` | `tribe:{slug,name,accessModel}`, `policy:{mode,contactType,requiresAdditionalVerification,isOpen,version}`, `state`, `nextAction`, `safeMessage`, `request?`. Solo información pública/propia; no coincidencias de lista ni destinatario de otra cuenta |
| `AdmissionRequestDto` | `id,status,version,submittedAt,expiresAt,source`, `contact?:{type,maskedValue,evidenceKind}`, `needsVerification`, `eligibilityReasons[]`, `externalMessage?`, `retryAllowedAt?`. Reviewer autorizado recibe detalle de cuenta/contacto/motivo en `AdmissionReviewDto`; jamás código/secreto |
| `AdmissionOutcomeDto` | Discriminante `outcome:pending/admitted/already_member`; `operationId`, `request?`, `membership?:{status,role}`, `safeMessage`, `nextHref?`. Se actualiza estado local; pertenencia básica no implica grants |
| `VerificationChallengeDto` | `challengeId,purpose,channel,maskedDestination,expiresAt,resendAllowedAt,deliveryState`, `allowedAlternative?`. Sin código, MAC, envelope, cuenta ajena o cuota consumida en otra tribu |
| `VerificationResultDto` | `result:verified`, `proofId` opaco solo para admisión y `applyBefore`; diagnóstico devuelve su resultado/versión y no proof de admisión |
| `AdmissionPolicyDto` | Configuración propia, `version,verificationEpoch`, estado de control/pausa y capacidades necesarias; resumen de países/versión de uso derivado por puerto propio, sin segunda lista editable. Su audiencia es leader |
| `MessagingConnectionDto` | `id,providerId,version,state`, máscara genérica, `credentialState,environment`, capacidades/diagnósticos seleccionados, fechas/requisitos faltantes/consumo propio agregado. Sin key completa, project/team/key privados, webhook o ciphertext |
| `ProviderResourcePageDto` | `items:{id,label,channels,readiness}[]`, `nextCursor?`; plantillas añaden categoría/idioma/aptitud propios. IDs externos se proyectan como referencias autorizadas propias; no retornar el objeto SDK |
| `AdmissionBatchResultDto` | `operationId,state`, `result:all_succeeded/mixed/all_rejected/incomplete`, `completedCount,failedCount,unresolvedCount`, `items:{requestId,status,version?,code?,safeMessage}[]`. Solo selección explícita, orden estable y resultados confirmados |
| `AllowlistImportDto` | `importId,expiresAt,sourceVersion`, filas/selección con índices, errores de campos seguros y counts; confirmación devuelve added/unchanged/skipped/conflict por fila y estado de operación |
| `OperationStateDto` | Identidad/tipo/estado y resultado ya confirmado o indeterminado, con versión del commit original cuando aplica. Esa versión no afirma estado vigente; consultar recurso actual por separado. Reconciliación del mismo actor/tribu antes de repetir; no request raw, token ni motivos ajenos |
| `AllowlistEntryDto` | `id,version,contactType,identity,displayName?,status,source,createdAt,updatedAt`; solo leader de la tribu. `version` entero positivo, sin fingerprint/MAC ni identidad ajena en proyecciones del solicitante |
| `PersonalInvitationDto` | Metadata privada de leader: `id,version,internalName,recipient,requiresAllowlist,expiresAt,status`, canje/revocación autorizados; sin token. Creación inicial añade `invitationUrl` una sola vez; replay devuelve metadata sin URL |
| `MessagingUsagePolicyDto` | `version,allowedCountries,verificationDailyLimit,notificationDailyLimit`, máximos de plataforma y consumo propio agregado por separado; version positiva de configuración, sin contadores globales ajenos |
| `MessagingUsagePolicyStateDto` | `state:not_configured/configured`, `policy:MessagingUsagePolicyDto/null`, defaults de presentación separados cuando falta recurso. No inventar versión persistida al leer ausencia |

`AdmissionReviewDto` amplía únicamente para reviewer actual: cuenta identificada, contacto/evidencia con fuente/fecha/alcance, restricciones nominativas, motivos internos y acciones elegibles. El renderer nunca confunde dato declarado con comprobado. Los DTOs tienen schemas discriminados concretos por operación, no `Record<string,unknown>` público.

## Versiones propias, CAS y recuperación

Aplicar la [regla común de versión](../data-model.md#resource-versioning) para `AllowlistEntry`, `PersonalInvitation` y `MessagingUsagePolicy`: creación server-side en `1`; lecturas y outcomes autorizados incluyen `version`. PATCH/PUT/revoke sobre recurso existente requieren `expectedVersion` entero positivo. No-op con versión vigente conserva el valor; cambio efectivo confirmado incrementa una vez. Las consultas, reservas/contadores y replays no incrementan la versión de configuración. Una versión obsoleta produce `409` sin efectos, incluso si el valor deseado coincide.

Autorización actual e intent normalizado preceden al ledger. Un replay confirmado del mismo `operationId` se resuelve antes del CAS y recupera la versión/outcome del commit original; no se clasifica como conflicto solo por conservar su `expectedVersion` antiguo. Otro intent o `expectedVersion` cambiado con esa identidad es `idempotency_conflict`. Un intent nuevo con versión vieja recibe conflicto de recurso; exige lectura y nueva confirmación/operación. Mantener resultado histórico y vista actual separados para no sobrescribir UI más nueva.

La creación no utiliza `expectedVersion=0`: POST crea versión `1` y está protegido por operation/unique. El canje por `/submissions` conserva su input público y realiza CAS interno de invitación bajo el writer; no expone destinatario ni añade requisito de versión de invitación al solicitante.

## Solicitante y prueba de contacto

Base `/api/tribes/[slug]/admissions`.

| Método y sufijo | Audience/input propio | Resultado/efecto |
| --- | --- | --- |
| GET `/overview` | Público para información pública; sesión para estado propio | Overview seguro; sin efectos |
| GET `/own-request` | account | Request propio o ausencia; nunca listar otros solicitantes |
| POST `/submissions` | account; `operationId`, `expectedPolicyVersion`, `invitationToken?`, `legacyInvitationToken?`, `phone?/country?`, `proofId?`, `message?` | Pending/admitted/existente; servidor resuelve fuente y restricciones. Correo viene de la cuenta, no del body |
| POST `/challenges` | account; `operationId`, `expectedPolicyVersion`, destino telefónico inequívoco cuando corresponda, canal permitido, `requestId?` o token del recorrido | Challenge/entrega propia. ON obligatorio; remitente/texto/código provienen del servidor; nada canjeado |
| POST `/challenges/[challengeId]/verify` | account; `verificationCode` de seis dígitos | Consumo único y proof local; validación local funciona con código vigente aunque proveedor/cuota haya caído |
| POST `/challenges/[challengeId]/resend` | account; operation estable, alternativa SMS explícita cuando autorizada | Desafío nuevo, anterior inválido, espera/cupos compartidos; no cambio a correo ni fallback silencioso |
| POST `/requests/[requestId]/proof` | account propio; `proofId,expectedVersion,operationId` | Adjunta prueba a la misma pendiente, sin cambiar plazo/aprobar/contacto ya fijado |
| POST `/requests/[requestId]/cancel` | account propio o leader; `expectedVersion,operationId`, motivo de gestión cuando leader | Cancelled; enlace consumido no se libera |
| GET `/operations/[operationId]` | actor/tribu de operación autorizada | Estado/resultado mínimo para reconciliar pérdida de respuesta |

Antes de crear desafío/presentación se devuelve membresía legítima o pendiente existente. La confirmación de canje resuelve cuenta/tribu/token/destinatario/lista/época/bloqueos actuales bajo el writer; una prueba valida no consume token hasta presentación confirmada. Contacto ajeno vinculado retorna conflicto genérico y recorrido de recuperación de cuenta/ayuda, sin revelar owner ni reasignarlo.

`POST /api/tribes/[slug]/academy/join` y el Server Action histórico son bridges a ese contrato cuando la academia está protegida. Las escrituras antiguas y las queries SQL de checkout/ingreso también se cierran autoritativamente; compatibilidad de UI no reemplaza el gate.

## Política, lista e invitaciones

| Método y sufijo | Audience/input | Resultado |
| --- | --- | --- |
| GET `/policy` | leader | Policy/configuración sin secreto |
| PUT `/policy` | sensitiveLeader; campos propios de admisión, `expectedVersion,operationId` | Versión nueva/CAS, impacto y épocas. Contact type no cambia una vez activado. Países se editan en usage-policy, no se acepta aquí una segunda lista |
| POST `/policy/activate` | sensitiveLeader; `expectedVersion,operationId`, confirmación explícita | Marcador durable y policy se activan juntos tras preflight; nunca activar solo por abrir página |
| POST `/policy/pause` | sensitiveLeader; `expectedVersion,operationId`, motivo | Cierre de presentaciones/aprobaciones, consulta/rechazo/cancelación disponible |
| GET `/allowlist` | leader; query/estado/cursor/page-size propios | Lista autorizada paginada de AllowlistEntryDto con version; no acceso de solicitante/guardián |
| POST `/allowlist` | sensitiveLeader; contacto canónico/nombre opcional/operation | Entrada nueva version 1 o replay confirmado; ninguna membership ni version elegida por cliente |
| PATCH `/allowlist/[entryId]` | sensitiveLeader; nombre/estado, expectedVersion/operation | CAS: cambio efectivo incrementa una vez, no-op vigente conserva version, stale 409; no reasignar ni expulsar |
| POST `/allowlist/imports` | sensitiveLeader; CSV dentro de límites | Vista previa temporal, sin efectos de lista |
| GET `/allowlist/imports/[importId]` | mismo leader/contexto autorizado | Estado/filas de preview o progreso conservado |
| POST `/allowlist/imports/[importId]/confirm` | sensitiveLeader; índices explícitos/version/operation | Revalidación y outcomes por fila; resume solo unidades no confirmadas |
| GET `/allowlist/imports/[importId]/report` | leader autorizado | Reporte sanitizado, sin fórmulas ejecutables; retención 24 h |
| GET `/invitations` | leader | PersonalInvitationDto versionado, metadata privada autorizada, sin token recuperable |
| POST `/invitations` | sensitiveLeader; nombre/destinatario/lista/expiry nullable, operation y confirmaciones | Nueva version 1; URL secreta solo en respuesta inicial. Replay metadata sin URL; no invita al portador |
| PATCH `/invitations/[invitationId]` | sensitiveLeader; solo nombre/expectedVersion/operation | Rename con CAS/resultado versionado; stale 409. Cambiar destinatario/lista/expiry exige otra emisión |
| POST `/invitations/[invitationId]/revoke` | sensitiveLeader; expectedVersion/operation/motivo | CAS de acción confirmada; revocar activa o autorización canjeada incrementa y atomiza notificación/cancelación. Cambio de estado concurrente exige nueva lectura/confirmación |

CSV: UTF-8/coma, `identity,display_name`, nombre opcional, 10.000 filas y 5 MiB. Los demás límites de copy y fechas son los del spec. El reintento de creación con URL perdida devuelve metadata y recuperación por revocar/reemitir, no reconstruye token.

## Bandeja, decisiones y recuperación

| Método y sufijo | Audience/input | Resultado |
| --- | --- | --- |
| GET `/requests` | reviewer; filtros estado/fecha/fuente/excepción/requisitos, query y cursor | Más antiguas primero; solo tribu actual |
| GET `/requests/[requestId]` | reviewer o cuenta propia, proyección distinta | ReviewDto o RequestDto, permisos/eligibilidad vigentes |
| POST `/requests/[requestId]/decision` | reviewer; approve/reject, expectedVersion/operation, motivo interno requerido, mensaje externo separado | Transición terminal única y efecto básico/notificación; no autoaprobarse |
| POST `/request-decisions` | reviewer; hasta 50 request IDs/versiones explícitos, decisión y motivos pertinentes/operation | Resultados individuales confirmados. Conflictos no se convierten en éxito global |
| POST `/requests/[requestId]/retry-eligibility` | sensitiveLeader; motivo/operation | Adelanta intento sin aprobar, levantar conducta ni reciclar enlace |
| GET `/activity` y `/metrics` | leader; intervalo/filtros acotados | Agregado propio/auditoría sanitizada; guardián solo historial necesario por RequestDto |
| PUT `/notification-preferences` | reviewer sobre sí mismo | Preferencia individual de avisos; no activa el canal de correo de la tribu |

Restaurar una fila privilegiada o un histórico con moderación desconocida requiere resolución del owner de membresías fuera de esta aprobación. No se ofrece un endpoint libre para roles/bloqueos. Las guardas de `subscriptions` preservan fundamento básico vigente, moderación y producto; una fuente paga legítima puede cancelar la pendiente por resolución externa.

## Conexiones de mensajería

Base `/api/tribes/[slug]/messaging`.

| Método y sufijo | Audience/input | Resultado |
| --- | --- | --- |
| GET `/configuration` | leader; guardián solo alerta operativa mínima | Metadata propia, ninguna clave; estado de política de uso disponible para leader aunque no exista conexión |
| POST `/connections` | sensitiveLeader; providerId zavu, key efímera, nombre/capacidades requeridas, operation | Candidata/draft cifrada; guardar no despacha ni activa |
| POST `/connections/[connectionId]/validate` | sensitiveLeader; version/operation | `me.retrieve` autentica/entorno; no canal probado ni mensaje |
| GET `/connections/[connectionId]/senders` | sensitiveLeader; cursor/limit propio | Página segura; acceso efectivo, continuation y contexto de versión |
| GET `/connections/[connectionId]/templates` | sensitiveLeader; sender/canal/cursor permitido | Página segura de plantillas/idiomas aptos |
| PUT `/connections/[connectionId]/configuration` | sensitiveLeader; referencias sender/template/idioma/canales, expectedVersion/operation | Versión nueva; diagnóstico anterior no habilita cambios efectivos |
| POST `/connections/[connectionId]/diagnostics` | sensitiveLeader; canal/destino autorizado/version/operation y confirmación de consumo | Desafío de diagnóstico, solo envío solicitado |
| POST `/connections/[connectionId]/diagnostics/[diagnosticId]/verify` | mismo líder/contexto; código | Resultado de conexión/canal/versión, nunca proof de admisión |
| POST `/connections/[connectionId]/activate` | sensitiveLeader; version/operation/confirmación | Reemplazo coherente solo tras capacidades dependientes probadas |
| POST `/connections/[connectionId]/suspend` | sensitiveLeader; motivo y operation | Stop inmediato; compromiso invalida pruebas según scope; no cancela mensaje aceptado |
| POST `/connections/[connectionId]/disconnect` | sensitiveLeader; resolución de dependencias/operation | Uso cerrado/purga operativa; revocación externa separada |
| GET `/usage-policy` | leader de la tribu; no exige conexión ni AdmissionPolicy | MessagingUsagePolicyStateDto; consulta sin efectos, version solo de recurso existente |
| POST `/usage-policy` | sensitiveLeader; operation e inicio explícito de configuración | Crea defaults del spec, allowedCountries vacío y version 1 si falta; si ya existe devuelve estado actual sin sobrescribir/resetear/incrementar. Unique por tribu/replay; sin SDK/envío ni dependencia de conexión |
| PUT `/usage-policy` | sensitiveLeader; allowedCountries/cupos dentro de máximos, expectedVersion/operation y confirmación de incremento | CAS: cambio efectivo incrementa, no-op vigente conserva version y stale 409; no altera historia ni reinicia contadores |
| GET `/deliveries/[deliveryId]` | leader o propietario de su desafío, proyección mínima | Transporte propio sin cuerpo/código/credencial |
| POST `/deliveries/[deliveryId]/recover` | sensitiveLeader; acción compatible/evidencia/motivo/operation | Recuperación autorizada de avisos; sin cambio silencioso de versión ni resend OTP ciego |

`allowedCountries` se guarda mediante usage-policy antes del primer diagnóstico SMS/WhatsApp y de la activación telefónica. El inicio explícito del asistente inicializa defaults si faltaba el recurso; abrir la página/GET no lo crea. Se puede configurar sin key, conexión activa o AdmissionPolicy; solo permisos/recencia de gestión vigentes. Todo envío telefónico admission/connection_diagnostic y SMS alternativo revalida la lista propia vigente y restricciones comprobadas antes del marker de intento. País retirado con trabajo no autorizado: suppressed/recipient_not_allowed sin RPC; intento iniciado/accepted/unknown conserva su tratamiento/cupo. Correo y manual/teléfono/OFF común siguen sus reglas independientes. [Detalle del modelo](../data-model.md#country-policy).

Selección manual de recurso existe cuando la enumeración no está permitida: identificador propio se verifica mediante detalle y/o diagnóstico autorizado que demuestre recurso/canal efectivos. Si no puede validarse, permanece incompleto; escribir un ID no basta. No se aprovisionan recursos ni se modifica el sender por defecto en Zavu.

## Auth y mantenimiento

- `POST /api/auth/reauthentication/intents`: sesión/actor/recurso autorizado, retorno allowlisted; intención propia sin marcar éxito. Callback Google existente decorado acredita identidad/recencia; `GET .../[intentId]` devuelve solo resultado propio seguro. Los endpoints sensibles buscan la evidencia vinculada a la sesión: browser no suministra `auth_time` ni permiso.
- `GET /api/maintenance/admission-messaging`: maintenance validado; pasos bounded de expiración/purga/recordatorios/outbox/reconciliación por ID propio, con outcome por paso y fallo visible si el driver/configuración falta. Un GET público ordinario no activa este mantenimiento.
- Webhook de entrega, si se integra, recibe bytes originales/firma v2 y correlaciona solo trabajo registrado. No se exige ni configura uno externo para onboarding mínimo; nunca cambia identidad/admisión.

## Transporte y resultados parciales

201 para una presentación/admisión nueva confirmada; 200 para lectura, resultado idempotente y lote finalizado (también mixed/all_rejected, diferenciados en DTO); 202 solo para una operación durable realmente iniciada cuyo resultado requiere consulta. No inventar job IDs si no hubo aceptación. Errores y commit indeterminado se rigen por [errors-and-recovery.md](errors-and-recovery.md).

Una importación conserva filas confirmadas si falla un bloque posterior. La selección nueva de retry contiene solo filas no confirmadas elegibles y revalida datos actuales. El lote DB-only no presume commit parcial ante caída: consulta ledger. Cualquier retomada requiere autorización vigente y no sustituye expected versions/motivos silenciosamente.

## Invariantes que deben ejercer los tests del contrato

Inputs extra/ajenos rechazados; schemas públicos reales; creación version 1/no sentinel 0, no-op, replay previo al CAS, intent distinto con misma clave, writers competidores/stale 409, canje/revocación e historial vs vista actual; lista de países vacía/prohibidos/reducción en cola y política de uso disponible antes de conexión; cuenta/tribu cruzadas denegadas; GET sin efectos; stale versions/conflictos; códigos locales no globales; secretos/notas internos ausentes; invitación perdida no recuperable; datos declarados nunca vinculantes; sin refresh global salvo excepción de cambio real de contexto de seguridad documentada; abort de consulta sin toast ni estado stale; operación/rows confirmadas preservadas y ninguna repetida por resultado incierto.
