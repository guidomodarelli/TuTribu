/** Guards only owned validation progress/results, never provider replies or private references. @module messaging-credential-validation-result */
import { z } from "zod";
import type { MessagingCredentialValidationResult } from "@/src/modules/messaging/domain/repositories/messaging-credential-validation";
import { MESSAGING_CREDENTIAL_PUBLIC_STATE } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGING_CREDENTIAL_MODE } from "@/src/modules/messaging/constants/messaging-credential-validation";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** A preparation DTO records only public resource/counter facts; its private ledger UUID is read separately. */
export const messagingCredentialPreparationSchema=z.object({id:z.uuid(),configurationVersion:z.int().positive(),expectedVersion:z.int().positive()});
/** A successful inspection does not imply channel readiness or a locally verified diagnostic. */
export const messagingCredentialValidationSchema=z.object({id:z.uuid(),version:z.int().positive(),configurationVersion:z.int().positive(),credentialState:z.enum([MESSAGING_CREDENTIAL_PUBLIC_STATE.valid,MESSAGING_CREDENTIAL_PUBLIC_STATE.invalid,MESSAGING_CREDENTIAL_PUBLIC_STATE.unavailable]),credentialMode:z.enum(MESSAGING_CREDENTIAL_MODE),validatedAt:z.iso.datetime({offset:true}),failureCode:z.enum(MESSAGING_ERROR_CODE).optional()}).refine((result)=>result.credentialState===MESSAGING_CREDENTIAL_PUBLIC_STATE.valid?result.failureCode===undefined&&result.credentialMode!==MESSAGING_CREDENTIAL_MODE.unknown:result.failureCode!==undefined&&result.credentialMode===MESSAGING_CREDENTIAL_MODE.unknown) satisfies z.ZodType<MessagingCredentialValidationResult>;
