/** Defines explicit diagnostic browser actions using own application contracts, never provider DTOs. @module messaging-diagnostic-browser-client */
import type {z} from "zod";
import type {MessagingUsageBrowserResult} from "./messaging-usage-browser-client";
import type {IssueConnectionDiagnosticInput} from "../use-cases/issue-connection-diagnostic-use-case";
import type {ConnectionDiagnosticIssueResult} from "../../domain/repositories/connection-diagnostic-issuance";
import type {ConnectionDiagnosticSnapshot} from "../results/connection-diagnostic-result";
import type {messageDeliverySchema} from "../results/messaging-flow-result-schemas";
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";

/** Current immutable scope binds responses; it never grants access to an integration. */
export type MessagingDiagnosticBrowserScope={slug:string;connectionId:string;configurationVersion:number};
/** Only explicitly confirmed destination input crosses the same-origin boundary; it is not persisted in browser metadata. */
export type MessagingDiagnosticBrowserIssue=Omit<IssueConnectionDiagnosticInput,"tribeId"|"connectionId"|"requestId">;
export interface MessagingDiagnosticBrowserClient{
  /** @param scope - Current own connection/version. @param input - Original explicit consent/destination/CAS. @param signal - Observation lifetime. @returns Masked original issuance or uncertainty without replaying dispatch. */
  issue(scope:MessagingDiagnosticBrowserScope,input:MessagingDiagnosticBrowserIssue,signal:AbortSignal):Promise<MessagingUsageBrowserResult<AdmissionOperationResult<ConnectionDiagnosticIssueResult>>>;
  /** @param scope - Exact issued challenge scope. @param input - Original explicit received code, never a send. @param signal - Observation lifetime. @returns Local capability verification, never an admission/Google proof. */
  verify(scope:MessagingDiagnosticBrowserScope&{diagnosticId:string;channel:MessagingDiagnosticBrowserIssue["channel"]},input:{operationId:string;confirmed:true;verificationCode:string},signal:AbortSignal):Promise<MessagingUsageBrowserResult<AdmissionOperationResult<ConnectionDiagnosticSnapshot>>>;
  /** @param query - Original associated delivery/channel. @param signal - Read lifetime. @returns Minimal transport state only, without message body or new writes. */
  delivery(query:{slug:string;deliveryId:string;channel:MessagingDiagnosticBrowserIssue["channel"]},signal:AbortSignal):Promise<MessagingUsageBrowserResult<z.infer<typeof messageDeliverySchema>>>;
}
