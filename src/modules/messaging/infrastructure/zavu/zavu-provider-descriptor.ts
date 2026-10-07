/** Registers only real pinned Zavu operations at the infrastructure composition boundary. @module zavu-provider-descriptor */
import "server-only";
import type {MessagingProviderDescriptor} from "../messaging-provider-registry";
import {ZavuConnectionInspector} from "./zavu-connection-inspector";
import {ZavuMessageDeliverySender} from "./zavu-message-delivery-sender";
import {MESSAGING_INITIAL_PROVIDER_ID,MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";

/** @param fetch - Explicit current hosting transport or closed own test HTTP boundary. @returns Stateless factories; no credential, client or sender is cached. */
export function createZavuProviderDescriptor(fetch:typeof globalThis.fetch):MessagingProviderDescriptor{
  return{id:MESSAGING_INITIAL_PROVIDER_ID,channels:[MESSAGING_PUBLIC_CHANNEL.email,MESSAGING_PUBLIC_CHANNEL.sms,MESSAGING_PUBLIC_CHANNEL.whatsapp],createInspector:(context,credential)=>new ZavuConnectionInspector({...context,credential},fetch),createSender:(preparation)=>new ZavuMessageDeliverySender(preparation,fetch)};
}
