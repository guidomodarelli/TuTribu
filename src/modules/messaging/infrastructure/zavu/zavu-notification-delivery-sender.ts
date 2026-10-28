/** Prepares and sends one authenticated generic notification email through the shared real SDK transport. @module zavu-notification-delivery-sender */
import "server-only";
import type { MessageDeliverySender, PreparedMessageDeliverySender } from "../../domain/repositories/message-delivery-sender";
import type { MessageDeliveryReceipt } from "../../domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "../../domain/repositories/messaging-repositories";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "../../constants/notification-delivery-recovery";
import { ZAVU_DELIVERY_CHANNEL, ZAVU_MESSAGE_TYPE } from "../../constants/zavu-delivery";
import { MESSAGING_DISPATCH_DEFAULT } from "../../constants/messaging-dispatch";
import type { NotificationDeliveryPreparation, PreparedNotificationDelivery } from "../notification-delivery-preparation";
import { assertPreparedMessageDeliveryScope } from "../message-delivery-preparation";
import { ZavuMessageDeliveryTransport } from "./zavu-message-delivery-transport";

/** Keeps notification subject/text separate from code generation and verification templates. */
export class ZavuNotificationDeliverySender implements MessageDeliverySender {
  /** Stores transport configuration only; credential material remains in each prepared operation. */
  private readonly transport: ZavuMessageDeliveryTransport;
  /** @param preparation - Complete original notification authority and private material owner. @param fetch - Explicit hosting or controlled transport. @param timeoutMs - Existing original request bound. */
  constructor(private readonly preparation: NotificationDeliveryPreparation, fetch: typeof globalThis.fetch, timeoutMs: number = MESSAGING_DISPATCH_DEFAULT.requestTimeoutMs) { this.transport = new ZavuMessageDeliveryTransport(fetch, timeoutMs); }

  /** @param context - Original confirmed marker. @param signal - Original run/RPC deadline. @returns Own receipt without another intent, fallback or retry. */
  async send(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> { return (await this.prepare(context, signal)).send(signal); }

  /** @param context - Original committed scope. @param signal - Remaining run deadline. @returns One transient operation with no RPC until send. */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedMessageDeliverySender> {
    signal.throwIfAborted();
    const prepared = await this.preparation.prepare(context, signal);
    signal.throwIfAborted();
    return { send: (rpcSignal) => this.sendPrepared(context, prepared, signal === rpcSignal ? rpcSignal : AbortSignal.any([signal, rpcSignal])) };
  }

  /** @param context - Original confirmed marker. @param prepared - Complete original private email. @param signal - Exact RPC deadline. @returns Own transport receipt. @throws MessagingSecretAccessError before SDK on crossed scope or a non-notification email. */
  private async sendPrepared(context: AuthorizedDeliveryMessagingContext, prepared: PreparedNotificationDelivery, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    signal.throwIfAborted();
    assertPreparedMessageDeliveryScope(context, prepared);
    const intent = prepared.intent;
    // Fail closed even if a caller bypasses the static contract (casts, untyped composition).
    if ((intent.purpose as string) !== NOTIFICATION_DELIVERY_RECOVERY_PURPOSE || (intent.channel as string) !== ZAVU_DELIVERY_CHANNEL.email || !intent.recipient || !intent.subject || !intent.text) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    return this.transport.send(context, prepared, { messageType: ZAVU_MESSAGE_TYPE.text, subject: intent.subject, text: intent.text }, signal);
  }
}
