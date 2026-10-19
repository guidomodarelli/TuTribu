/** @vitest-environment node */
/** Exercises the composed page with real own DTO guards and only its inward read ports. @module admission-activity-page-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GetAdmissionActivityPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-activity-page-use-case";
import type { ManageMessagingUsageUseCases } from "@/src/modules/messaging/application/use-cases/manage-messaging-usage-use-cases";
import type { GetAdmissionActivityAndMetricsUseCases } from "@/src/modules/academy-admissions/application/use-cases/get-admission-activity-and-metrics-use-cases";
import { createAdmissionActivityPageFixture } from "@/tests/support/admission-activity-page";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { admissionActivityReadyPageStateSchema } from "@/src/modules/academy-admissions/constants/admission-activity-page-schemas";
import { SECONDS_PER_DAY, MILLISECONDS_PER_SECOND } from "@/src/constants/time";

/** @returns A native-identity port and independent own readers without a writer or provider capability. */
function fixture() {
  const state = createAdmissionActivityPageFixture(), now = new Date(state.renderedAt);
  const account: AuthenticatedAccount = { userId: state.viewerId, normalizedEmail: `${randomUUID()}@example.test`, session: { id: randomUUID(), expiresAt: new Date(now.getTime() + SECONDS_PER_DAY * MILLISECONDS_PER_SECOND) }, googleAccount: null, identityEvidence: null};
  const accounts = { getAuthenticatedAccount: vi.fn(async (): Promise<AuthenticatedAccount | null> => account) };
  const readers = {
    resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId: state.tribeId } })) },
    usage: { read: vi.fn<ManageMessagingUsageUseCases["read"]>(async () => ({ ok: true as const, value: state.currentUsage, defaults: { allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200 } })) },
    observations: {
      metrics: vi.fn<GetAdmissionActivityAndMetricsUseCases["metrics"]>(async () => ({ ok: true as const, value: state.metrics })),
      activity: vi.fn<GetAdmissionActivityAndMetricsUseCases["activity"]>(async () => ({ ok: true as const, value: state.activity })),
    },
  };
  const page = new GetAdmissionActivityPageUseCase(accounts, readers, () => now);
  return { state, account, accounts, readers, page, query: { slug: state.slug, requestId: randomUUID(), filters: { limit: 25 } } };
}

describe("private admission activity page", () => {
  it("should retain current settings and historical versions as separate facts without inventing a write", async () => {
    const data = fixture(), result = await data.page.execute(data.query);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("The authorized own activity snapshot was rejected");
    expect(result.value.currentUsage.policy?.version).toBe(6);
    expect(result.value.activity.items[0].resourceVersion).toBe(2);
    expect(result.value.metrics.usage.verificationToday).toBe(8);
    expect(data.readers.usage.read).toHaveBeenCalledOnce();
    expect(data.readers.observations.metrics).toHaveBeenCalledOnce();
    expect(data.readers.observations.activity).toHaveBeenCalledOnce();
    expect(result.value).not.toHaveProperty("session");
    expect(result.value).not.toHaveProperty("normalizedEmail");
  });

  it("should preserve a legitimately different observed usage version rather than replace current configuration", async () => {
    const data = fixture();
    data.state.metrics.usage.policyVersion = 5;
    const result = await data.page.execute(data.query);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("A concurrent configuration observation was rejected");
    expect(result.value.metrics.usage.policyVersion).toBe(5);
    expect(result.value.currentUsage.policy?.version).toBe(6);
    expect(result.value.currentUsage.policy?.consumption.verificationToday).toBe(8);
  });

  it("should return no private partial snapshot when the native session changes after the reads", async () => {
    const data = fixture();
    data.accounts.getAuthenticatedAccount.mockResolvedValueOnce(data.account).mockResolvedValueOnce({ ...data.account, session: { ...data.account.session, id: randomUUID() } });
    expect(await data.page.execute(data.query)).toMatchObject({ ok: false, failure: { code: ADMISSION_ERROR_CODE.authenticationRequired } });
  });

  it("should stop on the current usage owner's denial without exposing aggregates or history", async () => {
    const data = fixture();
    data.readers.usage.read.mockResolvedValueOnce({ ok: false, failure: { code: "permission_denied" } });
    const result = await data.page.execute(data.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(result).not.toHaveProperty("value");
    expect(data.readers.observations.metrics).not.toHaveBeenCalled();
    expect(data.readers.observations.activity).not.toHaveBeenCalled();
  });

  it("should remove all partial private facts when authorization is lost during the final history read", async () => {
    const data = fixture();
    data.readers.observations.activity.mockResolvedValueOnce({ ok: false, failure: { code: "permission_denied" } });
    const result = await data.page.execute(data.query);
    expect(result).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    expect(result).not.toHaveProperty("value");
  });

  it("should reject foreign-tribe metrics and history in the own composite result", async () => {
    const data = fixture();
    data.state.metrics.tribeId = randomUUID();
    expect((await data.page.execute(data.query)).ok).toBe(false);
    expect(admissionActivityReadyPageStateSchema.safeParse(data.state).success).toBe(false);
    data.state.metrics.tribeId = data.state.tribeId;
    data.state.activity.tribeId = randomUUID();
    expect((await data.page.execute(data.query)).ok).toBe(false);
  });

  it("should retain microsecond pagination and bind resource selection to the native tribe", async () => {
    const data = fixture(), resourceId = randomUUID(), cursor = { at: "2026-10-13T12:00:00.000999Z", id: randomUUID() };
    const result = await data.page.execute({ ...data.query, filters: { limit: 10, resourceType: "messaging_usage_policy", resourceId, cursor } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("The bounded history selection was rejected");
    expect(result.value.selection).toMatchObject({ limit: 10, resourceId, cursor: `${cursor.at}|${cursor.id}` });
    expect(data.readers.observations.activity).toHaveBeenCalledWith(expect.objectContaining({ tribeId: data.state.tribeId, resourceType: "messaging_usage_policy", resourceId, cursor }));
  });
});
