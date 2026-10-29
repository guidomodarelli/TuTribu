/**
 * Admission HTTP handlers of the tribe admission routes, composed lazily from
 * the admission request modules: each request opens its own composition (with
 * the maintenance database connection for commands).
 * It lives in the app layer because it composes the request modules
 * (composition root); module code never imports `@/src/modules/setup`.
 *
 * @module admission-route-handlers
 */

import { createAdmissionRequestModules } from "@/src/modules/setup";
import { createAdmissionActivityHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-activity-handlers";
import { createAdmissionMutationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-mutation-handlers";
import { createAdmissionPolicyCommandHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-policy-command-handlers";
import { createAdmissionQueryHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-query-handlers";
import { createAdmissionReviewHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-review-handlers";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Public overview and own-request queries, outside membership middleware. */
export const admissionQueryHandlers = createAdmissionQueryHandlers(
  async () => (await createAdmissionRequestModules()).queries
);

/** Leader activity history and metrics. */
export const admissionActivityHandlers = createAdmissionActivityHandlers(async () => {
  const modules = await createAdmissionRequestModules();
  return { resolveTribe: modules.queries.resolveTribe, observations: modules.observations };
});

/** Reviewer list and detail of admission requests. */
export const admissionReviewHandlers = createAdmissionReviewHandlers(async () => {
  const modules = await createAdmissionRequestModules();
  return { resolveTribe: modules.queries.resolveTribe, review: modules.reviews.review };
});

/** Policy commands (initialize, update, activate, pause). */
export const admissionPolicyCommandHandlers = createAdmissionPolicyCommandHandlers(async () => {
  const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
  return { resolveTribe: modules.queries.resolveTribe, policy: modules.policyCommands };
});

/** Admission request mutations (submit, cancel, decide, retry eligibility). */
export const admissionMutationHandlers = createAdmissionMutationHandlers(async () => {
  const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
  return { ...modules.manual, resolveTribe: modules.queries.resolveTribe };
});
