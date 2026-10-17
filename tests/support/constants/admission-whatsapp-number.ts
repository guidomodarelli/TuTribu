/** Bounds real migration and concurrency scenarios without changing global Vitest timing. @module admission-whatsapp-number-test-constants */
export const ADMISSION_WHATSAPP_SQL_TIMEOUT_MS = 600_000;
/** Bounds actual browser rendering and migration without changing product limits. */
export const ADMISSION_WHATSAPP_BROWSER_VALIDATION = { timeoutMs: 1_200_000, actionTimeoutMs: 90_000, widths: [390, 1280], height: 900, securityEnvironment: "synthetic-whatsapp-ui", captureDirectoryEnvironment: "ADMISSION_WHATSAPP_CAPTURE_DIRECTORY", commonSubmissionRoute: "**/admissions/submissions" } as const;

/** Describes the visible workflow stage when a native browser event arrives. */
export type AdmissionWhatsappBrowserPhase = "configuration" | "common" | "correction" | "own_account_recovery" | "review" | "personal" | "personal_account_recovery" | "optional_settings" | "persistence";
/** Names diagnostic stages without changing the browser actions or acceptance assertions. */
export const ADMISSION_WHATSAPP_BROWSER_PHASE = { configuration: "configuration", common: "common", correction: "correction", ownAccountRecovery: "own_account_recovery", review: "review", personal: "personal", personalAccountRecovery: "personal_account_recovery", optionalSettings: "optional_settings", persistence: "persistence" } as const satisfies Readonly<Record<string, AdmissionWhatsappBrowserPhase>>;
/** Allowlists bounded error metadata; raw messages, stacks, addresses and request URLs stay in memory. */
export const ADMISSION_WHATSAPP_BROWSER_ERROR = {
  knownNames: ["Error", "TypeError", "SyntaxError", "RangeError", "ReferenceError", "URIError", "EvalError", "AbortError", "DOMException", "SecurityError", "NotAllowedError", "NotSupportedError"],
  nativeFetchPrefix: "Fetch API cannot load ", nativeFetchName: "NativeFetchError", unknownName: "UnclassifiedError",
  frameLocationPattern: /^(https?:\/\/[^\s()]+):(\d+):(\d+)$/,
  ownFramePath: "/_next/static/chunks/", chunkNamePattern: /^[A-Za-z0-9_.~-]+\.js$/,
  maximumFrames: 3, maximumEvents: 16,
} as const;
