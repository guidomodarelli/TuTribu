/** @vitest-environment node */
/** Exercises confirmed issuance denials through native account, owner and original ledger without transport or fabricated progress. @module admission-issuance-denial-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { ContactVerificationUseCases } from "@/src/modules/academy-admissions/application/use-cases/contact-verification-use-cases";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native original issuance denial", () => {
  it("should close a no-country denial in its exact original and replay it without dispatch or accounting", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      let dispatchCalls = 0;
      const useCases = new ContactVerificationUseCases(accounts, operations, { dispatch: async () => { dispatchCalls += 1; } }, () => new Date());
      const input = { tribeId: fixture.context.tribeId, requestId: fixture.context.requestId, operationId: fixture.input.operationId, expectedPolicyVersion: 2, confirmed: true as const, channel: "sms" as const, phone: "+5491155501234", country: "AR" };
      const first = await useCases.issue(input);
      const original = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select state,public_result from public.academy_admission_operations where tribe_id=${fixture.context.tribeId} and actor_user_id=${fixture.context.userId} and operation_type='issue_contact_challenge' and idempotency_key=${input.operationId}`));
      expect(original.rows[0]?.state).toBe("completed");
      expect(original.rows[0]?.public_result).toEqual({ purpose: "admission", result: "denied", code: "recipient_not_allowed" });
      expect(first).toMatchObject({ ok: false, failure: { code: "recipient_not_allowed", operation: { operationId: input.operationId, state: "completed" } } });
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`));
      expect(await useCases.issue(input)).toMatchObject({ ok: false, failure: { code: "recipient_not_allowed", operation: { operationId: input.operationId, state: "completed" } } });
      expect(dispatchCalls).toBe(0);
      expect(await fixture.counts()).toEqual({ challenges: 0, deliveries: 0, events: 0, operations: 1, proofs: 0, memberships: 0 });
    });
  }, 600_000);

  it("should roll back budget-subject staging on an exhausted request quota while closing only its ledger", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,channel,event_type,operation_id,occurred_at) select ${fixture.context.tribeId},${fixture.context.userId},'admission','sms','code_request',gen_random_uuid(),clock_timestamp()-interval '2 minutes' from generate_series(1,5)`);
      });
      const before = await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`select (select count(*)::int from public.messaging_contact_budget_subjects) as subjects,(select count(*)::int from public.messaging_contact_fingerprint_aliases) as aliases`));
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      await expect(operations.issue({ ...fixture.input, expectedPolicyVersion: 2 })).rejects.toMatchObject({ code: "usage_limit_reached", operationId: fixture.input.operationId, operationState: "completed" });
      const after = await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`select (select count(*)::int from public.messaging_contact_budget_subjects) as subjects,(select count(*)::int from public.messaging_contact_fingerprint_aliases) as aliases`));
      expect(after.rows).toEqual(before.rows);
      expect(await fixture.counts()).toEqual({ challenges: 0, deliveries: 0, events: 5, operations: 1, proofs: 0, memberships: 0 });
    });
  }, 600_000);
});
