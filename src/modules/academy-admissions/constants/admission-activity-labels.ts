/** Localizes closed activity dimensions without rendering arbitrary provider text or exception labels. @module admission-activity-labels */
import type { AdmissionActivityPage } from "../application/results/admission-activity-result";
import type { AdmissionMetricPhase, AdmissionMetricRunOperation } from "../domain/entities/admission-metric-dimensions";
import { ADMISSION_ACTIVITY_RESOURCE } from "./admission-activity";

/** Each event already belongs to an implemented owner; unknown storage events use the closed unclassified value. */
export const ADMISSION_ACTIVITY_EVENT_LABELS = {
  whatsapp_number_changed: "Número de WhatsApp declarado actualizado",
  initialize_admission_policy: "Inicio de la política de admisión", update_admission_policy: "Cambio de la política de admisión", activate_admission_policy: "Activación de la admisión", pause_admission_policy: "Pausa de la admisión", messaging_selection_replaced: "Cambio de la conexión seleccionada", proof_attached: "Prueba de contacto adjuntada",
  pending_created: "Solicitud pendiente creada", approved: "Solicitud aprobada", rejected: "Solicitud rechazada", cancelled: "Solicitud cancelada", expired: "Solicitud vencida", retry_allowed: "Nueva presentación autorizada",
  create_allowlist_entry: "Contacto habilitado añadido", update_allowlist_entry: "Contacto habilitado actualizado", confirm_allowlist_import: "Lote de contactos confirmado",
  create_personal_invitation: "Invitación personal creada", rename_personal_invitation: "Invitación personal renombrada", revoke_personal_invitation: "Invitación personal revocada", personal_invitation_redeemed: "Invitación personal canjeada",
  initialize_messaging_usage: "Inicio de países y cupos", update_messaging_usage: "Cambio de países y cupos", save_messaging_credentials: "Conexión candidata guardada", validate_messaging_connection: "Credencial comprobada", configure_messaging_connection: "Canales configurados",
  activate_messaging_connection: "Conexión activada", suspend_messaging_connection: "Conexión suspendida", disconnect_messaging_connection: "Conexión retirada", messaging_connection_compromised: "Conexión bloqueada por seguridad", messaging_connection_retired: "Referencias de conexión retiradas",
  authorized_resource_exposure: "Consulta privada autorizada", delivery_created: "Entrega preparada", delivery_attempt_started: "Intento externo iniciado", delivery_accepted: "Entrega aceptada por el proveedor", delivery_delivered: "Entrega confirmada", delivery_failed: "Entrega fallida", delivery_unknown: "Resultado de entrega desconocido",
  delivery_suppressed: "Entrega omitida", delivery_deferred: "Entrega diferida", delivery_cancelled: "Entrega cancelada", delivery_reconciled: "Entrega conciliada", notification_delivery_recovered: "Aviso recuperado con otra conexión",
  notification_obligation_created: "Aviso interno registrado", notification_materialized: "Aviso interno disponible",
  admission_email_settings_changed: "Avisos por correo actualizados",
  proof_created: "Prueba de contacto creada", proof_applied: "Prueba de contacto aplicada", proof_invalidated: "Prueba de contacto invalidada", proof_expired: "Prueba de contacto vencida", membership_admitted: "Ingreso registrado", membership_revoked: "Pertenencia retirada", membership_role_changed: "Rol de pertenencia cambiado",
  protection_keys_rotated: "Protección renovada", secret_retired: "Credencial retirada del uso", secret_purged: "Material de credencial eliminado", recovery_locked: "Recuperación bloqueada", retention_completed: "Lote de conservación completado", unclassified: "Hecho histórico sin clasificación",
} as const satisfies Record<AdmissionActivityPage["items"][number]["eventType"], string>;

/** Resource names reveal neither contact identity nor another tenant's data. */
export const ADMISSION_ACTIVITY_RESOURCE_LABELS = {
  [ADMISSION_ACTIVITY_RESOURCE.request]: "Solicitud", [ADMISSION_ACTIVITY_RESOURCE.allowlistEntry]: "Contacto habilitado",
  [ADMISSION_ACTIVITY_RESOURCE.personalInvitation]: "Invitación personal", [ADMISSION_ACTIVITY_RESOURCE.usagePolicy]: "Países y cupos",
  [ADMISSION_ACTIVITY_RESOURCE.connection]: "Conexión de mensajería", [ADMISSION_ACTIVITY_RESOURCE.exposure]: "Consulta privada",
  [ADMISSION_ACTIVITY_RESOURCE.delivery]: "Entrega", [ADMISSION_ACTIVITY_RESOURCE.notification]: "Aviso interno",
  [ADMISSION_ACTIVITY_RESOURCE.protection]: "Protección", [ADMISSION_ACTIVITY_RESOURCE.proof]: "Prueba de contacto",
  [ADMISSION_ACTIVITY_RESOURCE.membership]: "Pertenencia", [ADMISSION_ACTIVITY_RESOURCE.retention]: "Conservación de datos",
  [ADMISSION_ACTIVITY_RESOURCE.policy]: "Política de admisión",
  [ADMISSION_ACTIVITY_RESOURCE.emailSettings]: "Avisos por correo",
} as const satisfies Record<AdmissionActivityPage["items"][number]["resourceType"], string>;

