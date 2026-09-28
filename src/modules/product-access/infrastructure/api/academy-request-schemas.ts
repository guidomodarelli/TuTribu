/**
 * Boundary schemas of the academy and verification route handlers. They
 * validate client input once; business limits stay in the use cases.
 *
 * @module academy-request-schemas
 */

import { z } from "zod";

import {
  MEMBER_VERIFICATION_DECISION,
  MEMBER_VERIFICATION_LIMITS,
  MEMBER_VERIFICATION_STATUS,
  VERIFICATION_PROVIDER_LIMITS,
  VERIFICATION_REVIEW_QUEUE_PAGE,
} from "@/src/modules/member-verifications/constants/member-verifications";
import {
  ACADEMY_BONUS_LIMITS,
  ACADEMY_MEMBERS_PAGE,
  ACADEMY_OFFER_LIMITS,
} from "@/src/modules/product-access/constants/product-access";

const SLUG_MAX_LENGTH = 80;
const OPAQUE_ID_MAX_LENGTH = 128;
const MAX_PAGE = 10_000;
const MAX_VERSION = 1_000_000;

const slugSchema = z.string().trim().min(1).max(SLUG_MAX_LENGTH);
const uuidSchema = z.uuid();

export const academyTribeParamsSchema = z.object({ slug: slugSchema });

export const academyGrantParamsSchema = z.object({
  grantId: uuidSchema,
  slug: slugSchema,
});

export const verificationParamsSchema = z.object({
  slug: slugSchema,
  verificationId: uuidSchema,
});

export const verificationProviderParamsSchema = z.object({
  providerId: uuidSchema.nullable(),
  slug: slugSchema,
});

export const academyOfferBodySchema = z.object({
  benefits: z
    .array(z.string().max(ACADEMY_OFFER_LIMITS.benefitMaxLength))
    .max(ACADEMY_OFFER_LIMITS.maxBenefits),
  description: z.string().max(ACADEMY_OFFER_LIMITS.descriptionMaxLength),
  expectedConfigVersion: z.number().int().min(0).max(MAX_VERSION),
  title: z.string().min(1).max(ACADEMY_OFFER_LIMITS.titleMaxLength),
});

export const academyActivationBodySchema = z.object({
  expectedConfigVersion: z.number().int().min(0).max(MAX_VERSION),
});

export const academyAvailabilityBodySchema = z.object({
  admissionEnabled: z.boolean(),
  expectedConfigVersion: z.number().int().min(1).max(MAX_VERSION),
  salesEnabled: z.boolean(),
});

export const academyBonusBodySchema = z.object({
  allowUnverifiedRecipient: z.boolean().default(false),
  endsAt: z.iso.datetime({ offset: true }),
  idempotencyKey: uuidSchema,
  reason: z
    .string()
    .min(ACADEMY_BONUS_LIMITS.reasonMinLength)
    .max(ACADEMY_BONUS_LIMITS.reasonMaxLength),
  recipientUserId: z.string().trim().min(1).max(OPAQUE_ID_MAX_LENGTH),
  replacesGrantId: uuidSchema.nullable().default(null),
});

export const academyRevokeBodySchema = z.object({
  reason: z
    .string()
    .min(ACADEMY_BONUS_LIMITS.reasonMinLength)
    .max(ACADEMY_BONUS_LIMITS.reasonMaxLength),
});

export const academyCheckoutBodySchema = z.object({
  acceptedOfferVersion: z.number().int().min(1).max(MAX_VERSION),
});

export const academyMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  search: z.string().trim().max(ACADEMY_MEMBERS_PAGE.searchMaxLength).optional(),
});

export const verificationRequestBodySchema = z.object({
  declaredEmail: z
    .string()
    .trim()
    .max(MEMBER_VERIFICATION_LIMITS.declaredEmailMaxLength)
    .default(""),
  providerId: uuidSchema,
});

export const verificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  scope: z.enum(["own", "review"]).default("own"),
  search: z.string().trim().max(VERIFICATION_REVIEW_QUEUE_PAGE.searchMaxLength).optional(),
  status: z
    .enum([
      MEMBER_VERIFICATION_STATUS.pending,
      MEMBER_VERIFICATION_STATUS.rejected,
      MEMBER_VERIFICATION_STATUS.revoked,
      MEMBER_VERIFICATION_STATUS.verified,
    ])
    .optional(),
});

export const verificationDecisionBodySchema = z.object({
  decision: z.enum([
    MEMBER_VERIFICATION_DECISION.rejected,
    MEMBER_VERIFICATION_DECISION.revoked,
    MEMBER_VERIFICATION_DECISION.verified,
  ]),
  expectedVersion: z.number().int().min(1).max(MAX_VERSION),
  reason: z.string().max(MEMBER_VERIFICATION_LIMITS.reasonMaxLength).default(""),
});

export const verificationProviderBodySchema = z.object({
  displayName: z.string().min(1).max(VERIFICATION_PROVIDER_LIMITS.displayNameMaxLength),
  instructions: z.string().max(VERIFICATION_PROVIDER_LIMITS.instructionsMaxLength).default(""),
  isActive: z.boolean().default(true),
  key: z.string().min(1).max(VERIFICATION_PROVIDER_LIMITS.keyMaxLength),
  linkUrl: z.string().max(VERIFICATION_PROVIDER_LIMITS.linkUrlMaxLength).default(""),
});

export const academySubscriptionCancelQuerySchema = z.object({
  product: z.literal("academy"),
});
