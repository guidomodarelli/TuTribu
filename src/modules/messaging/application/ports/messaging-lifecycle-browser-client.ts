/** Defines explicit local lifecycle browser actions without auth state, SDK or provider DTOs. @module messaging-lifecycle-browser-client */
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { MessagingConnectionLifecycleResult } from "../results/messaging-connection-lifecycle-result";
import type { MessagingConnectionLifecycleInput, MessagingConnectionSuspensionInput } from "../../domain/repositories/messaging-connection-lifecycle";
import type { MessagingUsageBrowserResult } from "./messaging-usage-browser-client";

/** Public route identity conveys no actor, role or authority. */
export type MessagingLifecycleBrowserScope={slug:string;connectionId:string};
/** Each call corresponds to one explicit original UUID/CAS and current renewed consent. */
export interface MessagingLifecycleBrowserClient{
  /** @param scope - Exact public route resource. @param input - Explicit original cause/confirmation/CAS. @param signal - This observation's cancellation. @returns Minimum original local stop result or safe uncertainty, without retry. */
  suspend(scope:MessagingLifecycleBrowserScope,input:MessagingConnectionSuspensionInput,signal:AbortSignal):Promise<MessagingUsageBrowserResult<AdmissionOperationResult<MessagingConnectionLifecycleResult>>>;
  /** @param scope - Exact public route resource. @param input - Explicit original confirmation/CAS. @param signal - This observation's cancellation. @returns Minimum retirement result after server dependency checks, without external revocation claims. */
  disconnect(scope:MessagingLifecycleBrowserScope,input:MessagingConnectionLifecycleInput,signal:AbortSignal):Promise<MessagingUsageBrowserResult<AdmissionOperationResult<MessagingConnectionLifecycleResult>>>;
}
