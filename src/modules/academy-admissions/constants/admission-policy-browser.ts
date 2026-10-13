/** Fixed same-origin paths keep browser intents independent of provider endpoints. @module admission-policy-browser-constants */
import type { AdmissionPreflightReason } from "../domain/policies/admission-activation-preflight";
import type { AdmissionPolicyActivationReason } from "../domain/policies/admission-policy-activation";

export const ADMISSION_POLICY_BROWSER_PATH = { policy: "policy", preflight: "policy/preflight", activate: "policy/activate", pause: "policy/pause" } as const;
/** Scopes an original browser intention by its native viewer and current tribe. */
export const ADMISSION_POLICY_STORAGE_PREFIX = "tutribu:admission-policy-intent";
/** Actual leaf destination for policy management, also verified by the auth owner. */
export const ADMISSION_POLICY_SETTINGS_SEGMENT = "academia/admissions/settings";

/** Browser lifecycle cannot certify server authorization or complete runtime preparation. */
export const ADMISSION_POLICY_BROWSER_PHASE = { checking: "checking", idle: "idle", reading: "reading", writing: "writing", uncertain: "uncertain", changedViewer: "changed_viewer" } as const;
/** Fixed safe copy remains independent of raw HTTP/provider diagnostics. */
export const ADMISSION_POLICY_BROWSER_COPY = {
  saved: "La configuración quedó guardada.",
  recovered: "El resultado original quedó confirmado. Revisá la configuración actual antes de continuar.",
  changedViewer: "La cuenta cambió. Volvé a abrir la configuración con tu cuenta actual.",
  storageFailed: "No pudimos conservar o recuperar esta acción. Consultá su resultado antes de volver a confirmar.",
  uncertain: "Todavía no podemos confirmar el resultado. Consultá la operación original antes de volver a guardar.",
  reading: "Consultando la configuración actual…",
  notPrepared: "La admisión completa todavía no está disponible. Podés preparar un borrador.",
  prepared: "Las protecciones de admisión consultadas están preparadas. La activación volverá a comprobarlas al confirmar.",
  draftChanged: "Guardá el borrador y volvé a revisar los requisitos antes de activar.",
  invalid: "Revisá las reglas y confirmá la acción antes de continuar.",
  retry: "La operación original aún no está registrada. Podés confirmar un reintento con los mismos datos.",
  contactLocked: "El tipo de contacto quedó fijado al activar el control.",
  phoneAllowlist: "La lista por teléfono requiere comprobar el contacto con un código.",
  smsAlternative: "La alternativa SMS requiere teléfono, códigos activados y el canal WhatsApp.",
} as const;

/** Explains public cutover reasons without exposing database metadata or member identities. */
export const ADMISSION_POLICY_PREFLIGHT_REASON_COPY = {
  preflight_scope_mismatch: "La comprobación no corresponde a esta tribu. Volvé a consultar la configuración actual.",
  preflight_academy_unavailable: "La tribu no tiene disponible el modo academia.",
  preflight_policy_unavailable: "Falta la política de admisión. Prepará la configuración antes de volver a comprobarla.",
  preflight_marker_inconsistent: "La activación registrada no coincide con la política actual. Requiere revisión autorizada.",
  preflight_storage_unavailable: "La protección de los datos de admisión requiere preparación del equipo responsable.",
  preflight_ingress_unprotected: "Todavía falta proteger alguna vía de ingreso. Requiere revisión del equipo responsable.",
  preflight_unknown_commercial_history: "Hay membresías con historial comercial desconocido. Su resolución requiere autorización y registro del responsable de membresías.",
  preflight_privileged_commercial_membership: "Hay membresías comerciales restringidas con rol de líder o guardián. Su resolución requiere autorización y registro del responsable de membresías.",
  preflight_runtime_unavailable: "Todavía no están preparados todos los recorridos de admisión.",
  preflight_evaluator_disabled: "La admisión está deshabilitada en esta academia.",
  preflight_recovery_locked: "La admisión está cerrada por el bloqueo de recuperación de la plataforma.",
} satisfies Record<AdmissionPreflightReason, string>;

/** Keeps policy/channel preparation separate from the protected-ingress inventory. */
export const ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY = {
  policy_unavailable: "Falta preparar la política de admisión.",
  academy_unavailable: "El modo academia no está disponible.",
  admission_preflight_incomplete: "Las protecciones de admisión todavía no están preparadas.",
  admission_evaluator_unavailable: "La admisión de la academia no está habilitada.",
  admission_recovery_locked: "La plataforma mantiene el bloqueo de recuperación.",
  admission_clock_invalid: "No pudimos comprobar la vigencia de la configuración. Volvé a consultarla.",
  policy_scope_mismatch: "La configuración no corresponde a esta tribu. Volvé a consultarla.",
  contact_type_locked: "El tipo de contacto quedó fijado al activar el control.",
  phone_allowlist_verification_required: "La lista por teléfono requiere comprobar el contacto con un código.",
  verification_unavailable: "El canal para comprobar el contacto todavía no está preparado.",
  verification_quota_unavailable: "No hay cupo disponible para comprobar el contacto.",
  phone_channel_required: "Elegí el canal para enviar el código telefónico.",
  recipient_countries_not_configured: "Configurá los países habilitados para el envío telefónico.",
  recipient_countries_restricted: "Hay países elegidos que no están habilitados para este canal.",
  sms_alternative_invalid: "La alternativa SMS requiere WhatsApp y la comprobación por código.",
  sms_alternative_unavailable: "La alternativa SMS todavía no está preparada.",
} satisfies Record<AdmissionPolicyActivationReason, string>;
