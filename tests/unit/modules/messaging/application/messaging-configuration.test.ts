/** @vitest-environment node */
/** Exercises audience and identity changes through owned current-account/read ports. @module messaging-configuration-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {ReadMessagingConfigurationUseCase} from "@/src/modules/messaging/application/use-cases/read-messaging-configuration-use-case";
import type {MessagingAuthenticatedAccount,MessagingLeadershipFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConfigurationReader} from "@/src/modules/messaging/domain/repositories/messaging-configuration-reader";
import type {MessagingConfigurationResult} from "@/src/modules/messaging/application/results/messaging-configuration-result";

describe("current messaging configuration",()=>{
  it.each(["leader","guardian"]as const)("should read the exact %s projection without global recency or initialization",async(role)=>{
    const userId=randomUUID(),tribeId=randomUUID(),account:MessagingAuthenticatedAccount={userId,session:{id:randomUUID(),expiresAt:new Date(Date.now()+3_600_000)},googleAccount:null,recentAuthentication:[]};
    const facts:MessagingLeadershipFacts={tribeId,leaderUserId:role==="leader"?userId:randomUUID(),membership:{userId,role,status:"active"}};
    const read=vi.fn<MessagingConfigurationReader<MessagingConfigurationResult>["read"]>(async()=>role==="leader"?{audience:"leader",selected:null,candidate:null,usage:{state:"not_configured",policy:null}}:{audience:"guardian",operationalAlert:"not_configured"});
    const useCase=new ReadMessagingConfigurationUseCase({getAuthenticatedAccount:async()=>account},{getCurrentLeadership:async()=>facts},{read},()=>new Date());
    expect(await useCase.execute({tribeId,requestId:randomUUID()})).toMatchObject({ok:true,value:{audience:role}});
    expect(read).toHaveBeenCalledTimes(1);
    read.mockImplementationOnce(async()=>{facts.membership!.role="tribemate";return{audience:"leader",selected:null,candidate:null,usage:{state:"not_configured",policy:null}};});
    expect(await useCase.execute({tribeId,requestId:randomUUID()})).toMatchObject({ok:false,failure:{code:"permission_denied"}});
  });
});
