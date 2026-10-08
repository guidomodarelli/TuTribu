/** Exercises server-owned admission verification intent and durable dispatch recovery through the feature's own ports. @module admission-contact-verification-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {ContactVerificationUseCases} from "@/src/modules/academy-admissions/application/use-cases/contact-verification-use-cases";
import type {AuthenticatedAccount} from "@/src/modules/auth/domain/entities/authenticated-account";
import {AdmissionOperationError} from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import {ADMISSION_ERROR_CODE} from "@/src/modules/academy-admissions/constants/admission-errors";
import type {AdmissionContactVerificationOperations} from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";

/** @returns Only feature-owned account, atomic operation and dispatcher doubles; normalization and session policy remain real. */
function verificationFixture(){
  const now=new Date(),operationId=randomUUID(),tribeId=randomUUID(),challengeId=randomUUID();
  const account:AuthenticatedAccount={userId:randomUUID(),normalizedEmail:" Person+code@Gmail.com ",session:{id:randomUUID(),expiresAt:new Date(now.getTime()+3_600_000)},googleAccount:{id:randomUUID(),subject:randomUUID()},identityEvidence:null,recentAuthentication:[]};
  const challenge={challengeId,purpose:"admission"as const,channel:"email"as const,maskedDestination:"p•••@gmail.com",expiresAt:new Date(now.getTime()+600_000).toISOString(),resendAllowedAt:new Date(now.getTime()+60_000).toISOString(),deliveryState:"queued"as const};
  const issued={state:"completed"as const,operationId,replayed:false,result:challenge};
  const verified={state:"completed"as const,operationId,replayed:false,result:{purpose:"admission"as const,result:"verified"as const,proofId:randomUUID(),applyBefore:new Date(now.getTime()+900_000).toISOString()}};
  const accounts={getAuthenticatedAccount:vi.fn(async():Promise<AuthenticatedAccount|null>=>account)},operations={issue:vi.fn<AdmissionContactVerificationOperations["issue"]>(async()=>issued),resend:vi.fn<AdmissionContactVerificationOperations["resend"]>(async()=>issued),verify:vi.fn<AdmissionContactVerificationOperations["verify"]>(async()=>verified)},dispatcher={dispatch:vi.fn(async()=>{})};
  const input={tribeId,requestId:randomUUID(),operationId,expectedPolicyVersion:3,confirmed:true as const,channel:"email"as const};
  return{now,account,challenge,issued,verified,accounts,operations,dispatcher,input,useCases:new ContactVerificationUseCases(accounts,operations,dispatcher,()=>now)};
}

