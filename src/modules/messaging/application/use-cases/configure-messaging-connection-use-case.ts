/** Confirms exact resources outside SQL before the owner commits an untested immutable configuration. @module configure-messaging-connection */
import type {ResolveMessagingContextUseCase} from "./resolve-messaging-context-use-case";
import type {AuthorizedMessagingContext,MessagingSecretStore} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConnectionConfigurationOperations,MessagingConnectionConfigurationInput,MessagingConfigurationInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-connection-configuration";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MessagingConnectionInspectionError} from "@/src/modules/messaging/domain/errors/messaging-connection-inspection-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CHANNEL_RESOURCE_REQUIREMENT as RESOURCE_REQUIREMENT} from "@/src/modules/messaging/constants/messaging-resources";
import {MessagingRequirementError,type MessagingChannelResourceRequirement} from "@/src/modules/messaging/domain/errors/messaging-requirement-error";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {messagingFailure} from "../results/messaging-errors";

/** CAS refers to mutable lifecycle; the owner derives immutable configuration version. */
export type ConfigureMessagingConnectionInput=MessagingConnectionConfigurationInput&{tribeId:string;connectionId:string;requestId:string};

/** Resource detail reads do not establish code receipt, production readiness or contact authority. */
export class ConfigureMessagingConnectionUseCase{
  /** @param resolver - Current native account/leader/resource authority. @param operations - Original-result/CAS/version owner. @param secrets - Independently current private credential storage. @param inspectors - Fresh explicitly scoped real detail readers. */
  constructor(private readonly resolver:Pick<ResolveMessagingContextUseCase,"execute">,private readonly operations:MessagingConnectionConfigurationOperations,private readonly secrets:MessagingSecretStore,private readonly inspectors:MessagingConfigurationInspectorFactory){}
  /** @param original - Authority before awaited private/provider access. @param operationId - Original caller UUID, kept unresolved when the platform blocks an already registered original. @returns Current unchanged context. @throws Safe identity/resource conflict before another RPC or commit. */
  private async current(original:AuthorizedMessagingContext,operationId:string):Promise<AuthorizedMessagingContext>{
    const resolved=await this.resolver.execute({tribeId:original.tribeId,connectionId:original.connectionId,requestId:original.requestId,operationId,operation:REAUTHENTICATION_OPERATION.configureMessagingConnection});
    if(!resolved.allowed)throw new MessagingConnectionOperationError(resolved.failure.code,{cause:resolved.failure.cause,...(resolved.failure.operation?{operationId:resolved.failure.operation.operationId}:{})});
    const context=resolved.context;
    if(original.actorUserId!==context.actorUserId||original.sessionId!==context.sessionId||original.accountId!==context.accountId||original.subject!==context.subject)throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
    if(original.tribeId!==context.tribeId||original.connectionId!==context.connectionId||original.connectionVersion!==context.connectionVersion||original.secretRef!==context.secretRef||original.environment!==context.environment||original.securityEpoch!==context.securityEpoch||original.resourceId!==context.resourceId)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
    return context;
  }
  /** @param input - Boundary-normalized original action. @param signal - Native caller cancellation/deadline. @returns Original guarded mutation metadata or safe current denial; no credential or provider payload. */
  async execute(input:ConfigureMessagingConnectionInput,signal:AbortSignal){
    // Nothing is registered for this original until the owner commits it: an earlier failure (a Zavu read that failed or timed out) is definitive.
    let committing=false;
    try{
      signal.throwIfAborted();
      const resolved=await this.resolver.execute({tribeId:input.tribeId,connectionId:input.connectionId,requestId:input.requestId,operationId:input.operationId,operation:REAUTHENTICATION_OPERATION.configureMessagingConnection});
      if(!resolved.allowed)return{ok:false as const,failure:resolved.failure};
      const context=resolved.context,prepared=await this.operations.prepare(context,input);
      if(prepared.state!=="prepared")return{ok:true as const,value:prepared};
      if(prepared.configurationVersion!==context.connectionVersion)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionConflict);
      signal.throwIfAborted();
      if(!prepared.changed){committing=true;return{ok:true as const,value:await this.operations.commit(context,input,null)};}
      const resources=await this.inspectResources(context,input,signal);
      await this.current(context,input.operationId);signal.throwIfAborted();
      committing=true;
      return{ok:true as const,value:await this.operations.commit(context,input,resources)};
    }catch(error){
      return{ok:false as const,failure:configurationFailure(error,signal,!committing)};
    }
  }
  /** @param context - Current authority. @param input - Original action. @param signal - Native caller cancellation/deadline. @returns The credential and the exact provider resources the change commits. @throws Safe missing capability or invalid input. */
  private async inspectResources(context:AuthorizedMessagingContext,input:ConfigureMessagingConnectionInput,signal:AbortSignal){
    const credential=await this.secrets.loadAuthorizedSecret(context);await this.current(context,input.operationId);signal.throwIfAborted();
    const inspector=this.inspectors.create(context,credential),sender=await inspector.retrieveSender(input.senderId,signal);
    const senderRequirement=unmetSenderRequirement(sender,input);
    if(senderRequirement)throw missingResource(senderRequirement);
    let template;
    if(input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp){
      if(!input.templateId||!input.templateLanguage)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.invalidInput);
      await this.current(context,input.operationId);signal.throwIfAborted();template=await inspector.retrieveTemplate(input.templateId,signal);
      const templateRequirement=unmetTemplateRequirement(template,input);
      if(templateRequirement)throw missingResource(templateRequirement);
    }
    return{credential,sender,...(template?{template}:{})};
  }
}

