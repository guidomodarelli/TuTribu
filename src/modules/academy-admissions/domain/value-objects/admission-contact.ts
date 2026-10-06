/**
 * Canonicalizes contacts without creating evidence, bindings, or account identity.
 *
 * @module admission-contact
 */
import { isSupportedCountry, parsePhoneNumberWithError, ParseError, type CountryCode } from "libphonenumber-js/max";

import {
  ADMISSION_CONTACT_ERROR,
  ADMISSION_CONTACT_NORMALIZATION_STATUS,
  ADMISSION_CONTACT_TYPE,
  ADMISSION_EMAIL_PATTERN,
  ADMISSION_PHONE_PARSE_ERROR,
} from "@/src/modules/academy-admissions/constants/admission-contact";

export type AdmissionContactType = "email" | "phone";
export type AdmissionContact =
  | { type: "email"; value: string }
  | { type: "phone"; value: string; country: string };
export type AdmissionContactNormalizationResult =
  | { status: "valid"; contact: AdmissionContact }
  | { status: "invalid"; reason: (typeof ADMISSION_CONTACT_ERROR)[keyof typeof ADMISSION_CONTACT_ERROR] };

/**
 * Returns one canonical contact while preserving email dots, tags, and aliases.
 *
 * Phone parsing is strict: it consumes the whole value, rejects extensions,
 * derives the destination country, and refuses an incoherent supplied country.
 * Canonicalization never marks the contact as verified.
 *
 * @param input - Contact type, address/number, and optional explicit phone country.
 * @returns A canonical value or a stable failure without raw input diagnostics.
 * @throws An unexpected parser failure rather than hiding a library/runtime bug.
 */
export function normalizeAdmissionContact(input: {
  type: AdmissionContactType;
  value: string;
  country?: string;
}): AdmissionContactNormalizationResult {
  const value = input.value.trim();
  const invalid = { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.invalid, reason: ADMISSION_CONTACT_ERROR.invalid } as const;

  if (input.type === ADMISSION_CONTACT_TYPE.email) {
    const normalizedEmail = value.toLowerCase();
    return ADMISSION_EMAIL_PATTERN.test(normalizedEmail)
      ? { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.valid, contact: { type: ADMISSION_CONTACT_TYPE.email, value: normalizedEmail } }
      : invalid;
  }

  const country = input.country?.trim().toUpperCase();
  if (country && !isSupportedCountry(country as CountryCode)) return invalid;

  try {
    const phone = parsePhoneNumberWithError(value, { defaultCountry: country as CountryCode | undefined, extract: false });
    if (!phone.isValid() || phone.ext) return invalid;
    if (!phone.country) {
      return { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.invalid, reason: ADMISSION_CONTACT_ERROR.countryRequired };
    }
    if (country && phone.country !== country) {
      return { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.invalid, reason: ADMISSION_CONTACT_ERROR.countryMismatch };
    }
    return {
      status: ADMISSION_CONTACT_NORMALIZATION_STATUS.valid,
      contact: { type: ADMISSION_CONTACT_TYPE.phone, value: phone.number, country: phone.country },
    };
  } catch (error) {
    if (error instanceof ParseError) {
      return !country && error.message === ADMISSION_PHONE_PARSE_ERROR.invalidCountry
        ? { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.invalid, reason: ADMISSION_CONTACT_ERROR.countryRequired }
        : invalid;
    }
    throw error;
  }
}
