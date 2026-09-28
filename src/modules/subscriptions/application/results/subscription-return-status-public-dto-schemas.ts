/**
 * Runtime contract (allowlist) of the public Mercado Pago return status DTO:
 * the JSON body of `GET /api/tribes/[slug]/subscriptions/return-status`. The
 * route sends only the parsed value and the browser adapter parses the same
 * schema with `safeParse` before navigating anywhere.
 *
 * @module subscription-return-status-public-dto-schemas
 */

import { z } from "zod";

import type { SubscriptionReturnStatusResult } from "@/src/modules/subscriptions/application/results/subscription-return-status-result";
import { SUBSCRIPTION_RETURN_STATUS } from "@/src/modules/subscriptions/constants/subscription-return-status";

const INTERNAL_PATH_PREFIX = "/";
const PROTOCOL_RELATIVE_PATH_PREFIX = "//";
const BACKSLASH = "\\";

/**
 * Same-origin absolute path. Protocol-relative (`//host`) and backslash
 * variants are rejected so the browser can never be sent to another origin.
 */
const internalPathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      path.startsWith(INTERNAL_PATH_PREFIX) &&
      !path.startsWith(PROTOCOL_RELATIVE_PATH_PREFIX) &&
      !path.includes(BACKSLASH)
  );

export const subscriptionReturnStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal(SUBSCRIPTION_RETURN_STATUS.pending) }),
  z.object({
    redirectPath: internalPathSchema,
    status: z.literal(SUBSCRIPTION_RETURN_STATUS.resolved),
  }),
]) satisfies z.ZodType<SubscriptionReturnStatusResult>;

export const subscriptionReturnStatusMessageSchema = z.object({
  message: z.string(),
});

export type SubscriptionReturnStatusResponse = z.infer<
  typeof subscriptionReturnStatusSchema
>;
