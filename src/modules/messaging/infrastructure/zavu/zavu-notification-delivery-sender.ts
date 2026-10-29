/** Prepares and sends one authenticated generic notification email through the shared real SDK transport. @module zavu-notification-delivery-sender */
import "server-only";
import type { MessageDeliveryReceipt } from "../../domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "../../domain/repositories/messaging-repositories";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "../../constants/notification-delivery-recovery";
import { ZAVU_DELIVERY_CHANNEL, ZAVU_MESSAGE_TYPE } from "../../constants/zavu-delivery";
import type { PreparedNotificationDelivery } from "../notification-delivery-preparation";
import { assertPreparedMessageDeliveryScope } from "../message-delivery-preparation";
import { ZavuPreparedDeliverySender } from "./zavu-prepared-delivery-sender";

/** Keeps notification subject/text separate from code generation and verification templates. */
export class ZavuNotificationDeliverySender extends ZavuPreparedDeliverySender<PreparedNotificationDelivery> {
  /** @param context - Original confirmed marker. @param prepared - Complete original private email. @param signal - Exact RPC deadline. @returns Own transport receipt. @throws MessagingSecretAccessError before SDK on crossed scope or a non-notification email. */
  protected async sendPrepared(context: AuthorizedDeliveryMessagingContext, prepared: PreparedNotificationDelivery, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    signal.throwIfAborted();
    assertPreparedMessageDeliveryScope(context, prepared);
    const intent = prepared.intent;
    // Fail closed even if a caller bypasses the static contract (casts, untyped composition).
    if ((intent.purpose as string) !== NOTIFICATION_DELIVERY_RECOVERY_PURPOSE || (intent.channel as string) !== ZAVU_DELIVERY_CHANNEL.email || !intent.recipient || !intent.subject || !intent.text) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return this.transport.send(context, prepared, { messageType: ZAVU_MESSAGE_TYPE.text, subject: intent.subject, text: intent.text }, signal);
  }
}
