/** Maps auth-owned failures to safe Spanish HTTP contracts using the existing JSON boundary. */
import "server-only";
import {z} from "zod";
import {HTTP_STATUS} from "@/src/constants/http-status";
import {REAUTHENTICATION_ERROR_CODE,REAUTHENTICATION_ERROR_MESSAGE} from "@/src/modules/auth/constants/reauthentication-intents";
import type {ReauthenticationFailure} from "@/src/modules/auth/application/results/reauthentication-intent-result";
import {createOwnJsonRouteBoundary} from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";

const statusByCode={not_authenticated:HTTP_STATUS.unauthorized,reauthentication_required:HTTP_STATUS.forbidden,context_unavailable:HTTP_STATUS.forbidden,intent_not_found:HTTP_STATUS.notFound,invalid_input:HTTP_STATUS.unprocessableEntity,unexpected_failure:HTTP_STATUS.serverError,public_contract_unusable:HTTP_STATUS.serverError} as const;
const errorSchema=z.strictObject({code:z.enum(REAUTHENTICATION_ERROR_CODE),message:z.string().min(1),requestId:z.string().min(1)});

/**
 * Builds once-per-part input validation and own output validation with no raw causes.
 * @param request - Existing request and safe correlation input.
 * @param operation - Fixed owned route operation, never a browser-selected logger operation.
 * @returns Private no-store response helpers and safe Spanish failures.
 */
export function createReauthenticationRouteBoundary(request:Request,operation:string) {
  return createOwnJsonRouteBoundary<ReauthenticationFailure,z.infer<typeof errorSchema>>({request,operation,feature:"auth",errorSchema,invalidInput:()=>({code:REAUTHENTICATION_ERROR_CODE.invalidInput}),unusableContract:()=>({code:REAUTHENTICATION_ERROR_CODE.unusableContract}),unexpectedFailure:(cause)=>({code:REAUTHENTICATION_ERROR_CODE.unexpected,cause}),projectFailure:(failure,requestId)=>({status:statusByCode[failure.code],body:{code:failure.code,message:REAUTHENTICATION_ERROR_MESSAGE[failure.code],requestId}})});
}
