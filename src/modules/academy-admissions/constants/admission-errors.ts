import { MESSAGING_CONNECTION_ERROR_CODE } from "@/src/modules/shared/constants/messaging-connection-error-codes";
/** Closed semantic outcomes shared inward without deriving contracts from runtime values. */
export type AdmissionErrorCode =
  | "invalid_input" | "authentication_required" | "permission_denied" | "resource_unavailable"
  | "invitation_unavailable" | "policy_conflict" | "request_conflict" | "idempotency_conflict"
  | "allowlist_conflict" | "allowlist_import_conflict" | "invitation_conflict" | "usage_policy_conflict"
  | "connection_conflict" | "recipient_not_allowed" | "contact_evidence_required" | "additional_verification_required"
  | "contact_binding_conflict" | "challenge_expired" | "challenge_invalidated" | "proof_unavailable"
  | "verification_attempts_exceeded" | "usage_limit_reached" | "verification_code_incorrect" | "reauthentication_required"
  | "admissions_paused" | "admission_ineligible" | "membership_recovery_required" | "connection_incomplete" | "usage_policy_missing"
  | "missing_capability" | "invalid_credentials" | "upstream_rejected" | "provider_rate_limited"
  | "transport_timeout" | "dependency_unavailable" | "delivery_unknown" | "operation_unresolved"
  | "upstream_payload_unusable" | "public_contract_unusable" | "unexpected_failure" | "whatsapp_number_required"
  | "platform_security_unavailable";

/** Names closed semantic outcomes and safe Spanish copy; transport mapping remains in infrastructure. */
export const ADMISSION_ERROR_CODE = {
  invalidInput: "invalid_input",
  whatsappNumberRequired: "whatsapp_number_required",
  authenticationRequired: "authentication_required",
  permissionDenied: "permission_denied",
  resourceUnavailable: "resource_unavailable",
  invitationUnavailable: "invitation_unavailable",
  policyConflict: "policy_conflict",
  requestConflict: "request_conflict",
  idempotencyConflict: "idempotency_conflict",
  allowlistConflict: "allowlist_conflict",
  allowlistImportConflict: "allowlist_import_conflict",
  invitationConflict: "invitation_conflict",
  usagePolicyConflict: "usage_policy_conflict",
  connectionConflict: "connection_conflict",
  recipientNotAllowed: "recipient_not_allowed",
  contactEvidenceRequired: "contact_evidence_required",
  additionalVerificationRequired: "additional_verification_required",
  contactBindingConflict: "contact_binding_conflict",
  challengeExpired: "challenge_expired",
  challengeInvalidated: "challenge_invalidated",
  proofUnavailable: "proof_unavailable",
  verificationAttemptsExceeded: "verification_attempts_exceeded",
  usageLimitReached: "usage_limit_reached",
  verificationCodeIncorrect: "verification_code_incorrect",
  /** Kept only for persisted audit values and responses from older servers; current writers never emit it. */
  reauthenticationRequired: "reauthentication_required",
  admissionsPaused: "admissions_paused",
  admissionIneligible: "admission_ineligible",
  membershipRecoveryRequired: "membership_recovery_required",
  ...MESSAGING_CONNECTION_ERROR_CODE,
} as const satisfies Record<string, AdmissionErrorCode>;

