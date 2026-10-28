/** Resolves the currently authorized provider before each real operation, retaining application-owned ports. @module registered-messaging-adapters */
import "server-only";
import type {AuthorizedMessagingContext,AuthorizedDeliveryMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConnectionInspector} from "@/src/modules/messaging/domain/repositories/messaging-connection-inspector";
import type {MessagingCredentialInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-credential-validation";
import type {MessagingResourceInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-resource-inspection";
import type {MessagingConfigurationInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-connection-configuration";
import type {MessageDeliverySender} from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type {VerificationDeliveryPreparation} from "./verification-delivery-preparation";
import type {MessagingProviderRegistry} from "./messaging-provider-registry";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";

/** Current provider identity comes from a protected infrastructure read, never browser readiness or an inferred default. */
export type CurrentMessagingProviderReader=(context:AuthorizedMessagingContext|AuthorizedDeliveryMessagingContext)=>Promise<string>;
/** One factory satisfies existing application ports; no case of use learns an SDK or external DTO. */
export class RegisteredMessagingInspectorFactory implements MessagingCredentialInspectorFactory,MessagingResourceInspectorFactory,MessagingConfigurationInspectorFactory{
  /** @param registry - Implemented adapter allowlist. @param readProvider - Native current scope/epoch authorization and exact stored identity. */
  constructor(private readonly registry:MessagingProviderRegistry,private readonly readProvider:CurrentMessagingProviderReader){}
  /** @param context - Actual current authorized immutable version. @param credential - Transient server-only bytes. @returns Operations resolving the current provider before constructing its inspector. */
  create(context:AuthorizedMessagingContext,credential:string):MessagingConnectionInspector{
    /** @param signal - Original caller cancellation. @returns The exact common inspector, with no default substitution. */
    const resolve=async(signal:AbortSignal)=>{
      signal.throwIfAborted();const providerId=await this.readProvider(context);signal.throwIfAborted();return this.registry.resolve(providerId).createInspector(context,credential);
    };
    /** @param signal - Original caller cancellation. @returns Only implemented WhatsApp template inspection; an email adapter supplies no dummy methods. */
    const resolveTemplates=async(signal:AbortSignal)=>{
      signal.throwIfAborted();const providerId=await this.readProvider(context);signal.throwIfAborted();
      const descriptor=this.registry.resolve(providerId,MESSAGING_PUBLIC_CHANNEL.whatsapp);
      if(!descriptor.createTemplateInspector)throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability);
      return descriptor.createTemplateInspector(context,credential);
    };
    return{
      inspectCredential:async(signal)=>(await resolve(signal)).inspectCredential(signal),
      listSenders:async(signal)=>(await resolve(signal)).listSenders(signal),
      retrieveSender:async(resourceId,signal)=>(await resolve(signal)).retrieveSender(resourceId,signal),
      listTemplates:async(signal)=>(await resolveTemplates(signal)).listTemplates(signal),
      retrieveTemplate:async(resourceId,signal)=>(await resolveTemplates(signal)).retrieveTemplate(resourceId,signal),
    };
  }
}
/** Prepares the original authorized attempt once and resolves only its exact implemented channel/provider. */
export class RegisteredMessagingDeliverySender implements MessageDeliverySender{
  /** @param registry - Implemented adapter allowlist. @param readProvider - Native original marker/resource authorization. @param preparation - Private immutable intent and transient material owner. */
  constructor(private readonly registry:MessagingProviderRegistry,private readonly readProvider:CurrentMessagingProviderReader,private readonly preparation:VerificationDeliveryPreparation){}
  /** @param context - Original committed attempt. @param signal - Its original deadline/cancellation. @returns Own transport evidence from only the resolved adapter; unsupported channels never enter RPC. */
  async send(context:AuthorizedDeliveryMessagingContext,signal:AbortSignal){
    return(await this.prepare(context,signal)).send(signal);
  }
  /** @param context - Original committed attempt. @param signal - Remaining run deadline. @returns Exactly one prepared adapter operation without starting the provider request. */
  async prepare(context:AuthorizedDeliveryMessagingContext,signal:AbortSignal){
    signal.throwIfAborted();const prepared=await this.preparation.prepare(context,signal);signal.throwIfAborted();
    const providerId=await this.readProvider(context);signal.throwIfAborted();
    return this.registry.resolve(providerId,prepared.intent.channel).createSender({prepare:async()=>prepared}).prepare(context,signal);
  }
}
