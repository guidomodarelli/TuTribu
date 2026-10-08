/** Names current product dependencies that must be resolved before ordinary selected-resource retirement. @module messaging-connection-retirement-constants */
export const MESSAGING_CONNECTION_RETIREMENT_REASON = {
  admissionDependency: "admission_dependency",
  notificationDependency: "notification_dependency",
} as const;
/** Records explicit ordinary retirement independently of compromise and replacement. */
export const MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON="connection_disconnected";
