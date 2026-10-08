/** Names current product dependencies that must be resolved before ordinary selected-resource retirement. @module messaging-connection-retirement-constants */
export const MESSAGING_CONNECTION_RETIREMENT_REASON = {
  admissionDependency: "admission_dependency",
  notificationDependency: "notification_dependency",
} as const;
