/** Guards minimal local lifecycle snapshots without credentials, provider metadata or affected people's data. @module messaging-connection-lifecycle-result */
import { z } from "zod";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { MESSAGING_CONNECTION_SECURITY_REASON } from "../../constants/messaging-connection-security";

/** Original commit facts do not describe current selection or promise external cancellation. */
export const messagingConnectionLifecycleResultSchema=z.strictObject({id:z.uuid(),version:z.int().positive(),state:z.enum([MESSAGING_CONNECTION_STATE.suspended,MESSAGING_CONNECTION_STATE.disconnected]),reason:z.enum(MESSAGING_CONNECTION_SECURITY_REASON).nullable(),changed:z.boolean()});
/** Own JSON response/ledger contract; current configuration must be read from its owner after recovery. */
export type MessagingConnectionLifecycleResult=z.infer<typeof messagingConnectionLifecycleResultSchema>;
