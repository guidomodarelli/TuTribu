/** @vitest-environment node */
/** Exercises actual selected-version readiness without reading credentials or issuing a provider request. @module admission-verification-readiness-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAdmissionPolicyPreparationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-preparation-reader";
import { createDefaultAdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";

describe.skipIf(process.env.ACADEMY_ADMISSION_SQL_TESTS !== "1")("native tested admission readiness", () => {
  it.each(["credential-key", "security-epoch"])("should close policy preparation when %s changes between readiness and its final local security read", async (change) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database), tribeId = fixture.scope.tribeId;
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));
      const retired = change === "security-epoch" ? { ...fixture.config, securityEpoch: "different-epoch" }
        : { ...fixture.config, keyrings: { ...fixture.config.keyrings, credential: { ...fixture.config.keyrings.credential, keys: new Map() } } };
      let reads = 0;
      const readSecurity = async () => ++reads === 1 ? fixture.config : retired;
      const preparation = await database.withContext(fixture.own, async (transaction) => {
        const readiness = new PostgresAdmissionVerificationReadinessReader(transaction, async (_database, requestedTribeId) => requestedTribeId === tribeId, readSecurity);
        return new PostgresAdmissionPolicyPreparationReader(transaction, { isPrepared: async () => true }, { readForTribe: async () => null }, readiness, readSecurity).read({ ...createDefaultAdmissionPolicy({ id: tribeId, tribeId }), requiresAdditionalVerification: true, messagingConnectionId: fixture.scope.connectionId, messagingConnectionVersion: 1 });
      });
      expect(reads).toBe(2);
      expect(preparation).toMatchObject({ recoveryLocked: false, preflightComplete: true, configuration: { channelPrepared: false, verificationQuotaPositive: true } });
      expect(preparation.configuration).not.toHaveProperty("securityScope");
    });
  }, 240_000);

  it("should require the exact selected prepared version, current credential key and positive configured quota", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database), scope = { tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, connectionVersion: 1, channel: "email" as const, requiresSmsAlternative: false };
      let current: MessagingSecurityConfig = fixture.config;
      const read = (override = {}) => database.withContext(fixture.own, async (transaction) => {
        const reader = new PostgresAdmissionVerificationReadinessReader(transaction, async (_database, tribeId) => tribeId === scope.tribeId, async () => current);
        return reader.read({ ...scope, ...override });
      });
      expect(await read()).toMatchObject({ channelPrepared: true, smsAlternativePrepared: false, verificationQuotaPositive: true, securityScope: { environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch, credentialKeyId: fixture.config.keyrings.credential.activeKeyId } });
      expect(await read({ connectionVersion: 2 })).toMatchObject({ channelPrepared: false });
      expect(await read({ connectionId: null, connectionVersion: null })).toMatchObject({ channelPrepared: false });
      current = { ...fixture.config, environment: "different-environment" };
      expect(await read()).toMatchObject({ channelPrepared: false });
      current = { ...fixture.config, keyrings: { ...fixture.config.keyrings, credential: { ...fixture.config.keyrings[MESSAGING_KEY_PURPOSE.credential], keys: new Map() } } };
      expect(await read()).toMatchObject({ channelPrepared: false });
      current = fixture.config;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${scope.tribeId}`));
      expect(await read()).toMatchObject({ channelPrepared: true, smsAlternativePrepared: false, verificationQuotaPositive: false });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='unprepared',tested_at=null where connection_id=${scope.connectionId}`));
      expect(await read()).toMatchObject({ channelPrepared: false });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as deliveries from public.message_deliveries where tribe_id=${scope.tribeId}`)).rows)).toEqual([{ deliveries: 0 }]);
    });
  }, 240_000);

  it("should check each exact phone sender/template independently and close readiness after owner revocation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database, "admission", true), scope = { tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, connectionVersion: 1, channel: "whatsapp" as const, requiresSmsAlternative: true };
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${scope.tribeId},${scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','different-template','es','prepared',clock_timestamp(),clock_timestamp())`));
      let permitted = true;
      const read = () => database.withContext(fixture.own, (transaction) => new PostgresAdmissionVerificationReadinessReader(transaction, async () => permitted, async () => fixture.config).read(scope));
      expect(await read()).toMatchObject({ channelPrepared: false, smsAlternativePrepared: true, verificationQuotaPositive: true });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set template_id='synthetic-otp-template' where connection_id=${scope.connectionId} and channel='whatsapp'`));
      expect(await read()).toMatchObject({ channelPrepared: true, smsAlternativePrepared: true, verificationQuotaPositive: true });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set sender_id='different-sender' where connection_id=${scope.connectionId} and channel='sms'`));
      expect(await read()).toMatchObject({ channelPrepared: true, smsAlternativePrepared: false });
      permitted = false;
      await expect(read()).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, 240_000);
});
