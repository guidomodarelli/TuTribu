/** Guards leader metadata and the distinct minimal guardian operational alert. @module messaging-configuration-result */
import {z} from "zod";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {MESSAGING_GENERIC_CREDENTIAL_MASK,MESSAGING_CREDENTIAL_PUBLIC_STATE,MESSAGING_CAPABILITY_PUBLIC_STATE,MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_MODE} from "@/src/modules/messaging/constants/messaging-credential-validation";
import {messagingUsagePolicyStateSchema} from "./messaging-public-result-schemas";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";

/** A prepared capability and a locally verified diagnostic remain separate facts. */
const configurationCapabilitySchema=z.object({channel:z.enum(MESSAGING_PUBLIC_CHANNEL),state:z.enum(MESSAGING_CAPABILITY_PUBLIC_STATE),checkedAt:z.iso.datetime({offset:true}).nullable(),testedAt:z.iso.datetime({offset:true}).nullable()});
/** Identifies one exact current resource without sender/template/secret or provider administrative references. */
export const messagingConfigurationConnectionSchema=z.object({id:z.uuid(),name:z.string().min(1).max(ADMISSION_LIMIT.displayNameCharacters),version:z.int().positive(),configurationVersion:z.int().positive(),state:z.enum(MESSAGING_CONNECTION_STATE),credentialState:z.enum(MESSAGING_CREDENTIAL_PUBLIC_STATE),credentialMode:z.enum(MESSAGING_CREDENTIAL_MODE),maskedCredential:z.literal(MESSAGING_GENERIC_CREDENTIAL_MASK),capabilities:z.array(configurationCapabilitySchema)});
/** Guardian output cannot include the leader's configurations or usage data. */
export const messagingConfigurationSchema=z.discriminatedUnion("audience",[
  z.object({audience:z.literal("leader"),selected:messagingConfigurationConnectionSchema.nullable(),candidate:messagingConfigurationConnectionSchema.nullable(),usage:messagingUsagePolicyStateSchema}),
  z.strictObject({audience:z.literal("guardian"),operationalAlert:z.enum(["not_configured","attention_required","available"])}),
]);
/** Own view models accepted at server props, JSON and browser boundaries. */
export type MessagingConfigurationResult=z.infer<typeof messagingConfigurationSchema>;
export type MessagingConfigurationConnection=z.infer<typeof messagingConfigurationConnectionSchema>;
