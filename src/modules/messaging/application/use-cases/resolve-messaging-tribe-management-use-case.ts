/** Resolves tribe management before a connection exists, without consulting provider or private material. @module resolve-messaging-tribe-management */
import type { MessagingAccountProvider, MessagingAuthorizationReader, MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingUsageContext, MessagingUsageSensitiveContext } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import type { MessagingConnectionCreationContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type { MessagingConnectionLifecycleContext, MessagingConnectionLifecycleOperation } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { evaluateRecentAuthentication } from "@/src/modules/auth/domain/policies/recent-authentication";

/** Incoming scope contains no account, session, provider resource or authority flag. */
export type MessagingTribeManagementQuery={tribeId:string;requestId:string};
/** Connection-scoped local management can stop a resource without looking up its operational credentials. */
export type MessagingConnectionLifecycleQuery=MessagingTribeManagementQuery&{connectionId:string};
/** Sensitive creation and early usage operations share current canonical tribe ownership. */
type SensitiveOperation=MessagingUsageSensitiveContext["operation"]|MessagingConnectionCreationContext["operation"]|MessagingConnectionLifecycleOperation;

/** @param facts - Current canonical tenant membership. @param tribeId - Exact tenant. @param userId - Current native account. @returns Whether the account is the sole current active leader. */
function isManagementLeader(facts:MessagingLeadershipFacts|null,tribeId:string,userId:string):boolean {
  return Boolean(facts&&facts.tribeId===tribeId&&facts.leaderUserId===userId&&facts.membership?.userId===userId&&facts.membership.role===TRIBE_MEMBER_ROLE.leader&&facts.membership.status===TRIBE_MEMBERSHIP_STATUS.active);
}

/** Shares current account/lifetime/leadership/recency orchestration without granting access to a secret. */
export class ResolveMessagingTribeManagementUseCase {
  /** @param accounts - Current native account port. @param authorization - Current canonical leadership, independent of any connection. @param clock - Current time after awaited facts. */
  constructor(private readonly accounts:MessagingAccountProvider,private readonly authorization:Pick<MessagingAuthorizationReader,"getCurrentLeadership">,private readonly clock:()=>Date) {}

  /** @param query - Exact tribe and server correlation. @returns Current read-only leadership context without recency. */
  execute(query:MessagingTribeManagementQuery):Promise<MessagingUsageContext>;
  /** @param query - Exact tribe and server correlation. @param operation - Fixed early usage action. @returns Exact current scoped recency without a connection. */
  execute(query:MessagingTribeManagementQuery,operation:MessagingUsageSensitiveContext["operation"]):Promise<MessagingUsageSensitiveContext>;
  /** @param query - Exact tribe and server correlation. @param operation - Fixed credential creation action. @returns Exact current scoped recency before private material exists. */
  execute(query:MessagingTribeManagementQuery,operation:MessagingConnectionCreationContext["operation"]):Promise<MessagingConnectionCreationContext>;
  /** @param query - Exact tribe/connection and server correlation. @param operation - Fixed suspension or ordinary disconnection. @returns Current connection-scoped recency without secret or provider authority. */
  execute(query:MessagingConnectionLifecycleQuery,operation:MessagingConnectionLifecycleOperation):Promise<MessagingConnectionLifecycleContext>;
  /** @param query - Own boundary-resolved scope. @param operation - Optional fixed sensitive action. @returns Rechecked own context. @throws MessagingUsageOperationError for a closed current account, role or recency. */
  async execute(query:MessagingTribeManagementQuery|MessagingConnectionLifecycleQuery,operation?:SensitiveOperation):Promise<MessagingUsageContext|MessagingUsageSensitiveContext|MessagingConnectionCreationContext|MessagingConnectionLifecycleContext> {
    const connectionScoped=operation===REAUTHENTICATION_OPERATION.suspendMessagingConnection||operation===REAUTHENTICATION_OPERATION.disconnectMessagingConnection;
    if(connectionScoped!==("connectionId" in query))throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.invalidInput);
    const resourceId=connectionScoped&&"connectionId" in query?query.connectionId:query.tribeId;
    const first=await this.accounts.getAuthenticatedAccount();
    if(!first||!isAuthenticatedSessionLive(first.session.expiresAt,this.clock()))throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
    const initialLeadership=await this.authorization.getCurrentLeadership(query.tribeId,first.userId);
    const current=await this.accounts.getAuthenticatedAccount();
    if(!current||current.userId!==first.userId||current.session.id!==first.session.id||!isAuthenticatedSessionLive(current.session.expiresAt,this.clock()))throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
    if(!isManagementLeader(initialLeadership,query.tribeId,first.userId))throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const leadership=await this.authorization.getCurrentLeadership(query.tribeId,current.userId);
    const confirmed=await this.accounts.getAuthenticatedAccount(),now=this.clock();
    if(!confirmed||confirmed.userId!==current.userId||confirmed.session.id!==current.session.id||!isAuthenticatedSessionLive(confirmed.session.expiresAt,now))throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
    if(!isManagementLeader(leadership,query.tribeId,current.userId))throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    const context:MessagingUsageContext={actorUserId:current.userId,sessionId:current.session.id,tribeId:query.tribeId,requestId:query.requestId};
    if(!operation)return context;
    if(!confirmed.googleAccount)throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.reauthenticationRequired);
    const scope={userId:confirmed.userId,sessionId:confirmed.session.id,accountId:confirmed.googleAccount.id,subject:confirmed.googleAccount.subject,tribeId:query.tribeId,operation,resourceId};
    const evidence=confirmed.recentAuthentication.find((candidate)=>evaluateRecentAuthentication({now,scope,evidence:candidate,sessionActive:true,currentLeaderUserId:confirmed.userId}).allowed);
    if(!evidence?.authenticatedAt)throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.reauthenticationRequired);
    const sensitiveContext={...context,resourceId,accountId:confirmed.googleAccount.id,subject:confirmed.googleAccount.subject,authenticatedAt:evidence.authenticatedAt,validUntil:evidence.validUntil};
    if(operation===REAUTHENTICATION_OPERATION.suspendMessagingConnection||operation===REAUTHENTICATION_OPERATION.disconnectMessagingConnection){
      if(!("connectionId" in query))throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.invalidInput);
      return {...sensitiveContext,operation,connectionId:query.connectionId};
    }
    return {...sensitiveContext,operation};
  }
}
