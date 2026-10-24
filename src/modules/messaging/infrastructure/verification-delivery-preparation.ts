/** Defines provider-independent private code preparation without leaking material into an application result. @module verification-delivery-preparation */
import "server-only";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { PreparedMessageDeliveryIntent } from "./message-delivery-preparation";

/** Exists only in the backend sender boundary for the lifetime of this exact original attempt. */
export type PreparedVerificationDelivery = {
  credential: string;
  intent: PreparedMessageDeliveryIntent & { code: string; templateId: string | null; templateLanguage: string | null };
};
/** Must revalidate original marker/lease/current resource before reading protected bytes and entering RPC. */
export interface VerificationDeliveryPreparation {
  /** @param context - Original confirmed marker and exact owner scope. @param signal - Original request deadline. @returns Backend-only immutable intent and credential. */
  prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedVerificationDelivery>;
}
