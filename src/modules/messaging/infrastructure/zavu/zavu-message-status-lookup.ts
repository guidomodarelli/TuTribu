/** Reads one original owned message through the real pinned SDK without list/send or provider schema validation. @module zavu-message-status-lookup */
import "server-only";
import type { MessageStatusLookup, MessageStatusObservation, MessageStatusReference } from "../../domain/repositories/message-status-lookup";
import type { MessageStatusPreparation } from "./message-status-preparation";
import { MESSAGE_ATTEMPT_STATE } from "../../constants/message-delivery";
import { MESSAGE_STATUS_LOOKUP_OPERATION, MESSAGE_STATUS_PROVIDER_OPERATION } from "../../constants/message-reconciliation";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_PROVIDER_READ_TIMEOUT_MS } from "../../constants/messaging-dispatch";
import { ZAVU_DELIVERY_ENDPOINT, ZAVU_DELIVERY_HEADER, ZAVU_DELIVERY_STATUS, ZAVU_DELIVERY_TRANSPORT, ZAVU_MESSAGE_DIRECTION } from "../../constants/zavu-delivery";
import { normalizeMessagingProviderFailure } from "../api/messaging-route-http";
import type Zavu from "@zavudev/sdk";
import { createScopedZavuClient } from "./zavu-scoped-client";
import { messagingFailure } from "../../application/results/messaging-errors";
import { ZavuInspectionError } from "./zavu-inspection-error";

/** @param status - Provider message status. @returns The attempt state it supports; unknown statuses stay unknown. */
function providerAttemptState(status: unknown) {
  if (status === ZAVU_DELIVERY_STATUS.delivered || status === ZAVU_DELIVERY_STATUS.read) return MESSAGE_ATTEMPT_STATE.delivered;
  if (status === ZAVU_DELIVERY_STATUS.queued || status === ZAVU_DELIVERY_STATUS.sending || status === ZAVU_DELIVERY_STATUS.sent) return MESSAGE_ATTEMPT_STATE.accepted;
  return status === ZAVU_DELIVERY_STATUS.failed ? MESSAGE_ATTEMPT_STATE.rejected : MESSAGE_ATTEMPT_STATE.unknown;
}

/** @param response - Lookup as the provider returned it. @returns Its message, when present. */
function lookupMessage(response: UnverifiedProviderMessageLookup) {
  return response?.message;
}

/** Provider lookup as the network may actually return it; the SDK types are not a runtime guarantee. */
type UnverifiedProviderMessageLookup = {
  message?: Awaited<ReturnType<Zavu["messages"]["retrieve"]>>["message"] | null;
} | null | undefined;

/** A request-owned read adapter; a successful observation never creates a new delivery. */
export class ZavuMessageStatusLookup implements MessageStatusLookup {
  /** @param preparation - Native authorization and transient original credential. @param fetch - Hosting HTTP runtime or owned real-SDK test transport. @param timeoutMs - Bounded read duration; no SDK retries. */
  constructor(private readonly preparation: MessageStatusPreparation, private readonly fetch: typeof globalThis.fetch, private readonly timeoutMs: number = MESSAGING_PROVIDER_READ_TIMEOUT_MS) {}

  /** @param reference - Protected original identity, copied before any awaited preparation. @param signal - Exact lookup cancellation/deadline. @returns Transport only; no recipient, text, sender, secret or raw response. */
  async read(reference: MessageStatusReference, signal: AbortSignal): Promise<MessageStatusObservation> {
    signal.throwIfAborted();
    const original = Object.freeze({ ...reference });
    const prepared = await this.preparation.prepare(original, signal);
    signal.throwIfAborted();
    const scope = prepared.reference;
    if (!original.providerMessageId || !prepared.credential || !prepared.senderId || scope.tribeId !== original.tribeId || scope.connectionId !== original.connectionId || scope.connectionVersion !== original.connectionVersion || scope.deliveryId !== original.deliveryId || scope.attemptId !== original.attemptId || scope.providerMessageId !== original.providerMessageId || scope.channel !== original.channel) {
      throw new ZavuInspectionError(MESSAGE_STATUS_LOOKUP_OPERATION, messagingFailure(MESSAGING_ERROR_CODE.resourceUnavailable));
    }
    /** One scoped GET for this original provider ID, without inherited SDK headers or send authority. */
    const client = createScopedZavuClient({
      credential: prepared.credential, timeoutMs: this.timeoutMs, send: (input, init) => this.fetch(input, init),
      admit: (request) => {
        const url = new URL(request.url);
        if (request.method !== "GET" || url.origin !== ZAVU_DELIVERY_ENDPOINT.origin || url.pathname !== `${ZAVU_DELIVERY_ENDPOINT.path}/${encodeURIComponent(original.providerMessageId)}` || url.search || request.body) {
          throw new ZavuInspectionError(MESSAGE_STATUS_LOOKUP_OPERATION, messagingFailure(MESSAGING_ERROR_CODE.resourceUnavailable));
        }
      },
      headers: { [ZAVU_DELIVERY_HEADER.sender]: prepared.senderId, [ZAVU_DELIVERY_HEADER.accept]: ZAVU_DELIVERY_TRANSPORT.json, [ZAVU_DELIVERY_HEADER.requestId]: original.requestId },
    });
    try {
      const message = lookupMessage(await client.messages.retrieve(original.providerMessageId, { signal }));
      if (message?.id !== original.providerMessageId || message.direction !== ZAVU_MESSAGE_DIRECTION.outbound || message.channel !== original.channel) {
        throw new ZavuInspectionError(MESSAGE_STATUS_LOOKUP_OPERATION, messagingFailure(MESSAGING_ERROR_CODE.upstreamPayloadUnusable));
      }
      return { outcome: providerAttemptState(message.status), providerMessageId: original.providerMessageId };
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted();
      if (error instanceof ZavuInspectionError) throw error;
      throw new ZavuInspectionError(MESSAGE_STATUS_LOOKUP_OPERATION, normalizeMessagingProviderFailure(error, { operation: MESSAGE_STATUS_PROVIDER_OPERATION, dispatchAuthorized: false }));
    }
  }
}
