/** Models the durable external-attempt identity separately from the delivery obligation. @module message-delivery-attempt */
import type { MESSAGE_ATTEMPT_STATE } from "@/src/modules/messaging/constants/message-delivery";

/** The marker means a possible send even when the process died before entering the sender adapter. */
export type MessageDeliveryAttempt = {
  id: string; deliveryId: string; tribeId: string; connectionId: string; connectionVersion: number;
  sequence: number; reservationId: string; leaseToken: string; sendAuthorizedAt: Date; authorizedUsagePolicyVersion: number;
  recipientCountry: string | null; state: (typeof MESSAGE_ATTEMPT_STATE)[keyof typeof MESSAGE_ATTEMPT_STATE];
  completedAt: Date | null; correlationId: string | null; providerMessageId: string | null; safeReason: string | null; version: number;
};
