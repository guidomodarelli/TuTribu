/** @vitest-environment node */
/** Exercises the real pinned SDK through an owned HTTP transport, with no send/list or provider payload exposure. @module zavu-message-status-lookup-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ZavuMessageStatusLookup } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-status-lookup";
import { MESSAGE_ATTEMPT_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { ZAVU_DELIVERY_CHANNEL, ZAVU_DELIVERY_ENDPOINT, ZAVU_DELIVERY_HEADER, ZAVU_DELIVERY_STATUS, ZAVU_DELIVERY_TRANSPORT, ZAVU_MESSAGE_DIRECTION } from "@/src/modules/messaging/constants/zavu-delivery";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { HTTP_STATUS } from "@/src/constants/http-status";

/** @returns Only synthetic private references for this test-owned request. */
function fixture() {
  const reference = { tribeId: randomUUID(), connectionId: randomUUID(), connectionVersion: 1, deliveryId: randomUUID(), attemptId: randomUUID(), providerMessageId: randomUUID(), channel: ZAVU_DELIVERY_CHANNEL.email, requestId: randomUUID() };
  const prepared = { reference, credential: randomUUID(), senderId: randomUUID() };
  return { reference, prepared };
}

describe("native SDK own message status lookup", () => {
  it.each([
    [ZAVU_DELIVERY_STATUS.queued, MESSAGE_ATTEMPT_STATE.accepted],
    [ZAVU_DELIVERY_STATUS.sending, MESSAGE_ATTEMPT_STATE.accepted],
    [ZAVU_DELIVERY_STATUS.sent, MESSAGE_ATTEMPT_STATE.accepted],
    [ZAVU_DELIVERY_STATUS.delivered, MESSAGE_ATTEMPT_STATE.delivered],
    [ZAVU_DELIVERY_STATUS.read, MESSAGE_ATTEMPT_STATE.delivered],
    [ZAVU_DELIVERY_STATUS.failed, MESSAGE_ATTEMPT_STATE.rejected],
    ["unrecognized-provider-state", MESSAGE_ATTEMPT_STATE.unknown],
  ])("should retrieve only the original message and map %s to %s without another send", async (status, expectedOutcome) => {
    const data = fixture(); let requests = 0;
    const lookup = new ZavuMessageStatusLookup({ prepare: async () => data.prepared }, async (input, init) => {
      requests += 1; const request = new Request(input, init), url = new URL(request.url);
      expect(request.method).toBe("GET"); expect(url.origin).toBe(ZAVU_DELIVERY_ENDPOINT.origin);
      expect(url.pathname === `${ZAVU_DELIVERY_ENDPOINT.path}/${data.reference.providerMessageId}`).toBe(true);
      expect(url.search).toBe(""); expect(request.body).toBeNull();
      expect(request.headers.get(ZAVU_DELIVERY_HEADER.authorization) === `${ZAVU_DELIVERY_TRANSPORT.authorizationPrefix}${data.prepared.credential}`).toBe(true);
      expect(request.headers.get(ZAVU_DELIVERY_HEADER.sender) === data.prepared.senderId).toBe(true);
      return Response.json({ message: { id: data.reference.providerMessageId, direction: ZAVU_MESSAGE_DIRECTION.outbound, channel: data.reference.channel, status, to: "synthetic@example.test", text: "Private provider text" } });
    });
    expect(await lookup.read(data.reference, new AbortController().signal)).toEqual({ outcome: expectedOutcome, providerMessageId: data.reference.providerMessageId });
    expect(requests).toBe(1);
  });

  it("should refuse a crossed prepared connection before entering the SDK", async () => {
    const data = fixture(); let requests = 0;
    const lookup = new ZavuMessageStatusLookup({ prepare: async () => ({ ...data.prepared, reference: { ...data.reference, connectionId: randomUUID() } }) }, async () => { requests += 1; return Response.json({}); });
    await expect(lookup.read(data.reference, new AbortController().signal)).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.resourceUnavailable });
    expect(requests).toBe(0);
  });

  it("should close a foreign provider message without exposing its recipient or body", async () => {
    const data = fixture();
    const lookup = new ZavuMessageStatusLookup({ prepare: async () => data.prepared }, async () => Response.json({ message: { id: randomUUID(), direction: ZAVU_MESSAGE_DIRECTION.outbound, channel: data.reference.channel, status: ZAVU_DELIVERY_STATUS.delivered, to: "foreign@example.test", text: "Private foreign body" } }));
    await expect(lookup.read(data.reference, new AbortController().signal)).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.upstreamPayloadUnusable });
  });

  it("should classify a rate limit without an SDK retry or another message request", async () => {
    const data = fixture(); let requests = 0;
    const lookup = new ZavuMessageStatusLookup({ prepare: async () => data.prepared }, async () => { requests += 1; return Response.json({ error: { message: "Private provider diagnostic" } }, { status: HTTP_STATUS.tooManyRequests }); });
    await expect(lookup.read(data.reference, new AbortController().signal)).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.providerRateLimited });
    expect(requests).toBe(1);
  });

  it("should close a mismatched channel rather than applying another transport's delivery evidence", async () => {
    const data = fixture();
    const lookup = new ZavuMessageStatusLookup({ prepare: async () => data.prepared }, async () => Response.json({ message: { id: data.reference.providerMessageId, direction: ZAVU_MESSAGE_DIRECTION.outbound, channel: ZAVU_DELIVERY_CHANNEL.sms, status: ZAVU_DELIVERY_STATUS.delivered } }));
    await expect(lookup.read(data.reference, new AbortController().signal)).rejects.toMatchObject({ code: MESSAGING_ERROR_CODE.upstreamPayloadUnusable });
  });

  it("should preserve cancellation after awaited private preparation without entering the SDK", async () => {
    const data = fixture(); let requests = 0; const controller = new AbortController();
    const lookup = new ZavuMessageStatusLookup({ prepare: async () => { controller.abort(); return data.prepared; } }, async () => { requests += 1; return Response.json({}); });
    await expect(lookup.read(data.reference, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toBe(0);
  });

  it("should preserve an in-flight read cancellation without an SDK retry or outcome inference", async () => {
    const data = fixture(); let requests = 0; const controller = new AbortController();
    const lookup = new ZavuMessageStatusLookup({ prepare: async () => data.prepared }, async () => { requests += 1; controller.abort(); controller.signal.throwIfAborted(); return Response.json({}); });
    await expect(lookup.read(data.reference, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toBe(1);
  });

  it("should preserve cancellation before private preparation without a provider request", async () => {
    const data = fixture(); let preparations = 0, requests = 0; const controller = new AbortController(); controller.abort();
    const lookup = new ZavuMessageStatusLookup({ prepare: async () => { preparations += 1; return data.prepared; } }, async () => { requests += 1; return Response.json({}); });
    await expect(lookup.read(data.reference, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(preparations).toBe(0); expect(requests).toBe(0);
  });
});
