/** Owns the strict read proposal for a fresh common presentation after a prior request. @module admission-current-challenge-input */
import { z } from "zod";
import { isSupportedCountry, type CountryCode } from "libphonenumber-js/max";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";

/** No destination, account, code, sender, connection, token or verification flag can be selected. */
export const admissionCurrentChallengeInputSchema = z.strictObject({ previousRequestId: z.uuid().transform((reference) => reference.toLowerCase()), expectedPolicyVersion: z.int().positive(), channel: z.enum(MESSAGING_PUBLIC_CHANNEL), phone: z.string().trim().min(1).optional(), country: z.string().trim().toUpperCase().refine((country) => isSupportedCountry(country as CountryCode)).optional() });
