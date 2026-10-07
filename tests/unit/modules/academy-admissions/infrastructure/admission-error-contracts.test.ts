/** @vitest-environment node */
/** Exercises safe semantic errors, registered progress and intentional cancellation. @module admission-error-contracts-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdmissionRouteBoundary } from "@/src/modules/academy-admissions/infrastructure/api/admission-route-http";
import { admissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { createMessagingRouteBoundary } from "@/src/modules/messaging/infrastructure/api/messaging-route-http";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";

describe("safe semantic error contracts", () => {
  it.each([
    { code: "allowlist_conflict" as const, status: 409 }, { code: "invitation_conflict" as const, status: 409 },
    { code: "usage_policy_conflict" as const, status: 409 }, { code: "recipient_not_allowed" as const, status: 422 },
  ])("should return $status for $code with correlation and no private details", async ({ code, status }) => {
    const privateDetail = randomUUID();
    const requestId = randomUUID();
    const response = createAdmissionRouteBoundary({ request: new Request("https://tutribu.example.invalid/api/admissions", { headers: { "x-request-id": requestId } }), operation: "error-contract-test", diagnostics: () => undefined }).failure(admissionFailure(code, { cause: new Error(privateDetail) }));
    const body = await response.json();
    expect(response.status).toBe(status);
    expect(body).toMatchObject({ code, requestId });
    expect(body).not.toHaveProperty("cause");
    expect(JSON.stringify(body)).not.toContain(privateDetail);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("should publish 202 only when the owner supplied a registered started operation", async () => {
    const boundary = createAdmissionRouteBoundary({ request: new Request("https://tutribu.example.invalid/api/admissions"), operation: "error-contract-test", diagnostics: () => undefined });
    expect(boundary.failure(admissionFailure("operation_unresolved")).status).toBe(500);
    const operationId = randomUUID();
    const response = boundary.failure(admissionFailure("operation_unresolved", { operation: { operationId, state: "started" } }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ code: "operation_unresolved", operation: { operationId, state: "started" } });
    expect(boundary.failure(admissionFailure("operation_unresolved", { operation: { operationId, state: "completed" } })).status).toBe(500);
  });

  it("should keep messaging conflict/country semantics independent of upstream status and expose no SDK cause", async () => {
    const boundary = createMessagingRouteBoundary({ request: new Request("https://tutribu.example.invalid/api/messaging"), operation: "error-contract-test", diagnostics: () => undefined });
    const cause = new Error("Synthetic private upstream detail");
    const conflict = boundary.failure(messagingFailure("usage_policy_conflict", { cause, upstreamStatus: 401 }));
    expect(conflict.status).toBe(409);
    const body = await conflict.json();
    expect(body).not.toHaveProperty("cause");
    expect(body).not.toHaveProperty("upstreamStatus");
    expect(boundary.failure(messagingFailure("recipient_not_allowed", { cause, upstreamStatus: 503 })).status).toBe(422);
  });

  it("should propagate intentional cancellation rather than turn it into a toast-worthy failure", () => {
    const controller = new AbortController();
    const cause = new DOMException("Synthetic intentional cancellation", "AbortError");
    const request = new Request("https://tutribu.example.invalid/api/admissions", { signal: controller.signal });
    const boundary = createAdmissionRouteBoundary({ request, operation: "error-contract-test", diagnostics: () => undefined });
    controller.abort(cause);
    expect(() => boundary.unexpected(cause)).toThrow(cause);
  });
});
