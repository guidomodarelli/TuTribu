/** Shared prepare-then-send lifecycle of the Zavu delivery senders. @module zavu-prepared-delivery-sender */
import "server-only";
import type { MessageDeliverySender, PreparedMessageDeliverySender } from "../../domain/repositories/message-delivery-sender";
import type { MessageDeliveryReceipt } from "../../domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "../../domain/repositories/messaging-repositories";
import { MESSAGING_DISPATCH_DEFAULT } from "../../constants/messaging-dispatch";
import { ZavuMessageDeliveryTransport } from "./zavu-message-delivery-transport";

/** Private material owner that prepares one committed attempt. */
type DeliveryPreparation<TPrepared> = {
  prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<TPrepared>;
};

/** Prepares each attempt once and sends it through a per-attempt SDK client, never retrying. */
export abstract class ZavuPreparedDeliverySender<TPrepared> implements MessageDeliverySender {
  /** Stores transport configuration only; credential material remains in each prepared operation. */
  protected readonly transport: ZavuMessageDeliveryTransport;

  /**
   * @param preparation - Current authority and private material owner behind the private boundary.
   * @param fetch - Explicit transport for the current hosting runtime or controlled real-SDK tests.
   * @param timeoutMs - Server request bound in milliseconds; the dispatcher owns its shorter remaining deadline.
   */
  constructor(private readonly preparation: DeliveryPreparation<TPrepared>, fetch: typeof globalThis.fetch, timeoutMs: number = MESSAGING_DISPATCH_DEFAULT.requestTimeoutMs) { this.transport = new ZavuMessageDeliveryTransport(fetch, timeoutMs); }

  /** @param context - Original committed attempt. @param signal - Original run/RPC deadline. @returns Own receipt without another intent, fallback or retry. */
  async send(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    return (await this.prepare(context, signal)).send(signal);
  }

  /** @param context - Original committed attempt. @param signal - Remaining run deadline. @returns One transient exact prepared operation, with no RPC until its explicit send. */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedMessageDeliverySender> {
    signal.throwIfAborted();
    const prepared = await this.preparation.prepare(context, signal);
    signal.throwIfAborted();
    return { send: (rpcSignal) => this.sendPrepared(context, prepared, signal === rpcSignal ? rpcSignal : AbortSignal.any([signal, rpcSignal])) };
  }

  /** @param context - Original committed scope. @param prepared - Transient own material fixed to that attempt. @param signal - The exact RPC deadline. @returns Own transport evidence without another preparation or retry. */
  protected abstract sendPrepared(context: AuthorizedDeliveryMessagingContext, prepared: TPrepared, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">>;
}
