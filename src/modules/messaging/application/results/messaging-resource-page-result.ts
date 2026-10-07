/** Owns a bounded resource page and exact configuration scope without credential/admin payloads. @module messaging-resource-page-result */
import {z} from "zod";
import {providerResourcePageSchema} from "./messaging-flow-result-schemas";
/** Selected resource references belong only to the authorized current connection/version. */
export const messagingResourcePageSchema=providerResourcePageSchema.extend({connectionId:z.uuid(),configurationVersion:z.int().positive()});
export type MessagingResourcePageResult=z.infer<typeof messagingResourcePageSchema>;
