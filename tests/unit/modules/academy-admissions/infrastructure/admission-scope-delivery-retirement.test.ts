/** @vitest-environment node */
/** Exercises admission code retirement and original in-flight accounting on academy exit. @module admission-scope-delivery-retirement-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission delivery scope retirement", () => {
  it.each(["queued", "in_flight", "verified"] as const)("should retire code material while preserving original %s accounting after exit", async (stage) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql", "20261011223000_close_admission_scope_lifecycle.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.scope.tribeId},'academy',true)`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,mode,activated_at) values (${fixture.scope.tribeId},'manual_review',clock_timestamp())`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=(select activated_at from public.academy_admission_policies where tribe_id=${fixture.scope.tribeId}) where id=${fixture.scope.tribeId}`);
      });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select public.close_academy_admission_scope(${fixture.scope.tribeId},'academy_unavailable')`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      let proofId: string | null = null;
      if (stage === "verified") {
        const { code } = await recoverTestVerificationCode(database, fixture, fixture.original.challengeId);
        const verified = await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: fixture.original.challengeId, operationId: randomUUID(), code }));
        if (verified.outcome !== "verified" || !verified.proofId) throw new Error("Synthetic scope proof failed: actual verification unavailable");
        proofId = verified.proofId;
      }
      const verificationBefore = await database.withContext(fixture.own, async (transaction) => ({
        challenge: (await transaction.execute(sql`select state,is_current,code_mac is not null as usable from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows,
        envelopes: (await transaction.execute(sql`select count(*)::integer as total from public.verification_code_envelopes where challenge_id=${fixture.original.challengeId}`)).rows,
      }));
      /** @returns After the real settings trigger retires admission authority atomically. */
      const exit = () => database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.scope.tribeId} for update`);
        await transaction.execute(sql`update public.tribe_academy_settings set access_model='legacy',admission_enabled=false where tribe_id=${fixture.scope.tribeId}`);
      });
      await expect(database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.scope.tribeId} for update`);
        await transaction.execute(sql`update public.tribe_academy_settings set access_model='legacy',admission_enabled=false where tribe_id=${fixture.scope.tribeId}`);
        throw new Error("Synthetic scope retirement rollback");
      })).rejects.toThrow("Synthetic scope retirement rollback");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,is_current,code_mac is not null as usable from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual(verificationBefore.challenge);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.verification_code_envelopes where challenge_id=${fixture.original.challengeId}`)).rows).toEqual(verificationBefore.envelopes);
      });
      const providerId = randomUUID();
      const transport = createAdmissionProviderTransport(stage !== "in_flight" ? [] : [{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async () => {
        expect(fixture.transactions).toBe(0);
        const before = await fixture.snapshot();
        await exit();
        expect(await fixture.snapshot()).toEqual(before);
        return Response.json({ message: { id: providerId, direction: "outbound", channel: "email", status: "sent" } });
      } }]);
      if (stage !== "in_flight") {
        await exit();
        expect(await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 90 })).toEqual([]);
      } else {
        const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 90 }))[0];
        const authorized = await fixture.repository.authorize(claim, randomUUID());
        if (authorized.outcome !== "authorized") throw new Error("Synthetic scope receipt failed: original attempt unavailable");
        const receipt = await new ZavuMessageDeliverySender(fixture.preparation, transport.fetch).send(authorized.context, new AbortController().signal);
        expect(receipt).toMatchObject({ outcome: "accepted", providerMessageId: providerId });
        expect(await fixture.repository.complete({ context: authorized.context, ...receipt })).toMatchObject({ outcome: "completed" });
        expect(await fixture.repository.complete({ context: authorized.context, ...receipt })).toMatchObject({ outcome: "unchanged" });
      }
      expect(transport.receipts).toHaveLength(stage !== "in_flight" ? 0 : 1);
      expect(transport.deniedRequests).toBe(0);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,is_current,code_mac is null as retired,code_envelope_id is null as detached from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: stage === "verified" ? "verified" : "invalidated", is_current: false, retired: true, detached: true }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.verification_code_envelopes where challenge_id=${fixture.original.challengeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select state,connection_id,connection_version from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: stage !== "in_flight" ? "cancelled" : "accepted", connection_id: fixture.scope.connectionId, connection_version: 1 }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual(stage !== "in_flight" ? [] : [{ state: "consumed" }]);
        if (proofId) expect((await transaction.execute(sql`select status,invalidation_reason from public.academy_admission_verification_proofs where id=${proofId}`)).rows).toEqual([{ status: "invalid", invalidation_reason: "academy_unavailable" }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} and event_type='code_request'`)).rows).toEqual([{ total: 1 }]);
        await transaction.execute(sql`update public.tribe_academy_settings set access_model='academy',admission_enabled=true where tribe_id=${fixture.scope.tribeId}`);
        expect((await transaction.execute(sql`select is_current,code_mac is null as retired from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ is_current: false, retired: true }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
