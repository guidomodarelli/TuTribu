/** @vitest-environment node */
/** Exercises private usage orchestration and its native safe HTTP outcome. @module reserve-messaging-usage-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ReserveMessagingUsageUseCase } from "@/src/modules/messaging/application/use-cases/reserve-messaging-usage-use-case";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingUsageBudgetError } from "@/src/modules/messaging/domain/errors/messaging-usage-budget-error";
import { createMessagingRouteBoundary } from "@/src/modules/messaging/infrastructure/api/messaging-route-http";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";

/** Creates synthetic private authority only for the application port's controlled boundary. */
function context(now: Date): AuthorizedMessagingContext {
  const connectionId = randomUUID();
  return { authorizationPurpose: "sensitive_leader", actorUserId: randomUUID(), sessionId: randomUUID(), accountId: randomUUID(), subject: randomUUID(), tribeId: randomUUID(), connectionId, connectionVersion: 1, environment: "synthetic-local", securityEpoch: "synthetic-epoch", requestId: randomUUID(), secretRef: randomUUID(), resourceId: connectionId, operation: "validate_messaging_connection", authenticatedAt: now, validUntil: new Date(now.getTime()+540_000) };
}

describe("reserve messaging usage", () => {
  it.each(["read_messaging_senders", "diagnose_messaging_connection"])("should close an unrelated %s action before reserving", async (operation) => {
    const now = new Date();
    let calls = 0;
    const useCase = new ReserveMessagingUsageUseCase({ reserve: async () => { calls += 1; return { outcome: "denied", code: "usage_limit_reached" }; } }, () => now);
    expect(await useCase.execute({ context: { ...context(now), operation }, operationId: randomUUID() })).toEqual({ outcome: "denied", code: "permission_denied" });
    expect(calls).toBe(0);
  });

  it("should require a live recency window before reserving", async () => {
    const now = new Date();
    let calls = 0;
    const useCase = new ReserveMessagingUsageUseCase({ reserve: async () => { calls += 1; return { outcome: "denied", code: "usage_limit_reached" }; } }, () => now);
    expect(await useCase.execute({ context: { ...context(now), validUntil: now }, operationId: randomUUID() })).toEqual({ outcome: "denied", code: "reauthentication_required" });
    expect(calls).toBe(0);
  });

  it("should preserve a committed slot while closing provider access when its reply arrives after recency expires", async () => {
    const now = new Date();
    const authority = context(now);
    let current = now;
    const operationId = randomUUID();
    const useCase = new ReserveMessagingUsageUseCase({ reserve: async () => { current = authority.validUntil; return { outcome: "reserved", operationId, reservedAt: now }; } }, () => current);
    expect(await useCase.execute({ context: authority, operationId })).toEqual({ outcome: "denied", code: "reauthentication_required" });
  });

  it("should return historical accounting without granting another fresh reservation", async () => {
    const now = new Date();
    const operationId = randomUUID();
    const historical = { outcome: "already_reserved" as const, operationId, reservedAt: new Date(now.getTime()-60_000) };
    const useCase = new ReserveMessagingUsageUseCase({ reserve: async () => historical }, () => now);
    expect(await useCase.execute({ context: context(now), operationId })).toEqual(historical);
  });

  it("should retain the real private cause when the persistence result is unresolved", async () => {
    const now = new Date();
    const cause = new Error("Synthetic own persistence reply lost");
    const error = new MessagingUsageBudgetError("operation_unresolved", { cause, operation: "reserveCredentialValidation" });
    const useCase = new ReserveMessagingUsageUseCase({ reserve: async () => { throw error; } }, () => now);
    await expect(useCase.execute({ context: context(now), operationId: randomUUID() })).rejects.toBe(error);
    expect(error.cause).toBe(cause);
  });

  it("should map the credential limit to safe Spanish HTTP 429 without private diagnostics", async () => {
    const privateDetail = randomUUID();
    const boundary = createMessagingRouteBoundary({ request: new Request("https://tutribu.example.invalid/api/validation"), operation: "validate_messaging_connection", diagnostics: () => undefined });
    const response = boundary.failure(messagingFailure("credential_validation_limit_reached", { cause: new Error(privateDetail), upstreamStatus: 418 }));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body).toMatchObject({ code: "credential_validation_limit_reached", message: "Se alcanzó el límite de validaciones de credenciales. Esperá antes de volver a comprobar la conexión." });
    expect(body).not.toHaveProperty("cause");
    expect(body).not.toHaveProperty("upstreamStatus");
    expect(JSON.stringify(body)).not.toContain(privateDetail);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
