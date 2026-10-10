/** Fixed same-origin paths keep browser intents independent of provider endpoints. @module admission-policy-browser-constants */
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
  prepared: "Los requisitos consultados están preparados. La activación volverá a comprobarlos al confirmar.",
  draftChanged: "Guardá el borrador y volvé a revisar los requisitos antes de activar.",
  invalid: "Revisá las reglas y confirmá la acción antes de continuar.",
  retry: "La operación original aún no está registrada. Podés confirmar un reintento con los mismos datos.",
  contactLocked: "El tipo de contacto quedó fijado al activar el control.",
  phoneAllowlist: "La lista por teléfono requiere comprobar el contacto con un código.",
  smsAlternative: "La alternativa SMS requiere teléfono, códigos activados y el canal WhatsApp.",
} as const;
