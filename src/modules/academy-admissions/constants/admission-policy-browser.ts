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
/** Fixed safe copy remains independent of raw HTTP/provider diagnostics; each confirmed action has its own message. */
export const ADMISSION_POLICY_BROWSER_COPY = {
  activatedOpen: "Listo: las admisiones quedaron activadas y abiertas. Ya se pueden recibir solicitudes.",
  activatedPaused: "Las admisiones quedaron activadas, pero pausadas: nadie puede postularse hasta que las reanudes.",
  paused: "Las admisiones quedaron pausadas. Nadie puede postularse hasta que las reanudes.",
  resumed: "Las admisiones se reanudaron. Ya se pueden recibir solicitudes.",
  rulesSaved: "Los cambios en las reglas quedaron guardados.",
  recovered: "El resultado original quedó confirmado. Revisá la configuración actual antes de continuar.",
  changedViewer: "La cuenta cambió. Volvé a abrir la configuración con tu cuenta actual.",
  storageFailed: "No pudimos conservar o recuperar esta acción. Consultá su resultado antes de volver a confirmar.",
  uncertain: "Todavía no podemos confirmar el resultado. Consultá la operación original antes de volver a guardar.",
  reading: "Consultando la cuenta y la configuración actual…",
  changedMeanwhile: "La configuración cambió mientras tanto. Revisá el resumen y volvé a confirmar.",
  activationIneligible: "Todavía falta un requisito para activar las admisiones.",
  resumeIneligible: "Todavía falta un requisito para reanudar las admisiones.",
  rulesKept: "Las reglas ya quedaron guardadas como borrador. Al reintentar seguimos desde el paso que falló.",
  activationBlockedNote: "Tus reglas quedaron guardadas como borrador. Cuando lo resuelvas, volvé a tocar «Guardar y activar admisiones».",
  resumeBlockedNote: "Las admisiones siguen pausadas. Cuando lo resuelvas, volvé a tocar «Reanudar admisiones».",
  saveIneligible: "Todavía falta un requisito para guardar estos cambios.",
  saveBlockedNote: "Las reglas vigentes no cambiaron. Cuando lo resuelvas, volvé a tocar «Guardar cambios».",
  draftIneligible: "Todavía falta un requisito para guardar las reglas.",
  draftBlockedNote: "Lo que elegiste sigue en esta pantalla. Cuando se resuelva, volvé a tocar «Guardar y activar admisiones».",
  permissionDenied: "La configuración sólo está disponible para el líder activo de esta academia.",
  unavailable: "La configuración requiere revisión antes de continuar. La protección existente se conserva.",
  originalPending: "Antes de continuar, consultá el resultado de la operación anterior.",
  confirmRequired: "Marcá la confirmación para continuar.",
  invalid: "Revisá las reglas y confirmá la acción antes de continuar.",
  retry: "La operación original aún no está registrada. Podés confirmar un reintento con los mismos datos.",
  contactLocked: "El tipo de contacto quedó fijado al activar el control.",
  phoneAllowlist: "La lista por teléfono requiere comprobar el contacto con un código.",
  phoneChannelRequired: "Elegí el canal para enviar el código por teléfono.",
  smsAlternative: "La alternativa SMS requiere teléfono, códigos activados y el canal WhatsApp.",
} as const;

/** Explains each cutover reason in plain language without exposing database metadata or member identities. */
export const ADMISSION_POLICY_PREFLIGHT_REASON_COPY = {
  preflight_scope_mismatch: "La comprobación no corresponde a esta tribu. Volvé a comprobar para revisarla con la configuración actual.",
  preflight_academy_unavailable: "Primero hay que activar el modo academia en esta tribu.",
  preflight_policy_unavailable: "Falta guardar las reglas de admisión. Al tocar el botón final las guardamos antes de activar.",
  preflight_marker_inconsistent: "La activación registrada no coincide con las reglas guardadas y el equipo tiene que revisarla.",
  preflight_storage_unavailable: "La plataforma todavía no terminó de preparar la protección de los datos de admisión.",
  preflight_ingress_unprotected: "La plataforma todavía no protegió todas las formas de entrar a la academia.",
  preflight_runtime_unavailable: "La plataforma todavía no preparó todos los recorridos de admisión.",
  preflight_evaluator_disabled: "Las admisiones de la academia están cerradas. Encendé «Admisiones abiertas» en Gestionar academia y volvé a activar estas reglas.",
  preflight_recovery_locked: "La plataforma pausó las admisiones mientras recupera un servicio.",
} satisfies Record<AdmissionPreflightReason, string>;

