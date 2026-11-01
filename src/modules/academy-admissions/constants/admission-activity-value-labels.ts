/** Localizes the closed values shown in the detail of each activity fact; references, versions, counts and dates stay as recorded. @module admission-activity-value-labels */
import type { AdmissionActivityPage } from "../application/results/admission-activity-result";
import { ADMISSION_ACTIVITY_EVENT_LABELS } from "./admission-activity-labels";
import { ADMISSION_REVIEW_HISTORY_ACTOR_LABEL } from "./admission-review-history-page";

/** One fact of the guarded activity page. */
type ActivityItem = AdmissionActivityPage["items"][number];
/** Guarded change fields of one fact. */
type ActivityChanges = ActivityItem["changes"];
/** Guarded historical policy snapshot. */
type PolicySnapshot = NonNullable<ActivityChanges["toPolicy"]>;
/** Closed value of a change field, when the field holds one. */
type ClosedValue<Value> = Extract<NonNullable<Value>, string>;
/** Every closed field may name its labels; a map must cover each value its field accepts. */
type ClosedValueLabels<Fields> = { readonly [Field in keyof Fields]?: Readonly<Record<ClosedValue<Fields[Field]>, string>> };

/** Recorded states of requests, entries, invitations, connections, deliveries, proofs and memberships. */
const ADMISSION_ACTIVITY_STATE_LABELS = {
  pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada", cancelled: "Cancelada", expired: "Vencida",
  enabled: "Habilitado", disabled: "Deshabilitado", active: "Activa", revoked: "Revocada", redeemed: "Canjeada",
  draft: "Borrador", ready: "Lista", degraded: "Degradada", suspended: "Suspendida", disconnected: "Desconectada",
  queued: "En cola", accepted: "Aceptada", delivered: "Entregada", failed: "Fallida", unknown: "Desconocido", suppressed: "Omitida",
  available: "Disponible", applied: "Aplicada", invalid: "Inválida", muted: "Silenciada", blocked: "Bloqueada", removed: "Retirada",
  not_validated: "Sin comprobar", valid: "Válida", unavailable: "No disponible",
} as const satisfies Readonly<Record<ClosedValue<ActivityChanges["fromState"]>, string>>;

