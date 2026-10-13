/** Recovers an original connection mutation with current leadership/session but no key or mutation recency. @module read-messaging-connection-operation */
import type {MessagingAccountProvider,MessagingAuthorizationReader} from "../../domain/repositories/messaging-repositories";
import type {MessagingConnectionOperationReader} from "../../domain/repositories/messaging-connection-operation-reader";
import {MessagingConnectionOperationError} from "../../domain/errors/messaging-connection-operation-error";
import {MessagingSecretAccessError} from "../../domain/errors/messaging-secret-access-error";
import {MESSAGING_ERROR_CODE} from "../../constants/messaging-errors";
import {messagingConnectionOperationRecoverySchema} from "../results/messaging-connection-operation-result";
import {messagingFailure} from "../results/messaging-errors";
import {isAuthenticatedSessionLive} from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS} from "@/src/modules/tribes/constants/tribe-page-access";

/** A recovery response never repeats the original write or renews its lease. */
export class ReadMessagingConnectionOperationUseCase{
  /** @param accounts - Native current account. @param authorization - Canonical current leadership. @param reader - Original readonly owner. @param clock - Current time after awaited facts. */
  constructor(private readonly accounts:MessagingAccountProvider,private readonly authorization:Pick<MessagingAuthorizationReader,"getCurrentLeadership">,private readonly reader:MessagingConnectionOperationReader,private readonly clock:()=>Date){}
  /** @param query - Once-validated tribe/original UUID/correlation. @returns Original safe snapshot or a current closed result, without a credential input. */
  async execute(query:{tribeId:string;operationId:string;requestId:string}){
    try{
      const account=await this.accounts.getAuthenticatedAccount();if(!account||!isAuthenticatedSessionLive(account.session.expiresAt,this.clock()))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      /** @returns Nothing only while the same native session and canonical active leadership remain current. */
      const authorize=async()=>{
        const facts=await this.authorization.getCurrentLeadership(query.tribeId,account.userId),current=await this.accounts.getAuthenticatedAccount();
        if(!current||current.userId!==account.userId||current.session.id!==account.session.id||!isAuthenticatedSessionLive(current.session.expiresAt,this.clock()))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
        if(!facts||facts.tribeId!==query.tribeId||facts.leaderUserId!==account.userId||facts.membership?.userId!==account.userId||facts.membership.role!==TRIBE_MEMBER_ROLE.leader||facts.membership.status!==TRIBE_MEMBERSHIP_STATUS.active)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.permissionDenied);
      };
      await authorize();const value=await this.reader.read({actorUserId:account.userId,sessionId:account.session.id,tribeId:query.tribeId,requestId:query.requestId},query.operationId);await authorize();
      if(!value)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const parsed=messagingConnectionOperationRecoverySchema.safeParse(value);if(!parsed.success||parsed.data.operationId.toLowerCase()!==query.operationId.toLowerCase())throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.publicContractUnusable);
      return{ok:true as const,value:parsed.data};
    }catch(error){return{ok:false as const,failure:messagingFailure(error instanceof MessagingConnectionOperationError||error instanceof MessagingSecretAccessError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure,{cause:error})};}
  }
}
