/** @vitest-environment node */
/** Exercises actual reviewer HTTP boundaries with doubles only of inward application ports. @module admission-review-routes-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionReviewHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-review-handlers";
import type { GetAdmissionReviewUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-admission-review-use-cases";

/** Uses only public own DTOs; infrastructure auth/database are never mocked. */
function fixture() {
  const tribeId = randomUUID(), requestId = randomUUID();
  const value = { id: requestId, status: "pending" as const, version: 1, submittedAt: "2026-10-07T00:00:00.000Z", expiresAt: "2026-11-06T00:00:00.000Z", source: "common" as const, needsVerification: false, eligibilityReasons: [], applicant: { id: randomUUID(), name: "Solicitante" }, evidence: { kind: "none" as const }, eligibleActions: ["reject" as const, "approve" as const], restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null } };
  const services = {
    resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) },
    review: { list: vi.fn<GetAdmissionReviewUseCases["list"]>(async () => ({ ok: true, value: { items: [value], nextCursor: null } })), detail: vi.fn<GetAdmissionReviewUseCases["detail"]>(async () => ({ ok: true, value })) },
  };
  const open = vi.fn(async () => services);
  return { tribeId, requestId, value, services, open, handlers: createAdmissionReviewHandlers(open), context: { params: Promise.resolve({ slug: "synthetic-academy" }) } };
}

describe("current admission review HTTP", () => {
  it("should reject identity/role flags and malformed tuple cursors before opening any module", async () => {
    const data = fixture();
    for (const query of ["role=leader", "userId=foreign", "cursor=opaque-but-malformed", "limit=51", "submittedFrom=2026-10-08T00:00:00Z&submittedUntil=2026-10-07T00:00:00Z"]) expect((await data.handlers.list(new Request(`https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/requests?${query}`), data.context)).status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should pass normalized oldest-first selection to application and allowlist private reviewer responses", async () => {
    const data = fixture();
    data.services.review.list.mockResolvedValueOnce({ ok: true, value: { items: [{ ...data.value, internalReason: "Sólo revisores", externalMessage: "Mensaje externo", applicantMessage: "Mi presentación", providerToken: "synthetic-private-field" }], nextCursor: null } } as unknown as Awaited<ReturnType<GetAdmissionReviewUseCases["list"]>>);
    const response = await data.handlers.list(new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/requests?limit=1&status=pending&search=%20Solicitante%20"), data.context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data.services.review.list).toHaveBeenCalledWith(expect.objectContaining({ tribeId: data.tribeId, limit: 1, status: "pending", search: "Solicitante" }));
    const body = await response.json();
    expect(body.items[0]).toMatchObject({ internalReason: "Sólo revisores", externalMessage: "Mensaje externo", applicantMessage: "Mi presentación" });
    expect(body.items[0]).not.toHaveProperty("providerToken");
  });

  it("should keep exact request absence and permission failure safe without returning private detail", async () => {
    const data = fixture();
    data.services.review.detail.mockResolvedValueOnce({ ok: false, failure: { code: "resource_unavailable", cause: new Error("synthetic private SQL identifier") } });
    const context = { params: Promise.resolve({ slug: "synthetic-academy", requestId: data.requestId }) };
    const response = await data.handlers.detail(new Request(`https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/requests/${data.requestId}`), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "resource_unavailable", message: expect.any(String) });
    expect(data.services.review.detail).toHaveBeenCalledWith(expect.objectContaining({ tribeId: data.tribeId, admissionRequestId: data.requestId }));
    data.services.review.list.mockResolvedValueOnce({ ok: false, failure: { code: "permission_denied" } });
    const denied = await data.handlers.list(new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/requests"), data.context);
    expect(denied.status).toBe(403);
    expect(await denied.json()).not.toHaveProperty("items");
  });
});
