/** Defines read-only resource inspection after exact current credential authorization. @module messaging-resource-inspection */
import type {AuthorizedMessagingContext} from "./messaging-repositories";
import type {MessagingConnectionInspector} from "./messaging-connection-inspector";
import type {MESSAGING_RESOURCE_KIND} from "@/src/modules/messaging/constants/messaging-resources";

/** An own continuation is scoped to a configuration; every request resolves authority again. */
export type MessagingResourceCursor={tribeId:string;connectionId:string;configurationVersion:number;kind:(typeof MESSAGING_RESOURCE_KIND)[keyof typeof MESSAGING_RESOURCE_KIND];offset:number};
/** SDK clients remain infrastructure and transient; no global key or mutable singleton. */
export interface MessagingResourceInspectorFactory{
  /** @param context - Current exact server authority and resource. @param credential - Transient authorized bytes. @returns Read-only resource enumeration without messages or provisioning. */
  create(context:AuthorizedMessagingContext,credential:string):Pick<MessagingConnectionInspector,"listSenders"|"listTemplates">;
}
