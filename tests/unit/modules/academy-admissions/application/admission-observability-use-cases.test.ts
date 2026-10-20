/** Tests the actual current-authority resolver around own projection ports without mocking auth or database libraries. @module admission-observability-use-cases-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { AdmissionCommandScope } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { GetAdmissionActivityAndMetricsUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-admission-activity-and-metrics-use-cases";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** @returns Mutable own domain facts and projection ports for revocation races; no SDK or platform is replaced. */
function prepareObservation() {
  const tribeId = randomUUID(), userId = randomUUID(), sessionId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: `synthetic.${userId}@example.test`, session: { id: sessionId, expiresAt: new Date("2026-10-14T14:00:00.000Z") }, googleAccount: null, identityEvidence: null};
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const state = { now: new Date("2026-10-14T13:00:00.000Z"), account, actor, scopes: [] as AdmissionCommandScope[], afterRead: () => undefined as void, projectedTribeId: tribeId, failure: null as Error | null };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => structuredClone(state.account) }, { getCurrentActor: async () => ({ ...state.actor }), getResource: async () => null }, () => state.now);
  /** @param scope - Actual native selection. @returns Nothing after a deliberate own-port race. */
  function observe(scope: AdmissionCommandScope) { state.scopes.push(scope); if (state.failure) throw state.failure; state.afterRead(); }
  const queries = new GetAdmissionActivityAndMetricsUseCases(resolver, {
    async readActivity(scope) { observe(scope); return { tribeId: state.projectedTribeId, items: [], nextCursor: null }; },
    async readMetrics(scope) {
      observe(scope);
      return { tribeId: state.projectedTribeId, asOf: "2026-10-14T13:00:00.000Z", requests: { pending: 0, approved: 0, rejected: 0, cancelled: 0, expired: 0, oldestPendingAgeMs: null }, reviews: { automatic: 0, manual: 0 }, verification: [],
        deliveries: { queued: 0, accepted: 0, delivered: 0, failed: 0, unknown: 0, suppressed: 0, cancelled: 0, inFlightLeases: 0, oldestQueuedAgeMs: null }, attempts: { inFlight: 0, accepted: 0, delivered: 0, rejected: 0, unknown: 0 },
        usage: { policyVersion: null, dayStartUtc: "2026-10-14T00:00:00.000Z", verificationToday: 0, notificationToday: 0 }, errors: [], lastSuccessfulRun: null, maintenance: null, durations: [] };
    },
  });
  const query = { tribeId, requestId: randomUUID(), limit: 1 };
  return { state, queries, query, userId, sessionId };
}

describe("current admission observation authority", () => {
  it.each(["activity", "metrics"] as const)("should bind %s to the actual account/session and keep empty histories explicit", async (surface) => {
    const fixture = prepareObservation();
    expect(await fixture.queries[surface](fixture.query)).toMatchObject({ ok: true, value: { tribeId: fixture.query.tribeId } });
    expect(fixture.state.scopes).toEqual([{ tribeId: fixture.query.tribeId, requestId: fixture.query.requestId, limit: 1, userId: fixture.userId, sessionId: fixture.sessionId }]);
  });
  it.each(["guardian", "nonmember", "blocked"] as const)("should deny %s before selecting private history or metrics", async (change) => {
    const fixture = prepareObservation();
    if (change === "guardian") fixture.state.actor.role = "guardian";
    if (change === "nonmember") { fixture.state.actor.role = null; fixture.state.actor.status = null; }
    if (change === "blocked") fixture.state.actor.status = "blocked";
    for (const surface of ["activity", "metrics"] as const) expect(await fixture.queries[surface](fixture.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(fixture.state.scopes).toHaveLength(0);
  });
  it.each(["activity", "metrics"] as const)("should withhold %s when leadership is lost during its projection", async (surface) => {
    const fixture = prepareObservation(); fixture.state.afterRead = () => { fixture.state.actor.role = "guardian"; };
    expect(await fixture.queries[surface](fixture.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(fixture.state.scopes).toHaveLength(1);
  });
  it.each(["session_changed", "account_changed", "session_expired"] as const)("should close %s after a projection instead of handing its data to another session", async (change) => {
    const fixture = prepareObservation();
    fixture.state.afterRead = () => {
      if (change === "session_changed") fixture.state.account.session.id = randomUUID();
      if (change === "account_changed") { fixture.state.account.userId = randomUUID(); fixture.state.actor.userId = fixture.state.account.userId; }
      if (change === "session_expired") fixture.state.now = fixture.state.account.session.expiresAt;
    };
    expect(await fixture.queries.activity(fixture.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });
  it.each(["activity", "metrics"] as const)("should reject a foreign %s projection before the public result", async (surface) => {
    const fixture = prepareObservation(); fixture.state.projectedTribeId = randomUUID();
    expect(await fixture.queries[surface](fixture.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });
  it("should keep a classified private failure separate from its public code", async () => {
    const fixture = prepareObservation(), privateCause = new Error(randomUUID());
    fixture.state.failure = new AdmissionOperationError(ADMISSION_ERROR_CODE.dependencyUnavailable, { cause: privateCause });
    const result = await fixture.queries.metrics(fixture.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "dependency_unavailable", cause: fixture.state.failure } });
  });
});
