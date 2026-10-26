/** Sends one already prepared private message with fixed SDK scope and portable own receipts. @module zavu-message-delivery-transport */
import "server-only";
import Zavu from "@zavudev/sdk";
import type { MessageSendParams } from "@zavudev/sdk/resources/messages";
import type { AuthorizedDeliveryMessagingContext } from "../../domain/repositories/messaging-repositories";
import type { MessageDeliveryReceipt } from "../../domain/repositories/message-delivery-repository";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_RECEIPT_REASON } from "../../constants/message-delivery";
import { ZAVU_DELIVERY_ENDPOINT, ZAVU_DELIVERY_STATUS, ZAVU_DELIVERY_HEADER, ZAVU_DELIVERY_TRANSPORT, ZAVU_MESSAGE_DIRECTION } from "../../constants/zavu-delivery";
import { MESSAGING_DISPATCH_DEFAULT } from "../../constants/messaging-dispatch";
import { MESSAGING_PUBLIC_CHANNEL } from "../../constants/messaging-public-contract";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { normalizeMessagingProviderFailure } from "../api/messaging-route-http";
import { assertPreparedMessageDeliveryScope, type PreparedMessageDeliveryMaterial } from "../message-delivery-preparation";

/** Keeps SDK content local to infrastructure; routing, sender, credential and idempotency stay with the original intent. */
export type ZavuMessageDeliveryContent = Pick<MessageSendParams, "messageType" | "text" | "subject" | "content">;

/** Shares protocol handling without storing credentials, owning eligibility or retrying a possible send. */
export class ZavuMessageDeliveryTransport {
  /** @param fetch - Explicit hosting transport or controlled real-SDK transport. @param timeoutMs - Existing server RPC bound; the worker can provide a shorter signal. */
  constructor(private readonly fetch: typeof globalThis.fetch, private readonly timeoutMs: number = MESSAGING_DISPATCH_DEFAULT.requestTimeoutMs) {}

  /** @param context - Confirmed original attempt. @param prepared - Transient purpose-owned material. @param content - Exact already authenticated text/template content. @param signal - This original RPC deadline. @returns Own evidence, with ambiguous responses kept unknown. @throws MessagingSecretAccessError before SDK when scope is crossed; native cancellation also propagates before the request. */
  async send(context: AuthorizedDeliveryMessagingContext, prepared: PreparedMessageDeliveryMaterial, content: ZavuMessageDeliveryContent, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    signal.throwIfAborted();
    assertPreparedMessageDeliveryScope(context, prepared);
    const intent = prepared.intent;
    const params: MessageSendParams = { to: intent.recipient, channel: intent.channel, [ZAVU_DELIVERY_HEADER.sender]: intent.senderId, fallbackEnabled: false, idempotencyKey: intent.idempotencyKey, messageType: content.messageType, text: content.text, subject: content.subject, content: content.content };
    const scopedFetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url);
      if (url.origin !== ZAVU_DELIVERY_ENDPOINT.origin || url.pathname !== ZAVU_DELIVERY_ENDPOINT.path || url.search || request.method !== ZAVU_DELIVERY_TRANSPORT.method) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const headers = new Headers({ [ZAVU_DELIVERY_HEADER.authorization]: `${ZAVU_DELIVERY_TRANSPORT.authorizationPrefix}${prepared.credential}`, [ZAVU_DELIVERY_HEADER.sender]: intent.senderId, [ZAVU_DELIVERY_HEADER.contentType]: ZAVU_DELIVERY_TRANSPORT.json, [ZAVU_DELIVERY_HEADER.accept]: ZAVU_DELIVERY_TRANSPORT.json, [ZAVU_DELIVERY_HEADER.requestId]: context.requestId });
      // Preserve the original deadline when SDK intermediate Request signals are collected.
      return this.fetch(new Request(request, { headers, redirect: ZAVU_DELIVERY_TRANSPORT.redirect }), { signal: init?.signal ?? request.signal });
    };
    const client = new Zavu({ apiKey: prepared.credential, baseURL: ZAVU_DELIVERY_ENDPOINT.origin, fetch: scopedFetch, timeout: this.timeoutMs, maxRetries: ZAVU_DELIVERY_TRANSPORT.maximumRetries, logLevel: ZAVU_DELIVERY_TRANSPORT.logLevel });
    try {
      return classifyProviderMessage((await client.messages.send(params, { signal })).message, intent);
    } catch (error) {
      const failure = normalizeMessagingProviderFailure(error, { operation: "send", dispatchAuthorized: true }), status = failure.upstreamStatus;
      // Zavu answers a repeated idempotency key with 409 and the original message. Only a message of this exact intent
      // (outbound, channel, sender and recipient) recovers the original receipt; anything else stays unknown.
      if (status === HTTP_STATUS.conflict) {
        const original = conflictOriginalMessage(error);
        if (original && correlatesWithIntent(original, intent)) return classifyProviderMessage(original, intent);
      }
      const definitiveRejection = status !== undefined && status >= HTTP_STATUS.badRequest && status < HTTP_STATUS.serverError && status !== HTTP_STATUS.requestTimeout && status !== HTTP_STATUS.conflict;
      return { outcome: definitiveRejection ? MESSAGE_ATTEMPT_STATE.rejected : MESSAGE_ATTEMPT_STATE.unknown, providerMessageId: null, correlationId: null, reason: failure.code };
    }
  }
}

