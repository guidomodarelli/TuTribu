/** Owns explicit local safety action choices without changing authorization or provider state. @module messaging-lifecycle-options */
import { MESSAGING_CONNECTION_SECURITY_REASON } from "./messaging-connection-security";
import { MESSAGING_LIFECYCLE_BROWSER_PATH } from "./messaging-lifecycle-browser";

/** Keeps suspension and retirement distinct in the confirmation form. */
export const MESSAGING_LIFECYCLE_ACTION_OPTIONS = [
  { value: MESSAGING_LIFECYCLE_BROWSER_PATH.suspend, label: "Suspender nuevos envíos" },
  { value: MESSAGING_LIFECYCLE_BROWSER_PATH.disconnect, label: "Desconectar y retirar recursos" },
] as const;
/** Names the independent suspension reasons exposed to authorized leaders. */
export const MESSAGING_LIFECYCLE_REASON_OPTIONS = [
  { value: MESSAGING_CONNECTION_SECURITY_REASON.securityStop, label: "Detención de seguridad" },
  { value: MESSAGING_CONNECTION_SECURITY_REASON.suspectedCompromise, label: "Sospecha de compromiso" },
] as const;
