/** Defines protected original-message selection and observation persistence without provider SDK or secrets. @module message-reconciliation-repository */
import type { AuthorizedMessagingContext } from "./messaging-repositories";
import type { MessageDeliveryReadContext } from "./message-delivery-reader";
import type { MessageStatusReference, MessageStatusObservation } from "./message-status-lookup";

/** Selects one native delivery, never a browser-supplied provider ID or connection. */
export type MessageReconciliationQuery = Readonly<{ tribeId: string; deliveryId: string; requestId: string }>;

/** Commits only minimal original transport; no method grants a marker, reservation or resend. */
export interface MessageReconciliationRepository<Result> {
  /** @param context - Current server-derived principal. @param deliveryId - Exact own resource. @returns Its immutable original provider reference or absence. */
  readReference(context: MessageDeliveryReadContext, deliveryId: string): Promise<MessageStatusReference | null>;
  /** @param context - Current exact reconciliation authority. @param reference - Protected original message identity. @param observation - Minimal original provider-read fact. @returns The guarded own transport projection after a monotonic commit. */
  record(context: AuthorizedMessagingContext, reference: MessageStatusReference, observation: MessageStatusObservation): Promise<Result>;
}
