/** Models an immutable private delivery intent and its separately mutable execution state. @module message-delivery */
import type { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";

/** Contains references and protected fingerprints, never a recoverable code or credential. */
export type MessageDelivery = {
  id: string; tribeId: string; connectionId: string; connectionVersion: number; environment: string; securityEpoch: string;
  purpose: "admission" | "connection_diagnostic" | "admission_notification"; sourceResourceId: string;
  actorUserId: string | null; contactSubjectId: string | null; recipientRef: string; recipientCountry: string | null;
  channel: "email" | "sms" | "whatsapp"; idempotencyKey: string; payloadFingerprint: Uint8Array; payloadMacKeyId: string;
  frozenIntent: Readonly<Record<string, unknown>>; queuedUsagePolicyVersion: number;
  state: (typeof MESSAGE_DELIVERY_STATE)[keyof typeof MESSAGE_DELIVERY_STATE]; dueAt: Date; deadlineAt: Date;
  leaseToken: string | null; leaseUntil: Date | null; version: number; lastOutcome: string | null; createdAt: Date;
};
