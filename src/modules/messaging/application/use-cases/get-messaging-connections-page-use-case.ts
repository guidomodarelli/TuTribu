/** Loads current wizard metadata through one server entrypoint without provider queries or creation effects. @module get-messaging-connections-page */
import type {MessagingAccountProvider} from "../../domain/repositories/messaging-repositories";
import type {ReadMessagingConfigurationUseCase} from "./read-messaging-configuration-use-case";
import type {ResolveAdmissionTribeUseCase} from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import {isAuthenticatedSessionLive} from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import {MessagingConnectionOperationError} from "../../domain/errors/messaging-connection-operation-error";
import {MESSAGING_ERROR_CODE,MESSAGING_ERROR_MESSAGE} from "../../constants/messaging-errors";
import {messagingFailure} from "../results/messaging-errors";
import {messagingConnectionsPageStateSchema} from "../results/messaging-connections-page-state";
import type {ReadNotificationDeliveryCatalogUseCase} from "./read-notification-delivery-catalog-use-case";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";

/** Configuration owns audience and usage metadata; this reader never loads a key or duplicates its request. */
export class GetMessagingConnectionsPageUseCase{
  /** @param accounts - Native current viewer. @param readers - Canonical routing and a single authorized metadata query. @param clock - Current time after awaited reads. */
  constructor(private readonly accounts:MessagingAccountProvider,private readonly readers:{configuration:Pick<ReadMessagingConfigurationUseCase,"execute">;resolveTribe:Pick<ResolveAdmissionTribeUseCase,"execute">;catalog?:Pick<ReadNotificationDeliveryCatalogUseCase,"execute">},private readonly clock:()=>Date){}
  /** @param query - Once-validated slug and correlation. @returns Safe current SSR props or a closed localized failure, with no private key or automatic browser fetch. */
  async execute(query:{slug:string;requestId:string}){
    try{
      const first=await this.accounts.getAuthenticatedAccount();if(!first||!isAuthenticatedSessionLive(first.session.expiresAt,this.clock()))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      const tribe=await this.readers.resolveTribe.execute(query);if(!tribe.ok)return{ok:false as const,failure:messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code)=>code===tribe.failure.code)??MESSAGING_ERROR_CODE.unexpectedFailure,{cause:tribe.failure})};
      const result=await this.readers.configuration.execute({tribeId:tribe.value.tribeId,requestId:query.requestId});if(!result.ok)return result;
      const catalog=result.value.audience===TRIBE_MEMBER_ROLE.leader&&this.readers.catalog?await this.readers.catalog.execute({tribeId:tribe.value.tribeId,requestId:query.requestId,cursor:null}):undefined;
      if(catalog&&!catalog.ok&&(catalog.failure.code===MESSAGING_ERROR_CODE.permissionDenied||catalog.failure.code===MESSAGING_ERROR_CODE.authenticationRequired))return{ok:false as const,failure:catalog.failure};
      const notificationCatalog=catalog?catalog.ok?{status:"ready" as const,value:catalog.value}:{status:"failed" as const,code:catalog.failure.code,message:MESSAGING_ERROR_MESSAGE[catalog.failure.code]}:undefined;
      const current=await this.accounts.getAuthenticatedAccount(),now=this.clock();if(!current||current.userId!==first.userId||current.session.id!==first.session.id||!isAuthenticatedSessionLive(current.session.expiresAt,now))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      return{ok:true as const,value:messagingConnectionsPageStateSchema.parse({kind:"ready",slug:query.slug,tribeId:tribe.value.tribeId,viewerId:current.userId,renderedAt:now.toISOString(),configuration:result.value,...(notificationCatalog?{notificationCatalog}:{})})};
    }catch(error){return{ok:false as const,failure:messagingFailure(error instanceof MessagingConnectionOperationError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure,{cause:error})};}
  }
}
