/** Guards the original own ledger result without validating PostgreSQL resource rows or provider data. @module admission-email-settings-result-schemas */
import { z } from "zod";
import { ADMISSION_EMAIL_SETTINGS_REJECTION, ADMISSION_EMAIL_SETTINGS_STATUS } from "../../constants/admission-notification-email-settings";

/** Stores only the confirmed own configuration; a later query resolves current state separately. */
const settings = z.strictObject({ tribeId: z.uuid(), enabled: z.boolean(), version: z.int().nonnegative(), enabledAtMicroseconds: z.int().nullable(), timeZone: z.string().min(1) }).refine((value) => value.enabled === (value.enabledAtMicroseconds !== null));
/** Distinguishes confirmed no-op/write outcomes from expected policy rejection. */
export const admissionEmailSettingsChangeResultSchema = z.union([
  z.strictObject({ status: z.enum([ADMISSION_EMAIL_SETTINGS_STATUS.changed, ADMISSION_EMAIL_SETTINGS_STATUS.unchanged]), settings }),
  z.strictObject({ status: z.literal(ADMISSION_EMAIL_SETTINGS_STATUS.rejected), reason: z.enum(ADMISSION_EMAIL_SETTINGS_REJECTION) }),
]);
