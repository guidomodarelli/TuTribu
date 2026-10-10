/** Resolves current leader/guardian audience and rechecks identity around read-only metadata. @module read-messaging-configuration */
import type {MessagingAccountProvider,MessagingAuthorizationReader,MessagingLeadershipFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConfigurationReader,MessagingConfigurationContext} from "@/src/modules/messaging/domain/repositories/messaging-configuration-reader";
import type {MessagingConfigurationResult} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS} from "@/src/modules/tribes/constants/tribe-page-access";
import {isAuthenticatedSessionLive} from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";

/** @param facts - Current exact canonical membership. @param tribeId - Server tenant. @param userId - Native actor. @returns Derived audience or a closed denial. */
function audienceOf(facts:MessagingLeadershipFacts|null,tribeId:string,userId:string):MessagingConfigurationContext["audience"]|null{
  if(!facts||facts.tribeId!==tribeId||facts.membership?.userId!==userId||facts.membership.status!==TRIBE_MEMBERSHIP_STATUS.active)return null;
  if(facts.membership.role===TRIBE_MEMBER_ROLE.leader&&facts.leaderUserId===userId)return"leader";
  return facts.membership.role===TRIBE_MEMBER_ROLE.guardian?"guardian":null;
}
/** Read does not require recency, connection, keyring or provider availability. */
export class ReadMessagingConfigurationUseCase{
  /** @param accounts - Current native identity. @param authorization - Current canonical tenant membership. @param reader - Role-scoped DB-only metadata projection. @param clock - Current time after waits. */
  constructor(private readonly accounts:MessagingAccountProvider,private readonly authorization:Pick<MessagingAuthorizationReader,"getCurrentLeadership">,private readonly reader:MessagingConfigurationReader<MessagingConfigurationResult>,private readonly clock:()=>Date){}
  /** @param query - Exact server-resolved tribe and correlation. @returns Safe own metadata or a current identity/permission failure, without initialization. */
  async execute(query:{tribeId:string;requestId:string}){
    try{
      const first=await this.accounts.getAuthenticatedAccount();if(!first||!isAuthenticatedSessionLive(first.session.expiresAt,this.clock()))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      const facts=await this.authorization.getCurrentLeadership(query.tribeId,first.userId),current=await this.accounts.getAuthenticatedAccount();
      if(!current||current.userId!==first.userId||current.session.id!==first.session.id||!isAuthenticatedSessionLive(current.session.expiresAt,this.clock()))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      const audience=audienceOf(facts,query.tribeId,current.userId);if(!audience)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
      const value=await this.reader.read({actorUserId:current.userId,sessionId:current.session.id,tribeId:query.tribeId,requestId:query.requestId,audience});
      const afterFacts=await this.authorization.getCurrentLeadership(query.tribeId,current.userId),after=await this.accounts.getAuthenticatedAccount();
      if(!after||after.userId!==current.userId||after.session.id!==current.session.id||!isAuthenticatedSessionLive(after.session.expiresAt,this.clock()))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      if(audienceOf(afterFacts,query.tribeId,after.userId)!==audience||value.audience!==audience)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
      return{ok:true as const,value};
    }catch(error){const code=error instanceof MessagingConnectionOperationError||error instanceof MessagingSecretAccessError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure;return{ok:false as const,failure:messagingFailure(code,{cause:error})};}
  }
}