describe("admission contact verification orchestration",()=>{
  it("should derive the current email and account before committing an explicit issuance and dispatch only its exact challenge",async()=>{
    const fixture=verificationFixture(),foreignId=randomUUID();
    const input={...fixture.input,email:"foreign@example.test",userId:foreignId,verified:true,apiKey:randomUUID(),connectionId:randomUUID(),purpose:"connection_diagnostic"};
    expect(await fixture.useCases.issue(input)).toEqual({ok:true,value:fixture.issued});
    expect(fixture.operations.issue).toHaveBeenCalledExactlyOnceWith({tribeId:fixture.input.tribeId,requestId:fixture.input.requestId,operationId:fixture.input.operationId,expectedPolicyVersion:3,confirmed:true,userId:fixture.account.userId,sessionId:fixture.account.session.id,contact:{type:"email",value:"person+code@gmail.com"},channel:"email",purpose:"admission",admissionRequestId:null,source:{kind:"common"}});
    expect(fixture.dispatcher.dispatch).toHaveBeenCalledExactlyOnceWith({userId:fixture.account.userId,sessionId:fixture.account.session.id,tribeId:fixture.input.tribeId,requestId:fixture.input.requestId,challengeId:fixture.challenge.challengeId});
    expect(fixture.operations.issue.mock.invocationCallOrder[0]).toBeLessThan(fixture.dispatcher.dispatch.mock.invocationCallOrder[0]);
  });
  it("should require a live native account for issue, verify and resend without another operation or transport",async()=>{
    const fixture=verificationFixture();fixture.accounts.getAuthenticatedAccount.mockResolvedValue(null);
    expect(await fixture.useCases.issue(fixture.input)).toMatchObject({ok:false,failure:{code:"authentication_required"}});
    expect(await fixture.useCases.verify({...fixture.input,challengeId:fixture.challenge.challengeId,verificationCode:"123456"})).toMatchObject({ok:false,failure:{code:"authentication_required"}});
    expect(await fixture.useCases.resend({...fixture.input,challengeId:fixture.challenge.challengeId})).toMatchObject({ok:false,failure:{code:"authentication_required"}});
    expect(fixture.operations.issue).not.toHaveBeenCalled();expect(fixture.operations.verify).not.toHaveBeenCalled();expect(fixture.operations.resend).not.toHaveBeenCalled();expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should sample session liveness after the awaited account lookup",async()=>{
    const fixture=verificationFixture();fixture.account.session.expiresAt=fixture.now;
    expect(await fixture.useCases.issue(fixture.input)).toMatchObject({ok:false,failure:{code:"authentication_required"}});expect(fixture.operations.issue).not.toHaveBeenCalled();
  });
  it("should normalize an unambiguous phone and retain the explicit SMS choice and original policy version",async()=>{
    const fixture=verificationFixture();fixture.operations.issue.mockResolvedValueOnce({...fixture.issued,result:{...fixture.challenge,channel:"sms",maskedDestination:"+54 ••• 1234"}});
    expect(await fixture.useCases.issue({...fixture.input,phone:"+54 9 11 5550 1234",country:"AR",channel:"sms"})).toMatchObject({ok:true,value:{result:{channel:"sms"}}});
    expect(fixture.operations.issue).toHaveBeenCalledWith(expect.objectContaining({contact:{type:"phone",value:"+5491155501234",country:"AR"},channel:"sms",expectedPolicyVersion:3,purpose:"admission"}));
  });
  it("should reject an issuance on another channel before dispatching despite a matching original operation and purpose",async()=>{
    const fixture=verificationFixture();
    expect(await fixture.useCases.issue({...fixture.input,phone:"+5491155501234",country:"AR",channel:"sms"})).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it.each([{phone:"1155501234",channel:"sms"as const},{phone:"+5491155501234",country:"US",channel:"whatsapp"as const},{country:"AR",channel:"email"as const},{phone:"+5491155501234",country:"AR",channel:"email"as const}])("should reject incoherent contact choices before issuance or dispatch %#",async(patch)=>{
    const fixture=verificationFixture();expect(await fixture.useCases.issue({...fixture.input,...patch})).toMatchObject({ok:false,failure:{code:"invalid_input"}});expect(fixture.operations.issue).not.toHaveBeenCalled();expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should preserve a current policy denial for Gmail without bypassing the owner or changing policy",async()=>{
    const fixture=verificationFixture();fixture.operations.issue.mockRejectedValue(new AdmissionOperationError(ADMISSION_ERROR_CODE.additionalVerificationRequired));
    expect(await fixture.useCases.issue(fixture.input)).toMatchObject({ok:false,failure:{code:"additional_verification_required"}});expect(fixture.operations.issue).toHaveBeenCalledTimes(1);expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should preserve a replay without dispatching another message",async()=>{
    const fixture=verificationFixture();fixture.issued.replayed=true;
    expect(await fixture.useCases.issue(fixture.input)).toMatchObject({ok:true,value:{replayed:true}});expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should preserve actual registered progress without dispatching before the issuance commit",async()=>{
    const fixture=verificationFixture();fixture.operations.issue.mockResolvedValueOnce({state:"started",operationId:fixture.input.operationId});
    expect(await fixture.useCases.issue(fixture.input)).toEqual({ok:true,value:{state:"started",operationId:fixture.input.operationId}});expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should reject a result belonging to another original operation before dispatch or public progress",async()=>{
    const fixture=verificationFixture();fixture.issued.operationId=randomUUID();fixture.verified.operationId=randomUUID();
    expect(await fixture.useCases.issue(fixture.input)).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});
    expect(await fixture.useCases.verify({...fixture.input,challengeId:fixture.challenge.challengeId,verificationCode:"123456"})).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});
    expect(await fixture.useCases.resend({...fixture.input,challengeId:fixture.challenge.challengeId})).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should reject exception progress belonging to another UUID for issue, verify and resend",async()=>{
    const fixture=verificationFixture(),foreignId=randomUUID(),error=new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved,{operationId:foreignId});fixture.operations.issue.mockRejectedValue(error);fixture.operations.verify.mockRejectedValue(error);fixture.operations.resend.mockRejectedValue(error);
    const input={...fixture.input,challengeId:fixture.challenge.challengeId,verificationCode:"123456"};
    for(const action of["issue","verify","resend"]as const){const result=await fixture.useCases[action](input);expect(result).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});if(!result.ok)expect(result.failure.operation).toBeUndefined();}
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should preserve genuinely registered exception progress for the exact original UUID without dispatch",async()=>{
    const fixture=verificationFixture(),error=new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved,{operationId:fixture.input.operationId});fixture.operations.issue.mockRejectedValue(error);fixture.operations.verify.mockRejectedValue(error);fixture.operations.resend.mockRejectedValue(error);
    const input={...fixture.input,challengeId:fixture.challenge.challengeId,verificationCode:"123456"};
    for(const action of["issue","verify","resend"]as const)expect(await fixture.useCases[action](input)).toMatchObject({ok:false,failure:{code:"operation_unresolved",operation:{operationId:fixture.input.operationId,state:"started"}}});expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should retain a confirmed issuance and its completed operation when observing dispatch fails",async()=>{
    const fixture=verificationFixture();fixture.dispatcher.dispatch.mockRejectedValue(new Error("Owned dispatch observation failed"));
    expect(await fixture.useCases.issue(fixture.input)).toMatchObject({ok:false,failure:{code:"operation_unresolved",operation:{operationId:fixture.input.operationId,state:"completed"}}});expect(fixture.operations.issue).toHaveBeenCalledTimes(1);expect(fixture.dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });
  it("should validate locally through the exact own account and challenge without depending on transport",async()=>{
    const fixture=verificationFixture();fixture.dispatcher.dispatch.mockRejectedValue(new Error("Synthetic provider unavailable"));
    const input={...fixture.input,challengeId:fixture.challenge.challengeId,verificationCode:"123456",purpose:"connection_diagnostic"};expect(await fixture.useCases.verify(input)).toEqual({ok:true,value:fixture.verified});
    expect(fixture.operations.verify).toHaveBeenCalledExactlyOnceWith({userId:fixture.account.userId,sessionId:fixture.account.session.id,tribeId:fixture.input.tribeId,requestId:fixture.input.requestId,operationId:fixture.input.operationId,challengeId:fixture.challenge.challengeId,verificationCode:"123456",purpose:"admission"});expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("should retain the original resend and explicit alternative without accepting another recipient or code",async()=>{
    const fixture=verificationFixture();fixture.operations.resend.mockResolvedValueOnce({...fixture.issued,result:{...fixture.challenge,channel:"sms",maskedDestination:"+54 ••• 1234"}});
    const input={...fixture.input,challengeId:fixture.challenge.challengeId,useSmsAlternative:true as const,phone:"+12025550123",verificationCode:"654321"};expect(await fixture.useCases.resend(input)).toMatchObject({ok:true,value:{result:{channel:"sms"}}});
    expect(fixture.operations.resend).toHaveBeenCalledExactlyOnceWith({userId:fixture.account.userId,sessionId:fixture.account.session.id,tribeId:fixture.input.tribeId,requestId:fixture.input.requestId,operationId:fixture.input.operationId,challengeId:fixture.challenge.challengeId,useSmsAlternative:true,purpose:"admission"});expect(fixture.dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });
  it("should reject a resend on another channel when the user explicitly requested the SMS alternative",async()=>{
    const fixture=verificationFixture();expect(await fixture.useCases.resend({...fixture.input,challengeId:fixture.challenge.challengeId,useSmsAlternative:true})).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
