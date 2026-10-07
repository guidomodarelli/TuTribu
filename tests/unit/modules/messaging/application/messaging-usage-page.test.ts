/** Exercises early usage SSR state through real current authority without connection/provider mocks. @module messaging-usage-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetMessagingUsagePageUseCase } from "@/src/modules/messaging/application/use-cases/get-messaging-usage-page-use-case";
import { ManageMessagingUsageUseCases } from "@/src/modules/messaging/application/use-cases/manage-messaging-usage-use-cases";
import { loadMessagingUsagePageState } from "@/src/modules/messaging/infrastructure/composition/messaging-usage-page";
import type { MessagingAuthenticatedAccount, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { getMessagingUsageCountryChoices } from "@/src/modules/messaging/infrastructure/composition/messaging-usage-country-choices";

/** Current identity and usage absence remain feature-owned ports; their authority checks and public schemas are real. */
function fixture() {
  const now = new Date("2026-10-07T12:00:00Z"), tribeId = randomUUID(), userId = randomUUID();
  const account: MessagingAuthenticatedAccount = { userId, session: { id: randomUUID(), expiresAt: new Date("2026-10-08T12:00:00Z") }, googleAccount: null, recentAuthentication: [] };
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<MessagingAuthenticatedAccount | null> => account) }, facts: MessagingLeadershipFacts = { tribeId, leaderUserId: userId, membership: { userId, role: "leader", status: "active" } };
  const read = vi.fn(async () => ({ state: "not_configured" as const, policy: null }));
  const usage = new ManageMessagingUsageUseCases({ getAuthenticatedAccount: async () => account }, { getCurrentLeadership: async () => facts }, { read, initialize: async () => { throw new Error("SSR must not initialize usage"); }, update: async () => { throw new Error("SSR must not update usage"); } }, () => now);
  const resolveTribe = { execute: async () => ({ ok: true as const, value: { tribeId } }) };
  const page = new GetMessagingUsagePageUseCase(accounts, { usage, resolveTribe }, () => now, getMessagingUsageCountryChoices());
  return { account, accounts, facts, read, page, tribeId, input: { params: { slug: "synthetic-academy" }, query: {} } };
}

describe("early usage SSR page", () => {
  it("should expose true absence and standard Spanish country choices without a session, key, capability claim or write", async () => {
    const data = fixture(), state = await loadMessagingUsagePageState(data.input, async () => data.page);
    expect(state).toMatchObject({ kind: "ready", slug: "synthetic-academy", tribeId: data.tribeId, viewerId: data.account.userId, usage: { state: "not_configured", policy: null } });
    if (state.kind === "ready") expect(state.countryChoices).toContainEqual({ value: "AR", label: "Argentina" });
    expect(state).not.toHaveProperty("session"); expect(state).not.toHaveProperty("googleAccount"); expect(state).not.toHaveProperty("providerCapabilities");
    expect(data.read).toHaveBeenCalledOnce();
  });
  it("should deny a guardian and contain a session change after read without private partial props", async () => {
    const data = fixture(); data.facts.membership!.role = "guardian";
    expect(await loadMessagingUsagePageState(data.input, async () => data.page)).toMatchObject({ kind: "unavailable", code: "permission_denied" });
    expect(data.read).not.toHaveBeenCalled();
    data.facts.membership!.role = "leader";
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce(null);
    expect(await loadMessagingUsagePageState(data.input, async () => data.page)).toMatchObject({ kind: "unavailable", code: "authentication_required" });
  });
  it("should reject invalid runtime input before composition and hide unexpected infrastructure diagnostics", async () => {
    const data = fixture(), open = vi.fn(async () => data.page);
    expect(await loadMessagingUsagePageState({ ...data.input, query: { prepared: "true" } }, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(open).not.toHaveBeenCalled();
    const failed = await loadMessagingUsagePageState(data.input, async () => { throw new Error("Synthetic private storage detail"); });
    expect(failed).toMatchObject({ kind: "unavailable", code: "unexpected_failure" });
    expect(JSON.stringify(failed)).not.toContain("Synthetic private");
  });
});
