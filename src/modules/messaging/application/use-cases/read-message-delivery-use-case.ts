/** Reads minimal original transport under current session without recency, provider requests or a resend. @module read-message-delivery */
import type {MessagingAccountProvider} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessageDeliveryReader} from "@/src/modules/messaging/domain/repositories/message-delivery-reader";
import type {messageDeliverySchema} from "../results/messaging-flow-result-schemas";
import type {z} from "zod";
import {isAuthenticatedSessionLive} from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {messagingFailure} from "../results/messaging-errors";

/** The reader owns leader/challenge-owner authorization inside its protected native transaction. */
export class ReadMessageDeliveryUseCase{
  /** @param accounts - Actual current native session. @param reader - Own minimal no-side-effect transport projection. @param clock - Current time after awaited reads. */
  constructor(private readonly accounts:MessagingAccountProvider,private readonly reader:MessageDeliveryReader<z.infer<typeof messageDeliverySchema>>,private readonly clock:()=>Date){}
  /** @param query - Exact boundary-owned tenant/resource/correlation. @returns Minimal current transport or safe current failure, without claiming delivery or creating proof. */
  async execute(query:{tribeId:string;deliveryId:string;requestId:string}){
    try{
      const account=await this.accounts.getAuthenticatedAccount();if(!account||!isAuthenticatedSessionLive(account.session.expiresAt,this.clock()))throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
      const value=await this.reader.read({actorUserId:account.userId,sessionId:account.session.id,tribeId:query.tribeId,requestId:query.requestId},query.deliveryId);
      const current=await this.accounts.getAuthenticatedAccount();if(!current||current.userId!==account.userId||current.session.id!==account.session.id||!isAuthenticatedSessionLive(current.session.expiresAt,this.clock()))throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
      if(!value)return{ok:false as const,failure:messagingFailure(MESSAGING_ERROR_CODE.resourceUnavailable)};
      return{ok:true as const,value};
    }catch(error){return{ok:false as const,failure:messagingFailure(error instanceof MessagingSecretAccessError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure,{cause:error})};}
  }
}