/** Only catalogue copy can cross the public error boundary. */
export const ADMISSION_ERROR_MESSAGE = {
  [ADMISSION_ERROR_CODE.invalidInput]: "Revisá los datos de la operación antes de confirmar.",
  [ADMISSION_ERROR_CODE.whatsappNumberRequired]: "Completá tu teléfono para continuar.",
  [ADMISSION_ERROR_CODE.authenticationRequired]: "Iniciá sesión para continuar con el ingreso.",
  [ADMISSION_ERROR_CODE.permissionDenied]: "No tenés permiso para realizar esta operación.",
  [ADMISSION_ERROR_CODE.resourceUnavailable]: "El recurso solicitado no está disponible.",
  [ADMISSION_ERROR_CODE.invitationUnavailable]: "La invitación no está disponible para este ingreso.",
  [ADMISSION_ERROR_CODE.policyConflict]: "La configuración cambió. Revisala y volvé a confirmar.",
  [ADMISSION_ERROR_CODE.requestConflict]: "La solicitud cambió. Revisala antes de confirmar.",
  [ADMISSION_ERROR_CODE.idempotencyConflict]: "Esta operación ya tiene otro contenido. Consultá su estado antes de repetir.",
  [ADMISSION_ERROR_CODE.allowlistConflict]: "La entrada cambió. Revisala y volvé a confirmar.",
  [ADMISSION_ERROR_CODE.allowlistImportConflict]: "La importación cambió. Consultá su estado y volvé a confirmar.",
  [ADMISSION_ERROR_CODE.invitationConflict]: "La invitación cambió. Revisala y volvé a confirmar.",
  [ADMISSION_ERROR_CODE.usagePolicyConflict]: "Los cupos o países cambiaron. Revisalos y volvé a confirmar.",
  [ADMISSION_ERROR_CODE.connectionConflict]: "La conexión cambió o ya existe una candidata. Consultá la configuración y volvé a confirmar.",
  [ADMISSION_ERROR_CODE.recipientNotAllowed]: "La academia no tiene habilitado el país de ese teléfono.",
  [ADMISSION_ERROR_CODE.contactEvidenceRequired]: "No pudimos comprobar el contacto necesario para este ingreso.",
  [ADMISSION_ERROR_CODE.additionalVerificationRequired]: "Comprobá tu contacto para continuar con este ingreso.",
  [ADMISSION_ERROR_CODE.contactBindingConflict]: "No pudimos usar ese contacto para el ingreso. Revisá tu cuenta o pedí ayuda.",
  [ADMISSION_ERROR_CODE.challengeExpired]: "El código venció. Solicitá uno nuevo cuando esté disponible.",
  [ADMISSION_ERROR_CODE.challengeInvalidated]: "Ese código ya no está vigente. Consultá el estado antes de pedir otro.",
  [ADMISSION_ERROR_CODE.proofUnavailable]: "La prueba de contacto ya no está disponible para este ingreso.",
  [ADMISSION_ERROR_CODE.verificationAttemptsExceeded]: "Alcanzaste el límite de intentos de verificación. Esperá antes de intentar otra vez.",
  [ADMISSION_ERROR_CODE.usageLimitReached]: "Se alcanzó el límite de nuevos envíos. Podés validar un código vigente o consultar tu solicitud.",
  [ADMISSION_ERROR_CODE.verificationCodeIncorrect]: "El código no es correcto. Revisalo antes de intentar otra vez.",
  [ADMISSION_ERROR_CODE.reauthenticationRequired]: "Tu sesión cambió. Recargá la página e intentá de nuevo.",
  [ADMISSION_ERROR_CODE.admissionsPaused]: "Las admisiones están pausadas. Podés consultar o cancelar tu solicitud.",
  [ADMISSION_ERROR_CODE.admissionIneligible]: "Falta un requisito actual para resolver el ingreso. Consultá el estado de la solicitud.",
  [ADMISSION_ERROR_CODE.membershipRecoveryRequired]: "La recuperación de tu pertenencia requiere asistencia autorizada.",
  [ADMISSION_ERROR_CODE.connectionIncomplete]: "La academia todavía no tiene preparada la conexión necesaria.",
  [ADMISSION_ERROR_CODE.usagePolicyMissing]: "La academia todavía no tiene preparados los cupos de mensajería.",
  [ADMISSION_ERROR_CODE.missingCapability]: "La academia todavía no tiene preparado el canal necesario.",
  [ADMISSION_ERROR_CODE.invalidCredentials]: "El líder debe revisar las credenciales de mensajería de la academia.",
  [ADMISSION_ERROR_CODE.upstreamRejected]: "El proveedor rechazó la operación. Revisá la configuración antes de intentar otra vez.",
  [ADMISSION_ERROR_CODE.providerRateLimited]: "El proveedor limitó temporalmente la operación. Esperá antes de consultar otra vez.",
  [ADMISSION_ERROR_CODE.transportTimeout]: "La consulta de mensajería excedió su tiempo. Conservá los datos y consultá su estado.",
  [ADMISSION_ERROR_CODE.dependencyUnavailable]: "La mensajería no está disponible temporalmente. Podés consultar tu solicitud.",
  [ADMISSION_ERROR_CODE.deliveryUnknown]: "No pudimos confirmar el resultado del envío. Consultá su estado antes de repetir.",
  [ADMISSION_ERROR_CODE.operationUnresolved]: "La operación está registrada y su resultado todavía no se confirmó. Consultá su estado.",
  [ADMISSION_ERROR_CODE.upstreamPayloadUnusable]: "No pudimos interpretar la respuesta de mensajería. Conservá los datos y consultá el estado.",
  [ADMISSION_ERROR_CODE.publicContractUnusable]: "No pudimos mostrar el resultado de la operación. Conservá los datos y consultá el estado.",
  [ADMISSION_ERROR_CODE.unexpectedFailure]: "No pudimos completar la operación de admisión. Conservá los datos y consultá el estado.",
  [ADMISSION_ERROR_CODE.platformSecurityUnavailable]: "Esta operación depende del equipo de TuTribu: la plataforma todavía no puede protegerla. No se registró ningún cambio.",
} as const;
