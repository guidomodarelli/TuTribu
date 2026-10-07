/** Sends one explicit verification intent through the real pinned SDK with owned transport scope. @module zavu-message-delivery-sender */
import "server-only";
import Zavu from "@zavudev/sdk";
import type { MessageSendParams } from "@zavudev/sdk/resources/messages";
import type { MessageDeliverySender } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { MessageDeliveryReceipt } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { VerificationDeliveryPreparation } from "./verification-delivery-preparation";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_RECEIPT_REASON } from "@/src/modules/messaging/constants/message-delivery";
import { ZAVU_DELIVERY_ENDPOINT, ZAVU_DELIVERY_CHANNEL, ZAVU_DELIVERY_STATUS, ZAVU_DELIVERY_HEADER, ZAVU_DELIVERY_TRANSPORT, ZAVU_MESSAGE_TYPE, ZAVU_MESSAGE_DIRECTION, VERIFICATION_MESSAGE_COPY, ZAVU_OTP_TEMPLATE_PARAMETER } from "@/src/modules/messaging/constants/zavu-delivery";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { normalizeMessagingProviderFailure } from "@/src/modules/messaging/infrastructure/api/messaging-route-http";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";

/** Creates a per-attempt SDK client; it never mutates a singleton key/sender or posts a retry. */
export class ZavuMessageDeliverySender implements MessageDeliverySender {
  /**
   * @param preparation - Current marker/resource/frozen-payload/secret preparation behind the private boundary.
   * @param fetch - Explicit transport for the current hosting runtime or controlled real-SDK tests.
   * @param timeoutMs - Server request bound in milliseconds; the dispatcher owns its shorter remaining deadline.
   */
  constructor(private readonly preparation: VerificationDeliveryPreparation, private readonly fetch: typeof globalThis.fetch, private readonly timeoutMs: number = MESSAGING_DISPATCH_DEFAULT.requestTimeoutMs) {}

  /**
   * Sends a single prepared code with explicit sender/channel/fallback/idempotency and scoped headers.
   * @param context - Committed original attempt and its exact tenant/resource/security scope.
   * @param signal - Original abort/deadline, checked before preparation and RPC.
   * @returns Minimal own transport evidence, independent of code verification or admission.
   * @throws MessagingSecretAccessError before SDK when preparation crosses scope or lacks a required resource.
   */
  async send(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    signal.throwIfAborted();
    const prepared = await this.preparation.prepare(context, signal);
    signal.throwIfAborted();
    const intent = prepared.intent;
    if (!prepared.credential || !intent.senderId || intent.deliveryId !== context.deliveryId || intent.attemptId !== context.attemptId || intent.connectionId !== context.connectionId || intent.connectionVersion !== context.connectionVersion || intent.environment !== context.environment || intent.securityEpoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    if (intent.channel === ZAVU_DELIVERY_CHANNEL.whatsapp && (!intent.templateId || !intent.templateLanguage)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
    const text = `${VERIFICATION_MESSAGE_COPY.prefix}${intent.code}${VERIFICATION_MESSAGE_COPY.suffix}`;
    const params: MessageSendParams = { to: intent.recipient, channel: intent.channel, "Zavu-Sender": intent.senderId, fallbackEnabled: false, idempotencyKey: intent.idempotencyKey,
      ...(intent.channel === ZAVU_DELIVERY_CHANNEL.whatsapp ? { messageType: ZAVU_MESSAGE_TYPE.template, content: { templateId: intent.templateId!, templateVariables: { [ZAVU_OTP_TEMPLATE_PARAMETER]: intent.code } } } : { messageType: ZAVU_MESSAGE_TYPE.text, text, ...(intent.channel === ZAVU_DELIVERY_CHANNEL.email ? { subject: VERIFICATION_MESSAGE_COPY.subject } : {}) }) };
    const scopedFetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin !== ZAVU_DELIVERY_ENDPOINT.origin || url.pathname !== ZAVU_DELIVERY_ENDPOINT.path || url.search || request.method !== ZAVU_DELIVERY_TRANSPORT.method) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const headers = new Headers({ [ZAVU_DELIVERY_HEADER.authorization]: `${ZAVU_DELIVERY_TRANSPORT.authorizationPrefix}${prepared.credential}`, [ZAVU_DELIVERY_HEADER.sender]: intent.senderId, [ZAVU_DELIVERY_HEADER.contentType]: ZAVU_DELIVERY_TRANSPORT.json, [ZAVU_DELIVERY_HEADER.accept]: ZAVU_DELIVERY_TRANSPORT.json, [ZAVU_DELIVERY_HEADER.requestId]: context.requestId });
      // Keep the original deadline attached when intermediate Request signals are collected.
      return this.fetch(new Request(request, { headers, redirect: ZAVU_DELIVERY_TRANSPORT.redirect }),{signal:init?.signal??request.signal});
    };
    const client = new Zavu({ apiKey: prepared.credential, baseURL: ZAVU_DELIVERY_ENDPOINT.origin, fetch: scopedFetch, timeout: this.timeoutMs, maxRetries: ZAVU_DELIVERY_TRANSPORT.maximumRetries, logLevel: ZAVU_DELIVERY_TRANSPORT.logLevel });
    try {
      const response = await client.messages.send(params, { signal });
      const message = response.message;
      if (!message || message.direction !== ZAVU_MESSAGE_DIRECTION.outbound || message.channel !== intent.channel || typeof message.id !== "string" || !message.id) return { outcome: MESSAGE_ATTEMPT_STATE.unknown, providerMessageId: null, correlationId: null, reason: MESSAGING_ERROR_CODE.upstreamPayloadUnusable };
      const providerMessageId = message.id;
      if (message.status === ZAVU_DELIVERY_STATUS.delivered || message.status === ZAVU_DELIVERY_STATUS.read) return { outcome: MESSAGE_ATTEMPT_STATE.delivered, providerMessageId, correlationId: null, reason: MESSAGE_RECEIPT_REASON.delivered };
      if (message.status === ZAVU_DELIVERY_STATUS.queued || message.status === ZAVU_DELIVERY_STATUS.sending || message.status === ZAVU_DELIVERY_STATUS.sent) return { outcome: MESSAGE_ATTEMPT_STATE.accepted, providerMessageId, correlationId: null, reason: MESSAGE_RECEIPT_REASON.accepted };
      if (message.status === ZAVU_DELIVERY_STATUS.failed) return { outcome: MESSAGE_ATTEMPT_STATE.rejected, providerMessageId, correlationId: null, reason: MESSAGING_ERROR_CODE.upstreamRejected };
      return { outcome: MESSAGE_ATTEMPT_STATE.unknown, providerMessageId, correlationId: null, reason: MESSAGING_ERROR_CODE.deliveryUnknown };
    } catch (error) {
      const failure = normalizeMessagingProviderFailure(error, { operation: "send", dispatchAuthorized: true });
      const status = failure.upstreamStatus;
      const definitiveRejection = status !== undefined && status >= HTTP_STATUS.badRequest && status < HTTP_STATUS.serverError && status !== HTTP_STATUS.requestTimeout && status !== HTTP_STATUS.conflict;
      return { outcome: definitiveRejection ? MESSAGE_ATTEMPT_STATE.rejected : MESSAGE_ATTEMPT_STATE.unknown, providerMessageId: null, correlationId: null, reason: failure.code };
    }
  }
}
