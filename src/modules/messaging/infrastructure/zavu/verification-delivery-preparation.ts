/** Defines private sender preparation without leaking credential or code into an application result. @module verification-delivery-preparation */
import "server-only";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** Exists only in the backend sender boundary for the lifetime of this exact original attempt. */
export type PreparedVerificationDelivery = {
  credential: string;
  intent: { deliveryId: string; attemptId: string; connectionId: string; connectionVersion: number; environment: string; securityEpoch: string; channel: "email" | "sms" | "whatsapp"; senderId: string; recipient: string; code: string; idempotencyKey: string; templateId: string | null; templateLanguage: string | null };
};
/** Must revalidate original marker/lease/current resource before reading protected bytes and entering RPC. */
export interface VerificationDeliveryPreparation {
  /** @param context - Original confirmed marker and exact owner scope. @param signal - Original request deadline. @returns Backend-only immutable intent and credential. */
  prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedVerificationDelivery>;
}
