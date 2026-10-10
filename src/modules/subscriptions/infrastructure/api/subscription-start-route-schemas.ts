/** Defines own checkout input and public HTTP DTOs, never provider-response schemas. @module subscription-start-route-schemas */
import { z } from "zod";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";

/** Requires encrypted browser navigation for an external checkout destination. */
const CHECKOUT_URL_PROTOCOL = "https:";
/** Rejects malformed tenant identities before resolving request dependencies. */
export const subscriptionStartParamsSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(TRIBE_SLUG_PATTERN),
});
/** Keeps omission distinct from unusable tokens; an omitted or empty token means payment retry. */
export const subscriptionStartBodySchema = z.object({
  invitationToken: z.string().trim().optional(),
}).strict();
/** Projects a browser-ready checkout destination without allowing executable URL protocols. */
export const subscriptionStartCheckoutSchema = z.object({
  checkoutUrl: z.url().refine((url) => new URL(url).protocol === CHECKOUT_URL_PROTOCOL),
}).strict();
/** Allows only the own relative destination created from the validated tenant slug. */
export const subscriptionStartAlreadySubscribedSchema = z.object({
  subscriptionUrl: z.string().startsWith("/"),
}).strict();
/** Own safe Spanish failures include correlation without exposing causes or tokens. */
export const subscriptionStartErrorSchema = z.object({
  message: z.string().min(1),
  requestId: z.string().min(1),
}).strict();