/** Messaging channels, including the phone channel of a policy snapshot. */
const ADMISSION_ACTIVITY_CHANNEL_LABELS = { email: "Correo", sms: "SMS", whatsapp: "WhatsApp" } as const satisfies Readonly<Record<ClosedValue<ActivityChanges["channel"]>, string>>;
/** Contact used to identify each applicant. */
const ADMISSION_ACTIVITY_CONTACT_TYPE_LABELS = { email: "Correo", phone: "Teléfono" } as const satisfies Readonly<Record<ClosedValue<ActivityChanges["contactType"]>, string>>;
/** Tribe roles, with the same names as the rest of the product. */
const ADMISSION_ACTIVITY_ROLE_LABELS = { guardian: "Guardián", leader: "Líder", tribemate: "Integrante" } as const satisfies Readonly<Record<ClosedValue<ActivityChanges["fromRole"]>, string>>;
/** Private screens whose authorized read was recorded. */
const ADMISSION_ACTIVITY_SURFACE_LABELS = {
  activity: "Actividad", metrics: "Métricas", allowlist: "Habilitados", allowlist_report: "Informe de importación", invitations: "Invitaciones personales",
  request_details: "Detalle de la solicitud", connection_resources: "Recursos de la conexión", operational_secret: "Credencial operativa",
} as const satisfies Readonly<Record<ClosedValue<ActivityChanges["surface"]>, string>>;
/** Extent of an authorized read, never its content. */
const ADMISSION_ACTIVITY_RESOURCE_KIND_LABELS = {
  senders: "Remitentes", templates: "Plantillas", entries: "Contactos habilitados", requests: "Solicitudes", invitations: "Invitaciones", aggregate: "Resumen agregado", credential: "Credencial",
} as const satisfies Readonly<Record<ClosedValue<ActivityChanges["resourceKind"]>, string>>;
/** Data owners of a retention batch. */
const ADMISSION_ACTIVITY_RETENTION_OWNER_LABELS = {
  admission_requests: "Solicitudes de admisión", admission_audit: "Auditoría de admisión", allowlist_import_material: "Material de importación",
  messaging_secrets: "Credenciales de mensajería", verification_material: "Material de verificación", messaging_candidates: "Conexiones candidatas",
} as const satisfies Readonly<Record<ClosedValue<ActivityChanges["owner"]>, string>>;
/** What each protection key protects. */
const ADMISSION_ACTIVITY_KEY_PURPOSE_LABELS = {
  credential: "Credenciales", otp_envelope: "Códigos de verificación", verification_mac: "Firma de verificación",
  invitation_token: "Enlaces de invitación", contact_fingerprint: "Huella de contacto", operation_payload: "Datos de operaciones",
} as const satisfies Readonly<Record<ClosedValue<ActivityChanges["purpose"]>, string>>;
/** Checked state of a messaging credential. */
const ADMISSION_ACTIVITY_CREDENTIAL_STATE_LABELS = { not_validated: "Sin comprobar", valid: "Válida", invalid: "Inválida", unavailable: "No disponible" } as const satisfies Readonly<Record<ClosedValue<ActivityChanges["credentialState"]>, string>>;
/** Provider mode of a messaging credential. */
const ADMISSION_ACTIVITY_CREDENTIAL_MODE_LABELS = { production: "Producción", test: "Prueba", unknown: "Desconocido" } as const satisfies Readonly<Record<ClosedValue<ActivityChanges["credentialMode"]>, string>>;
/** Request fact that originated an internal notice. */
const ADMISSION_ACTIVITY_SOURCE_EVENT_LABELS = {
  pending_created: "Solicitud presentada", approved: "Solicitud aprobada", rejected: "Solicitud rechazada", cancelled: "Solicitud cancelada", expired: "Solicitud vencida", reminder: "Recordatorio",
} as const satisfies Readonly<Record<ClosedValue<ActivityChanges["sourceEvent"]>, string>>;
/** Recipient of an internal notice. */
const ADMISSION_ACTIVITY_AUDIENCE_LABELS = { applicant: "Persona solicitante", reviewer: "Equipo revisor" } as const satisfies Readonly<Record<ClosedValue<ActivityChanges["audience"]>, string>>;
/** Admission modes, named as in the policy editor. */
const ADMISSION_ACTIVITY_POLICY_MODE_LABELS = { allowlist: "Lista de habilitados", manual_review: "Revisión manual" } as const satisfies Readonly<Record<PolicySnapshot["mode"], string>>;

/** Labels of every closed change field; a field left out here is a reference, version, count, date or free value shown as recorded. */
export const ADMISSION_ACTIVITY_CHANGE_VALUE_LABELS = {
  fromState: ADMISSION_ACTIVITY_STATE_LABELS, toState: ADMISSION_ACTIVITY_STATE_LABELS, fromStatus: ADMISSION_ACTIVITY_STATE_LABELS, toStatus: ADMISSION_ACTIVITY_STATE_LABELS,
  originalFromState: ADMISSION_ACTIVITY_STATE_LABELS, originalToState: ADMISSION_ACTIVITY_STATE_LABELS,
  channel: ADMISSION_ACTIVITY_CHANNEL_LABELS, contactType: ADMISSION_ACTIVITY_CONTACT_TYPE_LABELS,
  fromRole: ADMISSION_ACTIVITY_ROLE_LABELS, toRole: ADMISSION_ACTIVITY_ROLE_LABELS,
  surface: ADMISSION_ACTIVITY_SURFACE_LABELS, resourceKind: ADMISSION_ACTIVITY_RESOURCE_KIND_LABELS, owner: ADMISSION_ACTIVITY_RETENTION_OWNER_LABELS,
  purpose: ADMISSION_ACTIVITY_KEY_PURPOSE_LABELS,
  previousCredentialState: ADMISSION_ACTIVITY_CREDENTIAL_STATE_LABELS, credentialState: ADMISSION_ACTIVITY_CREDENTIAL_STATE_LABELS, credentialMode: ADMISSION_ACTIVITY_CREDENTIAL_MODE_LABELS,
  sourceEvent: ADMISSION_ACTIVITY_SOURCE_EVENT_LABELS, audience: ADMISSION_ACTIVITY_AUDIENCE_LABELS,
} as const satisfies ClosedValueLabels<ActivityChanges>;

