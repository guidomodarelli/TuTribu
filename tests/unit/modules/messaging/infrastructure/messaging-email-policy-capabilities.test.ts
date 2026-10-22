/** @vitest-environment node */
/** Exercises real selected email readiness and the admission activation rule without phone capabilities or provider RPC. @module messaging-email-policy-capabilities-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import { MESSAGING_PROVIDER_SUBSTITUTION_TEST_TIMEOUT_MS } from "@/tests/support/constants/messaging-provider-validation";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import { PostgresMessagingUsageRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-repository";
import { PostgresAdmissionPolicyPreparationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-preparation-reader";
import { AdmissionMessagingUsagePolicyReader } from "@/src/modules/academy-admissions/infrastructure/verification/messaging-usage-policy-reader";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import { proposeAdmissionPolicyActivation } from "@/src/modules/academy-admissions/domain/policies/admission-policy-activation";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createTenantRowsPreflight } from "@/tests/support/admission-tenant-rows-preflight";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native email-only policy capability", () => {
  it("should permit email readiness and deny verified phone activation when only the selected email resource is prepared", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given a real encrypted selected production-mode resource with only its email capability prepared.
      const fixture = await prepareContactVerificationIssuer(database), tribeId = fixture.scope.tribeId;
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR']::text[],version=version+1 where tribe_id=${tribeId}`);
      });
      /** @param transaction - Original policy transaction. @param requestedTribeId - Exact reader scope. @returns Current native canonical leadership, never a browser capability flag. */
      const authorize = async (transaction: RequestDatabase, requestedTribeId: string) => requestedTribeId === tribeId && Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=public.current_app_user_id() and role='leader' and status='active' for share`)).rows[0]);
      const base = createDefaultAdmissionPolicy({ id: randomUUID(), tribeId });

      for (const channel of ["email", "sms", "whatsapp"] as const) {
        const policy = { ...base, contactType: channel === "email" ? "email" as const : "phone" as const, phoneChannel: channel === "email" ? null : channel, requiresAdditionalVerification: true, messagingConnectionId: fixture.scope.connectionId, messagingConnectionVersion: 1 };

        // When actual SQL readers derive the requested channel's facts and the real activation rule consumes them.
        const outcome = await database.withContext(fixture.own, async (transaction) => {
          const readiness = new PostgresAdmissionVerificationReadinessReader(transaction, authorize, async () => fixture.config);
          const usage = new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, authorize));
          const preparation = await new PostgresAdmissionPolicyPreparationReader(createTenantRowsPreflight(transaction, (requestedTribeId) => requestedTribeId === tribeId), usage, readiness, async () => fixture.config).read(policy);
          const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
          expect(preparation).toMatchObject({ isAcademy: true, preflightComplete: true, evaluatorEnabled: true, recoveryLocked: false, configuration: { verificationQuotaPositive: true, usagePolicy: { allowedCountries: ["AR"] } } });
          const facts = { ...preparation, now };
          return { prepared: preparation.configuration.channelPrepared, verified: proposeAdmissionPolicyActivation(policy, policy.version, facts), unverified: proposeAdmissionPolicyActivation({ ...policy, requiresAdditionalVerification: false }, policy.version, facts) };
        });

        // Then a prepared email channel cannot be promoted into a phone capability, while manual unverified phone keeps its independent rule.
        expect(outcome.prepared).toBe(channel === "email");
        if (channel === "email") expect(outcome.verified).toMatchObject({ outcome: "changed" });
        else expect(outcome.verified).toMatchObject({ outcome: "invalid", reason: "verification_unavailable" });
        expect(outcome.unverified).toMatchObject({ outcome: "changed" });
      }
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.academy_admission_policies where tribe_id=${tribeId}) as policies`)).rows[0])).toEqual({ deliveries: 0, policies: 0 });
    });
  }, MESSAGING_PROVIDER_SUBSTITUTION_TEST_TIMEOUT_MS);
});
