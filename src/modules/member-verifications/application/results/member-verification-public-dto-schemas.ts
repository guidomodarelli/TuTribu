/**
 * Public DTO contracts of member verifications (allowlist). The declared
 * email is only returned to its owner and to active reviewers.
 *
 * @module member-verification-public-dto-schemas
 */

import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

export const memberVerificationDtoSchema = z.strictObject({
  declaredEmail: z.string().nullable(),
  decisionReason: z.string().nullable(),
  id: z.uuid(),
  providerDisplayName: z.string(),
  providerId: z.uuid(),
  status: z.enum(["pending", "rejected", "revoked", "verified"]),
  updatedAt: isoDateTime,
  version: z.number().int().min(1),
});

export type MemberVerificationDto = z.infer<typeof memberVerificationDtoSchema>;

export const reviewQueueItemDtoSchema = memberVerificationDtoSchema.extend({
  memberDisplayName: z.string(),
  memberUserId: z.string(),
  reviewedAt: isoDateTime.nullable(),
});

export type ReviewQueueItemDto = z.infer<typeof reviewQueueItemDtoSchema>;

export const ownVerificationsDtoSchema = z.strictObject({
  scope: z.literal("own"),
  verifications: z.array(memberVerificationDtoSchema),
});

export const reviewQueueDtoSchema = z.strictObject({
  items: z.array(reviewQueueItemDtoSchema),
  page: z.number().int().min(1),
  scope: z.literal("review"),
  total: z.number().int().min(0),
});

export const verificationProviderDtoSchema = z.strictObject({
  displayName: z.string(),
  id: z.uuid(),
  instructions: z.string(),
  isActive: z.boolean(),
  key: z.string(),
  linkUrl: z.url({ protocol: /^https$/ }).nullable(),
});

export type VerificationProviderDto = z.infer<typeof verificationProviderDtoSchema>;

export const verificationProvidersDtoSchema = z.strictObject({
  providers: z.array(verificationProviderDtoSchema),
});
