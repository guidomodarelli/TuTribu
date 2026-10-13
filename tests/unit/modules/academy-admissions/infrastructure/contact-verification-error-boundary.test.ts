/** @vitest-environment node */
/** Exercises post-commit observation failure through the actual admission error serializer without platform mocks. @module contact-verification-error-boundary-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {ContactVerificationUseCases} from "@/src/modules/academy-admissions/application/use-cases/contact-verification-use-cases";
import {createAdmissionRouteBoundary} from "@/src/modules/academy-admissions/infrastructure/api/admission-route-http";
import type {AdmissionContactVerificationOperations} from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import type {AuthenticatedAccount} from "@/src/modules/auth/domain/entities/authenticated-account";

describe("committed contact challenge error boundary",()=>{
  it("should publish only the actual completed original when its dispatch observation fails and keep the private cause out of JSON",async()=>{
    const now=new Date(),operationId=randomUUID(),tribeId=randomUUID(),requestId=randomUUID(),privateDetail=randomUUID(),account:AuthenticatedAccount={userId:randomUUID(),normalizedEmail:"synthetic@example.test",session:{id:randomUUID(),expiresAt:new Date(now.getTime()+3_600_000)},googleAccount:null,identityEvidence:null,recentAuthentication:[]},operations:AdmissionContactVerificationOperations={issue:async()=>({state:"completed",operationId,replayed:false,result:{challengeId:randomUUID(),purpose:"admission",channel:"email",maskedDestination:"s••••@example.test",expiresAt:new Date(now.getTime()+600_000).toISOString(),resendAllowedAt:new Date(now.getTime()+60_000).toISOString(),deliveryState:"queued"}}),verify:async()=>{throw new Error("Unexpected local verify in issuance boundary scenario");},resend:async()=>{throw new Error("Unexpected local resend in issuance boundary scenario");}};
    const useCases=new ContactVerificationUseCases({getAuthenticatedAccount:async()=>account},operations,{dispatch:async()=>{throw new Error(privateDetail);}},()=>now),outcome=await useCases.issue({tribeId,requestId,operationId,confirmed:true,expectedPolicyVersion:1,channel:"email"});
    if(outcome.ok)throw new Error("Expected post-commit dispatch observation failure");
    const response=createAdmissionRouteBoundary({request:new Request("https://tutribu.example.invalid/api/admissions/challenges",{headers:{"x-request-id":requestId}}),operation:"issue-contact-challenge",diagnostics:()=>undefined}).failure(outcome.failure),body=await response.json();
    expect(response.status).toBe(202);expect(body).toMatchObject({code:"operation_unresolved",requestId,operation:{operationId,state:"completed"}});expect(body).not.toHaveProperty("cause");expect(body).not.toHaveProperty("stack");expect(JSON.stringify(body).includes(privateDetail)).toBe(false);expect(JSON.stringify(body).includes(account.normalizedEmail)).toBe(false);
  });
});
