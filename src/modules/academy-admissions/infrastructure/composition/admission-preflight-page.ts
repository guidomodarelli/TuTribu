/** Loads the informational activation preflight of the current leader for SSR, without granting activation. @module admission-preflight-page */
import "server-only";
import { z } from "zod";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import type { AdmissionPolicyPreflightDto } from "../../application/ports/admission-policy-browser-client";
import { admissionPreflightResultSchema } from "../../application/results/admission-preflight-result-schema";
import { admissionTribeParamsSchema } from "../api/admission-request-schemas";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

type PreflightPageServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  preflight: { execute(query: { tribeId: string; requestId: string }): Promise<{ ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }> };
};
const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema });

/**
 * @param input - Untrusted resolved route params.
 * @param open - Server-selected composition.
 * @returns The current preflight, or null when it cannot be read for this viewer; the browser checks again before activating.
 */
export async function loadAdmissionPreflightState(input: unknown, open: () => Promise<PreflightPageServices>): Promise<AdmissionPolicyPreflightDto | null> {
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const context = resolveRequestContext(new Headers());
  try {
    const services = await open();
    const identity = await services.resolveTribe.execute({ slug: parsed.data.params.slug, requestId: context.requestId });
    if (!identity.ok) return null;
    const result = await services.preflight.execute({ tribeId: identity.value.tribeId, requestId: context.requestId });
    if (!result.ok) return null;
    const preflight = admissionPreflightResultSchema.safeParse(result.value);
    return preflight.success ? preflight.data : null;
  } catch {
    createServerLogger({ feature: "academy-admissions", operation: "load_admission_preflight", ...context }).error({ message: "Admission preflight could not load safe state" });
    return null;
  }
}
