/** @vitest-environment node */
/** Exercises real private input/output validation and native bearer authorization before own composition. @module admission-messaging-maintenance-handler-tests */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/maintenance/admission-messaging/route";
import { createAdmissionMessagingMaintenanceHandler } from "@/src/modules/messaging/infrastructure/api/admission-messaging-maintenance-handler";
import { isAuthorizedCronRequest } from "@/src/modules/shared/infrastructure/http/cron-authorization";
import { createAdmissionMaintenanceResultFixture } from "@/tests/support/admission-messaging-maintenance-fixture";
import { ADMISSION_MESSAGING_MAINTENANCE_ROUTE } from "@/src/modules/messaging/constants/admission-messaging-maintenance";
import type { OwnHttpDiagnostic } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
import type { AdmissionMessagingMaintenanceResult } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";

/** @returns Own operation fakes behind the real HTTP boundary; no framework, SDK, auth library or validator is mocked. */
function fixture() {
  const secret = randomUUID(), value = createAdmissionMaintenanceResultFixture(), execute = vi.fn(async () => value), create = vi.fn(async () => ({ useCases: { runMaintenance: { execute } } })), diagnostics: OwnHttpDiagnostic[] = [];
  let currentSecret = secret;
  const handler = createAdmissionMessagingMaintenanceHandler({ authorize: (request) => isAuthorizedCronRequest(request, currentSecret), create, diagnostics: (diagnostic) => diagnostics.push(diagnostic) });
  const request = (query = "", authorized = true) => new Request(`https://example.invalid${ADMISSION_MESSAGING_MAINTENANCE_ROUTE}${query}`, { headers: authorized ? { authorization: `Bearer ${secret}` } : {} });
  return { secret, value, execute, create, diagnostics, handler, request, rotate: () => { currentSecret = randomUUID(); } };
}

afterEach(() => vi.unstubAllEnvs());

describe("protected admission messaging maintenance HTTP boundary", () => {
  it("should reject an unauthenticated real route request before database or provider composition", async () => {
    vi.stubEnv("CRON_SECRET", randomUUID());
    const response = await GET(new Request(`https://example.invalid${ADMISSION_MESSAGING_MAINTENANCE_ROUTE}`));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "maintenance_unauthorized" });
  });

  it("should deny cookies without the native bearer and never invoke its own operation factory", async () => {
    const test = fixture(), request = new Request(`https://example.invalid${ADMISSION_MESSAGING_MAINTENANCE_ROUTE}`, { headers: { cookie: `synthetic-session=${randomUUID()}` } });
    expect((await test.handler(request)).status).toBe(401);
    expect(test.create).not.toHaveBeenCalled();
    expect(test.execute).not.toHaveBeenCalled();
  });

  it("should reject additional query configuration before the first own operation and omit the rejected value from diagnostics", async () => {
    const test = fixture(), rejected = randomUUID();
    const response = await test.handler(test.request(`?limit=${rejected}`));
    expect(response.status).toBe(400);
    expect(test.create).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain(rejected);
    expect(JSON.stringify(test.diagnostics)).not.toContain(rejected);
  });

  it("should emit every confirmed phase and native health through the real own DTO validator", async () => {
    const test = fixture(), response = await test.handler(test.request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject(test.value);
    expect(body.message).toBeTruthy();
    expect(test.execute).toHaveBeenCalledTimes(1);
    expect(test.diagnostics).toEqual([]);
  });

  it("should return partial confirmed counters with a visible failure status instead of a successful zero", async () => {
    const test = fixture();
    const partial: AdmissionMessagingMaintenanceResult = { ...test.value, status: "incomplete", phases: test.value.phases.map((phase, index) => index === 0 ? { ...phase, metrics: [{ key: "expired_requests", value: 1 }] } : index === 1 ? { ...phase, status: "not_configured", reason: "configuration_unavailable", metrics: [], hasRemainingWork: true } : phase) };
    test.execute.mockResolvedValueOnce(partial);
    const response = await test.handler(test.request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("incomplete");
    expect(body.phases).toHaveLength(7);
    expect(body.phases[0]).toMatchObject({ metrics: [{ key: "expired_requests", value: 1 }] });
    expect(body.phases[1]).toMatchObject({ status: "not_configured" });
  });

  it("should answer a budget-only incomplete run with confirmed progress as a successful bounded invocation", async () => {
    const test = fixture();
    const partial: AdmissionMessagingMaintenanceResult = { ...test.value, status: "incomplete", deadlineReached: true, phases: test.value.phases.map((phase, index) => index === 4 ? { ...phase, status: "deferred", reason: "deadline_reached", hasRemainingWork: true } : index > 4 ? { ...phase, status: "not_run", reason: "deadline_reached", metrics: [], startedAtMilliseconds: null, durationMilliseconds: null, observation: "not_run" } : phase) };
    test.execute.mockResolvedValueOnce(partial);
    const response = await test.handler(test.request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "incomplete", message: "El mantenimiento conservó sus avances y tiene pasos pendientes." });
  });

  it("should reject private extra fields without exposing rejected values or raw causes", async () => {
    const test = fixture(), privateValue = randomUUID();
    test.execute.mockResolvedValueOnce(Object.assign({}, test.value, { credential: privateValue }));
    const response = await test.handler(test.request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(privateValue);
    expect(JSON.stringify(test.diagnostics)).not.toContain(privateValue);
  });

  it("should reject a duplicate phase instead of hiding a missing owner behind seven result entries", async () => {
    const test = fixture();
    test.execute.mockResolvedValueOnce({ ...test.value, phases: test.value.phases.map(() => test.value.phases[0]) });
    expect((await test.handler(test.request())).status).toBe(503);
  });

  it("should reject healthy completion without a native success observation", async () => {
    const test = fixture();
    test.execute.mockResolvedValueOnce({ ...test.value, health: { ...test.value.health, lastSuccessfulRunAtMilliseconds: null } });
    expect((await test.handler(test.request())).status).toBe(503);
  });

  it("should withhold all results when the native bearer is revoked after the original operation", async () => {
    const test = fixture();
    test.execute.mockImplementationOnce(async () => { test.rotate(); return test.value; });
    const response = await test.handler(test.request());
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("phases");
    expect(test.execute).toHaveBeenCalledTimes(1);
  });

  it("should map a failed own operation without serializing its private message or cause", async () => {
    const test = fixture(), privateValue = randomUUID();
    test.create.mockRejectedValueOnce(new Error(privateValue, { cause: new Error(privateValue) }));
    const response = await test.handler(test.request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(privateValue);
    expect(JSON.stringify(test.diagnostics)).not.toContain(privateValue);
    expect(test.execute).not.toHaveBeenCalled();
  });
});
