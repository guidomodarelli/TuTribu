/** @vitest-environment node */
/** Exercises personal code issue/verify with actual budgets, crypto and persisted origin without consuming the link. @module personal-contact-issuance-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal contact issuance", () => {
  it("should retain a personal origin on a real new code and proof without redeeming the invitation or creating a request/binding", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, operations, invitationId, input } = await preparePersonalContactIssuance(database);
      const issued = await operations.issue(input);
      expect(issued).toMatchObject({state:"completed",replayed:false,result:{purpose:"admission",channel:"email"}});
      if(issued.state!=="completed")throw new Error("Expected native personal code issuance");
      expect(await operations.issue(input)).toMatchObject({state:"completed",replayed:true,result:issued.result});
      const scope={...fixture.fixture.scope,userId:fixture.context.userId,contact:fixture.input.contact,verificationEpoch:2};
      const code=await recoverTestVerificationCode(database,{...fixture.fixture,own:fixture.own,scope},issued.result.challengeId);
      expect(await operations.verify({...fixture.context,operationId:randomUUID(),challengeId:issued.result.challengeId,verificationCode:code.code})).toMatchObject({state:"completed",result:{result:"verified",proofId:expect.any(String)}});
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select personal_invitation_id,state from public.contact_verification_challenges where id=${issued.result.challengeId}`)).rows).toEqual([{personal_invitation_id:invitationId,state:"verified"}]);
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{status:"active",version:1,redeemed_request_id:null}]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId} and owner_user_id=${fixture.context.userId}) as bindings`)).rows).toEqual([{requests:0,bindings:0}]);
      });
      await expect(database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.contact_verification_challenges set personal_invitation_id=null where id=${issued.result.challengeId}`))).rejects.toMatchObject({cause:{code:"23514"}});
    });
  },1_200_000);
});
