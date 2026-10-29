/** Validates policy page runtime input before native composition and own safe SSR projection. @module admission-policy-page */
import "server-only";
import { z } from "zod";
import type { GetAdmissionPolicyPageUseCase } from "../../application/use-cases/get-admission-policy-page-use-case";
import { admissionPolicyPageStateSchema, type AdmissionPolicyPageState } from "../../application/results/admission-policy-page-state";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "../api/admission-request-schemas";
import { loadAdmissionLeaderPageState } from "./admission-page-loading";

/** Browser input cannot supply actor, role, operational readiness or an alternative country owner. */
const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema });
/** @param input - Untrusted resolved framework input. @param open - Server-selected inward use case. @returns Safe current leader state or a contained Spanish failure. */
export async function loadAdmissionPolicyPageState(input: unknown, open: () => Promise<Pick<GetAdmissionPolicyPageUseCase, "execute">>): Promise<AdmissionPolicyPageState> {
  return loadAdmissionLeaderPageState({
    input, inputSchema: pageInputSchema, open, stateSchema: admissionPolicyPageStateSchema,
    read: (page, { params }, requestId) => page.execute({ slug: params.slug, requestId }),
    diagnostic: { operation: "load_admission_policy_page", readFailed: "Admission policy page read failed", loadFailed: "Admission policy page could not load safe state" },
  });
}
