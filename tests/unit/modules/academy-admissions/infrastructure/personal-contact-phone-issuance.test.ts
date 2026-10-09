/** @vitest-environment node */
/** Exercises actual SMS/phone personal issuance and local proof without converting it into redemption or global identity. @module personal-contact-phone-issuance-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal phone code", () => {
  it("should create only the permitted phone code and local proof with personal provenance, never membership or contact ownership", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, operations, invitationId, input } = await preparePersonalContactIssuance(database, true);
      const issued = await operations.issue(input);
      expect(issued).toMatchObject({ state: "completed", result: { channel: "sms", purpose: "admission" } });
      if (issued.state !== "completed") throw new Error("Expected native personal phone issuance");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      expect(await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code })).toMatchObject({ state: "completed", result: { result: "verified", purpose: "admission" } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select personal_invitation_id,personal_request_id,contact_type,state from public.contact_verification_challenges where id=${issued.result.challengeId}`)).rows).toEqual([{ personal_invitation_id: invitationId, personal_request_id: null, contact_type: "phone", state: "verified" }]);
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId} and owner_user_id=${fixture.context.userId}) as bindings,(select count(*)::int from public.tribe_members where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}) as members`)).rows).toEqual([{ requests: 0, bindings: 0, members: 0 }]);
      });
    });
  }, 1_200_000);
});
