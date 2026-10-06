/** Names connection lifecycle facts; suspended/retired resources cannot supply operational credentials. */
export const MESSAGING_CONNECTION_STATE = {
  draft: "draft", ready: "ready", active: "active", degraded: "degraded",
  suspended: "suspended", disconnected: "disconnected",
} as const;
export const MESSAGING_CREDENTIAL_USABLE_STATES = new Set<string>([
  MESSAGING_CONNECTION_STATE.draft, MESSAGING_CONNECTION_STATE.ready,
  MESSAGING_CONNECTION_STATE.active, MESSAGING_CONNECTION_STATE.degraded,
]);