/** Labels of the closed fields of a historical policy snapshot. */
export const ADMISSION_POLICY_SNAPSHOT_VALUE_LABELS = {
  mode: ADMISSION_ACTIVITY_POLICY_MODE_LABELS, contactType: ADMISSION_ACTIVITY_CONTACT_TYPE_LABELS, phoneChannel: ADMISSION_ACTIVITY_CHANNEL_LABELS,
} as const satisfies ClosedValueLabels<PolicySnapshot>;

/** Rules that are not themselves an event name; event-named rules reuse the event label. */
const ADMISSION_ACTIVITY_RULE_ONLY_LABELS = {
  manual_review: "Revisión manual", applicant_cancellation: "Cancelación de la persona solicitante", management_cancellation: "Cancelación desde la gestión de la tribu",
  automatic: "Decisión automática", external_resolution: "Resolución externa", academy_unavailable: "Academia no disponible",
  record_admission_notification_obligation: "Registro de aviso interno", materialize_admission_notification: "Preparación de aviso interno",
  minimize_terminal_admission_requests: "Minimización de solicitudes finalizadas", purge_admission_security_audit: "Depuración de la auditoría de seguridad", purge_allowlist_import_material: "Depuración del material de importación",
  tribe_deleted: "Tribu eliminada", account_deleted: "Cuenta eliminada", membership_deleted: "Pertenencia eliminada", nonrecoverable_membership: "Pertenencia no recuperable",
  leader_corrective_retry: "Nueva presentación habilitada por el liderazgo", local_verification: "Verificación local",
  messaging_connection_replaced: "Conexión de mensajería reemplazada", issue_contact_verification: "Envío de verificación de contacto", resend_contact_verification: "Reenvío de verificación de contacto",
  explicit_resend: "Reenvío solicitado", suspected_compromise: "Sospecha de compromiso", connection_replaced: "Conexión reemplazada", candidate_expired: "Conexión candidata vencida",
  accepted: "Aceptación del proveedor", delivered: "Entrega confirmada", rejected: "Rechazo", unknown: "Resultado desconocido", quota_exceeded: "Cupo agotado",
  lease_expired: "Plazo de trabajo vencido", reconcile_messaging_delivery: "Conciliación de entrega",
  read_admission_activity: "Consulta de actividad", read_admission_metrics: "Consulta de métricas", read_allowlist_entries: "Consulta de habilitados",
  read_allowlist_report: "Consulta del informe de importación", read_personal_invitations: "Consulta de invitaciones personales", read_admission_reviews: "Consulta de solicitudes",
  issue_contact_challenge: "Emisión de código de verificación", resend_contact_challenge: "Reenvío de código de verificación",
  authorize_delivery: "Autorización de entrega", complete_attempt: "Registro del resultado del intento", reconcile_leases: "Conciliación de trabajos vencidos",
  read_messaging_senders: "Consulta de remitentes", read_messaging_templates: "Consulta de plantillas", diagnose_messaging_connection: "Diagnóstico de la conexión",
  reconcile_message_delivery: "Conciliación manual de entrega", dispatch_delivery: "Despacho de entrega",
} as const;

/** Every applied rule; `rejected` as a rule also covers provider rejections, so it keeps a neutral label instead of the request event. */
export const ADMISSION_ACTIVITY_RULE_LABELS = { ...ADMISSION_ACTIVITY_EVENT_LABELS, ...ADMISSION_ACTIVITY_RULE_ONLY_LABELS } as const satisfies Readonly<Record<NonNullable<ActivityItem["rule"]>, string>>;

/** Rule shown when it only names the operation of the fact, which its summary already names. */
export const ADMISSION_ACTIVITY_RULE_COPY = { ownOperation: "La operación de este hecho" } as const;

