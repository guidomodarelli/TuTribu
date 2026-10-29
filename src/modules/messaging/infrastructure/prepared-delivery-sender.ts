/** Shared prepare-then-send lifecycle of the delivery senders. @module prepared-delivery-sender */
import "server-only";
import type { MessageDeliverySender, PreparedMessageDeliverySender } from "../domain/repositories/message-delivery-sender";
import type { MessageDeliveryReceipt } from "../domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "../domain/repositories/messaging-repositories";

/** Private material owner that prepares one committed attempt. */
export type DeliveryPreparation<TPrepared> = {
  prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<TPrepared>;
};

/** Prepares each committed attempt once, inside its run deadline, before any RPC. */
export abstract class PreparedDeliverySender<TPrepared> implements MessageDeliverySender {
  /** @param preparation - Current authority and private material owner behind the private boundary. */
  constructor(private readonly preparation: DeliveryPreparation<TPrepared>) {}

  /** @param context - Original committed attempt. @param signal - Original run/RPC deadline. @returns Own receipt without another intent, fallback or retry. */
  async send(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    return (await this.prepare(context, signal)).send(signal);
  }

  /** @param context - Original committed attempt. @param signal - Remaining run deadline. @returns One transient prepared operation, with no RPC until its explicit send. */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedMessageDeliverySender> {
    signal.throwIfAborted();
    const prepared = await this.preparation.prepare(context, signal);
    signal.throwIfAborted();
    return this.fromPrepared(context, prepared, signal);
  }

  /** @param context - Original committed attempt. @param prepared - Transient own material fixed to that attempt. @param signal - Remaining run deadline. @returns The prepared operation of the exact sender adapter. */
  protected abstract fromPrepared(context: AuthorizedDeliveryMessagingContext, prepared: TPrepared, signal: AbortSignal): PreparedMessageDeliverySender | Promise<PreparedMessageDeliverySender>;
}
