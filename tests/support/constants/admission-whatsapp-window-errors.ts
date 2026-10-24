/** Bounds the cross-document test observer; these are instrumentation limits, never product rules. @module admission-whatsapp-window-error-constants */
export const ADMISSION_WHATSAPP_WINDOW_OBSERVER = {
  storageKey: "tutribu-test-whatsapp-window-errors",
  failureMarker: "tutribu-test-whatsapp-window-observer-unavailable",
  maximumRecords: 200,
  readTimeoutMs: 2_000,
  retirementProximityMs: 250,
} as const;

/** Names closed observer failures without exporting browser exception text or private addresses. */
export const ADMISSION_WHATSAPP_WINDOW_FAILURE = {
  unavailable: "window_observation_unavailable",
  truncated: "browser_observation_truncated",
  exception: "window_exception",
  rejection: "unhandled_rejection",
  pageError: "unclassified_page_error",
} as const;
