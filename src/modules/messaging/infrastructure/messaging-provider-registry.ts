/** Resolves explicitly registered infrastructure adapters and implemented channels without a fallback. @module messaging-provider-registry */
import "server-only";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConnectionInspector} from "@/src/modules/messaging/domain/repositories/messaging-connection-inspector";
import type {MessageDeliverySender} from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type {VerificationDeliveryPreparation} from "./zavu/verification-delivery-preparation";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";

/** Supported product channels remain independent of external SDK names. */
export type MessagingProviderChannel="email"|"sms"|"whatsapp";
/** An implemented adapter advertises only real channels and creates fresh scoped clients. */
export interface MessagingProviderDescriptor{
  readonly id:string;
  readonly channels:readonly MessagingProviderChannel[];
  /** @param context - Current exact authorized resource. @param credential - Transient server-only bytes. @returns Fresh provider-independent read-only operations. */
  createInspector(context:AuthorizedMessagingContext,credential:string):MessagingConnectionInspector;
  /** @param preparation - Original protected attempt preparation. @returns Fresh portable sender without an arbitrary browser send entrypoint. */
  createSender(preparation:VerificationDeliveryPreparation):MessageDeliverySender;
}
/** Infrastructure composition supplies the allowlist; neither browser input nor environment silently adds providers. */
export class MessagingProviderRegistry{
  private readonly descriptors:ReadonlyMap<string,MessagingProviderDescriptor>;
  /** @param descriptors - Explicitly implemented factories, bound only to their hosting transport. */
  constructor(descriptors:readonly MessagingProviderDescriptor[]){
    const registered=new Map<string,MessagingProviderDescriptor>();
    for(const descriptor of descriptors){if(!descriptor.id||registered.has(descriptor.id))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.connectionIncomplete);registered.set(descriptor.id,descriptor);}
    this.descriptors=registered;
  }
  /** @returns Non-secret catalog of actually registered providers; mutating its arrays cannot change resolution. */
  list():readonly {id:string;channels:readonly MessagingProviderChannel[]}[]{return[...this.descriptors.values()].map((descriptor)=>({id:descriptor.id,channels:[...descriptor.channels]}));}
  /** @param providerId - Exact authorized provider identity. @param channel - Requested implemented channel when relevant. @returns Only that exact adapter. @throws MessagingConnectionOperationError when identity/channel has no implementation. */
  resolve(providerId:string,channel?:MessagingProviderChannel):MessagingProviderDescriptor{
    const descriptor=this.descriptors.get(providerId);
    if(!descriptor||channel&&!descriptor.channels.includes(channel))throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability);
    return descriptor;
  }
}
