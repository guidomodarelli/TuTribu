/** Defines own same-origin wizard transport without provider DTOs or browser credential persistence. @module messaging-connections-browser-client */
import type {MessagingUsageBrowserResult} from "./messaging-usage-browser-client";
import type {MessagingConfigurationResult} from "../results/messaging-configuration-result";
import type {MessagingConnectionOperationRecovery} from "../results/messaging-connection-operation-result";
import type {MessagingConnectionMutationResult} from "../results/messaging-connection-mutation-result";
import type {MessagingConnectionCreationInput} from "../../domain/repositories/messaging-connection-management";
import type {AdmissionOperationResult} from "@/src/modules/academy-admissions/domain/entities/admission-operation";

/** A lost/aborted write retains its original identity; an observation cannot claim rollback. */
export type MessagingConnectionsBrowserResult<Value>=MessagingUsageBrowserResult<Value>;
export interface MessagingConnectionsBrowserClient{
  /** @param signal - Current observation lifetime. @returns Only current own viewer identity. */
  viewer(signal:AbortSignal):Promise<MessagingConnectionsBrowserResult<{id:string}|null>>;
  /** @param slug - Current canonical route. @param signal - Read lifetime. @returns Current own role-scoped metadata without SDK requests. */
  read(slug:string,signal:AbortSignal):Promise<MessagingConnectionsBrowserResult<MessagingConfigurationResult>>;
  /** @param slug - Current canonical route. @param input - Explicit original key held only in memory. @param signal - Write observation. @returns Original protected candidate result or uncertainty, without a retry. */
  create(slug:string,input:MessagingConnectionCreationInput,signal:AbortSignal):Promise<MessagingConnectionsBrowserResult<AdmissionOperationResult<MessagingConnectionMutationResult>>>;
  /** @param slug - Current canonical route. @param operationId - Original client UUID. @param signal - Read lifetime. @returns Original mutation metadata without another key or lease. */
  operation(slug:string,operationId:string,signal:AbortSignal):Promise<MessagingConnectionsBrowserResult<MessagingConnectionOperationRecovery>>;
}
