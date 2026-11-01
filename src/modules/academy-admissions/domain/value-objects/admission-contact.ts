/**
 * Canonicalizes contacts without creating evidence, bindings, or account identity.
 *
 * @module admission-contact
 */
import { getCountryCallingCode, isSupportedCountry, parsePhoneNumberWithError, ParseError, type CountryCode, type PhoneNumber } from "libphonenumber-js/max";

import {
  ADMISSION_ARGENTINA_PHONE,
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
 * An Argentine mobile written without its 9 becomes its mobile form, the one SMS and WhatsApp reach.
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

  if (input.type === ADMISSION_CONTACT_TYPE.email) return normalizeEmailContact(value);

  const country = input.country?.trim().toUpperCase();
  if (country && !isSupportedCountry(country)) return invalid;

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
      contact: { type: ADMISSION_CONTACT_TYPE.phone, value: argentineMobileForm(phone) ?? phone.number, country: phone.country },
    };
  } catch (error) {
    if (error instanceof ParseError) return phoneParseFailure(error, country);
    throw error;
  }
}

/** @param phone - Valid parsed number. @returns The E.164 mobile form of an Argentine number written without its 9, or `null` for any other number. */
function argentineMobileForm(phone: PhoneNumber): string | null {
  if (phone.country !== ADMISSION_ARGENTINA_PHONE.country || phone.getType() !== ADMISSION_ARGENTINA_PHONE.geographicType) return null;
  const mobile = parsePhoneNumberWithError(`+${phone.countryCallingCode}${ADMISSION_ARGENTINA_PHONE.mobileToken}${phone.nationalNumber}`, { extract: false });
  return mobile.isValid() && mobile.getType() === ADMISSION_ARGENTINA_PHONE.mobileType ? mobile.number : null;
}

/**
 * @param contact - Canonical contact.
 * @returns The values stored rows may hold for it: an Argentine mobile also matches the form without its 9 that earlier versions
 * stored, so list entries, invitations and bindings saved before the mobile form still match. The canonical value comes first.
 */
export function admissionContactStoredValues(contact: AdmissionContact): string[] {
  if (contact.type !== ADMISSION_CONTACT_TYPE.phone || contact.country !== ADMISSION_ARGENTINA_PHONE.country) return [contact.value];
  const callingPrefix = `+${getCountryCallingCode(ADMISSION_ARGENTINA_PHONE.country)}`, mobilePrefix = `${callingPrefix}${ADMISSION_ARGENTINA_PHONE.mobileToken}`;
  return contact.value.startsWith(mobilePrefix) ? [contact.value, `${callingPrefix}${contact.value.slice(mobilePrefix.length)}`] : [contact.value];
}

/** @param value - Trimmed proposed address. @returns The lowercased address or a stable failure. */
function normalizeEmailContact(value: string): AdmissionContactNormalizationResult {
  const normalizedEmail = value.toLowerCase();
  return ADMISSION_EMAIL_PATTERN.test(normalizedEmail)
    ? { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.valid, contact: { type: ADMISSION_CONTACT_TYPE.email, value: normalizedEmail } }
    : { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.invalid, reason: ADMISSION_CONTACT_ERROR.invalid };
}

/** @param error - Parser rejection. @param country - Explicit supplied country, if any. @returns Country required when the number needs a country nobody supplied, else a generic failure. */
function phoneParseFailure(error: ParseError, country: string | undefined): AdmissionContactNormalizationResult {
  return !country && error.message === ADMISSION_PHONE_PARSE_ERROR.invalidCountry
    ? { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.invalid, reason: ADMISSION_CONTACT_ERROR.countryRequired }
    : { status: ADMISSION_CONTACT_NORMALIZATION_STATUS.invalid, reason: ADMISSION_CONTACT_ERROR.invalid };
}
