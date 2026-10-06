/** Exercises current account/tribe/resource authority through admission-owned readers. */
import { describe, expect, it } from "vitest";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";

/** Creates only private domain facts and own mutable ports, never framework or auth mocks. */
function prepareAuthority() {
  const now = new Date("2026-10-06T12:00:00Z");
  const account: AuthenticatedAccount = { userId: "leader-a", normalizedEmail: "synthetic@example.test", session: { id: "session-a", expiresAt: new Date("2026-10-06T13:00:00Z") }, googleAccount: { id: "account-a", subject: "subject-a" }, identityEvidence: null, recentAuthentication: [] };
  const actor: AdmissionActorFacts = { userId: account.userId, tribeId: "tribe-a", role: "leader", status: "active" };
  const state = { account: account as AuthenticatedAccount | null, actor: actor as AdmissionActorFacts | null, now, resource: { id: "request-a", tribeId: "tribe-a", applicantUserId: "applicant-a" } as { id: string; tribeId: string; applicantUserId?: string } | null, resourceReads: 0, afterResource: () => undefined as void };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => state.account ? structuredClone(state.account) : null }, {
    getCurrentActor: async () => state.actor ? { ...state.actor } : null,
    getResource: async () => { state.resourceReads += 1; state.afterResource(); return state.resource ? { ...state.resource } : null; },
  }, () => state.now);
  const command = { tribeId: "tribe-a", action: "read_inbox" as const, requestId: "correlation-a" };
  return { state, resolver, command };
}

describe("current admission authority", () => {
  it("should resolve active leader or guardian review authority without provider credentials", async () => {
    const fixture = prepareAuthority();
    expect(await fixture.resolver.execute(fixture.command)).toMatchObject({ allowed: true, context: { userId: "leader-a", sessionId: "session-a", tribeId: "tribe-a", action: "read_inbox" } });
    if (!fixture.state.actor) throw new Error("Synthetic actor missing");
    fixture.state.actor.role = "guardian";
    expect(await fixture.resolver.execute(fixture.command)).toMatchObject({ allowed: true });
    expect(await fixture.resolver.execute({ ...fixture.command, action: "configure_policy" })).toMatchObject({ allowed: false, failure: { code: "permission_denied" } });
    expect(fixture.state.resourceReads).toBe(0);
  });

  it.each(["missing_account", "expired_session", "wrong_actor", "wrong_tribe", "blocked_member"] as const)("should close %s before looking up a private resource", async (change) => {
    const fixture = prepareAuthority();
    if (change === "missing_account") fixture.state.account = null;
    if (change === "expired_session" && fixture.state.account) fixture.state.account.session.expiresAt = fixture.state.now;
    if (change === "wrong_actor" && fixture.state.actor) fixture.state.actor.userId = "another-account";
    if (change === "wrong_tribe" && fixture.state.actor) fixture.state.actor.tribeId = "another-tribe";
    if (change === "blocked_member" && fixture.state.actor) fixture.state.actor.status = "blocked";
    expect(await fixture.resolver.execute({ ...fixture.command, action: "decide_request", resource: { kind: "admission_request", id: "request-a" } })).toMatchObject({ allowed: false });
    expect(fixture.state.resourceReads).toBe(0);
  });

  it("should allow an authenticated nonmember to read only their own preadmission request", async () => {
    const fixture = prepareAuthority();
    fixture.state.actor = { userId: "leader-a", tribeId: "tribe-a", role: null, status: null };
    fixture.state.resource = { id: "request-a", tribeId: "tribe-a", applicantUserId: "leader-a" };
    const command = { ...fixture.command, action: "read_own_request" as const, resource: { kind: "admission_request" as const, id: "request-a" } };
    expect(await fixture.resolver.execute(command)).toMatchObject({ allowed: true });
    fixture.state.resource.applicantUserId = "another-account";
    expect(await fixture.resolver.execute(command)).toMatchObject({ allowed: false, failure: { code: "permission_denied" } });
  });

  it.each(["crossed_resource", "missing_resource", "self_decision", "lost_role", "session_changed", "expired_during_read"] as const)("should recheck scope and current authority for %s", async (change) => {
    const fixture = prepareAuthority();
    if (change === "crossed_resource" && fixture.state.resource) fixture.state.resource.tribeId = "another-tribe";
    if (change === "missing_resource") fixture.state.resource = null;
    if (change === "self_decision" && fixture.state.resource) fixture.state.resource.applicantUserId = "leader-a";
    fixture.state.afterResource = () => {
      if (change === "lost_role" && fixture.state.actor) fixture.state.actor.role = "tribemate";
      if (change === "session_changed" && fixture.state.account) fixture.state.account.session.id = "session-b";
      if (change === "expired_during_read") fixture.state.now = new Date("2026-10-06T13:00:00Z");
    };
    expect(await fixture.resolver.execute({ ...fixture.command, action: "decide_request", resource: { kind: "admission_request", id: "request-a" } })).toMatchObject({ allowed: false });
  });

  it("should require exact current global recency for a sensitive leader operation", async () => {
    const fixture = prepareAuthority();
    const command = { ...fixture.command, action: "configure_policy" as const, sensitiveOperation: "update_admission_policy" as const };
    expect(await fixture.resolver.execute(command)).toMatchObject({ allowed: false, failure: { code: "reauthentication_required" } });
    if (!fixture.state.account) throw new Error("Synthetic account missing");
    fixture.state.account.recentAuthentication = [{ id: "recent-a", intentId: "intent-a", userId: "leader-a", sessionId: "session-a", accountId: "account-a", subject: "subject-a", tribeId: "tribe-a", operation: "update_admission_policy", resourceId: "tribe-a", authenticatedAt: fixture.state.now, verifiedAt: fixture.state.now, validUntil: new Date("2026-10-06T12:10:00Z"), invalidatedAt: null }];
    expect(await fixture.resolver.execute(command)).toMatchObject({ allowed: true, context: { authenticatedAt: fixture.state.now } });
    expect(await fixture.resolver.execute({ ...command, sensitiveOperation: "activate_admission_policy" })).toMatchObject({ allowed: false, failure: { code: "reauthentication_required" } });
  });

  it("should reject missing sensitive scope or unrelated action/resource before private lookup", async () => {
    const fixture = prepareAuthority();
    expect(await fixture.resolver.execute({ ...fixture.command, action: "configure_policy" })).toMatchObject({ allowed: false, failure: { code: "reauthentication_required" } });
    expect(await fixture.resolver.execute({ ...fixture.command, action: "configure_policy", sensitiveOperation: "update_admission_policy", resource: { kind: "admission_request", id: "request-a" } })).toMatchObject({ allowed: false, failure: { code: "invalid_input" } });
    expect(await fixture.resolver.execute({ ...fixture.command, action: "read_own_request", resource: { kind: "allowlist_entry", id: "entry-a" } })).toMatchObject({ allowed: false, failure: { code: "invalid_input" } });
    expect(fixture.state.resourceReads).toBe(0);
  });

  it("should permit ordinary leader list reads while requiring current recency for the corresponding writer", async () => {
    const fixture = prepareAuthority();
    expect(await fixture.resolver.execute({ ...fixture.command, action: "manage_allowlist" })).toMatchObject({ allowed: true });
    expect(await fixture.resolver.execute({ ...fixture.command, action: "manage_allowlist", sensitiveOperation: "create_allowlist_entry" })).toMatchObject({ allowed: false, failure: { code: "reauthentication_required" } });
  });
});
