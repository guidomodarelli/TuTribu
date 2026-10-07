/** Composes explicit provider resolution with the current protected scope and existing application ports. @module messaging-provider-adapters */
import "server-only";
import type {MessagingSecurityFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {VerificationDeliveryPreparation} from "../zavu/verification-delivery-preparation";
import {PostgresCurrentMessagingProvider,type MessagingProviderDatabaseExecutor} from "../repositories/postgres-current-messaging-provider";
import {MessagingProviderRegistry} from "../messaging-provider-registry";
import {RegisteredMessagingInspectorFactory,RegisteredMessagingDeliverySender} from "../registered-messaging-adapters";
import {createZavuProviderDescriptor} from "../zavu/zavu-provider-descriptor";

/** @param dependencies - Actual native checkout, current non-secret security facts and explicit hosting transport. @returns Provider-independent ports and the implemented catalog; no lookup defaults or client/credential caches. */
export function createRegisteredMessagingAdapters(dependencies:{execute:MessagingProviderDatabaseExecutor;readSecurityFacts:()=>Promise<MessagingSecurityFacts>;fetch:typeof globalThis.fetch}){
  const registry=new MessagingProviderRegistry([createZavuProviderDescriptor(dependencies.fetch)]),providers=new PostgresCurrentMessagingProvider(dependencies.execute,dependencies.readSecurityFacts),readProvider=providers.read.bind(providers);
  return{inspectors:new RegisteredMessagingInspectorFactory(registry,readProvider),catalog:registry.list(),createSender:(preparation:VerificationDeliveryPreparation)=>new RegisteredMessagingDeliverySender(registry,readProvider,preparation)};
}
