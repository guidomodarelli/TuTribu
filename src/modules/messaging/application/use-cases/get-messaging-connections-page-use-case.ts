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
import type {MessagingProviderCatalogReader} from "../ports/messaging-provider-catalog-reader";

type NotificationCatalogRead=Awaited<ReturnType<ReadNotificationDeliveryCatalogUseCase["execute"]>>;

/** @param catalog - Leader's notification catalog read. @returns Its page, or its safe localized failure. */
function projectNotificationCatalog(catalog:NotificationCatalogRead){
  if(catalog.ok)return{status:"ready" as const,value:catalog.value};
  return{status:"failed" as const,code:catalog.failure.code,message:MESSAGING_ERROR_MESSAGE[catalog.failure.code]};
}

/** Configuration owns audience and usage metadata; this reader never loads a key or duplicates its request. */
export class GetMessagingConnectionsPageUseCase{
  /** @param accounts - Native current viewer. @param readers - Canonical routing, one authorized configuration read and actual static provider metadata. @param clock - Current time after awaited reads. */
  constructor(private readonly accounts:MessagingAccountProvider,private readonly readers:{configuration:Pick<ReadMessagingConfigurationUseCase,"execute">;resolveTribe:Pick<ResolveAdmissionTribeUseCase,"execute">;providers:MessagingProviderCatalogReader;catalog?:Pick<ReadNotificationDeliveryCatalogUseCase,"execute">},private readonly clock:()=>Date){}
  /** @param query - Once-validated slug and correlation. @returns Safe current SSR props or a closed localized failure, with no private key or automatic browser fetch. */
  async execute(query:{slug:string;requestId:string}){
    try{
      const first=await this.accounts.getAuthenticatedAccount();if(!first||!isAuthenticatedSessionLive(first.session.expiresAt,this.clock()))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      const tribe=await this.readers.resolveTribe.execute(query);if(!tribe.ok)return{ok:false as const,failure:messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code)=>code===tribe.failure.code)??MESSAGING_ERROR_CODE.unexpectedFailure,{cause:tribe.failure})};
      const result=await this.readers.configuration.execute({tribeId:tribe.value.tribeId,requestId:query.requestId});if(!result.ok)return result;
      const catalog=await this.readLeaderCatalog(result.value.audience,{tribeId:tribe.value.tribeId,requestId:query.requestId});
      if(catalog&&!catalog.ok&&isAuthorityFailure(catalog.failure.code))return{ok:false as const,failure:catalog.failure};
      const notificationCatalog=catalog?projectNotificationCatalog(catalog):undefined;
      const current=await this.accounts.getAuthenticatedAccount(),now=this.clock();if(current?.userId !== first.userId||current.session.id!==first.session.id||!isAuthenticatedSessionLive(current.session.expiresAt,now))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      const providerCatalog=result.value.audience===TRIBE_MEMBER_ROLE.leader?this.readers.providers.read():undefined;
      const parsed=messagingConnectionsPageStateSchema.safeParse({kind:"ready",slug:query.slug,tribeId:tribe.value.tribeId,viewerId:current.userId,renderedAt:now.toISOString(),configuration:result.value,...(notificationCatalog?{notificationCatalog}:{}),...(providerCatalog?{providerCatalog}:{})});
      if(!parsed.success)return{ok:false as const,failure:messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable,{cause:parsed.error})};
      return{ok:true as const,value:parsed.data};
    }catch(error){return{ok:false as const,failure:messagingFailure(error instanceof MessagingConnectionOperationError?error.code:MESSAGING_ERROR_CODE.unexpectedFailure,{cause:error})};}
  }
  /** @param audience - Configuration audience of the viewer. @param scope - Own tribe and correlation. @returns The first notification catalog page for a leader when the reader is configured, otherwise nothing. */
  private async readLeaderCatalog(audience:string,scope:{tribeId:string;requestId:string}){
    if(audience!==TRIBE_MEMBER_ROLE.leader||!this.readers.catalog)return undefined;
    return this.readers.catalog.execute({...scope,cursor:null});
  }
}

/** @param code - Catalog failure code. @returns Whether the failure revokes the whole page instead of only the catalog. */
function isAuthorityFailure(code:string):boolean{
  return code===MESSAGING_ERROR_CODE.permissionDenied||code===MESSAGING_ERROR_CODE.authenticationRequired;
}