/** Phase labels correspond to real observations, without claiming that absent samples were successful. */
export const ADMISSION_METRIC_PHASE_LABELS = {
  admission: "Admisión", review: "Revisión", verification: "Verificación", dispatch: "Despacho", retention: "Conservación", notification: "Aviso interno",
  claim: "Obtención del trabajo", authorize: "Autorización", prepare: "Preparación", send: "Envío externo", complete: "Registro del resultado", late: "Resultado tardío", defer: "Reprogramación",
} as const satisfies Record<AdmissionMetricPhase, string>;
/** Run categories are not delivery or provider acceptance states. */
export const ADMISSION_METRIC_RUN_LABELS = { messaging_dispatch: "Despacho de mensajes", admission_expiration: "Vencimiento de solicitudes", admission_retention: "Conservación de admisión", notification_materialization: "Preparación de avisos internos" } as const satisfies Record<AdmissionMetricRunOperation, string>;
/** Native selects require a nonempty value for the explicit unfiltered option. */
export const ADMISSION_ACTIVITY_FILTER_ALL = "all";
/** Standard private-history display values retain explicit absence and system actors. */
export const ADMISSION_OBSERVATION_COPY = { noData: "Sin datos registrados", noVersion: "Sin versión registrada", systemActor: "Sistema", yes: "Sí", no: "No", absent: "No registrado" } as const;

/** Detail labels cover only the existing own activity contract, preserving technical reference values. */
export const ADMISSION_ACTIVITY_CHANGE_LABELS = {
  enabled: "Correo externo habilitado", timeZone: "Zona horaria",
  fromPolicy: "Política anterior", toPolicy: "Política nueva", fromState: "Estado anterior", toState: "Estado nuevo", fromStatus: "Estado anterior", toStatus: "Estado nuevo",
  previousVersion: "Versión anterior", previousRequestVersion: "Versión anterior de la solicitud", policyVersion: "Versión de política", verificationEpoch: "Época de verificación", configurationVersion: "Versión de configuración", previousConfigurationVersion: "Configuración anterior",
  channel: "Canal", requestId: "Referencia de solicitud", proofId: "Referencia de prueba", challengeId: "Referencia de desafío", decisionId: "Referencia de decisión",
  invitationId: "Referencia de invitación", importId: "Referencia de importación", connectionId: "Referencia de conexión", previousConnectionId: "Conexión anterior", connectionVersion: "Versión de conexión", previousConnectionVersion: "Versión de conexión anterior",
  attemptId: "Referencia de intento", authorizedUsagePolicyVersion: "Versión de uso autorizada", originalDeliveryId: "Entrega original", targetConnectionId: "Conexión de recuperación", originalConnectionId: "Conexión original", originalConnectionVersion: "Versión de conexión original",
  originalFromState: "Estado original anterior", originalToState: "Estado original nuevo", previousOriginalVersion: "Versión original anterior", originalVersion: "Versión original", originalAttemptId: "Intento original", originalAuthorizedUsagePolicyVersion: "Uso autorizado original",
  contactType: "Tipo de contacto", fromAuthorizationRevoked: "Autorización revocada anterior", toAuthorizationRevoked: "Autorización revocada nueva", allowedCountries: "Países habilitados", verificationDailyLimit: "Cupo diario de códigos", notificationDailyLimit: "Cupo diario de avisos",
  membershipInstanceId: "Instancia de pertenencia", fromRole: "Rol anterior", toRole: "Rol nuevo", surface: "Superficie consultada", itemCount: "Cantidad de elementos", resourceKind: "Clase de recurso",
  owner: "Responsable del proceso", processed: "Elementos procesados", remaining: "Trabajo restante", cutoff: "Fecha de corte", purpose: "Propósito de protección", previousKeyId: "Referencia de protección anterior", activeKeyId: "Referencia de protección activa", securityEpoch: "Época de seguridad",
  previousCredentialState: "Estado anterior de credencial", credentialState: "Estado de credencial", credentialMode: "Modo de credencial", obligationId: "Referencia de aviso interno", requestVersion: "Versión de solicitud", sourceEvent: "Hecho de origen", audience: "Audiencia", durationMs: "Duración observada",
} as const satisfies Record<keyof AdmissionActivityPage["items"][number]["changes"], string>;

/** Nested policy snapshots choose each original field instead of serializing an arbitrary object. */
export const ADMISSION_POLICY_SNAPSHOT_LABELS = {
  requiresWhatsappNumber: "Número de WhatsApp obligatorio",
  mode: "Modo", contactType: "Tipo de contacto", isOpen: "Recepción abierta", allowCommonExceptions: "Excepciones comunes permitidas", requiresAdditionalVerification: "Verificación adicional requerida",
  phoneChannel: "Canal telefónico", allowSmsAlternative: "Alternativa SMS permitida", messagingConnectionId: "Conexión", messagingConnectionVersion: "Versión de conexión", verificationEpoch: "Época de verificación", activatedAt: "Activación",
} as const satisfies Record<keyof NonNullable<AdmissionActivityPage["items"][number]["changes"]["toPolicy"]>, string>;
