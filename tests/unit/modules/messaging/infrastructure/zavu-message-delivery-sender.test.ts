/** @vitest-environment node */
/** Exercises the actual SDK through a closed own HTTP transport; no SDK or crypto library is mocked. @module zavu-message-delivery-sender-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import type { PreparedVerificationDelivery } from "@/src/modules/messaging/infrastructure/zavu/verification-delivery-preparation";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/**
 * Provides an own prepared-port fixture without real provider credentials or a fabricated SDK response mock.
 * @param channel - Explicit product channel to capture at the real HTTP boundary.
 * @returns Exact original scope, synthetic credential and backend-only intent.
 */
function preparedFixture(channel: "email" | "sms" | "whatsapp" = "email") {
  const context: AuthorizedDeliveryMessagingContext = { authorizationPurpose: "authorized_delivery", contributingLeaderUserId: randomUUID(), tribeId: randomUUID(), connectionId: randomUUID(), connectionVersion: 3, environment: "synthetic", securityEpoch: "synthetic-epoch", requestId: randomUUID(), secretRef: randomUUID(), deliveryId: randomUUID(), attemptId: randomUUID(), attemptVersion: 1, leaseToken: randomUUID(), sendAuthorizedAt: new Date(), authorizedUsagePolicyVersion: 2, operation: "dispatch_delivery" };
  const prepared: PreparedVerificationDelivery = { credential: randomUUID(), intent: { deliveryId: context.deliveryId, attemptId: context.attemptId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, environment: context.environment, securityEpoch: context.securityEpoch, channel, senderId: randomUUID(), recipient: channel === "email" ? "synthetic@example.test" : "+5491155501234", code: "429017", idempotencyKey: randomUUID(), templateId: channel === "whatsapp" ? randomUUID() : null, templateLanguage: channel === "whatsapp" ? "es" : null } };
  return { context, prepared };
}

