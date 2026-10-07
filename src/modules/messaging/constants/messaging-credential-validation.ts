/** Names the durable database-only preparation and provider-independent final credential outcome. @module messaging-credential-validation-constants */
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
/** Preparation completes only accounting eligibility, never credential or channel validation. */
export const MESSAGING_CREDENTIAL_VALIDATION_OPERATION={prepare:"prepare_messaging_credential_validation",complete:REAUTHENTICATION_OPERATION.validateMessagingConnection}as const;
/** Classifies credential environment only from the actual inspected mode. */
export const MESSAGING_CREDENTIAL_MODE={production:"production",test:"test",unknown:"unknown"}as const;
