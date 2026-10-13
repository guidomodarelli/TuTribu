/** Owns resource-page observations and explicit immutable channel configuration without provider DTOs or key persistence. @module messaging-resources-browser-client */
import type {MessagingUsageBrowserResult} from "./messaging-usage-browser-client";
import type {MessagingResourcePageResult} from "../results/messaging-resource-page-result";
import type {MessagingConnectionConfigurationInput,MessagingConnectionConfigurationResult} from "../../domain/repositories/messaging-connection-configuration";
import type {MessagingResourceCursor} from "../../domain/repositories/messaging-resource-inspection";
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";

/** Current UI counters bind returned data; the backend independently owns all authority. */
export type MessagingResourceBrowserScope={slug:string;connectionId:string;configurationVersion:number};
export interface MessagingResourcesBrowserClient{
  /** @param query - Exact own scope/kind and optional own continuation. @param signal - Read lifetime. @returns One current page, without an automatic selection or subsequent fetch. */
  read(query:MessagingResourceBrowserScope&{kind:MessagingResourceCursor["kind"];cursor?:string},signal:AbortSignal):Promise<MessagingUsageBrowserResult<MessagingResourcePageResult>>;
  /** @param scope - Observed immutable configuration. @param input - Original explicit CAS and chosen resource references, never a key. @param signal - Observation lifetime. @returns Original version/no-op metadata or uncertainty without retrying. */
  configure(scope:MessagingResourceBrowserScope,input:MessagingConnectionConfigurationInput,signal:AbortSignal):Promise<MessagingUsageBrowserResult<AdmissionOperationResult<MessagingConnectionConfigurationResult>>>;
}
