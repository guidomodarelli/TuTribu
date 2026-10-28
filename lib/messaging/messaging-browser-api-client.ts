"use client";
/** Shares guarded same-origin HTTP observations without retrying mutations or preserving private input. @module messaging-browser-api-client */
import {OPERATION_STATE} from "@/src/constants/operation-state";
import type {z} from "zod";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type {MessagingErrorCode} from "@/src/modules/messaging/application/results/messaging-errors";
import {messagingPublicErrorSchema} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import {MESSAGING_ERROR_CODE,MESSAGING_ERROR_MESSAGE} from "@/src/modules/messaging/constants/messaging-errors";
import {HTTP_STATUS} from "@/src/constants/http-status";
import {boundBrowserRequest} from "@/lib/browser-request-deadline";

/** @param code - Own semantic outcome. @param uncertain - Whether a write may have committed. @returns Safe localized facts with no body, transport cause or provider error. */
export function messagingBrowserFailure(code:MessagingErrorCode,uncertain=false):MessagingUsageBrowserResult<never>{return{status:"failed",code,message:MESSAGING_ERROR_MESSAGE[code],uncertain};}

/** @param transport - Native fetch or an owned HTTP boundary. @returns A single-request observer; all input and DTO ownership stays with the caller. */
export function createMessagingBrowserRequest(transport:typeof fetch=globalThis.fetch){
  /** @param url - Fixed same-origin adapter path. @param schema - Own public DTO guard. @param signal - Observation lifetime. @param write - Explicit method/input, absent for reads. @returns A safe observed result or uncertainty, never inferred rollback or an automatic retry. */
  return async function request<Value>(url:string,schema:z.ZodType<Value>,callerSignal:AbortSignal,write?:{method:"POST"|"PUT";input:object}):Promise<MessagingUsageBrowserResult<Value>>{
    const writing=write!==undefined;if(callerSignal.aborted)return{status:"aborted"};
    // A hung response ends at the deadline as a timeout that keeps a write uncertain; the caller's own cancellation stays an abort.
    return boundBrowserRequest<MessagingUsageBrowserResult<Value>>(callerSignal,(signal)=>send(url,schema,signal,write),()=>messagingBrowserFailure(MESSAGING_ERROR_CODE.transportTimeout,writing));
  };

  /** Sends one own request under a signal that already follows the caller and the deadline. */
  async function send<Value>(url:string,schema:z.ZodType<Value>,signal:AbortSignal,write?:{method:"POST"|"PUT";input:object}):Promise<MessagingUsageBrowserResult<Value>>{
    const writing=write!==undefined;
    try{
      const response=await transport(url,{method:write?.method??"GET",credentials:"same-origin",cache:"no-store",signal,...(write?{headers:{"content-type":"application/json"},body:JSON.stringify(write.input)}:{})});
      let body:unknown;try{body=await response.json();}catch{return signal.aborted?{status:"aborted"}:messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);}
      if(signal.aborted)return{status:"aborted"};
      const publicFailure=messagingPublicErrorSchema.safeParse(body);
      // A failure bound to a completed original is its final answer (for example a stored denial); an unfinished or unresolved original stays uncertain and recoverable.
      if(publicFailure.success){const operation=publicFailure.data.operation,unresolved=operation!==undefined&&(operation.state!==OPERATION_STATE.completed||publicFailure.data.code===MESSAGING_ERROR_CODE.operationUnresolved);return messagingBrowserFailure(publicFailure.data.code,writing&&(response.status>=HTTP_STATUS.serverError||unresolved));}
      if(!response.ok)return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);
      const parsed=schema.safeParse(body);return parsed.success?{status:"ready",value:parsed.data}:messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);
    }catch{return signal.aborted?{status:"aborted"}:messagingBrowserFailure(MESSAGING_ERROR_CODE.dependencyUnavailable,writing);}
  }
}
