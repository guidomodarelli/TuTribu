/** @vitest-environment node */
/** Exercises notification email through the real SDK and closed own HTTP transport, without platform mocks. @module zavu-notification-delivery-sender-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { PreparedNotificationDelivery } from "@/src/modules/messaging/infrastructure/notification-delivery-preparation";
import { ZavuNotificationDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-notification-delivery-sender";
import { createZavuProviderDescriptor } from "@/src/modules/messaging/infrastructure/zavu/zavu-provider-descriptor";
import { MessagingProviderRegistry } from "@/src/modules/messaging/infrastructure/messaging-provider-registry";
import { RegisteredNotificationDeliverySender } from "@/src/modules/messaging/infrastructure/registered-notification-delivery-sender";

/** @returns Own marked-context/material fixtures with synthetic addresses and credentials, without pretending to execute native preparation. */
function notificationFixture() {
  const context: AuthorizedDeliveryMessagingContext = { authorizationPurpose: "authorized_delivery", contributingLeaderUserId: randomUUID(), tribeId: randomUUID(), connectionId: randomUUID(), connectionVersion: 3, environment: "synthetic", securityEpoch: "synthetic-epoch", requestId: randomUUID(), secretRef: randomUUID(), deliveryId: randomUUID(), attemptId: randomUUID(), attemptVersion: 1, leaseToken: randomUUID(), sendAuthorizedAt: new Date(), authorizedUsagePolicyVersion: 2, operation: "dispatch_delivery" };
  const prepared: PreparedNotificationDelivery = { providerId: "zavu", credential: randomUUID(), intent: { purpose: "admission_notification", deliveryId: context.deliveryId, attemptId: context.attemptId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, environment: context.environment, securityEpoch: context.securityEpoch, channel: "email", senderId: randomUUID(), recipient: `${randomUUID()}@example.test`, idempotencyKey: randomUUID(), subject: "Actualización de admisión", text: "Tenés novedades de tus solicitudes. Abrí la pantalla autenticada para consultarlas." } };
  return { context, prepared };
}

