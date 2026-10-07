/** Guards minimal original policy outcomes, independently of today's current configuration. @module admission-policy-result-schemas */
import { z } from "zod";
import { admissionPublicIdSchema, admissionPublicVersionSchema, admissionPublicInstantSchema } from "./admission-contract-fields";
import { admissionPolicySchema } from "./admission-management-result-schemas";
import { ADMISSION_POLICY_PUBLIC_STATE, ADMISSION_POLICY_PREPARATION_STATE, ADMISSION_POLICY_ACTIVATION_ERROR, ADMISSION_POLICY_CONFIGURATION_ERROR, ADMISSION_POLICY_CONFIGURATION_WARNING } from "../../constants/admission-policy";

/** Replay contains no countries, capability/secret metadata or editable historical configuration. */
export const admissionPolicyMutationResultSchema = z.object({
  policyId: admissionPublicIdSchema,
  version: admissionPublicVersionSchema,
  verificationEpoch: admissionPublicVersionSchema,
  activatedAt: admissionPublicInstantSchema.nullable(),
  controlActivated: z.boolean(),
  changed: z.boolean(),
}).refine((result) => result.controlActivated === (result.activatedAt !== null));

/** Query data and historical mutation results stay separate; absence carries no persisted resource version. */
export const admissionPolicyStateResultSchema = z.object({
  state: z.enum(ADMISSION_POLICY_PUBLIC_STATE),
  controlActivated: z.boolean(),
  policy: admissionPolicySchema.nullable(),
  usage: z.object({ version: admissionPublicVersionSchema, allowedCountries: z.array(z.string()) }).nullable(),
  preparation: z.object({ state: z.enum(ADMISSION_POLICY_PREPARATION_STATE), requirements: z.array(z.enum({ ...ADMISSION_POLICY_ACTIVATION_ERROR, ...ADMISSION_POLICY_CONFIGURATION_ERROR })) }),
  impact: z.object({ pendingRequestCount: z.int().nonnegative(), contactTypeLocked: z.boolean(), historicalLinksProtected: z.boolean(), warnings: z.array(z.enum(ADMISSION_POLICY_CONFIGURATION_WARNING)) }),
}).refine((result) => {
  if (result.impact.historicalLinksProtected !== result.controlActivated || result.impact.contactTypeLocked !== (result.controlActivated || Boolean(result.policy?.activatedAt))) return false;
  if (result.state === ADMISSION_POLICY_PUBLIC_STATE.unavailable) return true;
  if (result.policy === null) return result.state === ADMISSION_POLICY_PUBLIC_STATE.notConfigured && !result.controlActivated;
  if (result.state === ADMISSION_POLICY_PUBLIC_STATE.notConfigured) return false;
  if (Boolean(result.policy.activatedAt) !== result.controlActivated) return false;
  return result.state === ADMISSION_POLICY_PUBLIC_STATE.draft ? !result.controlActivated
    : result.state === (result.policy.isOpen ? ADMISSION_POLICY_PUBLIC_STATE.active : ADMISSION_POLICY_PUBLIC_STATE.paused);
});
export type AdmissionPolicyStateDto = z.infer<typeof admissionPolicyStateResultSchema>;