/** Every recorded cause, as a short name instead of the message of a failed operation. */
export const ADMISSION_ACTIVITY_CAUSE_LABELS = {
  invalid_input: "Datos inválidos", whatsapp_number_required: "Falta el número de WhatsApp", authentication_required: "Sesión requerida", permission_denied: "Permiso denegado",
  resource_unavailable: "Recurso no disponible", invitation_unavailable: "Invitación no disponible", policy_conflict: "La política cambió", request_conflict: "La solicitud cambió",
  idempotency_conflict: "Operación repetida con otros datos", allowlist_conflict: "Conflicto en habilitados", allowlist_import_conflict: "Conflicto en la importación", invitation_conflict: "Conflicto en la invitación",
  usage_policy_conflict: "Países y cupos cambiaron", connection_conflict: "La conexión cambió", recipient_not_allowed: "Destinatario no permitido", contact_evidence_required: "Falta verificar el contacto",
  additional_verification_required: "Se requiere verificación adicional", contact_binding_conflict: "Contacto vinculado a otra cuenta", challenge_expired: "Código vencido", challenge_invalidated: "Código invalidado",
  proof_unavailable: "Prueba de contacto no disponible", verification_attempts_exceeded: "Intentos de verificación agotados", usage_limit_reached: "Cupo diario alcanzado", verification_code_incorrect: "Código incorrecto",
  reauthentication_required: "Se requiere volver a autenticarse", admissions_paused: "Admisión pausada", admission_ineligible: "Requisitos de admisión no cumplidos", membership_recovery_required: "Pertenencia por recuperar",
  connection_incomplete: "Conexión incompleta", usage_policy_missing: "Sin países y cupos configurados", missing_capability: "Capacidad del proveedor faltante", invalid_credentials: "Credenciales inválidas",
  upstream_rejected: "Rechazo del proveedor", provider_rate_limited: "Límite de envíos del proveedor", transport_timeout: "Tiempo de espera agotado", dependency_unavailable: "Servicio no disponible",
  delivery_unknown: "Resultado de entrega desconocido", operation_unresolved: "Operación sin resolver", upstream_payload_unusable: "Respuesta del proveedor inutilizable", public_contract_unusable: "Resultado inutilizable",
  unexpected_failure: "Falla inesperada", platform_security_unavailable: "Seguridad de la plataforma no disponible", connection_retirement_blocked: "Retiro de la conexión bloqueado", original_dispatch_unresolved: "Envío original sin resolver",
  authorized_connection_replacement: "Reemplazo autorizado de la conexión", connection_replaced: "Conexión reemplazada", messaging_connection_replaced: "Conexión de mensajería reemplazada", connection_disconnected: "Conexión retirada",
  suspected_compromise: "Sospecha de compromiso", security_stop: "Detención por seguridad", ordinary_retirement: "Retiro ordinario", scheduled_expiration: "Vencimiento programado",
  scope_retired: "Alcance retirado", policy_verification_context_changed: "Cambió la verificación de la política", explicit_resend: "Reenvío solicitado", candidate_expired: "Conexión candidata vencida",
  provider_accepted: "Aceptada por el proveedor", provider_delivered: "Entregada por el proveedor", provider_rejected: "Rechazada por el proveedor", dispatch_result_unknown: "Resultado del envío desconocido",
  worker_lease_expired: "Plazo del proceso vencido", delivery_expired: "Entrega vencida", security_context_changed: "Cambió el contexto de seguridad", connection_unavailable: "Conexión no disponible",
  leadership_changed: "Cambió el liderazgo", credentials_unprepared: "Credenciales sin preparar", test_mode_connection: "Conexión en modo de prueba", challenge_unavailable: "Código no disponible",
  capability_unprepared: "Capacidad sin preparar", diagnostic_unavailable: "Diagnóstico no disponible", quota_exceeded: "Cupo agotado",
} as const satisfies Readonly<Record<NonNullable<ActivityItem["cause"]>, string>>;

/**
 * Rules produced only by automatic processes (the SQL metrics already count `automatic` decisions as the system's).
 * A missing actor on any other fact cannot prove automation: the account may have been deleted (`ON DELETE SET NULL`).
 */
export const ADMISSION_ACTIVITY_AUTOMATIC_RULES: ReadonlySet<NonNullable<ActivityItem["rule"]>> = new Set([
  "automatic", "expired", "lease_expired", "reconcile_leases", "materialize_admission_notification",
  "minimize_terminal_admission_requests", "purge_admission_security_audit", "purge_allowlist_import_material",
]);

/** Actor shown for a fact without a recorded account. */
export const ADMISSION_ACTIVITY_ACTOR_LABEL = { system: "Sistema", unattributed: ADMISSION_REVIEW_HISTORY_ACTOR_LABEL.unattributed } as const;
