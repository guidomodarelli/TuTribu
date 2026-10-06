/** Limits private credential reads to operations that actually need provider access. */
import { MILLISECONDS_PER_SECOND, SECONDS_PER_DAY } from "@/src/constants/time";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

export const MESSAGING_SECRET_HUMAN_OPERATIONS = [REAUTHENTICATION_OPERATION.validateMessagingConnection, REAUTHENTICATION_OPERATION.readMessagingSenders, REAUTHENTICATION_OPERATION.readMessagingTemplates, REAUTHENTICATION_OPERATION.configureMessagingConnection, REAUTHENTICATION_OPERATION.diagnoseMessagingConnection, REAUTHENTICATION_OPERATION.activateMessagingConnection] as const;
/** Bounds inactive candidate material without imposing daily diagnostics on an unchanged active version. */
const MESSAGING_CANDIDATE_IDLE_DAYS = 7;
export const MESSAGING_CANDIDATE_IDLE_LIFETIME_MS = MESSAGING_CANDIDATE_IDLE_DAYS * SECONDS_PER_DAY * MILLISECONDS_PER_SECOND;
/** Names private persisted attempt facts; an uncertain or completed attempt cannot dispatch again. */
export const MESSAGING_SECRET_ATTEMPT_STATE = { inFlight: "in_flight", consumed: "consumed", queued: "queued" } as const;
/** Identifies the fixed worker operation and permits candidates only for connection diagnostics. */
export const MESSAGING_SECRET_DELIVERY_SCOPE = { operation: "dispatch_delivery", diagnostic: "connection_diagnostic", active: "active", degraded: "degraded" } as const;
