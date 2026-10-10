/** Guards only minimal own immutable configuration mutation facts. @module messaging-connection-configuration-result */
import {z} from "zod";
import {messagingConnectionMutationSchema} from "./messaging-connection-mutation-result";
import type {MessagingConnectionConfigurationResult} from "@/src/modules/messaging/domain/repositories/messaging-connection-configuration";
/** Stored original results and public responses share one owned schema. */
export const messagingConnectionConfigurationSchema=messagingConnectionMutationSchema.extend({changed:z.boolean()}) satisfies z.ZodType<MessagingConnectionConfigurationResult>;
