/** Guards original minimal activation/replacement facts without secrets or provider references. @module messaging-connection-activation-result */
import {z} from "zod";
import {messagingConnectionMutationSchema} from "./messaging-connection-mutation-result";
import type {MessagingConnectionActivationResult} from "@/src/modules/messaging/domain/repositories/messaging-connection-activation";
/** Own scope and counters are the only mutation metadata shared with the client. */
export const messagingConnectionActivationSchema=messagingConnectionMutationSchema.extend({replaced:z.strictObject({connectionId:z.uuid(),connectionVersion:z.int().positive()}).nullable(),policyVersion:z.int().positive().nullable()}) satisfies z.ZodType<MessagingConnectionActivationResult>;
