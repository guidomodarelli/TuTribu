/** Original usage ledger namespaces stay separate from admission operations and current configuration. @module messaging-usage-constants */
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
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
export const MESSAGING_USAGE_BROWSER_PHASE = { checking: "checking", idle: "idle", reading: "reading", writing: "writing", uncertain: "uncertain", changedViewer: "changed_viewer" } as const;
/** Safe browser feedback never renders database or provider messages. */
export const MESSAGING_USAGE_UI_COPY = {
  invalid: "Revisá los países y los límites diarios antes de confirmar.",
  quotaInvalid: "Revisá los límites diarios; deben ser enteros desde cero y respetar los máximos actuales.",
  countryInvalid: "Revisá los países; no pueden repetirse ni usar códigos desconocidos.",
  saved: "Los países y cupos quedaron guardados.",
  recovered: "El resultado original quedó confirmado. Revisá el uso actual antes de continuar.",
  uncertain: "Todavía no podemos confirmar el guardado. Consultá la operación original antes de repetir.",
  changedViewer: "La cuenta cambió. Volvé a abrir la configuración de uso con tu cuenta actual.",
  storageFailed: "No pudimos conservar esta acción. Consultá su resultado antes de repetir.",
  retry: "La operación original todavía no está registrada. Confirmá un reintento con sus mismos datos.",
  reauthenticationFailed: "No pudimos preparar la confirmación de Google. Consultá el estado antes de continuar.",
} as const;