/** @param requirement - Unmet resource requirement. @returns A missing capability that names it as its typed cause. */
function missingResource(requirement:MessagingChannelResourceRequirement){
  return new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability,{cause:new MessagingRequirementError(requirement)});
}

/** @param sender - Exact Zavu sender read now. @param input - Original action. @returns Why it cannot send on the chosen channel, or null when it can. */
function unmetSenderRequirement(sender:{resourceId:string;channels:readonly string[];canSendWhatsappTemplates:boolean},input:ConfigureMessagingConnectionInput):MessagingChannelResourceRequirement|null{
  if(sender.resourceId!==input.senderId)return RESOURCE_REQUIREMENT.senderMismatch;
  if(!sender.channels.includes(input.channel))return RESOURCE_REQUIREMENT.senderChannelMissing;
  return input.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp&&!sender.canSendWhatsappTemplates?RESOURCE_REQUIREMENT.senderWhatsappTemplatesUnavailable:null;
}

/** @param template - Exact Zavu template read now. @param input - Original action. @returns Why it cannot authenticate on WhatsApp, or null when it can. */
function unmetTemplateRequirement(template:{resourceId:string;authenticationApproved:boolean;language:string|null},input:ConfigureMessagingConnectionInput):MessagingChannelResourceRequirement|null{
  if(template.resourceId!==input.templateId)return RESOURCE_REQUIREMENT.templateMismatch;
  if(!template.authenticationApproved)return RESOURCE_REQUIREMENT.templateNotApproved;
  return template.language!==input.templateLanguage?RESOURCE_REQUIREMENT.templateLanguageMismatch:null;
}

/** @param error - Failure of the configuration attempt. @param signal - Native caller cancellation/deadline. @param beforeCommit - Whether it happened before the owner could register the original. @returns The safe failure, keeping the unresolved operation reference; a failure before the commit is definitive. */
function configurationFailure(error:unknown,signal:AbortSignal,beforeCommit:boolean){
  const known=error instanceof MessagingSecretAccessError||error instanceof MessagingConnectionOperationError||error instanceof MessagingConnectionInspectionError;
  const code=known?error.code:abortedOrUnexpectedCode(signal);
  const unresolved=error instanceof MessagingConnectionOperationError&&error.code===MESSAGING_ERROR_CODE.operationUnresolved&&error.operationId;
  return messagingFailure(code,{cause:error,...(unresolved?{operation:{operationId:error.operationId,state:OPERATION_STATE.started}}:{}),...(beforeCommit&&!unresolved?{definitive:true}:{})});
}

/** @param signal - Native caller cancellation/deadline. @returns Timeout when the caller aborted, otherwise an unexpected failure. */
function abortedOrUnexpectedCode(signal:AbortSignal){
  return signal.aborted?MESSAGING_ERROR_CODE.transportTimeout:MESSAGING_ERROR_CODE.unexpectedFailure;
}
