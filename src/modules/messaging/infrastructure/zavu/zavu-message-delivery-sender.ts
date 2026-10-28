/** Sends one explicit verification intent through the real pinned SDK with owned transport scope. @module zavu-message-delivery-sender */
import "server-only";
import type { MessageDeliverySender, PreparedMessageDeliverySender } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { MessageDeliveryReceipt } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { PreparedVerificationDelivery, VerificationDeliveryPreparation } from "../verification-delivery-preparation";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { ZAVU_DELIVERY_CHANNEL, ZAVU_MESSAGE_TYPE, VERIFICATION_MESSAGE_COPY, ZAVU_OTP_TEMPLATE_PARAMETER } from "@/src/modules/messaging/constants/zavu-delivery";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { assertPreparedMessageDeliveryScope } from "../message-delivery-preparation";
import { ZavuMessageDeliveryTransport, type ZavuMessageDeliveryContent } from "./zavu-message-delivery-transport";

/** Creates a per-attempt SDK client; it never mutates a singleton key/sender or posts a retry. */
export class ZavuMessageDeliverySender implements MessageDeliverySender {
  /** Stores only transport configuration; every prepared operation owns its own credential closure. */
  private readonly transport: ZavuMessageDeliveryTransport;
  /**
   * @param preparation - Current marker/resource/frozen-payload/secret preparation behind the private boundary.
   * @param fetch - Explicit transport for the current hosting runtime or controlled real-SDK tests.
   * @param timeoutMs - Server request bound in milliseconds; the dispatcher owns its shorter remaining deadline.
   */
  constructor(private readonly preparation: VerificationDeliveryPreparation, fetch: typeof globalThis.fetch, timeoutMs: number = MESSAGING_DISPATCH_DEFAULT.requestTimeoutMs) { this.transport = new ZavuMessageDeliveryTransport(fetch, timeoutMs); }

  /**
   * Sends a single prepared code with explicit sender/channel/fallback/idempotency and scoped headers.
   * @param context - Committed original attempt and its exact tenant/resource/security scope.
   * @param signal - Original abort/deadline, checked before preparation and RPC.
   * @returns Minimal own transport evidence, independent of code verification or admission.
   * @throws MessagingSecretAccessError before SDK when preparation crosses scope or lacks a required resource.
   */
  async send(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    return (await this.prepare(context, signal)).send(signal);
  }

  /** @param context - Original committed attempt. @param signal - Remaining run deadline. @returns One transient exact prepared operation, with no RPC until its explicit send. */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedMessageDeliverySender> {
    signal.throwIfAborted();
    const prepared = await this.preparation.prepare(context, signal);
    signal.throwIfAborted();
    return { send: (rpcSignal) => this.sendPrepared(context, prepared, signal===rpcSignal?rpcSignal:AbortSignal.any([signal,rpcSignal])) };
  }

  /** @param context - Original committed scope. @param prepared - Transient own material fixed to that attempt. @param signal - The exact RPC deadline. @returns Own transport evidence without another preparation or retry. */
  private async sendPrepared(context: AuthorizedDeliveryMessagingContext, prepared: PreparedVerificationDelivery, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    signal.throwIfAborted();
    const intent = prepared.intent;
    assertPreparedMessageDeliveryScope(context, prepared);
    const templateId = intent.channel === ZAVU_DELIVERY_CHANNEL.whatsapp ? intent.templateId : undefined;
    if (intent.channel === ZAVU_DELIVERY_CHANNEL.whatsapp && (!templateId || !intent.templateLanguage)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
    const text = `${VERIFICATION_MESSAGE_COPY.prefix}${intent.code}${VERIFICATION_MESSAGE_COPY.suffix}`;
    const content: ZavuMessageDeliveryContent = templateId ? { messageType: ZAVU_MESSAGE_TYPE.template, content: { templateId, templateVariables: { [ZAVU_OTP_TEMPLATE_PARAMETER]: intent.code } } } : { messageType: ZAVU_MESSAGE_TYPE.text, text, ...(intent.channel === ZAVU_DELIVERY_CHANNEL.email ? { subject: VERIFICATION_MESSAGE_COPY.subject } : {}) };
    return this.transport.send(context, prepared, content, signal);
  }
}
