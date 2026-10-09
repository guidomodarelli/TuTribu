/** Names persisted request states independently of admission submission outcomes. @module admission-request-constants */
import { ADMISSION_POLICY_OPERATION } from "./admission-policy";
import { VERIFICATION_ISSUANCE_OPERATION } from "./verification-issuance";
import { ADMISSION_CONTACT_VERIFICATION_OPERATION } from "./admission-contact-verification";
import { ADMISSION_PROOF_OPERATION } from "./admission-proof";
import { ALLOWLIST_RECOVERABLE_OPERATIONS } from "./allowlist-management";
import { ALLOWLIST_IMPORT_RECOVERABLE_OPERATIONS } from "./allowlist-import";
export const ADMISSION_REQUEST_STATUS = { pending: "pending", approved: "approved", rejected: "rejected", cancelled: "cancelled", expired: "expired" } as const;
/** Own ledger namespaces bind the exact action to the same original client operation. */
export const ADMISSION_OPERATION_TYPE = { submit: "submit_admission", decide: "decide_admission_request", cancel: "cancel_admission_request", allowRetry: "allow_admission_retry" } as const;
/** Only these implemented request/policy owners can project an original operation recovery result. */
export const ADMISSION_RECOVERABLE_OPERATION_TYPES = [ADMISSION_OPERATION_TYPE.submit, ADMISSION_OPERATION_TYPE.decide, ADMISSION_OPERATION_TYPE.cancel, ADMISSION_OPERATION_TYPE.allowRetry, ...Object.values(ADMISSION_POLICY_OPERATION), ...Object.values(VERIFICATION_ISSUANCE_OPERATION), ADMISSION_CONTACT_VERIFICATION_OPERATION, ADMISSION_PROOF_OPERATION, ...ALLOWLIST_RECOVERABLE_OPERATIONS, ...ALLOWLIST_IMPORT_RECOVERABLE_OPERATIONS] as const;
/** Source is fixed by the owning route/token resolver, independently of contact authority. */
export const ADMISSION_REQUEST_SOURCE = { common: "common", personal: "personal", legacy: "legacy" } as const;
/** Local event names derive notices/audit from the same committed request fact. */
export const ADMISSION_REQUEST_EVENT = { pendingCreated: "pending_created", approved: "approved", rejected: "rejected", cancelled: "cancelled", expired: "expired" } as const;
