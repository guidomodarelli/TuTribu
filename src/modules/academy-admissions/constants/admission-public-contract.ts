/** Owns bounded public contract vocabulary without admitting browser authorization facts. @module admission-public-contract */
import { ADMISSION_LIMIT } from "./admission-limits";
/** Bounds transport pages and opaque cursor/search input independently of CSV capacity. */
export const ADMISSION_QUERY_LIMIT = { defaultPageSize: 25, maximumPageSize: 50, cursorCharacters: 512, searchCharacters: 100 } as const;
/** Allows decimal query counts only; booleans and expressions cannot coerce into pagination. */
export const ADMISSION_QUERY_INTEGER_PATTERN = /^\d+$/u;
/** Six decimal characters are a local verification input, never a browser permission flag. */
export const ADMISSION_PUBLIC_CODE_PATTERN = new RegExp(`^[0-9]{${ADMISSION_LIMIT.verificationCodeDigits}}$`, "u");
/** Recognizes an intentionally hidden contact representation rather than a plaintext destination. */
export const ADMISSION_MASK_MARKER_PATTERN = /[•*…]/u;
/** Rejects authority-like paths, backslashes and controls in a same-origin navigation result. */
export const ADMISSION_LOCAL_HREF_PATTERN = /^\/(?!\/)[^\\\u0000-\u0020\u007f]*$/u;
/** Separates public navigation state from domain authority and hidden eligibility facts. */
export const ADMISSION_OVERVIEW_STATE = { available: "available", pending: "pending", alreadyMember: "already_member", verificationRequired: "verification_required", signInRequired: "sign_in_required", closed: "closed", unavailable: "unavailable" } as const;
/** Gives the client a closed navigation hint; actions still reauthorize in the owner. */
export const ADMISSION_NEXT_ACTION = { signIn: "sign_in", requestAdmission: "request_admission", verifyContact: "verify_contact", viewRequest: "view_request", openAcademy: "open_academy", changeAccount: "change_account", wait: "wait", contactLeader: "contact_leader", none: "none" } as const;
/** Names the persisted historical source without deriving it from browser flags. */
export const ADMISSION_PUBLIC_SOURCE = { common: "common", personal: "personal", legacy: "legacy" } as const;
/** Keeps decision input separate from resulting request status. */
export const ADMISSION_DECISION = { approve: "approve", reject: "reject" } as const;
/** Distinguishes confirmed per-row results, business rejection and unconfirmed work. */
export const ADMISSION_BATCH_ITEM_STATUS = { approved: "approved", rejected: "rejected", cancelled: "cancelled", conflict: "conflict", denied: "denied", unresolved: "unresolved" } as const;
/** Summarizes actual item counts; no global success hides rejected or unresolved items. */
export const ADMISSION_BATCH_RESULT = { allSucceeded: "all_succeeded", mixed: "mixed", allRejected: "all_rejected", incomplete: "incomplete" } as const;
/** Distinguishes global Google capture from a local admission code, without returning OAuth identifiers. */
export const ADMISSION_REVIEW_EVIDENCE_SOURCE = { google: "google", localCode: "local_code" } as const;
/** Base evidence belongs to the current applicant account rather than a tenant-issued challenge. */
export const ADMISSION_REVIEW_ACCOUNT_SCOPE = "account";
/** Delimits a timestamp/UUID tuple without exposing an offset or granting resource authority. */
export const ADMISSION_REVIEW_CURSOR_SEPARATOR = "~";
