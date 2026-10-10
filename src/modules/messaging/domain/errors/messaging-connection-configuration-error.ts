/** Keeps immutable configuration failures separate from SecretStore and HTTP errors. @module messaging-connection-configuration-error */

/** Rejects an edit that would reuse an envelope bound to a different immutable version. */
export class MessagingConnectionConfigurationError extends Error {
  /** @param code - Closed own configuration requirement. */
  constructor(public readonly code: "secret_version_required" | "resource_unavailable") {
    super(`MessagingConnectionVersion.prepare failed: ${code}`);
    this.name = "MessagingConnectionConfigurationError";
  }
}
