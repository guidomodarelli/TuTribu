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
import { createDefaultAdmissionPolicy, type AdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { GetAdmissionNotificationSettingsPageUseCase } from "@/src/modules/notifications/application/use-cases/get-admission-notification-settings-page-use-case";
import { AdmissionNotificationPreferencesUseCases } from "@/src/modules/notifications/application/use-cases/admission-notification-preferences-use-cases";
import { AdmissionNotificationEmailSettingsUseCases } from "@/src/modules/notifications/application/use-cases/admission-notification-email-settings-use-cases";
import { resolveAdmissionNotificationPreference } from "@/src/modules/notifications/domain/policies/admission-notification-preference";
import type { AdmissionNotificationEmailSettingsCurrent } from "@/src/modules/notifications/domain/repositories/admission-notification-email-settings-repository";

/**
 * @param platformSecurity - Platform security the rules read reports.
 * @param savedPolicy - Rules the read returns, built for the fixture tribe (a policy shares its tribe id); none by default.
 * @returns Guide openers: the real rules page use cases over own ports, a preflight that reads missing settings as a recovery lock,
 * and messaging and notification pages that cannot be composed here (their facts stay unknown).
 */
function fixture(platformSecurity: PlatformSecurityRequirement | null, savedPolicy?: (tribeId: string) => AdmissionPolicy) {
  const now = new Date("2026-10-07T09:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  const account: AuthenticatedAccount = { userId, normalizedEmail: "synthetic-leader@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-08T09:00:00Z") }, googleAccount: null, identityEvidence: null };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase({ getAuthenticatedAccount: async () => account }, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const policy = new GetAdmissionPolicyUseCase(resolver, { read: async () => ({ policy: savedPolicy?.(tribeId) ?? null, controlActivated: false, usage: null }) }, { read: async () => ({ pendingRequestCount: 0, preparation: null, platformSecurity }) });
  const resolveTribe = new ResolveAdmissionTribeUseCase({ readIdentity: async () => ({ id: tribeId, slug: "synthetic-academy" }) });
  const page = new GetAdmissionPolicyPageUseCase({ getAuthenticatedAccount: async () => account }, { policy, resolveTribe }, () => now);
  const preflight = { execute: vi.fn(async () => ({ ok: true as const, value: { prepared: false, reasons: ["preflight_policy_unavailable", "preflight_recovery_locked"] } })) };
  const unavailable = async (): Promise<never> => { throw new Error("Synthetic composition that this test does not need"); };
  /**
   * @param current - What the email settings port reads for the leader, built for the fixture tribe.
   * @returns The real notices page use case over owned storage ports, so the guide reads the same email capability as that page.
   */
  const notices = (current: (tribeId: string) => AdmissionNotificationEmailSettingsCurrent) => {
    const preferences = new AdmissionNotificationPreferencesUseCases(resolver, { getOwn: async () => resolveAdmissionNotificationPreference({ tribeId, recipientUserId: userId, currentRole: actor.role, membershipStatus: actor.status }, null), changeOwn: async () => { throw new Error("The guide never writes preferences"); } });
    const email = new AdmissionNotificationEmailSettingsUseCases(resolver, { get: async () => current(tribeId), change: async () => { throw new Error("The guide never writes email settings"); } });
    return new GetAdmissionNotificationSettingsPageUseCase({ getAuthenticatedAccount: async () => account }, { resolveTribe, preferences, email }, () => now);
  };
  return {
    input: { params: { slug: "synthetic-academy" }, query: {} },
    openers: { policy: async () => page, notifications: unavailable, messaging: unavailable, preflight: async () => ({ resolveTribe: { execute: async () => ({ ok: true as const, value: { tribeId } }) }, preflight }) },
    notices,
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
    // Unread messaging and notices areas never block a step: the guide shows them as before.
    expect(guide?.progress.steps.find((step) => step.id === "connection")).toEqual({ id: "connection", status: "optional" });
    expect(guide?.progress.steps.find((step) => step.id === "notifications")).toEqual({ id: "notifications", status: "optional" });
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

  it("should keep messaging optional for a declared phone contact and require it only once the rules verify the phone with a code", async () => {
    const declared = fixture(null, (tribeId) => ({ ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), contactType: "phone" }));
    const declaredSteps = (await loadAdmissionSetupGuideState(declared.input, declared.openers))?.progress.steps;
    expect(declaredSteps?.find((step) => step.id === "connection")).toEqual({ id: "connection", status: "optional" });
    expect(declaredSteps?.find((step) => step.id === "usage")).toEqual({ id: "usage", status: "optional" });

    const verified = fixture(null, (tribeId) => ({ ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), contactType: "phone", requiresAdditionalVerification: true, phoneChannel: "sms" }));
    const verifiedSteps = (await loadAdmissionSetupGuideState(verified.input, verified.openers))?.progress.steps;
    expect(verifiedSteps?.find((step) => step.id === "connection")).toEqual({ id: "connection", status: "pending", messagingNeed: "codes" });
    expect(verifiedSteps?.find((step) => step.id === "usage")).toEqual({ id: "usage", status: "pending" });
  });

  it("should send the notices step to the connection exactly when the notices page reads no prepared email", async () => {
    const data = fixture(null);
    const settings = (tribeId: string) => ({ tribeId, enabled: false, version: 0, enabledAtMicroseconds: null, timeZone: "America/Argentina/Buenos_Aires" });
    const missing = await loadAdmissionSetupGuideState(data.input, { ...data.openers, notifications: async () => data.notices((tribeId) => ({ settings: settings(tribeId), platformRequirement: null, preparedEmailAvailable: false })) });
    expect(missing?.progress.steps.find((step) => step.id === "notifications")).toEqual({ id: "notifications", status: "optional", blockedBy: "connection" });

    const prepared = await loadAdmissionSetupGuideState(data.input, { ...data.openers, notifications: async () => data.notices((tribeId) => ({ settings: settings(tribeId), platformRequirement: null, preparedEmailAvailable: true })) });
    expect(prepared?.progress.steps.find((step) => step.id === "notifications")).toEqual({ id: "notifications", status: "optional" });
  });

  it("should list the required steps first and keep the optional ones after them", async () => {
    const data = fixture(null);
    const guide = await loadAdmissionSetupGuideState(data.input, data.openers);
    expect(guide?.progress.steps.map((step) => step.id)).toEqual(["rules", "open", "connection", "usage", "notifications"]);
    expect(guide?.progress).toMatchObject({ next: "rules", completed: 0, required: 2 });
  });
});
