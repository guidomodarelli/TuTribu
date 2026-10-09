/** @vitest-environment node */
/** Closes personal resend after actual invitation key retirement while code/account budgets and platform crypto stay real. @module personal-contact-key-retirement-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { advanceVerificationRequestCooldown } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal resend key retirement", () => {
  it("should refuse a fresh resend after only the invitation key is retired without creating another code or changing the original result", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, invitationId, input } = await preparePersonalContactIssuance(database);
      let security: MessagingSecurityConfig = fixture.fixture.config;
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => security);
      const issued = await operations.issue(input);
      if (issued.state !== "completed") throw new Error("Expected native personal code before token key retirement");
      await advanceVerificationRequestCooldown(database, fixture.fixture);
      const successorId = randomUUID(), successor = await crypto.subtle.importKey("raw", new Uint8Array(randomBytes(MESSAGING_CRYPTO.keyBytes)), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
      security = { ...security, keyrings: { ...security.keyrings, invitation_token: { ...security.keyrings.invitation_token, activeKeyId: successorId, keys: new Map([[successorId, successor]]) } } };
      await expect(operations.resend({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId })).rejects.toMatchObject({ code: "invitation_unavailable" });
      expect(await operations.issue(input)).toMatchObject({ state: "completed", replayed: true, result: issued.result });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.contact_verification_challenges where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
      });
    });
  }, 1_200_000);
});
