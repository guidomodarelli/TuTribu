/** @vitest-environment node */
/** Exercises the actual own diagnostic DTO and safe HTTP error boundary. @module connection-diagnostic-result-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { projectConnectionDiagnosticSnapshot, connectionDiagnosticSnapshotSchema } from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import { createMessagingRouteBoundary } from "@/src/modules/messaging/infrastructure/api/messaging-route-http";
import { messagingPublicErrorSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";

describe("connection diagnostic own result", () => {
  it("should serialize the original verification timestamp and preserve unavailable capability without an admission proof", () => {
    const diagnosticId = randomUUID();
    const result = projectConnectionDiagnosticSnapshot({ outcome: "verified", diagnosticId, connectionVersion: 3, channel: "whatsapp", validatedAt: new Date("2026-10-06T12:00:00.000Z"), capabilityState: "unavailable" });
    expect(result).toEqual({ outcome: "verified", diagnosticId, connectionVersion: 3, channel: "whatsapp", validatedAt: "2026-10-06T12:00:00.000Z", capabilityState: "unavailable" });
    expect(connectionDiagnosticSnapshotSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it("should reject secret or authority fields in an own replay DTO rather than passing them to a consumer", () => {
    const snapshot = { outcome: "verified", diagnosticId: randomUUID(), connectionVersion: 1, channel: "email", validatedAt: "2026-10-06T12:00:00.000Z", capabilityState: "prepared" };
    for (const privateField of [{ code: "123456" }, { credential: randomUUID() }, { context: { actorUserId: randomUUID() } }, { proofId: randomUUID() }, { contact: "synthetic@example.test" }]) expect(connectionDiagnosticSnapshotSchema.safeParse({ ...snapshot, ...privateField }).success).toBe(false);
    expect(connectionDiagnosticSnapshotSchema.safeParse({ ...snapshot, connectionVersion: 0 }).success).toBe(false);
    expect(connectionDiagnosticSnapshotSchema.safeParse({ ...snapshot, capabilityState: "active" }).success).toBe(false);
  });

  it.each([
    { code: MESSAGING_ERROR_CODE.verificationCodeIncorrect, status: 422 },
    { code: MESSAGING_ERROR_CODE.challengeExpired, status: 409 },
    { code: MESSAGING_ERROR_CODE.challengeInvalidated, status: 409 },
    { code: MESSAGING_ERROR_CODE.verificationAttemptsExceeded, status: 429 },
  ])("should return safe Spanish copy and status $status for $code without a private cause", async ({ code, status }) => {
    const privateValue = randomUUID();
    const boundary = createMessagingRouteBoundary({ request: new Request("https://tutribu.example.test/api/diagnostics"), operation: "verify_messaging_diagnostic", diagnostics: () => undefined });
    const response = boundary.failure(messagingFailure(code, { cause: new Error(privateValue) }));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(messagingPublicErrorSchema.parse(body)).toMatchObject({ code, message: MESSAGING_ERROR_MESSAGE[code] });
    expect(body).not.toHaveProperty("cause");
    expect(JSON.stringify(body)).not.toContain(privateValue);
  });
});
