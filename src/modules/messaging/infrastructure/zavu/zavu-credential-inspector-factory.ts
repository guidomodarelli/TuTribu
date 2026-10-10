/** Creates a fresh pinned SDK inspector only from explicit authorized private material. @module zavu-credential-inspector-factory */
import "server-only";
import type { MessagingCredentialInspectorFactory } from "@/src/modules/messaging/domain/repositories/messaging-credential-validation";
import type {MessagingResourceInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-resource-inspection";
import type {MessagingConfigurationInspectorFactory} from "@/src/modules/messaging/domain/repositories/messaging-connection-configuration";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { ZavuConnectionInspector } from "./zavu-connection-inspector";

/** Keeps transport selection at infrastructure and never caches a provider credential or client. */
export class ZavuCredentialInspectorFactory implements MessagingCredentialInspectorFactory,MessagingResourceInspectorFactory,MessagingConfigurationInspectorFactory {
  /** @param fetch - Explicit hosting transport or the owned closed test boundary. */
  constructor(private readonly fetch:typeof globalThis.fetch){}
  /** @param context - Current exact actor/resource/security scope. @param credential - Transient private material from SecretStore. @returns A new read-only inspector with the same original scope. */
  create(context:AuthorizedMessagingContext,credential:string){return new ZavuConnectionInspector({...context,credential},this.fetch);}
}
