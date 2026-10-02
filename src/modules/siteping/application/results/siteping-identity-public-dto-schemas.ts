/**
 * Runtime contract (allowlist) of the public Siteping identity DTO: the JSON
 * body of `GET /api/siteping/identity`. The browser adapter parses it with
 * `safeParse` before the provider mounts the Beezping widget.
 *
 * @module siteping-identity-public-dto-schemas
 */

import { z } from "zod";

import type { SitepingIdentityResult } from "@/src/modules/siteping/application/results/siteping-feedback-result";

/** The identity endpoint exposes only widget access, display identity and project. */
export const sitepingIdentityResultSchema = z.object({
  enabled: z.boolean(),
  identity: z.object({ email: z.string(), name: z.string() }).nullable(),
  projectName: z.string().min(1),
}) satisfies z.ZodType<SitepingIdentityResult>;
