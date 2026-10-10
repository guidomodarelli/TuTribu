/** Names connection lifecycle facts; suspended/retired resources cannot supply operational credentials. */
export const MESSAGING_CONNECTION_STATE = {
  draft: "draft", ready: "ready", active: "active", degraded: "degraded",
  suspended: "suspended", disconnected: "disconnected",
} as const;
export const MESSAGING_CREDENTIAL_USABLE_STATES = new Set<string>([
  MESSAGING_CONNECTION_STATE.draft, MESSAGING_CONNECTION_STATE.ready,
  MESSAGING_CONNECTION_STATE.active, MESSAGING_CONNECTION_STATE.degraded,
]);

/** Separates recent human authorization from a durably authorized background attempt. */
export const MESSAGING_AUTHORIZATION_PURPOSE = {
  sensitiveLeader: "sensitive_leader", authorizedDelivery: "authorized_delivery",
} as const;
/** Fixed internal resource slots; an inactive candidate never becomes selected by a read. */
export const MESSAGING_CONNECTION_SLOT = { selected: "selected", candidate: "candidate" } as const;
/** Provides an orientation label for legacy metadata without inventing provider validation. */
export const MESSAGING_DEFAULT_CONNECTION_NAME = "Conexión de mensajería";
