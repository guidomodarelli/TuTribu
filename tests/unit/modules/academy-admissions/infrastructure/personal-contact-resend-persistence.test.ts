/** @vitest-environment node */
/** Verifies personal resend preserves its original resource and closes after revocation without resetting accounting. @module personal-contact-resend-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { advanceVerificationRequestCooldown } from "@/tests/support/contact-verification-issuance-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal code resend", () => {
  it("should retain personal origin on one replacement, replay without another code and refuse a new resend after current revocation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, operations, invitationId, input } = await preparePersonalContactIssuance(database);
      const issued = await operations.issue(input);
      if (issued.state !== "completed") throw new Error("Expected native initial personal code");
      await advanceVerificationRequestCooldown(database, fixture.fixture);
      const intent = { ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId }, replacement = await operations.resend(intent);
      expect(replacement).toMatchObject({ state: "completed", replayed: false });
      if (replacement.state !== "completed") throw new Error("Expected native personal replacement code");
      const replacementId = replacement.result.challengeId;
      expect(replacementId).not.toBe(issued.result.challengeId);
      expect(await operations.resend(intent)).toMatchObject({ state: "completed", replayed: true, result: replacement.result });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select personal_invitation_id,personal_request_id,is_current from public.contact_verification_challenges where id=${replacementId}`)).rows).toEqual([{ personal_invitation_id: invitationId, personal_request_id: null, is_current: true }]);
        expect((await transaction.execute(sql`select is_current from public.contact_verification_challenges where id=${issued.result.challengeId}`)).rows).toEqual([{ is_current: false }]);
        await transaction.execute(sql`update public.academy_personal_invitations set status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=${invitationId}`);
      });
      await expect(operations.resend({ ...intent, operationId: randomUUID(), challengeId: replacementId })).rejects.toMatchObject({ code: "invitation_unavailable" });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.contact_verification_challenges where user_id=${fixture.context.userId} and tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ count: 2 }]);
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "revoked", version: 2 }]);
      });
    });
  }, 1_200_000);
});
