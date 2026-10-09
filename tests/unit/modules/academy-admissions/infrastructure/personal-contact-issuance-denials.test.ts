/** @vitest-environment node */
/** Keeps closed personal eligibility proposals from creating code, budget or contact effects. @module personal-contact-issuance-denials-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal code denials", () => {
  it("should reject an invalid token, another destination and a revoked original before creating a new code, usage event, binding or request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, operations, invitationId, input } = await preparePersonalContactIssuance(database);
      await expect(operations.issue({ ...input, operationId: randomUUID(), source: { kind: "personal", token: randomUUID() } })).rejects.toMatchObject({ code: "invitation_unavailable" });
      await expect(operations.issue({ ...input, operationId: randomUUID(), contact: { type: "email", value: "another.recipient@example.test" } })).rejects.toMatchObject({ code: "invalid_input" });
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_personal_invitations set status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=${invitationId}`));
      await expect(operations.issue({ ...input, operationId: randomUUID() })).rejects.toMatchObject({ code: "invitation_unavailable" });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select (select count(*)::int from public.contact_verification_challenges where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}) as challenges,(select count(*)::int from public.messaging_usage_events where tribe_id=${fixture.context.tribeId} and actor_user_id=${fixture.context.userId} and event_type='code_request') as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId} and owner_user_id=${fixture.context.userId}) as bindings,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}) as admissions`)).rows).toEqual([{ challenges: 0, requests: 0, bindings: 0, admissions: 0 }]);
      });
    });
  }, 1_200_000);
});
