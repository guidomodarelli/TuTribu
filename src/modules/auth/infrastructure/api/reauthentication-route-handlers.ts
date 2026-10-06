/** Runs owned intent use cases only after the actual HTTP input boundary accepts the request. */
import "server-only";
import {HTTP_STATUS} from "@/src/constants/http-status";
import type {ReauthenticationIntentUseCaseResult} from "@/src/modules/auth/application/results/reauthentication-intent-result";
import {reauthenticationIntentResultSchema} from "@/src/modules/auth/application/results/reauthentication-intent-result";
import {createReauthenticationIntentSchema,reauthenticationIntentParamsSchema} from "./reauthentication-request-schemas";
import {createReauthenticationRouteBoundary} from "./reauthentication-route-http";

/** Small own module contract; no SDK/database object reaches an application consumer. */
export type ReauthenticationIntentRouteModule={useCases:{
  createIntent:{execute:(command:{tribeId:string;operation:string;resourceId:string;returnPath:string})=>Promise<ReauthenticationIntentUseCaseResult>};
  readIntent:{execute:(command:{intentId:string})=>Promise<ReauthenticationIntentUseCaseResult>};
}};

/**
 * Creates only an explicitly confirmed, current-session intent; no OAuth or message is sent.
 * @param request - Native body validated exactly once at this own boundary.
 * @param createModule - Current server account and guarded application composition.
 * @returns Safe created DTO or a closed audience/input/operation failure.
 */
export async function postReauthenticationIntent(request:Request,createModule:()=>Promise<ReauthenticationIntentRouteModule>):Promise<Response> {
  const boundary=createReauthenticationRouteBoundary(request,"create_reauthentication_intent");
  const input=await boundary.readBody(createReauthenticationIntentSchema);
  if(!input.usable) return input.response;
  try {
    const authModule=await createModule();
    const result=await authModule.useCases.createIntent.execute(input.value);
    return result.ok?boundary.success(reauthenticationIntentResultSchema,result.value,HTTP_STATUS.created):boundary.failure(result.failure);
  } catch(error) {return boundary.unexpected(error);}
}

/**
 * Reads one owned intent without consuming its nonce or emitting any authority.
 * @param request - Native request with private caching/correlation semantics.
 * @param params - Resolved framework params, validated once before account lookup.
 * @param createModule - Request-owned application composition.
 * @returns Explicit safe intent outcome; a consumed callback alone is not verification.
 */
export async function getReauthenticationIntent(request:Request,params:unknown,createModule:()=>Promise<ReauthenticationIntentRouteModule>):Promise<Response> {
  const boundary=createReauthenticationRouteBoundary(request,"read_reauthentication_intent");
  const input=boundary.input("params",reauthenticationIntentParamsSchema,params);
  if(!input.usable) return input.response;
  try {
    const authModule=await createModule();
    const result=await authModule.useCases.readIntent.execute(input.value);
    return result.ok?boundary.success(reauthenticationIntentResultSchema,result.value):boundary.failure(result.failure);
  } catch(error) {return boundary.unexpected(error);}
}
