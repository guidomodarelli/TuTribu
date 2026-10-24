/** Defines code-free private email preparation without exposing group data or credentials to a browser. @module notification-delivery-preparation */
import "server-only";
import type { AuthorizedDeliveryMessagingContext } from "../domain/repositories/messaging-repositories";
import type { PreparedMessageDeliveryIntent } from "./message-delivery-preparation";

/** Contains exactly the authenticated generic email and transient credential of one original marked attempt. */
export type PreparedNotificationDelivery = {
  providerId: string;
  credential: string;
  intent: PreparedMessageDeliveryIntent & { purpose: "admission_notification"; channel: "email"; subject: string; text: string };
};
/** Owns current marker, complete content, current destination and private secret preparation; it never performs an RPC. */
export interface NotificationDeliveryPreparation {
  /** @param context - Original committed marker and native scope. @param signal - Original remaining run deadline. @returns Current backend-only original material; no OTP or template is fabricated. */
  prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedNotificationDelivery>;
}
