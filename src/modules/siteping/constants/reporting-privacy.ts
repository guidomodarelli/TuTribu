/** Owns secret-bearing navigation surfaces that must not mount URL/screenshot diagnostics. @module reporting-privacy-constants */
export const REPORTING_PRIVATE_ROUTE_PREFIXES = ["/admissions/invitations/"] as const satisfies readonly string[];
/** Administrative one-view material must also stay outside page-content/screenshot reporting. */
export const REPORTING_PRIVATE_ROUTE_FRAGMENTS = ["/academia/admissions/invitations"] as const satisfies readonly string[];
/** Historical attribution URLs and encoded login returns also contain private route material. */
export const REPORTING_PRIVATE_ROUTE_PATTERNS = [/\/admissions\/[^/]+\/legacy\//u, /\/[^/]+\/invitar\//u] as const satisfies readonly RegExp[];
