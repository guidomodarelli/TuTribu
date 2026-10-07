/** Names delivery/attempt facts without adopting upstream transport states as contact authority. @module message-delivery-constants */
import { VERIFICATION_MATERIAL_PURGE_OPERATION } from "./verification-material";
/** Records the private obligation independently of code verification. */
export const MESSAGE_DELIVERY_STATE = { queued: "queued", accepted: "accepted", delivered: "delivered", failed: "failed", unknown: "unknown", suppressed: "suppressed", cancelled: "cancelled" } as const;
/** Marks possible external dispatch before RPC; unknown preserves that possibility. */
export const MESSAGE_ATTEMPT_STATE = { inFlight: "in_flight", accepted: "accepted", delivered: "delivered", rejected: "rejected", unknown: "unknown" } as const;
/** Separates reservation categories without resetting them when configuration changes. */
export const MESSAGE_USAGE_CATEGORY = { verification: "verification", notification: "notification" } as const;
/** Releases only with deliberate absence evidence, never simply because a lease or request timed out. */
export const MESSAGE_RESERVATION_STATE = { consumed: "consumed", released: "released" } as const;
/** Names database outcomes of the private marker transition. */
export const MESSAGE_AUTHORIZATION_OUTCOME = { authorized: "authorized", suppressed: "suppressed", quotaExceeded: "quota_exceeded", stale: "stale" } as const;
/** Distinguishes receipt persistence from a lost CAS or a confirmed identical result. */
export const MESSAGE_COMPLETION_OUTCOME = { completed: "completed", unchanged: "unchanged", stale: "stale" } as const;
/** Selects only backend maintenance actions; it is not a browser permission token. */
export const MESSAGE_STORAGE_OPERATION = { claim: "claim_deliveries", authorize: "authorize_delivery", complete: "complete_attempt", read: "read_attempt", reconcile: "reconcile_leases", purgeVerificationMaterial: VERIFICATION_MATERIAL_PURGE_OPERATION } as const;
/** Names own terminal receipt reasons, never raw provider messages. */
export const MESSAGE_RECEIPT_REASON = { accepted: "provider_accepted", delivered: "provider_delivered", rejected: "provider_rejected", unknown: "dispatch_result_unknown" } as const;
