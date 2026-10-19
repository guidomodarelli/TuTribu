/** @vitest-environment node */
/** Exercises safe SSR projection through actual inward use cases and the canonical current-role resolver. @module admission-notification-settings-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { AdmissionActorFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import { GetAdmissionNotificationSettingsPageUseCase } from "@/src/modules/notifications/application/use-cases/get-admission-notification-settings-page-use-case";
import { AdmissionNotificationPreferencesUseCases } from "@/src/modules/notifications/application/use-cases/admission-notification-preferences-use-cases";
import { AdmissionNotificationEmailSettingsUseCases } from "@/src/modules/notifications/application/use-cases/admission-notification-email-settings-use-cases";
import type { AdmissionNotificationPreferenceRepository } from "@/src/modules/notifications/domain/repositories/admission-notification-preference-repository";
import type { AdmissionNotificationEmailSettingsRepository } from "@/src/modules/notifications/domain/repositories/admission-notification-email-settings-repository";
import { resolveAdmissionNotificationPreference } from "@/src/modules/notifications/domain/policies/admission-notification-preference";

/** @returns Real authority/use-case composition with doubles only at owned storage ports, without provider or auth SDK mocks. */
function fixture() {
  const now = new Date("2026-10-15T20:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  let account: AuthenticatedAccount | null = { userId, normalizedEmail: "reviewer@example.invalid", session: { id: randomUUID(), expiresAt: new Date("2026-10-15T21:00:00Z") }, googleAccount: null, identityEvidence: null};
  const accounts = { getAuthenticatedAccount: async () => account };
  const actor: AdmissionActorFacts = { userId, tribeId, role: "leader", status: "active" };
  const resolver = new ResolveAdmissionContextUseCase(accounts, { getCurrentActor: async () => actor, getResource: async () => null }, () => now);
  const preference: AdmissionNotificationPreferenceRepository = { getOwn: vi.fn(async () => resolveAdmissionNotificationPreference({ tribeId, recipientUserId: userId, currentRole: actor.role, membershipStatus: actor.status }, null)), changeOwn: vi.fn(async () => { throw new Error("Read-only page cannot write preferences"); }) };
  const settings = { tribeId, enabled: false, version: 0, enabledAtMicroseconds: null, timeZone: "America/Argentina/Buenos_Aires" };
  const email: AdmissionNotificationEmailSettingsRepository = { get: vi.fn(async () => settings), change: vi.fn(async () => { throw new Error("Read-only page cannot write email settings"); }) };
  const resolveTribe = new ResolveAdmissionTribeUseCase({ readIdentity: async () => ({ id: tribeId, slug: "test" }) });
  const preferences = new AdmissionNotificationPreferencesUseCases(resolver, preference), emailSettings = new AdmissionNotificationEmailSettingsUseCases(resolver, email);
  const page = new GetAdmissionNotificationSettingsPageUseCase(accounts, { resolveTribe, preferences, email: emailSettings }, () => now);
  return { page, actor, accounts, settings, preference, email, query: { slug: "test", requestId: randomUUID() }, userId, tribeId, getAccount: () => account!, setAccount: (value: AuthenticatedAccount | null) => { account = value; } };
}

describe("current admission notification settings page", () => {
  it("should render minimal leader defaults without initializing settings or exposing identity evidence", async () => {
    const data = fixture();

    const result = await data.page.execute(data.query);

    expect(result).toEqual({ ok: true, value: { kind: "ready", slug: "test", tribeId: data.tribeId, viewerId: data.userId, preference: { mode: "grouped", version: 0, source: "implicit" }, canConfigureEmail: true, email: { enabled: false, version: 0, timeZone: "America/Argentina/Buenos_Aires" } } });
    expect(data.preference.changeOwn).not.toHaveBeenCalled();
    expect(data.email.change).not.toHaveBeenCalled();
  });

  it("should render a guardian's own omitted default without reading leader-only email settings", async () => {
    const data = fixture(); data.actor.role = "guardian";

    expect(await data.page.execute(data.query)).toMatchObject({ ok: true, value: { preference: { mode: "omitted", version: 0 }, canConfigureEmail: false, email: null } });
    expect(data.email.get).not.toHaveBeenCalled();
  });

  it.each([{ role: "guardian", status: "muted" }, { role: "tribemate", status: "active" }] as const)("should deny the page before storage for $status $role", async ({ role, status }) => {
    const data = fixture(); Object.assign(data.actor, { role, status });

    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.preference.getOwn).not.toHaveBeenCalled(); expect(data.email.get).not.toHaveBeenCalled();
  });

  it("should reauthorize email instead of treating the earlier leader hint as authority", async () => {
    const data = fixture();
    vi.mocked(data.preference.getOwn).mockImplementationOnce(async () => { const result = resolveAdmissionNotificationPreference({ tribeId: data.tribeId, recipientUserId: data.userId, currentRole: data.actor.role, membershipStatus: data.actor.status }, null); data.actor.role = "guardian"; return result; });

    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(data.email.get).not.toHaveBeenCalled();
  });

  it.each(["user", "session", "expiry"] as const)("should discard private props when current %s changes during the reads", async (changed) => {
    const data = fixture();
    vi.mocked(data.email.get).mockImplementationOnce(async () => {
      const account = data.getAccount();
      data.setAccount({ ...account, ...(changed === "user" ? { userId: randomUUID() } : {}), session: { ...account.session, ...(changed === "session" ? { id: randomUUID() } : {}), ...(changed === "expiry" ? { expiresAt: new Date("2026-10-15T19:00:00Z") } : {}) } });
      return data.settings;
    });

    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });

  it("should close a foreign email scope before projecting it as current settings", async () => {
    const data = fixture(); vi.mocked(data.email.get).mockResolvedValue({ ...data.settings, tribeId: randomUUID() });
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
  });

  it("should require a live account before resolving the private page", async () => {
    const data = fixture(); data.setAccount(null);
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(data.preference.getOwn).not.toHaveBeenCalled(); expect(data.email.get).not.toHaveBeenCalled();
  });
});
