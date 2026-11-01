/** @vitest-environment node */
/** Exercises the setup guide composition with the real rules page use cases and doubles only of owned ports. @module admission-setup-guide-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { loadAdmissionSetupGuideState } from "@/src/modules/academy-admissions/infrastructure/composition/admission-setup-guide-page";
import { GetAdmissionPolicyPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-page-use-case";
import { GetAdmissionPolicyUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-policy-use-case";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/**
 * @param platformSecurity - Platform security the rules read reports.
 * @returns Guide openers: the real rules page use cases over own ports, a preflight that reads missing settings as a recovery lock,
 * and messaging and notification pages that cannot be composed here (their facts stay unknown).
 */
function fixture(platformSecurity: PlatformSecurityRequirement | null) {
  const now = new Date("2026-10-07T09:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "synthetic-leader@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-08T09:00:00Z") }, googleAccount: null, identityEvidence: null };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const policy = new GetAdmissionPolicyUseCase(resolver, { read: async () => ({ policy: null, controlActivated: false, usage: null }) }, { read: async () => ({ pendingRequestCount: 0, preparation: null, platformSecurity }) });
  const resolveTribe = new ResolveAdmissionTribeUseCase({ readIdentity: async () => ({ id: tribeId, slug: "synthetic-academy" }) });
  const page = new GetAdmissionPolicyPageUseCase({ getAuthenticatedAccount: async () => account }, { policy, resolveTribe }, () => now);
  const preflight = { execute: vi.fn(async () => ({ ok: true as const, value: { prepared: false, reasons: ["preflight_policy_unavailable", "preflight_recovery_locked"] } })) };
  const unavailable = async (): Promise<never> => { throw new Error("Synthetic composition that this test does not need"); };
  return {
    input: { params: { slug: "synthetic-academy" }, query: {} },
    openers: { policy: async () => page, notifications: unavailable, messaging: unavailable, preflight: async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) }, preflight }) },
  };
}

describe("setup guide composition", () => {
  it("should replace every step action with one platform notice when the rules read names the platform security", async () => {
    const data = fixture("security_unconfigured");
    const guide = await loadAdmissionSetupGuideState(data.input, data.openers);
    expect(guide?.progress.platformSecurity).toEqual({ requirement: "security_unconfigured", rulesSaved: false });
    // The preflight reports the same missing settings as a recovery lock; the single notice already explains it.
    expect(guide?.progress.steps.find((step) => step.id === "open")).toEqual({ id: "open", status: "pending" });
    expect(guide?.progress.steps.find((step) => step.id === "rules")).toEqual({ id: "rules", status: "pending" });
  });

  it("should name the platform recovery lock from the rules read", async () => {
    const data = fixture("recovery_locked");
    expect((await loadAdmissionSetupGuideState(data.input, data.openers))?.progress.platformSecurity).toEqual({ requirement: "recovery_locked", rulesSaved: false });
  });

  it("should keep the opening step's own platform block when the rules read can protect writes", async () => {
    const data = fixture(null);
    const guide = await loadAdmissionSetupGuideState(data.input, data.openers);
    expect(guide?.progress.platformSecurity).toBeNull();
    expect(guide?.progress.steps.find((step) => step.id === "open")).toEqual({ id: "open", status: "pending", platformBlocked: true });
  });
});