describe("real SDK message sender", () => {
  it("should preserve original preparation cancellation when the prepared operation receives a separate RPC signal",async()=>{
    const fixture=preparedFixture(),transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/messages",method:"POST",respond:()=>Response.json({message:{id:randomUUID(),direction:"outbound",channel:"email",status:"sent"}})}]),controller=new AbortController(),sender=new ZavuMessageDeliverySender({prepare:async()=>fixture.prepared},transport.fetch);
    const operation=await sender.prepare(fixture.context,controller.signal);expect(transport.receipts).toHaveLength(0);controller.abort();
    await expect(operation.send(new AbortController().signal)).rejects.toMatchObject({name:"AbortError"});expect(transport.receipts).toHaveLength(0);
  });
  it("should preserve the original SDK deadline under native GC without retrying an authorized message",async()=>{
    const fixture=preparedFixture();
    const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/messages",method:"POST",respond:()=>{
      const collectGarbage=(globalThis as {gc?:()=>void}).gc;if(collectGarbage)setTimeout(collectGarbage,0);
      return new Promise<Response>(()=>undefined);
    }}]);
    const sender=new ZavuMessageDeliverySender({prepare:async()=>fixture.prepared},transport.fetch,20);
    expect(await sender.send(fixture.context,new AbortController().signal)).toMatchObject({outcome:"unknown",reason:"delivery_unknown",providerMessageId:null});
    expect(transport.receipts).toHaveLength(1);expect(transport.deniedRequests).toBe(0);
  });
  it.each(["email", "sms", "whatsapp"] as const)("should send one explicit %s intent with scoped headers and disabled fallback", async (channel) => {
    const fixture = preparedFixture(channel);
    const providerId = randomUUID();
    let body!: Record<string, unknown>;
    let senderHeader: string | null = null, authorizationHeader: string | null = null;
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
      body = await request.json() as Record<string, unknown>;
      senderHeader = request.headers.get("Zavu-Sender"); authorizationHeader = request.headers.get("Authorization");
      return Response.json({ message: { id: providerId, direction: "outbound", channel, status: "sent", providerFieldWeDoNotConsume: { arbitrary: true } } });
    } }]);
    const sender = new ZavuMessageDeliverySender({ prepare: async () => fixture.prepared }, transport.fetch);
    expect(await sender.send(fixture.context, new AbortController().signal)).toEqual({ outcome: "accepted", providerMessageId: providerId, correlationId: null, reason: "provider_accepted" });
    expect(senderHeader).toBe(fixture.prepared.intent.senderId);
    expect(authorizationHeader).toBe(`Bearer ${fixture.prepared.credential}`);
    expect(body).toMatchObject({ to: fixture.prepared.intent.recipient, channel, fallbackEnabled: false, idempotencyKey: fixture.prepared.intent.idempotencyKey });
    if (channel === "whatsapp") {
      expect(body).toMatchObject({ messageType: "template", content: { templateId: fixture.prepared.intent.templateId, templateVariables: { "1": fixture.prepared.intent.code } } });
      expect(body).not.toHaveProperty("templateLanguage");
      expect(body).not.toHaveProperty("language");
      expect(body).not.toHaveProperty("text");
    } else {
      expect(body).toMatchObject({ messageType: "text", text: expect.stringContaining(fixture.prepared.intent.code) });
      expect(body).not.toHaveProperty("content");
      expect(Boolean(body.subject)).toBe(channel === "email");
    }
    expect(transport.receipts).toHaveLength(1);
    expect(transport.deniedRequests).toBe(0);
  });

  it.each([
    { status: 401, outcome: "rejected", reason: "invalid_credentials" },
    { status: 403, outcome: "rejected", reason: "missing_capability" },
    { status: 429, outcome: "rejected", reason: "provider_rate_limited" },
    { status: 409, outcome: "unknown", reason: "delivery_unknown" },
    { status: 503, outcome: "unknown", reason: "delivery_unknown" },
  ])("should classify HTTP $status without a retry or forwarding its private message", async ({ status, outcome, reason }) => {
    const fixture = preparedFixture();
    const privateValue = randomUUID();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: () => Response.json({ error: { message: `timeout ${privateValue}` } }, { status }) }]);
    const sender = new ZavuMessageDeliverySender({ prepare: async () => fixture.prepared }, transport.fetch);
    const result = await sender.send(fixture.context, new AbortController().signal);
    expect(result).toMatchObject({ outcome, reason, providerMessageId: null });
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(transport.receipts).toHaveLength(1);
  });

  it("should keep two interleaved keys/senders isolated even when a global SDK header override exists", async () => {
    const first = preparedFixture(), second = preparedFixture();
    const previousHeaders = process.env.ZAVUDEV_CUSTOM_HEADERS;
    process.env.ZAVUDEV_CUSTOM_HEADERS = `Authorization:Bearer ${randomUUID()}\nZavu-Sender:${randomUUID()}\nCookie:synthetic-global-cookie`;
    try {
      const observed = new Map<string, string | null>();
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        observed.set(request.headers.get("Zavu-Sender")!, request.headers.get("Authorization"));
        expect(request.headers.get("Cookie")).toBeNull();
        return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "queued" } });
      } }]);
      await Promise.all([new ZavuMessageDeliverySender({ prepare: async () => first.prepared }, transport.fetch).send(first.context, new AbortController().signal), new ZavuMessageDeliverySender({ prepare: async () => second.prepared }, transport.fetch).send(second.context, new AbortController().signal)]);
      expect(observed).toEqual(new Map([[first.prepared.intent.senderId, `Bearer ${first.prepared.credential}`], [second.prepared.intent.senderId, `Bearer ${second.prepared.credential}`]]));
    } finally {
      if (previousHeaders === undefined) delete process.env.ZAVUDEV_CUSTOM_HEADERS; else process.env.ZAVUDEV_CUSTOM_HEADERS = previousHeaders;
    }
  });

  it("should reject crossed preparation before SDK and propagate an already aborted request without preparing a secret", async () => {
    const fixture = preparedFixture();
    const transport = createAdmissionProviderTransport([]);
    const crossed = new ZavuMessageDeliverySender({ prepare: async () => ({ ...fixture.prepared, intent: { ...fixture.prepared.intent, connectionId: randomUUID() } }) }, transport.fetch);
    await expect(crossed.send(fixture.context, new AbortController().signal)).rejects.toMatchObject({ code: "resource_unavailable" });
    let preparations = 0;
    const sender = new ZavuMessageDeliverySender({ prepare: async () => { preparations += 1; return fixture.prepared; } }, transport.fetch);
    const controller = new AbortController(); controller.abort();
    await expect(sender.send(fixture.context, controller.signal)).rejects.toBe(controller.signal.reason);
    expect(preparations).toBe(0);
    expect(transport.receipts).toEqual([]);
  });
  it("should reject a missing scoped credential even when the SDK environment offers a global key",async()=>{
    const fixture=preparedFixture(),transport=createAdmissionProviderTransport([]),previousKey=process.env.ZAVUDEV_API_KEY;
    process.env.ZAVUDEV_API_KEY=randomUUID();
    try{
      const sender=new ZavuMessageDeliverySender({prepare:async()=>({...fixture.prepared,credential:""})},transport.fetch);
      await expect(sender.send(fixture.context,new AbortController().signal)).rejects.toMatchObject({code:"resource_unavailable"});
      expect(transport.receipts).toEqual([]);expect(transport.deniedRequests).toBe(0);
    }finally{if(previousKey===undefined)delete process.env.ZAVUDEV_API_KEY;else process.env.ZAVUDEV_API_KEY=previousKey;}
  });
});