/** Provider message fields read for a receipt; the response is not schema-validated beyond these structural checks. */
type ProviderMessage = { id?: unknown; direction?: unknown; channel?: unknown; status?: unknown; senderId?: unknown; to?: unknown };

/** @param message - Provider message from a send response or a correlated 409. @param intent - Original prepared intent. @returns The own receipt for that message, unknown when it is not an outbound message of this channel. */
function classifyProviderMessage(message: ProviderMessage | undefined, intent: PreparedMessageDeliveryMaterial["intent"]): Omit<MessageDeliveryReceipt, "context"> {
  if (!message || message.direction !== ZAVU_MESSAGE_DIRECTION.outbound || message.channel !== intent.channel || typeof message.id !== "string" || !message.id) return { outcome: MESSAGE_ATTEMPT_STATE.unknown, providerMessageId: null, correlationId: null, reason: MESSAGING_ERROR_CODE.upstreamPayloadUnusable };
  const providerMessageId = message.id;
  if (message.status === ZAVU_DELIVERY_STATUS.delivered || message.status === ZAVU_DELIVERY_STATUS.read) return { outcome: MESSAGE_ATTEMPT_STATE.delivered, providerMessageId, correlationId: null, reason: MESSAGE_RECEIPT_REASON.delivered };
  if (message.status === ZAVU_DELIVERY_STATUS.queued || message.status === ZAVU_DELIVERY_STATUS.sending || message.status === ZAVU_DELIVERY_STATUS.sent) return { outcome: MESSAGE_ATTEMPT_STATE.accepted, providerMessageId, correlationId: null, reason: MESSAGE_RECEIPT_REASON.accepted };
  if (message.status === ZAVU_DELIVERY_STATUS.failed) return { outcome: MESSAGE_ATTEMPT_STATE.rejected, providerMessageId, correlationId: null, reason: MESSAGING_ERROR_CODE.upstreamRejected };
  return { outcome: MESSAGE_ATTEMPT_STATE.unknown, providerMessageId, correlationId: null, reason: MESSAGING_ERROR_CODE.deliveryUnknown };
}

/** @param error - SDK failure for a 409. @returns The original message carried in its body, if any. */
function conflictOriginalMessage(error: unknown): ProviderMessage | undefined {
  const body = typeof error === "object" && error !== null && "error" in error ? (error as { error?: unknown }).error : undefined;
  const message = typeof body === "object" && body !== null && "message" in body ? (body as { message?: unknown }).message : undefined;
  return typeof message === "object" && message !== null ? message as ProviderMessage : undefined;
}

/** @param message - Original message returned with a 409. @param intent - This attempt. @returns Whether it is the same outbound send: channel, sender and recipient match; email recipients compare case-insensitively. */
function correlatesWithIntent(message: ProviderMessage, intent: PreparedMessageDeliveryMaterial["intent"]): boolean {
  if (message.direction !== ZAVU_MESSAGE_DIRECTION.outbound || message.channel !== intent.channel || message.senderId !== intent.senderId || typeof message.to !== "string") return false;
  return intent.channel === MESSAGING_PUBLIC_CHANNEL.email ? message.to.toLowerCase() === intent.recipient.toLowerCase() : message.to === intent.recipient;
}
