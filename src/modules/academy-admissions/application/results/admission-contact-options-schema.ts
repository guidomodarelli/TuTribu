/** Allowlists applicant-facing channel and country choices without resource, credential or tenant quota references. @module admission-contact-options-schema */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";

/** Only supported canonical country identifiers can enter the own public form contract. */
const countrySchema = z.string().refine((country) => isSupportedCountry(country as CountryCode));
/** The snapshot never grants sending permission or selects a provider resource. */
export const admissionContactOptionsSchema = z.object({ channel: z.enum(MESSAGING_PUBLIC_CHANNEL), allowedCountries: z.array(countrySchema).refine((countries) => new Set(countries).size === countries.length), allowedAlternative: z.literal(MESSAGING_PUBLIC_CHANNEL.sms).optional() }).refine((options) => options.allowedAlternative === undefined || options.channel === MESSAGING_PUBLIC_CHANNEL.whatsapp).refine((options) => options.channel !== MESSAGING_PUBLIC_CHANNEL.email || options.allowedCountries.length === 0);
