/** Owns same-origin contact route fragments and guarded browser outcomes. @module admission-contact-browser-constants */
export const ADMISSION_CONTACT_BROWSER_PATH = { prefix: "/api/tribes", segment: "admissions", challenges: "challenges", verify: "verify", resend: "resend", requests: "requests", proof: "proof", operations: "operations", messaging: "messaging", deliveries: "deliveries" } as const;
/** Keeps browser cancellation, controlled failures and usable owned results distinct. */
export const ADMISSION_CONTACT_BROWSER_STATUS = { ready: "ready", failed: "failed", aborted: "aborted" } as const;
/** Browser storage contains references only and is scoped to the actual viewer/tribe/optional pending. */
export const ADMISSION_CONTACT_STORAGE_PREFIX = "tutribu-admission-contact-intent";
/** Distinguishes personal contact references from ordinary applicant drafts without storing the link token. */
export const ADMISSION_PERSONAL_CONTACT_STORAGE_PREFIX = "tutribu-personal-admission-contact-intent";
/** A non-recoverable SHA-256 route scope identifies the original personal proposal in this browser only. */
export const ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN = /^[a-f0-9]{64}$/;
/** Each pending reference identifies the exact original namespace, never server-accepted progress. */
export const ADMISSION_CONTACT_ACTION = { issue: "issue", verify: "verify", resend: "resend", sms: "sms", apply: "apply" } as const;
/** A completed issuance reference restores either original issue or resend by its guarded actual namespace. */
export const ADMISSION_CONTACT_ISSUED_REFERENCE = "issued";
/** UI phases never substitute for an actually registered server operation. */
export const ADMISSION_CONTACT_PHASE = { idle: "idle", issuing: "issuing", verifying: "verifying", resending: "resending", applying: "applying", reading: "reading", uncertain: "uncertain" } as const;
/** Bounds browser observation independently of the unchanged server/SDK deadlines. */
export const ADMISSION_CONTACT_BROWSER_TIMEOUT_MS = 120_000;
/** Clock updates start only after mount and stop with the owned scope. */
export const ADMISSION_CONTACT_CLOCK_INTERVAL_MS = 1_000;
/** Safe persistent UI copy belongs to the contact workflow, not the transport. */
export const ADMISSION_CONTACT_COPY = { confirm: "Confirmá el contacto y el envío antes de continuar.", storage: "No pudimos conservar la operación en este navegador. Habilitá el almacenamiento antes de confirmar.", code: "Ingresá los seis números del código recibido.", phone: "Revisá el teléfono y su prefijo internacional.", country: "Elegí un país habilitado para este teléfono.", uncertain: "La respuesta no quedó confirmada. Consultá la operación original antes de repetir.", started: "La operación original sigue registrada en proceso. Podés consultar otra vez.", absent: "La operación original todavía no aparece. Conservá la referencia y consultá nuevamente antes de repetir.", requested: "El código quedó solicitado para este ingreso.", verified: "El código se comprobó. Conservá la prueba para esta solicitud.", applied: "La prueba quedó aplicada a tu solicitud pendiente.", proofExpired: "La prueba venció. Solicitá otro código para este ingreso.", resendWait: "Esperá hasta que termine el plazo de reenvío antes de pedir otro código." } as const;
