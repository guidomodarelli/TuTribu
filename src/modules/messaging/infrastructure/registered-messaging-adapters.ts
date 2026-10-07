/** Resolves the currently authorized provider before each real operation, retaining application-owned ports. @module registered-messaging-adapters */
import "server-only";
import type {AuthorizedMessagingContext,AuthorizedDeliveryMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConnectionInspector} from "@/src/modules/messaging/domain/repositories/messaging-connection-inspector";
import type {MessagingCredentialInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-credential-validation";
import type {MessagingResourceInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-resource-inspection";
import type {MessagingConfigurationInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-connection-configuration";
import type {MessageDeliverySender} from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type {VerificationDeliveryPreparation} from "./zavu/verification-delivery-preparation";
import {MessagingProviderRegistry} from "./messaging-provider-registry";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";

/** Current provider identity comes from a protected infrastructure read, never browser readiness or an inferred default. */
export type CurrentMessagingProviderReader=(context:AuthorizedMessagingContext|AuthorizedDeliveryMessagingContext)=>Promise<string>;
/** One factory satisfies existing application ports; no case of use learns an SDK or external DTO. */
export class RegisteredMessagingInspectorFactory implements MessagingCredentialInspectorFactory,MessagingResourceInspectorFactory,MessagingConfigurationInspectorFactory{
  /** @param registry - Implemented adapter allowlist. @param readProvider - Native current scope/epoch authorization and exact stored identity. */
  constructor(private readonly registry:MessagingProviderRegistry,private readonly readProvider:CurrentMessagingProviderReader){}
  /** @param context - Actual current authorized immutable version. @param credential - Transient server-only bytes. @returns Operations resolving the current provider before constructing its inspector. */
  create(context:AuthorizedMessagingContext,credential:string):MessagingConnectionInspector{
    /** @param signal - Original caller cancellation. @param whatsapp - Whether this operation requires real WhatsApp support. @returns The exact freshly resolved inspector, with no default substitution. */
    const resolve=async(signal:AbortSignal,whatsapp=false)=>{
      signal.throwIfAborted();const providerId=await this.readProvider(context);signal.throwIfAborted();return this.registry.resolve(providerId,whatsapp?MESSAGING_PUBLIC_CHANNEL.whatsapp:undefined).createInspector(context,credential);
    };
    return{
      inspectCredential:async(signal)=>(await resolve(signal)).inspectCredential(signal),
      listSenders:async(signal)=>(await resolve(signal)).listSenders(signal),
      retrieveSender:async(resourceId,signal)=>(await resolve(signal)).retrieveSender(resourceId,signal),
      listTemplates:async(signal)=>(await resolve(signal,true)).listTemplates(signal),
      retrieveTemplate:async(resourceId,signal)=>(await resolve(signal,true)).retrieveTemplate(resourceId,signal),
    };
  }
}
/** Prepares the original authorized attempt once and resolves only its exact implemented channel/provider. */
export class RegisteredMessagingDeliverySender implements MessageDeliverySender{
  /** @param registry - Implemented adapter allowlist. @param readProvider - Native original marker/resource authorization. @param preparation - Private immutable intent and transient material owner. */
  constructor(private readonly registry:MessagingProviderRegistry,private readonly readProvider:CurrentMessagingProviderReader,private readonly preparation:VerificationDeliveryPreparation){}
  /** @param context - Original committed attempt. @param signal - Its original deadline/cancellation. @returns Own transport evidence from only the resolved adapter; unsupported channels never enter RPC. */
  async send(context:AuthorizedDeliveryMessagingContext,signal:AbortSignal){
    signal.throwIfAborted();const prepared=await this.preparation.prepare(context,signal);signal.throwIfAborted();
    const providerId=await this.readProvider(context);signal.throwIfAborted();
    return this.registry.resolve(providerId,prepared.intent.channel).createSender({prepare:async()=>prepared}).send(context,signal);
  }
}
