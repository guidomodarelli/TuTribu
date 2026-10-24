/** @vitest-environment node */
/** Exercises the production HTTP adapter with native requests, real schemas and own application ports. @module tribe-subscription-start-route-tests */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createSubscriptionStartRouteHandler, type SubscriptionStartModules } from "@/src/modules/subscriptions/infrastructure/api/subscription-start-route-handler";
import { REQUEST_ID_HEADER, TRACE_ID_HEADER } from "@/src/modules/shared/infrastructure/observability/request-context";

/** Builds a native HTTP request; omission of the attempt header preserves the invitation fallback. */
function buildRequest(body: unknown = {}, attemptKey: string | null = "request-1") {
  const headers = new Headers({ "content-type": "application/json", [REQUEST_ID_HEADER]: "correlation-1", [TRACE_ID_HEADER]: "trace-1" });
  if (attemptKey !== null) headers.set("x-idempotency-key", attemptKey);
  return new Request("https://example.test/api/tribes/matematica-pro/subscriptions/start", { method: "POST", headers, body: JSON.stringify(body) });
}

/** Isolates only application collaborators owned by this route; no framework, ORM or shared logger mocks. */
function fixture() {
  const getAuthenticatedMember = vi.fn(async (): Promise<{id:string}|null> => ({ id: "member-1" }));
  const startTribeMemberSubscription = vi.fn<SubscriptionStartModules["subscriptions"]["useCases"]["startTribeMemberSubscription"]>(async () => ({ checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout", status: "pending" }));
  const retryTribeMemberSubscriptionPayment = vi.fn<SubscriptionStartModules["subscriptions"]["useCases"]["retryTribeMemberSubscriptionPayment"]>(async () => ({ checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout", status: "pending" }));
  const createModules = vi.fn(async () => ({ auth: { useCases: { getAuthenticatedMember } }, subscriptions: { useCases: { startTribeMemberSubscription, retryTribeMemberSubscriptionPayment } } }));
  return { handler: createSubscriptionStartRouteHandler(createModules), createModules, getAuthenticatedMember, startTribeMemberSubscription, retryTribeMemberSubscriptionPayment };
}
const context = () => ({ params: Promise.resolve({ slug: "matematica-pro" }) });
const hash = (value:string) => createHash("sha256").update(value).digest("hex");

describe("tribe subscription start route", () => {
  it("passes the invitation and preserves hashed checkout identity and correlation", async () => {
    const own = fixture();
    const response = await own.handler(buildRequest({ invitationToken: "invitation-token-1" }), context());
    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("correlation-1");
    expect(response.headers.get(TRACE_ID_HEADER)).toBe("trace-1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(own.createModules).toHaveBeenCalledWith({ requestId: "correlation-1" });
    expect(own.startTribeMemberSubscription).toHaveBeenCalledWith({ idempotencyKey: ["member-1", "matematica-pro", hash("invitation-token-1"), hash("request-1")].join(":"), invitationToken: "invitation-token-1", tribeSlug: "matematica-pro" });
    expect(own.retryTribeMemberSubscriptionPayment).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout" });
  });

  it("uses the invitation digest as fallback when no attempt header exists", async () => {
    const own = fixture();
    expect((await own.handler(buildRequest({ invitationToken: "invitation-token-1" }, null), context())).status).toBe(200);
    expect(own.startTribeMemberSubscription).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: ["member-1", "matematica-pro", hash("invitation-token-1"), hash("invitation-token-1")].join(":") }));
  });

  it("retries payment only when valid input omits the invitation", async () => {
    const own = fixture();
    expect((await own.handler(buildRequest(), context())).status).toBe(200);
    expect(own.retryTribeMemberSubscriptionPayment).toHaveBeenCalledWith({ idempotencyKey: ["member-1", "matematica-pro", hash(""), hash("request-1")].join(":"), tribeSlug: "matematica-pro" });
    expect(own.startTribeMemberSubscription).not.toHaveBeenCalled();
  });

  it("returns the subscription destination for a payment retry that is already active", async () => {
    const own = fixture();
    own.retryTribeMemberSubscriptionPayment.mockResolvedValue({ status: "already_subscribed" });
    const response = await own.handler(buildRequest(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ subscriptionUrl: "/matematica-pro/suscripcion" });
  });

  it.each([
    ["invalid_invitation", 403, "La invitación no está disponible."],
    ["conduct_blocked", 403, "No podés reingresar a esta tribu con esta cuenta."],
    ["missing_current_price", 400, "La tribu no tiene un precio actual disponible."],
    ["payment_blocked", 503, "No pudimos iniciar el pago. Intentá de nuevo."],
  ] as const)("maps %s to a safe correlated response", async (status, httpStatus, message) => {
    const own = fixture();
    own.startTribeMemberSubscription.mockResolvedValue({ status });
    const response = await own.handler(buildRequest({ invitationToken: "private-token" }), context());
    expect(response.status).toBe(httpStatus);
    expect(await response.json()).toEqual({ message, requestId: "correlation-1" });
  });

  it.each([null, [], { invitationToken: 1 }, { invitationToken: null }, { paid: true }])("rejects invalid body %j before composition or payment", async (body) => {
    const own = fixture();
    const response = await own.handler(buildRequest(body), context());
    expect(response.status).toBe(400);
    expect(own.createModules).not.toHaveBeenCalled();
    expect(own.retryTribeMemberSubscriptionPayment).not.toHaveBeenCalled();
    expect(own.startTribeMemberSubscription).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON rather than turning it into a payment retry", async () => {
    const own = fixture();
    const request = new Request("https://example.test/api/start", { method: "POST", headers: { "content-type": "application/json" }, body: "{broken" });
    const response = await own.handler(request, context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "La solicitud de pago no es válida." });
    expect(own.createModules).not.toHaveBeenCalled();
  });

  it("rejects malformed tenant scope before composing application collaborators", async () => {
    const own = fixture();
    const response = await own.handler(buildRequest(), { params: Promise.resolve({ slug: "../another-tribe" }) });
    expect(response.status).toBe(400);
    expect(own.createModules).not.toHaveBeenCalled();
  });

  it("canonicalizes mixed-case tenant and trims the invitation before invoking the use case", async () => {
    const own = fixture();
    expect((await own.handler(buildRequest({ invitationToken: " token " }), { params: Promise.resolve({ slug: " Matematica-Pro " }) })).status).toBe(200);
    expect(own.startTribeMemberSubscription).toHaveBeenCalledWith(expect.objectContaining({ invitationToken: "token", tribeSlug: "matematica-pro" }));
  });

  it("requires authentication before invoking either subscription operation", async () => {
    const own = fixture();
    own.getAuthenticatedMember.mockResolvedValue(null);
    const response = await own.handler(buildRequest(), context());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Iniciá sesión para continuar.", requestId: "correlation-1" });
    expect(own.startTribeMemberSubscription).not.toHaveBeenCalled();
    expect(own.retryTribeMemberSubscriptionPayment).not.toHaveBeenCalled();
  });

  it("rejects an unusable own checkout DTO and never exposes raw error details", async () => {
    const own = fixture();
    own.startTribeMemberSubscription.mockResolvedValue({ status: "pending", checkoutUrl: "javascript:privateDiagnostic()" });
    const invalid = await own.handler(buildRequest({ invitationToken: "token" }), context());
    expect(invalid.status).toBe(503);
    expect(await invalid.json()).toEqual({ message: "No pudimos iniciar el pago. Intentá de nuevo.", requestId: "correlation-1" });
    own.startTribeMemberSubscription.mockRejectedValue(new Error("Provider token=private secret trace"));
    const failed = await own.handler(buildRequest({ invitationToken: "token" }), context());
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ message: "No pudimos iniciar el pago. Intentá de nuevo.", requestId: "correlation-1" });
  });
});
