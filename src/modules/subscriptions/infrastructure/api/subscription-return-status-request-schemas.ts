/**
 * Input contracts of `GET /api/tribes/[slug]/subscriptions/return-status`.
 * The route validates its params and query once, at its boundary.
 *
 * @module subscription-return-status-request-schemas
 */

import { z } from "zod";

import {
  MERCADO_PAGO_PREAPPROVAL_ID_MAX_LENGTH,
  MERCADO_PAGO_PREAPPROVAL_ID_PATTERN,
  SUBSCRIPTION_RETURN_INPUT_ISSUE,
  SUBSCRIPTION_RETURN_QUERY_PARAM,
} from "@/src/modules/subscriptions/constants/subscription-return-status";

const invalidReturnIssue = { error: SUBSCRIPTION_RETURN_INPUT_ISSUE.invalidReturn };

/** `[slug]` segment of the tribe that the member is returning to. */
export const subscriptionReturnStatusParamsSchema = z.object({
  slug: z.string(invalidReturnIssue).trim().min(1, invalidReturnIssue),
});

/** Query: the Mercado Pago preapproval id appended to the return URL. */
export const subscriptionReturnStatusQuerySchema = z.object({
  [SUBSCRIPTION_RETURN_QUERY_PARAM.mercadoPagoPreapprovalId]: z
    .string(invalidReturnIssue)
    .trim()
    .min(1, invalidReturnIssue)
    .max(MERCADO_PAGO_PREAPPROVAL_ID_MAX_LENGTH, invalidReturnIssue)
    .regex(MERCADO_PAGO_PREAPPROVAL_ID_PATTERN, invalidReturnIssue),
});
