/** Defines a private read-only status port for an original owned message, without send authority. @module message-status-lookup */

/** References come from protected storage; a browser never selects a provider message or credential. */
export type MessageStatusReference = Readonly<{
  tribeId: string; connectionId: string; connectionVersion: number;
  deliveryId: string; attemptId: string; providerMessageId: string;
  channel: "email" | "sms" | "whatsapp"; requestId: string;
}>;

/** Transport evidence never verifies contact, membership or permission and carries no provider body. */
export type MessageStatusObservation = Readonly<{
  outcome: "accepted" | "delivered" | "rejected" | "unknown";
  providerMessageId: string;
}>;

/** Reads only the immutable original provider ID through its authorized private preparation. */
export interface MessageStatusLookup {
  /** @param reference - Native stored attempt and exact original connection scope. @param signal - This lookup's cancellation/deadline. @returns Minimal transport evidence without authorizing a resend. */
  read(reference: MessageStatusReference, signal: AbortSignal): Promise<MessageStatusObservation>;
}
