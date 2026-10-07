/** Confirms exact resources outside SQL before the owner commits an untested immutable configuration. @module configure-messaging-connection */
import type {ResolveMessagingContextUseCase} from "./resolve-messaging-context-use-case";
import type {AuthorizedMessagingContext,MessagingSecretStore} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConnectionConfigurationOperations,MessagingConnectionConfigurationInput,MessagingConfigurationInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-connection-configuration";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MessagingConnectionInspectionError} from "@/src/modules/messaging/domain/errors/messaging-connection-inspection-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {messagingFailure} from "../results/messaging-errors";

/** CAS refers to mutable lifecycle; the owner derives immutable configuration version. */
export type ConfigureMessagingConnectionInput=MessagingConnectionConfigurationInput&{tribeId:string;connectionId:string;requestId:string};

/** Resource detail reads do not establish code receipt, production readiness or contact authority. */
export class ConfigureMessagingConnectionUseCase{
  /** @param resolver - Current native account/leader/recency/resource authority. @param operations - Original-result/CAS/version owner. @param secrets - Independently current private credential storage. @param inspectors - Fresh explicitly scoped real detail readers. */
  constructor(private readonly resolver:Pick<ResolveMessagingContextUseCase,"execute">,private readonly operations:MessagingConnectionConfigurationOperations,private readonly secrets:MessagingSecretStore,private readonly inspectors:MessagingConfigurationInspectorFactory){}
  /** @param original - Authority before awaited private/provider access. @returns Current unchanged context. @throws Safe identity/resource conflict before another RPC or commit. */
  private async current(original:AuthorizedMessagingContext):Promise<AuthorizedMessagingContext>{
    const resolved=await this.resolver.execute({tribeId:original.tribeId,connectionId:original.connectionId,requestId:original.requestId,operation:REAUTHENTICATION_OPERATION.configureMessagingConnection});
    if(!resolved.allowed)throw new MessagingConnectionOperationError(resolved.failure.code);
    const context=resolved.context;
    if(original.actorUserId!==context.actorUserId||original.sessionId!==context.sessionId||original.accountId!==context.accountId||original.subject!==context.subject)throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    if(original.tribeId!==context.tribeId||original.connectionId!==context.connectionId||original.connectionVersion!==context.connectionVersion||original.secretRef!==context.secretRef||original.environment!==context.environment||original.securityEpoch!==context.securityEpoch||original.resourceId!==context.resourceId)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
    return context;
  }
  /** @param input - Boundary-normalized original action. @param signal - Native caller cancellation/deadline. @returns Original guarded mutation metadata or safe current denial; no credential or provider payload. */
  async execute(input:ConfigureMessagingConnectionInput,signal:AbortSignal){
    try{
      signal.throwIfAborted();
      const resolved=await this.resolver.execute({tribeId:input.tribeId,connectionId:input.connectionId,requestId:input.requestId,operation:REAUTHENTICATION_OPERATION.configureMessagingConnection});
      if(!resolved.allowed)return{ok:false as const,failure:resolved.failure};
      const context=resolved.context,prepared=await this.operations.prepare(context,input);
      if(prepared.state!=="prepared")return{ok:true as const,value:prepared};
      if(prepared.configurationVersion!==context.connectionVersion)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
      signal.throwIfAborted();
      if(!prepared.changed)return{ok:true as const,value:await this.operations.commit(context,input,null)};
      const credential=await this.secrets.loadAuthorizedSecret(context);await this.current(context);signal.throwIfAborted();
      const inspector=this.inspectors.create(context,credential),sender=await inspector.retrieveSender(input.senderId,signal);
      if(sender.resourceId!==input.senderId||!sender.channels.includes(input.channel)||input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp&&!sender.canSendWhatsappTemplates)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability);
      let template;
      if(input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp){
        if(!input.templateId||!input.templateLanguage)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.invalidInput);
        await this.current(context);signal.throwIfAborted();template=await inspector.retrieveTemplate(input.templateId,signal);
        if(template.resourceId!==input.templateId||!template.authenticationApproved||template.language!==input.templateLanguage)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability);
      }
      await this.current(context);signal.throwIfAborted();
      return{ok:true as const,value:await this.operations.commit(context,input,{credential,sender,...(template?{template}:{})})};
    }catch(error){
      const known=error instanceof MessagingSecretAccessError||error instanceof MessagingConnectionOperationError||error instanceof MessagingConnectionInspectionError;
      const code=known?error.code:signal.aborted?MESSAGING_ERROR_CODE.transportTimeout:MESSAGING_ERROR_CODE.unexpectedFailure;
      return{ok:false as const,failure:messagingFailure(code,{cause:error,...(error instanceof MessagingConnectionOperationError&&error.code===MESSAGING_ERROR_CODE.operationUnresolved&&error.operationId?{operation:{operationId:error.operationId,state:OPERATION_STATE.started}}:{})})};
    }
  }
}
