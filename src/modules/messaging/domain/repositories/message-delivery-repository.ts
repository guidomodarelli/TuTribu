/** Defines DB-only outbox and receipt ports without provider RPC or credential material. @module message-delivery-repository */
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessageDeliveryAttempt } from "@/src/modules/messaging/domain/entities/message-delivery-attempt";
import type { MESSAGE_AUTHORIZATION_OUTCOME, MESSAGE_COMPLETION_OUTCOME, MESSAGE_RECEIPT_REASON } from "@/src/modules/messaging/constants/message-delivery";
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Private ownership hint; the marker writer must revalidate every field against current rows. */
export type ClaimedMessageDelivery = { deliveryId: string; tribeId: string; version: number; leaseToken: string; contributingLeaderUserId: string | null };
/** A private request-owned launch is limited to one committed diagnostic; this tuple is never browser authority. */
export type DiagnosticDeliveryDispatchScope={deliveryId:string;tribeId:string;contributingLeaderUserId:string;connectionId:string;connectionVersion:number};
/** Admission separates the applicant from the contributor and binds the exact immutable challenge lineage. */
export type AdmissionDeliveryDispatchScope=DiagnosticDeliveryDispatchScope&{purpose:"admission";applicantUserId:string;challengeId:string};
/** A focal backend launch retains purpose-specific authority and cannot become a global queue drain. */
export type FocalDeliveryDispatchScope=DiagnosticDeliveryDispatchScope|AdmissionDeliveryDispatchScope;
/** A confirmed marker has already consumed its external slot; it is not contact evidence. */
export type MessageDeliveryAuthorization =
  | { outcome: "authorized"; context: AuthorizedDeliveryMessagingContext; deliveryVersion: number }
  | { outcome: Exclude<(typeof MESSAGE_AUTHORIZATION_OUTCOME)[keyof typeof MESSAGE_AUTHORIZATION_OUTCOME], "authorized">; deliveryId: string; deliveryVersion: number | null };
/** Provider adapters map to own safe reasons; raw messages never reach this persistence contract. */
export type MessageDeliveryReceipt = {
  context: AuthorizedDeliveryMessagingContext; outcome: "accepted" | "delivered" | "rejected" | "unknown";
  providerMessageId: string | null; correlationId: string | null;
  reason: (typeof MESSAGE_RECEIPT_REASON)[keyof typeof MESSAGE_RECEIPT_REASON] | (typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE];
};
/** A historical receipt does not grant another external attempt or release its reservation. */
export type MessageDeliveryCompletion = { outcome: (typeof MESSAGE_COMPLETION_OUTCOME)[keyof typeof MESSAGE_COMPLETION_OUTCOME]; attemptVersion: number | null; deliveryVersion: number | null };
/** Own operations commit before the caller leaves persistence to retrieve secrets or enter a sender. */
export interface MessageDeliveryRepository {
  /** @param command - Backend-owned batch lease and bounded claim options. @returns One confirmed queue head per eligible tribe. */
  claim(command: { leaseToken: string; limit: number; leaseSeconds: number }): Promise<ClaimedMessageDelivery[]>;
  /** @param claim - Original confirmed lease, with current scope rechecked by the writer. @returns A confirmed marker or a closed queue outcome. */
  authorize(claim: ClaimedMessageDelivery, requestId: string): Promise<MessageDeliveryAuthorization>;
  /** @param receipt - Actual result of this exact original external attempt. @returns Confirmed persistence, identical replay or stale CAS. */
  complete(receipt: MessageDeliveryReceipt): Promise<MessageDeliveryCompletion>;
  /** @param context - Exact original attempt/lease identity. @returns Private own receipt state without another marker or RPC. */
  readAttempt(context: AuthorizedDeliveryMessagingContext): Promise<MessageDeliveryAttempt | null>;
  /** @param limit - Bounded maintenance batch. @returns Number of confirmed expired-lease transitions. */
  reconcileExpiredLeases(limit: number): Promise<number>;
}
