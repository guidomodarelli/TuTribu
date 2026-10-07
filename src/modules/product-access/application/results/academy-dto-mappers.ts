/**
 * Maps academy use case results to their public DTOs (ISO dates, allowlisted
 * fields). The route or page validates the DTO with its schema afterwards.
 *
 * @module academy-dto-mappers
 */

import type {
  AcademyAccessStatusDto,
  AcademyMembersPageDto,
  AcademyOfferDto,
  AcademySettingsDto,
} from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import type { TribeAccessModel } from "@/src/modules/product-access/constants/product-access";
import type {
  AcademyGrantView,
  AcademyMembersPage,
  AcademyPublicOffer,
  AcademySettings,
} from "@/src/modules/product-access/domain/repositories/product-access-repository";
import type { AcademyAccessStatus } from "@/src/modules/product-access/domain/services/academy-access-status";

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toAcademyAccessStatusDto(
  access: AcademyAccessStatus,
  accessModel: TribeAccessModel
): AcademyAccessStatusDto {
  return {
    accessEndsAt: toIso(access.accessEndsAt),
    accessModel,
    canStartCheckout: access.canStartCheckout,
    eligibility: access.eligibility,
    firstActivatedAt: toIso(access.firstActivatedAt),
    hasBonusCoverage: access.hasBonusCoverage,
    hasPaidCoverage: access.hasPaidCoverage,
    isLeaderPreview: access.isLeaderPreview,
    level: access.level,
    nextAction: access.nextAction,
    renewalStatus: access.renewalStatus,
  };
}

export function toAcademyOfferDto(offer: AcademyPublicOffer): AcademyOfferDto {
  return {
    admissionEnabled: offer.admissionEnabled,
    admissionRequiresRequest: offer.admissionRequiresRequest,
    benefits: offer.benefits,
    description: offer.description,
    offerVersion: offer.offerVersion,
    price: offer.price,
    salesEnabled: offer.salesEnabled,
    title: offer.title,
    tribeName: offer.tribeName,
  };
}

export function toAcademySettingsDto(settings: AcademySettings): AcademySettingsDto {
  return {
    accessModel: settings.accessModel,
    admissionEnabled: settings.admissionEnabled,
    benefits: settings.benefits,
    configVersion: settings.configVersion,
    description: settings.description,
    offerVersion: settings.offerVersion,
    salesEnabled: settings.salesEnabled,
    title: settings.title,
  };
}

export function toAcademyGrantDto(grant: AcademyGrantView & { note?: string | null }) {
  return {
    endsAt: toIso(grant.endsAt),
    id: grant.id,
    note: grant.note ?? null,
    revokedAt: toIso(grant.revokedAt),
    sourceType: grant.sourceType,
    startsAt: grant.startsAt.toISOString(),
  };
}

export function toAcademyMembersPageDto(
  page: AcademyMembersPage,
  pageNumber: number
): AcademyMembersPageDto {
  return {
    members: page.members.map((member) => ({
      displayName: member.displayName,
      grants: member.grants.map(toAcademyGrantDto),
      hasAcademyAccess: member.hasAcademyAccess,
      isVerified: member.isVerified,
      membershipStatus: member.membershipStatus,
      renewalStatus: member.renewalStatus,
      role: member.role,
      userId: member.userId,
    })),
    page: pageNumber,
    total: page.total,
    viewerRole: page.viewerRole,
  };
}
