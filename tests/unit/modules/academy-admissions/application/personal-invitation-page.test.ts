/** @vitest-environment node */
/** Exercises real personal SSR input/DTO guards through own native identity and preview ports. @module personal-invitation-page-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { GetPersonalInvitationOverviewUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-personal-invitation-overview-use-case";
import { GetPersonalInvitationPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-personal-invitation-page-use-case";
import { personalInvitationPageStateSchema } from "@/src/modules/academy-admissions/application/results/personal-invitation-page-state";
import { loadPersonalInvitationPageState } from "@/src/modules/academy-admissions/infrastructure/composition/personal-invitation-page";

/** @returns Controlled own ports and a canonical opaque proposal, without replacing SDK/database/schema libraries. */
function fixture() {
  const now = new Date("2026-10-09T18:00:00Z"), token = randomBytes(32).toString("base64url");
  const account: AuthenticatedAccount = { userId: randomUUID(), normalizedEmail: "synthetic@example.test", session: { id: randomUUID(), expiresAt: new Date("2026-10-10T18:00:00Z") }, googleAccount: null, identityEvidence: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const preview = { execute: vi.fn<GetPersonalInvitationOverviewUseCase["execute"]>(async () => ({ ok: true, value: { state: "available", requiresAllowlist: false, expectedOutcome: "pending", overview: { tribe: { slug: "synthetic-personal", name: "Academia sintética", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, isOpen: true, version: 1 }, state: "available", nextAction: "request_admission", safeMessage: "Al confirmar, enviarás una solicitud que deberá revisar el equipo de la academia." } } })) };
  const page = new GetPersonalInvitationPageUseCase(accounts, preview, () => now);
  return { now, token, account, accounts, preview, page, query: { token, requestId: randomUUID() } };
}

describe("personal invitation SSR page", () => {
  it("should expose the safe preview and native viewer scope without token, account contact or session", async () => {
    const data = fixture(), result = await data.page.execute(data.query);
    expect(result).toMatchObject({ ok: true, value: { kind: "ready", viewerId: data.account.userId, renderedAt: data.now.toISOString(), preview: { state: "available", expectedOutcome: "pending" } } });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(data.token);
    expect(serialized).not.toContain(data.account.normalizedEmail);
    expect(serialized).not.toContain(data.account.session.id);
    expect(data.preview.execute).toHaveBeenCalledExactlyOnceWith(data.query, data.account);
  });

  it("should reject a transient different preview account even when surrounding page reads return to the first account", async () => {
    const data = fixture(), other = { ...data.account, userId: randomUUID(), normalizedEmail: "other@example.test", session: { ...data.account.session, id: randomUUID() } };
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce(other).mockResolvedValueOnce(other).mockResolvedValue(data.account);
    const reader = { readOverview: vi.fn(async () => null) };
    const preview = new GetPersonalInvitationOverviewUseCase(data.accounts, reader, () => data.now);
    const page = new GetPersonalInvitationPageUseCase(data.accounts, preview, () => data.now);
    expect(await page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(reader.readOverview).not.toHaveBeenCalled();
  });

  it("should preserve the original application failure cause privately", async () => {
    const data = fixture(), cause = new Error("Synthetic private failure");
    data.preview.execute.mockResolvedValue({ ok: false, failure: { code: "unexpected_failure", cause } });
    const result = await data.page.execute(data.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "unexpected_failure" } });
    if (result.ok) throw new Error("Expected a native preview failure");
    expect(result.failure.cause).toBe(cause);
  });

  it("should keep an anonymous visit generic without inventing a viewer or restoring consent", async () => {
    const data = fixture();
    data.accounts.getAuthenticatedAccount.mockResolvedValue(null);
    data.preview.execute.mockResolvedValue({ ok: true, value: { state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." } });
    expect(await data.page.execute(data.query)).toEqual({ ok: true, value: { kind: "ready", preview: { state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." }, viewerId: null, renderedAt: data.now.toISOString() } });
  });

  it.each(["account", "session", "contact", "expired", "signed_out"])("should discard the preview when native identity becomes %s after reading", async (change) => {
    const data = fixture();
    const changed = change === "signed_out" ? null : { ...data.account, ...(change === "account" ? { userId: randomUUID() } : {}), ...(change === "contact" ? { normalizedEmail: "changed@example.test" } : {}), session: { ...data.account.session, ...(change === "session" ? { id: randomUUID() } : {}), ...(change === "expired" ? { expiresAt: data.now } : {}) } };
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce(changed);
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });

  it("should reject a login racing an anonymous read before exposing the resulting private preview", async () => {
    const data = fixture();
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(null).mockResolvedValueOnce(data.account);
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
  });

  it("should reject a private field added to the public preview and inconsistent anonymous viewer states", async () => {
    const data = fixture();
    const preview = (await data.preview.execute(data.query));
    if (!preview.ok) throw new Error("Synthetic preview must be available");
    const malformed = { ok: true as const, value: { ...preview.value, token: data.token } };
    data.preview.execute.mockResolvedValue(malformed);
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: "public_contract_unusable" } });
    expect(personalInvitationPageStateSchema.safeParse({ kind: "ready", preview: { state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." }, viewerId: data.account.userId, renderedAt: data.now.toISOString() }).success).toBe(false);
  });

  it("should reject malformed or authority-bearing page input before opening native composition", async () => {
    const data = fixture(), open = vi.fn();
    for (const input of [{ params: { token: "invalid" }, query: {} }, { params: { token: data.token }, query: { proofId: randomUUID() } }, { params: { token: data.token, userId: data.account.userId }, query: {} }]) {
      expect(await loadPersonalInvitationPageState(input, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("should map native application failure safely without serializing the token or its private cause", async () => {
    const data = fixture();
    data.preview.execute.mockResolvedValue({ ok: false, failure: { code: "authentication_required", cause: new Error(data.token) } });
    const state = await loadPersonalInvitationPageState({ params: { token: data.token }, query: {} }, async () => ({ page: data.page }));
    expect(state).toMatchObject({ kind: "unavailable", code: "authentication_required" });
    expect(JSON.stringify(state)).not.toContain(data.token);
  });

  it("should load a canonical proposal through the real page input and DTO boundary", async () => {
    const data = fixture();
    expect(await loadPersonalInvitationPageState({ params: { token: data.token }, query: {} }, async () => ({ page: data.page }))).toMatchObject({ kind: "ready", viewerId: data.account.userId });
  });
});
