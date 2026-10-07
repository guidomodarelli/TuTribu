/** Reads exact authorized resources without mutation, diagnostic or delivery side effects. @module read-messaging-resources */
import type {ResolveMessagingContextUseCase} from "./resolve-messaging-context-use-case";
import type {AuthorizedMessagingContext,MessagingSecretStore} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingResourceCursor,MessagingResourceInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-resource-inspection";
import type {MessagingFailure} from "../results/messaging-errors";
import {messagingFailure} from "../results/messaging-errors";
import {messagingResourcePageSchema,type MessagingResourcePageResult} from "../results/messaging-resource-page-result";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MessagingConnectionInspectionError} from "@/src/modules/messaging/domain/errors/messaging-connection-inspection-error";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_RESOURCE_KIND} from "@/src/modules/messaging/constants/messaging-resources";
import {MESSAGING_RESOURCE_READINESS,MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";

/** Boundary-normalized pagination does not select credentials, roles, environment or provider endpoints. */
export type ReadMessagingResourcesInput={tribeId:string;connectionId:string;requestId:string;kind:MessagingResourceCursor["kind"];limit:number;cursor?:MessagingResourceCursor};

/** @param original - Authority before awaited material/provider reads. @param current - Newly resolved exact scope. @returns Nothing if unchanged. @throws A safe identity/resource conflict before metadata can be returned. */
function requireSameResource(original:AuthorizedMessagingContext,current:AuthorizedMessagingContext):void{
  if(original.actorUserId!==current.actorUserId||original.sessionId!==current.sessionId||original.accountId!==current.accountId||original.subject!==current.subject)throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
  if(original.tribeId!==current.tribeId||original.connectionId!==current.connectionId||original.connectionVersion!==current.connectionVersion||original.secretRef!==current.secretRef||original.environment!==current.environment||original.securityEpoch!==current.securityEpoch||original.resourceId!==current.resourceId||original.operation!==current.operation)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
}

/** Completes all upstream pagination before publishing any bounded own page; partial reads never appear successful. */
export class ReadMessagingResourcesUseCase{
  /** @param resolver - Current human recency, canonical leader and resource authority. @param secrets - Independent current SQL/epoch authorization. @param inspectors - Fresh explicitly scoped SDK readers. */
  constructor(private readonly resolver:Pick<ResolveMessagingContextUseCase,"execute">,private readonly secrets:MessagingSecretStore,private readonly inspectors:MessagingResourceInspectorFactory){}
  /** @param input - Own validated pagination and server-resolved tenant. @param signal - Native cancellation/deadline. @returns Minimal guarded selections or a safe current denial, without creating operations or consuming messaging quota. */
  async execute(input:ReadMessagingResourcesInput,signal:AbortSignal):Promise<{ok:true;value:MessagingResourcePageResult}|{ok:false;failure:MessagingFailure}>{
    try{
      signal.throwIfAborted();
      const operation=input.kind===MESSAGING_RESOURCE_KIND.senders?REAUTHENTICATION_OPERATION.readMessagingSenders:REAUTHENTICATION_OPERATION.readMessagingTemplates;
      const command={tribeId:input.tribeId,connectionId:input.connectionId,requestId:input.requestId,operation};
      const first=await this.resolver.execute(command);if(!first.allowed)return{ok:false,failure:first.failure};
      const context=first.context,cursor=input.cursor;
      if(cursor&&(cursor.tribeId!==context.tribeId||cursor.connectionId!==context.connectionId||cursor.configurationVersion!==context.connectionVersion||cursor.kind!==input.kind))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
      const credential=await this.secrets.loadAuthorizedSecret(context);
      const current=await this.resolver.execute(command);if(!current.allowed)return{ok:false,failure:current.failure};requireSameResource(context,current.context);
      signal.throwIfAborted();
      const inspector=this.inspectors.create(context,credential);
      const resources=input.kind===MESSAGING_RESOURCE_KIND.senders?(await inspector.listSenders(signal)).map((sender)=>({id:sender.resourceId,label:sender.name,channels:[...sender.channels],readiness:sender.channels.some((channel)=>channel!==MESSAGING_PUBLIC_CHANNEL.whatsapp)||sender.canSendWhatsappTemplates?MESSAGING_RESOURCE_READINESS.ready:MESSAGING_RESOURCE_READINESS.incomplete})):(await inspector.listTemplates(signal)).map((template)=>({id:template.resourceId,label:template.name,channels:[MESSAGING_PUBLIC_CHANNEL.whatsapp],readiness:template.authenticationApproved?MESSAGING_RESOURCE_READINESS.ready:MESSAGING_RESOURCE_READINESS.incomplete,language:template.language}));
      signal.throwIfAborted();
      const final=await this.resolver.execute(command);if(!final.allowed)return{ok:false,failure:final.failure};requireSameResource(context,final.context);
      signal.throwIfAborted();
      const ordered=[...new Map(resources.map((resource)=>[resource.id,resource])).values()].sort((left,right)=>left.id<right.id?-1:left.id>right.id?1:0),offset=cursor?.offset??0;
      const end=offset+input.limit;
      const page={connectionId:context.connectionId,configurationVersion:context.connectionVersion,items:ordered.slice(offset,end),...(end<ordered.length?{nextCursor:JSON.stringify({tribeId:context.tribeId,connectionId:context.connectionId,configurationVersion:context.connectionVersion,kind:input.kind,offset:end})}:{})};
      const parsed=messagingResourcePageSchema.safeParse(page);if(!parsed.success)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.publicContractUnusable);
      return{ok:true,value:parsed.data};
    }catch(error){
      const known=error instanceof MessagingSecretAccessError||error instanceof MessagingConnectionInspectionError||error instanceof MessagingConnectionOperationError;
      return{ok:false,failure:messagingFailure(known?error.code:signal.aborted?MESSAGING_ERROR_CODE.transportTimeout:MESSAGING_ERROR_CODE.unexpectedFailure,{cause:error})};
    }
  }
}
