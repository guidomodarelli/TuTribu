/** @vitest-environment node */
/** Exercises purpose-scoped post-commit launch without giving applicant data direct worker or SDK authority. @module admission-verification-dispatcher-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {ScopedAdmissionVerificationDispatcher,type AdmissionVerificationDispatchDependencies} from "@/src/modules/academy-admissions/infrastructure/verification/admission-verification-message-sender";

/** @returns Exact private scope and controlled own resolver/worker factory, without platform mocks. */
function dispatcherFixture(){
  const intent={userId:randomUUID(),sessionId:randomUUID(),tribeId:randomUUID(),requestId:randomUUID(),challengeId:randomUUID()},scope={purpose:"admission"as const,applicantUserId:intent.userId,challengeId:intent.challengeId,deliveryId:randomUUID(),tribeId:intent.tribeId,contributingLeaderUserId:randomUUID(),connectionId:randomUUID(),connectionVersion:2},security={environment:"synthetic-local",securityEpoch:"synthetic-epoch",recoveryLocked:false},resolved={scope,environment:security.environment,securityEpoch:security.securityEpoch},resolve=vi.fn<AdmissionVerificationDispatchDependencies["resolve"]>(async()=>resolved),execute=vi.fn(async()=>({claimed:1,authorized:1,accepted:1,delivered:0,rejected:0,unknown:0,unresolved:0,suppressed:0,quotaDeferred:0,deadlineReached:false,elapsedMs:0})),createDispatcher=vi.fn<AdmissionVerificationDispatchDependencies["createDispatcher"]>(()=>({execute})),readSecurityFacts=vi.fn(async()=>security);
  return{intent,scope,security,resolved,resolve,execute,createDispatcher,readSecurityFacts,dispatcher:new ScopedAdmissionVerificationDispatcher({resolve,createDispatcher,readSecurityFacts})};
}

describe("focal applicant verification launch",()=>{
  it("should resolve only the committed own challenge before creating one worker scope and check current security without another send",async()=>{
    const fixture=dispatcherFixture(),input={...fixture.intent,senderId:randomUUID(),apiKey:randomUUID(),recipient:"foreign@example.test"};await fixture.dispatcher.dispatch(input);
    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(fixture.intent);expect(fixture.createDispatcher).toHaveBeenCalledExactlyOnceWith(fixture.scope,expect.any(Function));expect(fixture.execute).toHaveBeenCalledTimes(1);expect(fixture.resolve.mock.invocationCallOrder[0]).toBeLessThan(fixture.createDispatcher.mock.invocationCallOrder[0]);const authorize=fixture.createDispatcher.mock.calls[0][1];expect(await authorize()).toBe(true);fixture.security.recoveryLocked=true;expect(await authorize()).toBe(false);fixture.security.recoveryLocked=false;fixture.security.environment="synthetic-other";expect(await authorize()).toBe(false);fixture.security.environment=fixture.resolved.environment;fixture.security.securityEpoch="synthetic-other-epoch";expect(await authorize()).toBe(false);
  });
  it("should reject a resolved scope belonging to another applicant, challenge or tribe before creating worker authority",async()=>{
    for(const patch of[{applicantUserId:randomUUID()},{challengeId:randomUUID()},{tribeId:randomUUID()}]){const fixture=dispatcherFixture();fixture.resolve.mockResolvedValue({...fixture.resolved,scope:{...fixture.scope,...patch}});await expect(fixture.dispatcher.dispatch(fixture.intent)).rejects.toMatchObject({code:"permission_denied"});expect(fixture.createDispatcher).not.toHaveBeenCalled();expect(fixture.execute).not.toHaveBeenCalled();}
  });
  it("should keep an original resolver failure without manufacturing a worker or retry",async()=>{
    const fixture=dispatcherFixture(),error=new Error("Owned applicant challenge resolution unavailable");fixture.resolve.mockRejectedValue(error);await expect(fixture.dispatcher.dispatch(fixture.intent)).rejects.toBe(error);expect(fixture.resolve).toHaveBeenCalledTimes(1);expect(fixture.createDispatcher).not.toHaveBeenCalled();
  });
});
