/** Loads the informational activation preflight of the current leader for SSR, without granting activation. @module admission-preflight-page */
import "server-only";
import { z } from "zod";
import type { AdmissionPreflightServices } from "../api/admission-preflight-query-handler";
import type { AdmissionPolicyPreflightDto } from "../../application/ports/admission-policy-browser-client";
import { admissionPreflightResultSchema } from "../../application/results/admission-preflight-result-schema";
import { admissionTribeParamsSchema } from "../api/admission-request-schemas";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { readWithinAdmissionTribe } from "./admission-page-loading";

const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema });

/**
 * @param input - Untrusted resolved route params.
 * @param open - Server-selected composition.
 * @returns The current preflight, or null when it cannot be read for this viewer; the browser checks again before activating.
 */
export async function loadAdmissionPreflightState(input: unknown, open: () => Promise<AdmissionPreflightServices>): Promise<AdmissionPolicyPreflightDto | null> {
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const context = resolveRequestContext(new Headers());
  try {
    const result = await readWithinAdmissionTribe(open, { slug: parsed.data.params.slug, requestId: context.requestId }, (services, scope) => services.preflight.execute(scope));
    if (!result.ok) return null;
    const preflight = admissionPreflightResultSchema.safeParse(result.value);
    return preflight.success ? preflight.data : null;
  } catch {
    createServerLogger({ feature: "academy-admissions", operation: "load_admission_preflight", ...context }).error({ message: "Admission preflight could not load safe state" });
    return null;
  }
}