/** Keeps policy/channel preparation separate from the protected-ingress inventory, in plain language. */
export const ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY = {
  policy_unavailable: "Falta preparar la política de admisión.",
  academy_unavailable: "Primero hay que activar el modo academia en esta tribu.",
  admission_preflight_incomplete: "La plataforma todavía no terminó de preparar las protecciones de admisión.",
  admission_evaluator_unavailable: "Las admisiones de la academia están cerradas. Encendé «Admisiones abiertas» en Gestionar academia y volvé a activar estas reglas.",
  admission_recovery_locked: "La plataforma pausó las admisiones mientras recupera un servicio.",
  admission_security_unconfigured: "La plataforma todavía no tiene configurada la seguridad que protege las operaciones de admisión.",
  admission_clock_invalid: "No pudimos comprobar la vigencia de la configuración. Volvé a comprobar.",
  policy_scope_mismatch: "La configuración no corresponde a esta tribu. Volvé a comprobar.",
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

/** Copy of the callout for reasons only the TuTribu team can resolve. */
export const ADMISSION_POLICY_PLATFORM_COPY = {
  title: "Depende del equipo de TuTribu",
  explanation: "Esto no es algo que puedas cambiar desde tu academia. Lo que ya elegiste quedó guardado como borrador.",
  diagnosticLabel: "Código de diagnóstico",
  copy: "Copiar código",
  copied: "Código copiado.",
  copyFailed: "No pudimos copiar el código. Seleccionalo y copialo a mano.",
  recheck: "Volver a comprobar",
  report: "Reportar el problema",
  reportUnavailable: "No pudimos abrir el reporte. Escribile al equipo de TuTribu e incluí el código de diagnóstico.",
  rechecked: "Volvimos a comprobar: todavía falta resolver lo que se indica.",
  recheckedReady: "Volvimos a comprobar y ya no hay bloqueos. Podés activar las admisiones.",
} as const;

/** Copy of the actions that resolve a reason on another page or step. */
export const ADMISSION_POLICY_DESTINATION_COPY = {
  usage: "Ir a Países y cupos",
  connection: "Ir a Conexión",
  contactStep: "Revisar «Cómo se contactan»",
  academy: "Ir a Gestionar academia",
  recheck: "Volver a comprobar",
} as const;

/** Copy of the unpublished-draft notice of the rules page. */
export const ADMISSION_POLICY_DRAFT_COPY = {
  title: "Tenés reglas guardadas sin publicar",
  description: "Las admisiones todavía no reciben solicitudes. Revisá lo que guardaste y activalas.",
  action: "Revisar y activar",
  platformBlocked: "Por ahora no se pueden activar: depende del equipo de TuTribu.",
  activateNow: "Activar ahora",
  returnToRules: "Volver a Reglas para activar",
} as const;

/**
 * @param count - Commercial memberships the first activation converts.
 * @returns What happens to them, with singular agreement, for the final step before activating.
 */
export function freeConversionImpactCopy(count: number): string {
  if (count === 1) return "Al activar, 1 membresía bloqueada por pago pasa a ser integrante gratuita: entra a la tribu sin acceso al contenido pago de la academia y, si era guardiana, pierde ese rol. Después podés gestionarla desde Integrantes.";
  return `Al activar, ${count} membresías bloqueadas por pago pasan a ser integrantes gratuitas: entran a la tribu sin acceso al contenido pago de la academia y las que eran guardianas pierden ese rol. Después podés gestionarlas desde Integrantes.`;
}
