/**
 * Public DTO contracts of the academy routes and pages. Each schema is an
 * allowlist: internal ids of payments, private notes (bonus reasons for
 * non-leaders), provider identifiers or emails are never part of a member DTO.
 * Server routes validate before sending; browser adapters validate on read.
 *
 * @module academy-public-dto-schemas
 */

import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

export const academyAccessStatusDtoSchema = z.strictObject({
  accessEndsAt: isoDateTime.nullable(),
  accessModel: z.enum(["academy", "legacy"]),
  canStartCheckout: z.boolean(),
  eligibility: z.enum(["not_requested", "not_verified", "pending", "verified"]),
  firstActivatedAt: isoDateTime.nullable(),
  hasBonusCoverage: z.boolean(),
  hasPaidCoverage: z.boolean(),
  isLeaderPreview: z.boolean(),
  level: z.enum(["academy", "basic"]),
  nextAction: z.enum([
    "complete_checkout",
    "contact_support",
    "continue_learning",
    "request_verification",
    "view_offer",
    "wait_for_verification",
  ]),
  renewalStatus: z.enum(["active", "canceled", "canceling", "none", "pending"]),
});

export type AcademyAccessStatusDto = z.infer<typeof academyAccessStatusDtoSchema>;

export const academyOfferDtoSchema = z.strictObject({
  admissionEnabled: z.boolean(),
  benefits: z.array(z.string()),
  description: z.string(),
  offerVersion: z.number().int().min(1),
  price: z
    .strictObject({
      amountCents: z.number().int().min(0),
      currency: z.string(),
      frequency: z.string(),
    })
    .nullable(),
  salesEnabled: z.boolean(),
  title: z.string(),
  tribeName: z.string(),
});

export type AcademyOfferDto = z.infer<typeof academyOfferDtoSchema>;

export const academySettingsDtoSchema = z.strictObject({
  accessModel: z.enum(["academy", "legacy"]),
  admissionEnabled: z.boolean(),
  benefits: z.array(z.string()),
  configVersion: z.number().int().min(0),
  description: z.string(),
  offerVersion: z.number().int().min(1),
  salesEnabled: z.boolean(),
  title: z.string(),
});

export type AcademySettingsDto = z.infer<typeof academySettingsDtoSchema>;

export const academyGrantDtoSchema = z.strictObject({
  endsAt: isoDateTime.nullable(),
  id: z.uuid(),
  note: z.string().nullable(),
  revokedAt: isoDateTime.nullable(),
  sourceType: z.enum(["legacy", "manual_bonus", "subscription_payment"]),
  startsAt: isoDateTime,
});

export const academyMemberRowDtoSchema = z.strictObject({
  displayName: z.string(),
  grants: z.array(academyGrantDtoSchema),
  hasAcademyAccess: z.boolean(),
  isVerified: z.boolean(),
  membershipStatus: z.string(),
  renewalStatus: z.string().nullable(),
  role: z.string(),
  userId: z.string(),
});

export type AcademyMemberRowDto = z.infer<typeof academyMemberRowDtoSchema>;

export const academyMembersPageDtoSchema = z.strictObject({
  members: z.array(academyMemberRowDtoSchema),
  page: z.number().int().min(1),
  total: z.number().int().min(0),
  viewerRole: z.enum(["guardian", "leader"]),
});

export type AcademyMembersPageDto = z.infer<typeof academyMembersPageDtoSchema>;

export const academyBonusResultDtoSchema = z.strictObject({
  grant: academyGrantDtoSchema,
  hasActiveRenewal: z.boolean(),
  status: z.enum(["created", "replayed"]),
});

export const academyCheckoutDtoSchema = z.strictObject({
  checkoutUrl: z.url({ protocol: /^https$/ }),
});

export const academyStatusMessageDtoSchema = z.strictObject({
  status: z.string(),
});
