/** Defines platform-owned contact budget domains and continuity windows. @module contact-budget-constants */
import { MILLISECONDS_PER_SECOND, SECONDS_PER_DAY } from "@/src/constants/time";
export const CONTACT_BUDGET_FINGERPRINT_DOMAIN = "tutribu.messaging.contact-budget.v1";
export const CONTACT_BUDGET_LOCK_DOMAIN = "messaging_contact_budget_alias";
/** Covers every moving-hour/UTC-day code-request window during a key retirement. */
export const CONTACT_BUDGET_CONTINUITY_WINDOW_MS = SECONDS_PER_DAY * MILLISECONDS_PER_SECOND;
export const CONTACT_BUDGET_REQUEST_EVENT = "code_request";
