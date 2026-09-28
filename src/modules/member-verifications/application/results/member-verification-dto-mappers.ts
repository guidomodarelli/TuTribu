/**
 * Maps member verification results to their public DTOs.
 *
 * @module member-verification-dto-mappers
 */

import type {
  OwnMemberVerification,
  ReviewQueueItem,
  VerificationProvider,
} from "@/src/modules/member-verifications/domain/repositories/member-verification-repository";

export function toMemberVerificationDto(verification: OwnMemberVerification) {
  return {
    declaredEmail: verification.declaredEmail,
    decisionReason: verification.decisionReason,
    id: verification.id,
    providerDisplayName: verification.providerDisplayName,
    providerId: verification.providerId,
    status: verification.status,
    updatedAt: verification.updatedAt.toISOString(),
    version: verification.version,
  };
}

export function toReviewQueueItemDto(item: ReviewQueueItem) {
  return {
    ...toMemberVerificationDto(item),
    memberDisplayName: item.memberDisplayName,
    memberUserId: item.memberUserId,
    reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : null,
  };
}

export function toVerificationProviderDto(provider: VerificationProvider) {
  return {
    displayName: provider.displayName,
    id: provider.id,
    instructions: provider.instructions,
    isActive: provider.isActive,
    key: provider.key,
    linkUrl: provider.linkUrl,
  };
}
