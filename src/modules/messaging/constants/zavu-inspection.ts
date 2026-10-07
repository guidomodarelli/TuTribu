/** Names the read-only pinned provider operations and bounds resource enumeration. @module zavu-inspection-constants */
/** Fixes inspection paths at the adapter; caller input cannot select an upstream endpoint. */
export const ZAVU_INSPECTION_PATH = { credential: "/v1/me", senders: "/v1/senders", templates: "/v1/templates" } as const;
/** Bounds each page and each full read; incomplete enumeration fails instead of silently truncating. */
export const ZAVU_INSPECTION_PAGINATION = { pageSize: 50, maximumPages: 100 } as const;
/** Uses upstream discriminators only for capability projection, never a complete provider schema. */
export const ZAVU_TEMPLATE_PREPARATION = { authentication: "AUTHENTICATION", approved: "approved" } as const;
/** Permits only cursor pagination on pinned GET operations. */
export const ZAVU_INSPECTION_TRANSPORT = { method: "GET", cursor: "cursor", limit: "limit" } as const;
