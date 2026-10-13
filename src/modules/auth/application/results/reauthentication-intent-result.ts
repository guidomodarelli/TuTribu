/** Publishes only owned safe intent state, never nonce, subject, account or credentials. */
import {z} from "zod";
import {GLOBAL_REAUTHENTICATION_INTENT_STATE} from "@/src/modules/auth/constants/recent-authentication";
import {REAUTHENTICATION_ERROR_CODE,REAUTHENTICATION_INTENT_OUTCOME} from "@/src/modules/auth/constants/reauthentication-intents";

export const reauthenticationIntentResultSchema=z.strictObject({intentId:z.uuid(),state:z.enum(GLOBAL_REAUTHENTICATION_INTENT_STATE),outcome:z.enum(REAUTHENTICATION_INTENT_OUTCOME),safeMessage:z.string().min(1),returnPath:z.string().startsWith("/").refine((path)=>!path.startsWith("//")&&!path.includes("\\")),validUntil:z.iso.datetime({offset:true}).optional()});
export type ReauthenticationIntentResult=z.infer<typeof reauthenticationIntentResultSchema>;
export type ReauthenticationFailure={code:(typeof REAUTHENTICATION_ERROR_CODE)[keyof typeof REAUTHENTICATION_ERROR_CODE];cause?:unknown};
export type ReauthenticationIntentUseCaseResult={ok:true;value:ReauthenticationIntentResult}|{ok:false;failure:ReauthenticationFailure};
