/** Projects only current viewer, policy and clocks needed by import UI from the existing authorized SSR owner. @module allowlist-import-page-state */
import { z } from "zod";
import type { AdmissionPolicyPageState } from "./admission-policy-page-state";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "../../constants/admission-errors";

export const allowlistImportPageStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), slug: z.string().min(1), tribeId: z.uuid(), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ offset: true }), contactType: z.enum(ADMISSION_CONTACT_TYPE).nullable(), policyVersion: z.int().positive().nullable() }).refine((state) => (state.contactType === null) === (state.policyVersion === null)),
  z.strictObject({ kind: z.literal("unavailable"), code: z.enum(ADMISSION_ERROR_CODE), message: z.string() }).refine((state) => state.message === ADMISSION_ERROR_MESSAGE[state.code]),
]);
export type AllowlistImportPageState = z.infer<typeof allowlistImportPageStateSchema>;
/** @param state - Already authorized and guarded current policy SSR state. @returns Minimum own import props, without native session, connection or usage data. */
export function presentAllowlistImportPage(state: AdmissionPolicyPageState): AllowlistImportPageState {
  if (state.kind === "unavailable") return allowlistImportPageStateSchema.parse(state);
  return allowlistImportPageStateSchema.parse({ kind: state.kind, slug: state.slug, tribeId: state.tribeId, viewerId: state.viewerId, renderedAt: state.renderedAt, contactType: state.policy.policy?.contactType ?? null, policyVersion: state.policy.policy?.version ?? null });
}
