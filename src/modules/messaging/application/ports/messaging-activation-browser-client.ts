/** Defines one explicit selection action without SDK, credential, browser authority or route refresh. @module messaging-activation-browser-client */
import type {MessagingConnectionsBrowserResult} from "./messaging-connections-browser-client";
import type {MessagingConnectionActivationInput,MessagingConnectionActivationResult} from "../../domain/repositories/messaging-connection-activation";
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";

/** Observed own configuration is a result binding, never a server authorization claim. */
export type MessagingActivationBrowserScope={slug:string;connectionId:string;configurationVersion:number};
/** Current native authority, dependencies, production mode and diagnostics remain server-owned decisions. */
export interface MessagingActivationBrowserClient{
  /** @param scope - Explicit current candidate observed by the route. @param input - Original confirmation and lifecycle CAS. @param signal - Observation lifetime. @returns Original minimal selection or uncertainty without another request. */
  activate(scope:MessagingActivationBrowserScope,input:MessagingConnectionActivationInput,signal:AbortSignal):Promise<MessagingConnectionsBrowserResult<AdmissionOperationResult<MessagingConnectionActivationResult>>>;
}
