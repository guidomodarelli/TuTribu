/** Shares only private attempt bindings across purpose-specific material preparation. @module message-delivery-preparation */
import "server-only";
import type { AuthorizedDeliveryMessagingContext } from "../domain/repositories/messaging-repositories";
import { MessagingSecretAccessError } from "../domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "../constants/messaging-errors";

/** Keeps transient original transport coordinates separate from verification or notification content. */
export type PreparedMessageDeliveryIntent = {
  deliveryId: string; attemptId: string; connectionId: string; connectionVersion: number;
  environment: string; securityEpoch: string; channel: "email" | "sms" | "whatsapp";
  senderId: string; recipient: string; idempotencyKey: string;
};
/** Exists only inside the backend sender boundary for the original prepared attempt. */
export type PreparedMessageDeliveryMaterial = { credential: string; intent: PreparedMessageDeliveryIntent };

/** @param context - Original confirmed marker. @param prepared - Purpose-owned transient material. @returns Only when every consumed original binding matches. @throws MessagingSecretAccessError before SDK work on missing or crossed material. */
export function assertPreparedMessageDeliveryScope(context: AuthorizedDeliveryMessagingContext, prepared: PreparedMessageDeliveryMaterial): void {
  const intent = prepared.intent;
  if (!prepared.credential || !intent.senderId || intent.deliveryId !== context.deliveryId || intent.attemptId !== context.attemptId || intent.connectionId !== context.connectionId || intent.connectionVersion !== context.connectionVersion || intent.environment !== context.environment || intent.securityEpoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
}
