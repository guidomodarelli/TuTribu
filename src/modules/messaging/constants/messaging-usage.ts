/** Original usage ledger namespaces stay separate from admission operations and current configuration. @module messaging-usage-constants */
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MESSAGING_ERROR_CODE } from "./messaging-errors";
import type { MessagingErrorCode } from "../domain/errors/messaging-error-code";
export const MESSAGING_USAGE_RECOVERABLE_OPERATION = { initialize: REAUTHENTICATION_OPERATION.initializeMessagingUsage, update: REAUTHENTICATION_OPERATION.updateMessagingUsage } as const;
/** Editable count input is decimal and nonempty; absence must never silently become zero. */
export const MESSAGING_USAGE_COUNT_PATTERN = /^\d+$/;
/** Product country labels are generated in the same server locale before hydration. */
export const MESSAGING_USAGE_PRESENTATION_LOCALE = "es";
/** ISO alpha-2 country identifiers are public input choices, never capability identifiers. */
export const MESSAGING_USAGE_COUNTRY_CODE_LENGTH = 2;
/** Local intentions are scoped by native account/tribe; this key carries no authority. */
export const MESSAGING_USAGE_INTENT_STORAGE_PREFIX = "tutribu:messaging-usage-intent";
/** Same-origin product paths never expose a provider endpoint or private account. */
export const MESSAGING_USAGE_BROWSER_PATH = { tribePrefix: "/api/tribes", usageSegment: "messaging/usage-policy", operationsSegment: "operations" } as const;
/** Actual leaf navigation stays independent of saved policy and provider connection state. */
export const MESSAGING_USAGE_SETTINGS_SEGMENT = "academia/admissions/messaging";
/** UI phases never grant the current role or permission by themselves. */
export type MessagingUsageBrowserPhase = "checking" | "idle" | "reading" | "writing" | "uncertain" | "changed_viewer";
export const MESSAGING_USAGE_BROWSER_PHASE = { checking: "checking", idle: "idle", reading: "reading", writing: "writing", uncertain: "uncertain", changedViewer: "changed_viewer" } as const satisfies Record<string, MessagingUsageBrowserPhase>;
/** A lost session or role revokes read access; a write rejected as unavailable does not while the current read still works. */
export const MESSAGING_USAGE_PRIVATE_AUTHORITY_FAILURES: readonly MessagingErrorCode[] = [MESSAGING_ERROR_CODE.authenticationRequired, MESSAGING_ERROR_CODE.permissionDenied];
/** A definitive write rejection registered nothing; only a session answer keeps its original, so signing in again can recover it. */
export const MESSAGING_USAGE_INTENT_KEEPING_FAILURES: readonly MessagingErrorCode[] = [MESSAGING_ERROR_CODE.authenticationRequired, MESSAGING_ERROR_CODE.reauthenticationRequired];
/** Ordered decisions of the guided usage flow; the review step is always last. */
export type MessagingUsageStepId = "countries" | "verification" | "notification" | "review";
export const MESSAGING_USAGE_STEP = { countries: "countries", verification: "verification", notification: "notification", review: "review" } as const satisfies Record<string, MessagingUsageStepId>;
export const MESSAGING_USAGE_STEP_ORDER: readonly MessagingUsageStepId[] = [MESSAGING_USAGE_STEP.countries, MESSAGING_USAGE_STEP.verification, MESSAGING_USAGE_STEP.notification, MESSAGING_USAGE_STEP.review];
/** Sub-step of the final save: creating the first configuration, then saving the chosen values. */
export type MessagingUsageWriteStep = "creating" | "saving";
export const MESSAGING_USAGE_WRITE_STEP = { creating: "creating", saving: "saving" } as const satisfies Record<string, MessagingUsageWriteStep>;
/** Daily notice quotas below this value are explained as very low: an ordinary admissions day can exhaust them. */
export const MESSAGING_USAGE_LOW_NOTIFICATION_DAILY_LIMIT = 20;
/** Safe browser feedback never renders database or provider messages. */
export const MESSAGING_USAGE_UI_COPY = {
  invalid: "Revisá los países y los límites diarios antes de confirmar.",
  quotaInvalid: "Revisá los límites diarios; deben ser enteros desde cero y respetar los máximos actuales.",
  countryInvalid: "Revisá los países; no pueden repetirse ni usar códigos desconocidos.",
  saved: "Los países y cupos quedaron guardados.",
  creating: "Creando la configuración…",
  saving: "Guardando tus países y cupos…",
  initializedOnly: "La configuración se creó con los valores iniciales, pero todavía falta guardar lo que elegiste.",
  initialized: "La configuración se creó con los valores iniciales. Revisá los pasos y guardá lo que elegiste.",
  recovered: "El resultado original quedó confirmado. Revisá el uso actual antes de continuar.",
  uncertain: "Todavía no podemos confirmar el guardado. Consultá la operación original antes de repetir.",
  changedViewer: "La cuenta cambió. Volvé a abrir la configuración de uso con tu cuenta actual.",
  storageFailed: "No pudimos conservar esta acción. Consultá su resultado antes de repetir.",
  retry: "La operación original todavía no está registrada. Confirmá un reintento con sus mismos datos.",
  started: "La operación original todavía no terminó. Si no avanza, confirmá un reintento con sus mismos datos: no se aplica dos veces.",
  startedWrite: "El guardado todavía no terminó. Consultá la operación original para ver su resultado o reintentarla con los mismos datos.",
  /** Shown once a stored original turns out unregistered while the platform cannot protect saves: nothing is left to retry. */
  platformForgotten: "El guardado anterior no quedó registrado y no hace falta reintentarlo. Vas a poder guardar cuando el equipo de TuTribu resuelva la seguridad de la plataforma.",
  platformConsequence: "Esto no es algo que puedas resolver desde tu academia. Mientras tanto no se pueden guardar países ni cupos; los guardados siguen vigentes.",
} as const;