describe("real SDK notification email sender", () => {
  it("should prepare once and send the exact generic subject and text with original private routing and no verification template", async () => {
    const fixture = notificationFixture(), messageId = randomUUID();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
      expect(request.headers.get("Authorization") === `Bearer ${fixture.prepared.credential}`).toBe(true);
      expect(request.headers.get("Zavu-Sender")).toBe(fixture.prepared.intent.senderId);
      expect(request.headers.get("X-Request-Id")).toBe(fixture.context.requestId);
      const body = await request.json() as Record<string, unknown>;
      expect(body).toMatchObject({ to: fixture.prepared.intent.recipient, channel: "email", messageType: "text", subject: fixture.prepared.intent.subject, text: fixture.prepared.intent.text, fallbackEnabled: false, idempotencyKey: fixture.prepared.intent.idempotencyKey });
      expect(body).not.toHaveProperty("code");
      expect(body).not.toHaveProperty("content");
      expect(body).not.toHaveProperty("templateId");
      return Response.json({ message: { id: messageId, direction: "outbound", channel: "email", status: "queued" } });
    } }]);
    let preparations = 0;
    const registry = new MessagingProviderRegistry([createZavuProviderDescriptor(transport.fetch)]);
    const sender = new RegisteredNotificationDeliverySender(registry, { prepare: async () => { preparations++; return fixture.prepared; } });
    const operation = await sender.prepare(fixture.context, new AbortController().signal);
    expect(preparations).toBe(1);
    expect(transport.receipts).toHaveLength(0);
    const receipt = await operation.send(new AbortController().signal);
    expect(receipt).toEqual({ outcome: "accepted", providerMessageId: messageId, correlationId: null, reason: "provider_accepted" });
    expect(preparations).toBe(1);
    expect(transport.receipts).toHaveLength(1);
    expect(transport.deniedRequests).toBe(0);
    expect(JSON.stringify(receipt)).not.toContain(fixture.prepared.credential);
    expect(JSON.stringify(receipt)).not.toContain(fixture.prepared.intent.recipient);
  });

  it.each([
    { label: "delivery", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.deliveryId = randomUUID(); } },
    { label: "attempt", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.attemptId = randomUUID(); } },
    { label: "connection", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.connectionId = randomUUID(); } },
    { label: "connection version", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.connectionVersion++; } },
    { label: "environment", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.environment = randomUUID(); } },
    { label: "epoch", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.securityEpoch = randomUUID(); } },
    { label: "credential", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.credential = ""; } },
    { label: "sender", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.senderId = ""; } },
    { label: "purpose", change: (fixture: ReturnType<typeof notificationFixture>) => { Object.assign(fixture.prepared.intent, { purpose: "admission" }); } },
    { label: "channel", change: (fixture: ReturnType<typeof notificationFixture>) => { Object.assign(fixture.prepared.intent, { channel: "sms" }); } },
    { label: "recipient", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.recipient = ""; } },
    { label: "subject", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.subject = ""; } },
    { label: "text", change: (fixture: ReturnType<typeof notificationFixture>) => { fixture.prepared.intent.text = ""; } },
  ])("should close a crossed or missing $label before the SDK request", async ({ change }) => {
    const fixture = notificationFixture(), transport = createAdmissionProviderTransport([]);
    change(fixture);
    const sender = new ZavuNotificationDeliverySender({ prepare: async () => fixture.prepared }, transport.fetch);
    await expect(sender.send(fixture.context, new AbortController().signal)).rejects.toMatchObject({ code: "resource_unavailable" });
    expect(transport.receipts).toHaveLength(0);
    expect(transport.deniedRequests).toBe(0);
  });

  it.each([
    { status: "queued", outcome: "accepted" }, { status: "sending", outcome: "accepted" }, { status: "sent", outcome: "accepted" },
    { status: "delivered", outcome: "delivered" }, { status: "read", outcome: "delivered" }, { status: "failed", outcome: "rejected" },
    { status: "future_status", outcome: "unknown" },
  ])("should map provider $status to the own $outcome receipt with one request", async ({ status, outcome }) => {
    const fixture = notificationFixture(), messageId = randomUUID();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: () => Response.json({ message: { id: messageId, direction: "outbound", channel: "email", status } }) }]);
    const receipt = await new ZavuNotificationDeliverySender({ prepare: async () => fixture.prepared }, transport.fetch).send(fixture.context, new AbortController().signal);
    expect(receipt.outcome).toBe(outcome);
    expect(receipt.providerMessageId).toBe(messageId);
    expect(transport.receipts).toHaveLength(1);
  });

  it.each([
    { id: "synthetic-message", direction: "inbound", channel: "email", status: "sent" },
    { id: "synthetic-message", direction: "outbound", channel: "sms", status: "sent" },
    { direction: "outbound", channel: "email", status: "sent" },
  ])("should preserve ambiguous provider message evidence as unknown", async (message) => {
    const fixture = notificationFixture();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: () => Response.json({ message }) }]);
    const receipt = await new ZavuNotificationDeliverySender({ prepare: async () => fixture.prepared }, transport.fetch).send(fixture.context, new AbortController().signal);
    expect(receipt).toMatchObject({ outcome: "unknown", providerMessageId: null, reason: "upstream_payload_unusable" });
    expect(transport.receipts).toHaveLength(1);
  });

  it.each([{ status: 400, outcome: "rejected" }, { status: 403, outcome: "rejected" }, { status: 408, outcome: "unknown" }, { status: 409, outcome: "unknown" }, { status: 503, outcome: "unknown" }])("should preserve HTTP $status as $outcome without another authorized POST", async ({ status, outcome }) => {
    const fixture = notificationFixture(), upstreamCanary = randomUUID();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: () => Response.json({ error: { message: upstreamCanary } }, { status }) }]);
    const receipt = await new ZavuNotificationDeliverySender({ prepare: async () => fixture.prepared }, transport.fetch).send(fixture.context, new AbortController().signal);
    expect(receipt.outcome).toBe(outcome);
    expect(transport.receipts).toHaveLength(1);
    expect(JSON.stringify(receipt)).not.toContain(upstreamCanary);
    expect(JSON.stringify(receipt)).not.toContain(fixture.prepared.credential);
  });

  it("should preserve an actual preparation failure and cancel a previously prepared email before any request", async () => {
    const fixture = notificationFixture(), transport = createAdmissionProviderTransport([]), failure = new Error("Synthetic private notification preparation failure");
    await expect(new ZavuNotificationDeliverySender({ prepare: async () => { throw failure; } }, transport.fetch).send(fixture.context, new AbortController().signal)).rejects.toBe(failure);
    const original = new AbortController(), sender = new ZavuNotificationDeliverySender({ prepare: async () => fixture.prepared }, transport.fetch);
    const prepared = await sender.prepare(fixture.context, original.signal);
    original.abort();
    await expect(prepared.send(new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(transport.receipts).toHaveLength(0);
    expect(transport.deniedRequests).toBe(0);
  });

  it.each(["unknown_provider", "unsupported_notification", "unsupported_email"] as const)("should close %s at explicit registry resolution without substituting verification or another provider", async (scenario) => {
    const fixture = notificationFixture(), transport = createAdmissionProviderTransport([]), actual = createZavuProviderDescriptor(transport.fetch);
    const descriptor = scenario === "unsupported_notification" ? { ...actual, createNotificationSender: undefined } : scenario === "unsupported_email" ? { ...actual, channels: ["sms" as const] } : actual;
    if (scenario === "unknown_provider") fixture.prepared.providerId = randomUUID();
    const sender = new RegisteredNotificationDeliverySender(new MessagingProviderRegistry([descriptor]), { prepare: async () => fixture.prepared });
    await expect(sender.prepare(fixture.context, new AbortController().signal)).rejects.toMatchObject({ code: "missing_capability" });
    expect(transport.receipts).toHaveLength(0);
    expect(transport.deniedRequests).toBe(0);
  });

  it("should keep parallel original notification credentials and senders isolated on the same registered adapter", async () => {
    const fixtures = [notificationFixture(), notificationFixture()];
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
      const body = await request.json() as { to: string; subject: string; text: string }, fixture = fixtures.find((candidate) => candidate.prepared.intent.recipient === body.to)!;
      expect(fixture).toBeDefined();
      expect(request.headers.get("Authorization") === `Bearer ${fixture.prepared.credential}`).toBe(true);
      expect(request.headers.get("Zavu-Sender")).toBe(fixture.prepared.intent.senderId);
      expect(body.subject).toBe(fixture.prepared.intent.subject);
      expect(body.text).toBe(fixture.prepared.intent.text);
      return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "sent" } });
    } }]);
    const registry = new MessagingProviderRegistry([createZavuProviderDescriptor(transport.fetch)]);
    const receipts = await Promise.all(fixtures.map((fixture) => new RegisteredNotificationDeliverySender(registry, { prepare: async () => fixture.prepared }).send(fixture.context, new AbortController().signal)));
    expect(receipts.map((receipt) => receipt.outcome)).toEqual(["accepted", "accepted"]);
    expect(transport.receipts).toHaveLength(2);
    expect(transport.deniedRequests).toBe(0);
  });
});
