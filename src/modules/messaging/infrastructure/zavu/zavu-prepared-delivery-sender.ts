/** Shared prepare-then-send lifecycle of the Zavu delivery senders. @module zavu-prepared-delivery-sender */
import "server-only";
import type { PreparedMessageDeliverySender } from "../../domain/repositories/message-delivery-sender";
import type { MessageDeliveryReceipt } from "../../domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "../../domain/repositories/messaging-repositories";
import { MESSAGING_DISPATCH_DEFAULT } from "../../constants/messaging-dispatch";
import { ZavuMessageDeliveryTransport } from "./zavu-message-delivery-transport";
import { PreparedDeliverySender, type DeliveryPreparation } from "../prepared-delivery-sender";

/** Prepares each attempt once and sends it through a per-attempt SDK client, never retrying. */
export abstract class ZavuPreparedDeliverySender<TPrepared> extends PreparedDeliverySender<TPrepared> {
  /** Stores transport configuration only; credential material remains in each prepared operation. */
  protected readonly transport: ZavuMessageDeliveryTransport;

  /**
   * @param preparation - Current authority and private material owner behind the private boundary.
   * @param fetch - Explicit transport for the current hosting runtime or controlled real-SDK tests.
   * @param timeoutMs - Server request bound in milliseconds; the dispatcher owns its shorter remaining deadline.
   */
  constructor(preparation: DeliveryPreparation<TPrepared>, fetch: typeof globalThis.fetch, timeoutMs: number = MESSAGING_DISPATCH_DEFAULT.requestTimeoutMs) { super(preparation); this.transport = new ZavuMessageDeliveryTransport(fetch, timeoutMs); }

  /** @param context - Original committed attempt. @param prepared - Transient exact material. @param signal - Remaining run deadline. @returns One transient exact prepared operation, with no RPC until its explicit send. */
  protected fromPrepared(context: AuthorizedDeliveryMessagingContext, prepared: TPrepared, signal: AbortSignal): PreparedMessageDeliverySender {
    return { send: (rpcSignal) => this.sendPrepared(context, prepared, signal === rpcSignal ? rpcSignal : AbortSignal.any([signal, rpcSignal])) };
  }

  /** @param context - Original committed scope. @param prepared - Transient own material fixed to that attempt. @param signal - The exact RPC deadline. @returns Own transport evidence without another preparation or retry. */
  protected abstract sendPrepared(context: AuthorizedDeliveryMessagingContext, prepared: TPrepared, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">>;
}
