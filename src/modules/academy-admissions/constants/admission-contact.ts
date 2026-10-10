/**
 * Defines contact kinds and canonicalization outcomes owned by academy admissions.
 *
 * @module admission-contact-constants
 */

/** Identifies the contact selected before the first policy activation. */
export const ADMISSION_CONTACT_TYPE = { email: "email", phone: "phone" } as const;

/** Distinguishes a canonical contact from input that cannot be used safely. */
export const ADMISSION_CONTACT_NORMALIZATION_STATUS = { valid: "valid", invalid: "invalid" } as const;

/** Names contact failures without exposing a recipient or library diagnostic. */
export const ADMISSION_CONTACT_ERROR = {
  invalid: "contact_invalid",
  countryRequired: "contact_country_required",
  countryMismatch: "contact_country_mismatch",
} as const;

/** Rejects whitespace, control characters, and missing email address parts. */
export const ADMISSION_EMAIL_PATTERN = /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/u;

/** Recognizes the normalizer's documented missing-country ParseError. */
export const ADMISSION_PHONE_PARSE_ERROR = { invalidCountry: "INVALID_COUNTRY" } as const;
