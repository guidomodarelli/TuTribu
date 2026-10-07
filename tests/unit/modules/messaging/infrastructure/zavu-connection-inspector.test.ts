/** @vitest-environment node */
/** Exercises credential/resource inspection through the real SDK and an owned closed transport. @module zavu-connection-inspector-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ZavuConnectionInspector } from "@/src/modules/messaging/infrastructure/zavu/zavu-connection-inspector";

/** @returns A private synthetic resource scope, with no global provider credential. */
function inspectionFixture() {
  return { credential: randomUUID(), requestId: randomUUID(), tribeId: randomUUID(), connectionId: randomUUID(), connectionVersion: 1, environment: "synthetic", securityEpoch: "synthetic-epoch" };
}

describe("real SDK connection inspector", () => {
  it.each([true, false])("should derive test mode %s from me rather than a key prefix without sending", async (isTestMode) => {
    const fixture = { ...inspectionFixture(), credential: isTestMode ? `live_${randomUUID()}` : `test_${randomUUID()}` };
    const identity = { apiKey: { id: randomUUID() }, project: { id: randomUUID() }, team: { id: randomUUID() } };
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/me", method: "GET", respond: (request) => {
      expect(request.headers.get("Authorization")).toBe(`Bearer ${fixture.credential}`);
      expect(request.headers.get("X-Request-Id")).toBe(fixture.requestId);
      return Response.json({ ...identity, isTestMode, arbitraryProviderExtension: { secret: randomUUID() } });
    } }]);
    const result = await new ZavuConnectionInspector(fixture, transport.fetch).inspectCredential(new AbortController().signal);
    expect(result).toEqual({ isTestMode, apiKeyId: identity.apiKey.id, projectId: identity.project.id, teamId: identity.team.id });
    expect(transport.receipts).toHaveLength(1);
    expect(transport.deniedRequests).toBe(0);
  });

  it("should consume every cursor including an empty page and expose only explicit supported sender channels", async () => {
    const fixture = inspectionFixture();
    const privateValue = randomUUID();
    const firstId = randomUUID(), lastId = randomUUID();
    const observedCursors: (string | null)[] = [];
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/senders", method: "GET", respond: (request) => {
      const query = new URL(request.url).searchParams;
      expect(Number(query.get("limit"))).toBeGreaterThan(0);
      expect(Number(query.get("limit"))).toBeLessThanOrEqual(100);
      const cursor = query.get("cursor"); observedCursors.push(cursor);
      if (!cursor) return Response.json({ items: [{ id: firstId, name: "Origen de prueba", phoneNumber: "+5491155501234", emailAddress: "sender@example.test", channels: ["email", "sms_oneway", "voice"], webhook: { secret: privateValue } }], nextCursor: "empty" });
      if (cursor === "empty") return Response.json({ items: [], nextCursor: "last" });
      return Response.json({ items: [{ id: lastId, name: "Origen sin canales", phoneNumber: "+5491155501234", emailAddress: "sender@example.test" }], nextCursor: null });
    } }]);
    const result = await new ZavuConnectionInspector(fixture, transport.fetch).listSenders(new AbortController().signal);
    expect(result).toEqual([{ resourceId: firstId, name: "Origen de prueba", channels: ["email"], canSendWhatsappTemplates: false }, { resourceId: lastId, name: "Origen sin canales", channels: [], canSendWhatsappTemplates: false }]);
    expect(observedCursors).toEqual([null, "empty", "last"]);
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(JSON.stringify(result)).not.toContain("sender@example.test");
  });

  it("should list all templates and keep approval/category/language independent of credentials", async () => {
    const fixture = inspectionFixture();
    const firstId = randomUUID(), lastId = randomUUID();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/templates", method: "GET", respond: (request) => new URL(request.url).searchParams.has("cursor")
      ? Response.json({ items: [{ id: lastId, name: "otp_es", language: "es", category: "AUTHENTICATION", status: "approved", body: "private template", whatsapp: { namespace: "private namespace" } }], nextCursor: null })
      : Response.json({ items: [{ id: firstId, name: "draft", language: "en", category: "AUTHENTICATION", status: "pending" }], nextCursor: "next" }) }]);
    const result = await new ZavuConnectionInspector(fixture, transport.fetch).listTemplates(new AbortController().signal);
    expect(result).toEqual([{ resourceId: firstId, name: "draft", language: "en", authenticationApproved: false }, { resourceId: lastId, name: "otp_es", language: "es", authenticationApproved: true }]);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(transport.receipts).toHaveLength(2);
  });

  it("should permit a manually supplied resource only after the real detail operation succeeds", async () => {
    const fixture = inspectionFixture(), senderId = randomUUID(), templateId = randomUUID();
    const transport = createAdmissionProviderTransport([
      { origin: "https://api.zavu.dev", pathname: "/v1/senders", method: "GET", respond: () => Response.json({ message: "private list denial" }, { status: 403 }) },
      { origin: "https://api.zavu.dev", pathname: `/v1/senders/${senderId}`, method: "GET", respond: () => Response.json({ id: senderId, name: "WhatsApp", channels: ["whatsapp"], whatsapp: { paymentStatus: { canSendTemplates: true } }, webhook: { secret: randomUUID() } }) },
      { origin: "https://api.zavu.dev", pathname: `/v1/templates/${templateId}`, method: "GET", respond: () => Response.json({ id: templateId, name: "otp", language: "es_AR", category: "AUTHENTICATION", status: "approved" }) },
    ]);
    const inspector = new ZavuConnectionInspector(fixture, transport.fetch);
    await expect(inspector.listSenders(new AbortController().signal)).rejects.toMatchObject({ code: "missing_capability" });
    expect(await inspector.retrieveSender(senderId, new AbortController().signal)).toEqual({ resourceId: senderId, name: "WhatsApp", channels: ["whatsapp"], canSendWhatsappTemplates: true });
    expect(await inspector.retrieveTemplate(templateId, new AbortController().signal)).toEqual({ resourceId: templateId, name: "otp", language: "es_AR", authenticationApproved: true });
    expect(transport.receipts).toHaveLength(3);
  });

  it.each([{ status: 401, code: "invalid_credentials" }, { status: 403, code: "missing_capability" }, { status: 402, code: "upstream_rejected" }, { status: 429, code: "provider_rate_limited" }, { status: 503, code: "dependency_unavailable" }])("should classify $status before private message text without another request", async ({ status, code }) => {
    const fixture = inspectionFixture(), privateValue = randomUUID();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/me", method: "GET", respond: () => Response.json({ error: { message: `timeout ${privateValue}` } }, { status }) }]);
    await expect(new ZavuConnectionInspector(fixture, transport.fetch).inspectCredential(new AbortController().signal)).rejects.toMatchObject({ code });
    expect(transport.receipts).toHaveLength(1);
  });

  it("should reject missing credentials, crossed details and repeated cursors without an unbounded read", async () => {
    const fixture = inspectionFixture(), senderId = randomUUID();
    const transport = createAdmissionProviderTransport([
      { origin: "https://api.zavu.dev", pathname: `/v1/senders/${senderId}`, method: "GET", respond: () => Response.json({ id: randomUUID(), name: "crossed", channels: ["email"] }) },
      { origin: "https://api.zavu.dev", pathname: "/v1/senders", method: "GET", respond: () => Response.json({ items: [], nextCursor: "same" }) },
    ]);
    expect(() => new ZavuConnectionInspector({ ...fixture, credential: "" }, transport.fetch)).toThrow();
    const inspector = new ZavuConnectionInspector(fixture, transport.fetch);
    await expect(inspector.retrieveSender(senderId, new AbortController().signal)).rejects.toMatchObject({ code: "upstream_payload_unusable" });
    await expect(inspector.listSenders(new AbortController().signal)).rejects.toMatchObject({ code: "upstream_payload_unusable" });
    expect(transport.receipts).toHaveLength(3);
  });

  it("should abort before SDK and isolate interleaved credentials from global custom headers", async () => {
    const first = inspectionFixture(), second = inspectionFixture();
    const previousHeaders = process.env.ZAVUDEV_CUSTOM_HEADERS;
    process.env.ZAVUDEV_CUSTOM_HEADERS = `Authorization:Bearer ${randomUUID()}\nCookie:global-private`;
    try {
      const observed: string[] = [];
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/me", method: "GET", respond: (request) => {
        observed.push(request.headers.get("Authorization")!);
        expect(request.headers.get("Cookie")).toBeNull();
        return Response.json({ isTestMode: false, apiKey: { id: randomUUID() }, project: { id: randomUUID() }, team: { id: randomUUID() } });
      } }]);
      const controller = new AbortController(); controller.abort();
      await expect(new ZavuConnectionInspector(first, transport.fetch).inspectCredential(controller.signal)).rejects.toBe(controller.signal.reason);
      await Promise.all([new ZavuConnectionInspector(first, transport.fetch).inspectCredential(new AbortController().signal), new ZavuConnectionInspector(second, transport.fetch).inspectCredential(new AbortController().signal)]);
      expect(observed).toEqual(expect.arrayContaining([`Bearer ${first.credential}`, `Bearer ${second.credential}`]));
      expect(transport.receipts).toHaveLength(2);
    } finally {
      if (previousHeaders === undefined) delete process.env.ZAVUDEV_CUSTOM_HEADERS; else process.env.ZAVUDEV_CUSTOM_HEADERS = previousHeaders;
    }
  });

  it("should discard prior pages when a continuation fails and retain the actual private cause", async () => {
    const fixture = inspectionFixture(), privateValue = randomUUID();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/templates", method: "GET", respond: (request) => new URL(request.url).searchParams.has("cursor")
      ? Response.json({ message: privateValue }, { status: 503 })
      : Response.json({ items: [{ id: randomUUID(), name: "otp", language: "es", category: "AUTHENTICATION", status: "approved" }], nextCursor: "next" }) }]);
    const inspector = new ZavuConnectionInspector(fixture, transport.fetch);
    const failure = await inspector.listTemplates(new AbortController().signal).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "dependency_unavailable", failure: { upstreamStatus: 503 }, cause: expect.any(Error) });
    expect((failure as Error).message).not.toContain(privateValue);
    expect(transport.receipts).toHaveLength(2);
  });

  it.each(["apiKey", "project", "team"] as const)("should reject an unusable consumed %s reference without publishing credential facts", async (field) => {
    const fixture = inspectionFixture();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/me", method: "GET", respond: () => Response.json({ isTestMode: false, apiKey: { id: randomUUID() }, project: { id: randomUUID() }, team: { id: randomUUID() }, [field]: { id: 42 }, ignoredExtension: { arbitrary: true } }) }]);
    await expect(new ZavuConnectionInspector(fixture, transport.fetch).inspectCredential(new AbortController().signal)).rejects.toMatchObject({ code: "upstream_payload_unusable" });
    expect(transport.receipts).toHaveLength(1);
  });

  it("should preserve timeout and cancellation outcomes without sending or retrying", async () => {
    const fixture = inspectionFixture();
    const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/me", method: "GET", respond: () => {
      const collectGarbage=(globalThis as {gc?:()=>void}).gc;
      if(collectGarbage)setTimeout(collectGarbage,0);
      return new Promise<Response>(() => undefined);
    } }]);
    process.stdout.write(JSON.stringify({phase:"credential_sdk_timeout_begin"})+"\n");
    await expect(new ZavuConnectionInspector(fixture, transport.fetch, 20).inspectCredential(new AbortController().signal)).rejects.toMatchObject({ code: "transport_timeout" });
    process.stdout.write(JSON.stringify({phase:"credential_sdk_timeout_completed"})+"\n");
    const controller = new AbortController();
    const read = new ZavuConnectionInspector(fixture, transport.fetch).inspectCredential(controller.signal);
    controller.abort();
    await expect(read).rejects.toBe(controller.signal.reason);
    process.stdout.write(JSON.stringify({phase:"credential_sdk_cancellation_completed"})+"\n");
    expect(transport.receipts.every((receipt) => receipt.method === "GET")).toBe(true);
    expect(transport.receipts.filter((receipt) => receipt.outcome === "aborted")).toHaveLength(1);
  });
});
