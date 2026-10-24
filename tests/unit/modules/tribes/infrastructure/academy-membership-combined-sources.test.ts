/** @vitest-environment node */
/** Exercises both consumed membership sources and real administrative/conduct removal. @module academy-membership-combined-sources-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalPaidMembership } from "@/tests/support/personal-paid-membership-fixture";
import { createSubscriptionMembershipReconciliationRepository } from "@/tests/support/subscription-membership-reconciliation-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE } from "@/src/modules/subscriptions/constants/subscriptions";
import { buildAcademyAdmissionsModule, createAdmissionMembershipLifecycleWriter } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeMembershipLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-membership-lifecycle-repository";
import { ManageTribeMembershipUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-membership-use-cases";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native combined membership sources", () => {
  it.each([{ status: "active", action: "remove" }, { status: "active", action: "block" }, { status: "muted", action: "remove" }, { status: "muted", action: "block" }] as const)("should revoke basic and paid sources after real $action of an original $status instance without releasing its personal canje", async ({ status, action }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const scenario = await preparePersonalPaidMembership(database, async (resources) => {
        const input = { priceId: resources.priceId, tribeSlug: resources.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton };
        expect(await createSubscriptionMembershipReconciliationRepository(database, resources.owner, "authorized").reconcileProviderSubscribers(input)).toMatchObject({ status: "verified", verifiedCount: 1 });
        expect(await createSubscriptionMembershipReconciliationRepository(database, resources.owner, "cancelled").reconcileProviderSubscribers(input)).toMatchObject({ status: "verified", verifiedCount: 1 });
      }, status);
      const { fixture, recipient } = scenario;
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admission = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
      const approved = await admission.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: scenario.requestId, expectedVersion: 2, confirmed: true, decision: "approve", internalReason: "Fundamento básico vigente", externalMessage: null });
      expect(approved).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved" } } });
      /** @returns Original role/date, both real receipts and immutable personal attribution. */
      const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
        member: (await transaction.execute(sql`select id,role,status,created_at::text,admission_membership_effect_id,subscription_membership_effect_id from public.tribe_members where id=${scenario.originalMember.id}`)).rows[0],
        basic: (await transaction.execute(sql`select applied_at is not null as consumed,revoked_at is not null as revoked from public.academy_admission_membership_effects where request_id=${scenario.requestId}`)).rows,
        paid: (await transaction.execute(sql`select applied_at is not null as consumed,revoked_at is not null as revoked from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows,
        invitation: (await transaction.execute(sql`select status,redeemed_request_id,redeemed_by_user_id,redeemed_at::text from public.academy_personal_invitations where id=${scenario.invitationId}`)).rows[0],
        binding: (await transaction.execute(sql`select id,owner_user_id,first_request_id,first_proof_id,created_at::text from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}`)).rows[0],
      }));
      const before = await snapshot();
      expect(before.member).toMatchObject({ ...scenario.originalMember, status, admission_membership_effect_id: expect.any(String), subscription_membership_effect_id: expect.any(String) });
      expect(before.basic).toEqual([{ consumed: true, revoked: false }]);
      expect(before.paid).toEqual([{ consumed: true, revoked: false }]);
      const owner = new ManageTribeMembershipUseCases(accounts, new PostgresTribeMembershipLifecycleRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createAdmissionMembershipLifecycleWriter));
      const command = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), memberId: scenario.originalMember.id, action, expectedStatus: status, confirmed: true };
      expect(await owner.change(command)).toMatchObject({ state: "completed", result: { outcome: "changed" } });
      expect(await owner.change(command)).toMatchObject({ state: "completed", replayed: true });
      const closed = await snapshot();
      expect(closed.member).toMatchObject({ ...scenario.originalMember, status: action === "remove" ? "removed" : "blocked" });
      expect(closed.basic).toEqual([{ consumed: true, revoked: true }]);
      expect(closed.paid).toEqual([{ consumed: true, revoked: true }]);
      expect(closed.invitation).toEqual(before.invitation);
      expect(closed.binding).toEqual(before.binding);
      expect(await createSubscriptionMembershipReconciliationRepository(database, { userId: fixture.userId, email: null }, "authorized").reconcileProviderSubscribers({ priceId: scenario.priceId, tribeSlug: scenario.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton })).toMatchObject({ status: "verified", verifiedCount: 1 });
      expect(await recipient.commands.submit.execute({ ...scenario.submission, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await recipient.commands.submit.execute(scenario.submission)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      const final = await snapshot();
      expect(final).toEqual(closed);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${scenario.requestId}`)).rows).toEqual([{ status: "approved", version: 3 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_decisions where request_id=${scenario.requestId}`)).rows).toEqual([{ total: 1 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
