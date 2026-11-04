/** Names the private activity flow independently of provider or credential configuration. @module admission-activity-browser */
export const ADMISSION_ACTIVITY_PAGE_KIND = { ready: "ready", unavailable: "unavailable" } as const;
/** Keeps ordinary read navigation separate from mutations and original-operation recovery. */
export const ADMISSION_ACTIVITY_BROWSER_PATH = { settings: "academia/admissions/activity", snapshot: "admissions/activity/snapshot" } as const;
/** Correlates only fixed operations and diagnostics, never a resource URL or query value. */
export const ADMISSION_ACTIVITY_PAGE_DIAGNOSTIC = { feature: "academy-admissions", load: "load_admission_activity_page", snapshot: "read_admission_activity_snapshot", message: "Private activity page could not produce its own safe snapshot." } as const;
/** Explicit phases have no implication of server-side authority. */
export type AdmissionActivityBrowserPhase = "checking" | "reading" | "ready" | "unavailable" | "changed_viewer" | "signed_out";
/** Supplies fixed workflow phases without deriving public types from runtime values. */
export const ADMISSION_ACTIVITY_BROWSER_PHASE = { checking: "checking", reading: "reading", ready: "ready", unavailable: "unavailable", changedViewer: "changed_viewer", signedOut: "signed_out" } as const satisfies Record<string, AdmissionActivityBrowserPhase>;
/**
 * What a read does with the view on screen: `restore` withholds it until a restored document is authorized again; `replace` keeps it while new filters load and then replaces it;
 * `refresh` keeps it while the same filters are reread and keeps the older pages already loaded; `older` adds the next page below it.
 */
export type AdmissionActivityReadMode = "restore" | "replace" | "refresh" | "older";
/** Supplies the fixed read modes without deriving their type from runtime values. */
export const ADMISSION_ACTIVITY_READ_MODE = { restore: "restore", replace: "replace", refresh: "refresh", older: "older" } as const satisfies Record<string, AdmissionActivityReadMode>;
/** Browser outcome discriminators are independent of local workflow phases and native authority. */
export const ADMISSION_ACTIVITY_BROWSER_STATUS = { ready: "ready", failed: "failed", aborted: "aborted" } as const;
/** Recovery copy describes read outcomes without copying an upstream failure or pretending a mutation occurred. */
export const ADMISSION_ACTIVITY_UI_COPY = { loading: "Consultando consumo e historial actuales…", updating: "Actualizando consumo e historial…",readFailed: "No pudimos consultar el consumo y el historial. Volvé a intentarlo.", invalidFilter: "Revisá el tipo de recurso y su referencia antes de consultar.", changedViewer: "La cuenta cambió. Volvé a cargar la página para consultar los datos de la cuenta actual.", signedOut: "Tu sesión terminó. Iniciá sesión para volver a consultar el consumo y el historial." } as const;

