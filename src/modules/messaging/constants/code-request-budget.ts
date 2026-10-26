/** Names global code-request locks, request events and moving-hour duration. @module code-request-budget-constants */
import { MILLISECONDS_PER_SECOND, SECONDS_PER_HOUR } from "@/src/constants/time";
/** Serializes the account budget across all contacts and tenants. */
export const CODE_REQUEST_ACCOUNT_LOCK_DOMAIN = "messaging_code_request_account";
/** Serializes contact consumption after alias resolution across retained keyring generations. */
export const CODE_REQUEST_CONTACT_LOCK_DOMAIN = "messaging_code_request_contact";
/** Serializes channel/hour and tribe/day diagnostic counters without changing account/contact scope. */
export const CODE_REQUEST_DIAGNOSTIC_LOCK_DOMAIN = "messaging_code_request_diagnostic_tribe";
/** Bounds the moving-hour request window in milliseconds; daily windows are calculated in UTC. */
export const CODE_REQUEST_HOURLY_WINDOW_MS = MILLISECONDS_PER_SECOND * SECONDS_PER_HOUR;
/** Keeps request and diagnostic obligations distinct from local failures and external reservations. */
export const CODE_REQUEST_EVENT = { request: "code_request", diagnostic: "diagnostic_request", credential: "credential_validation" } as const;
