/**
 * Member verification use cases. The authenticated identity is always taken
 * from the session by the repository (`current_app_user_id()`); the input
 * never carries the actor, its role or the resulting decision of access.
 *
 * @module manage-member-verifications-use-cases
 */

import {
  MEMBER_VERIFICATION_LIMITS,
  VERIFICATION_PROVIDER_LIMITS,
  VERIFICATION_REVIEW_QUEUE_PAGE,
  type MemberVerificationDecision,
  type MemberVerificationStatus,
} from "@/src/modules/member-verifications/constants/member-verifications";
import type {
  MemberVerificationRepository,
  OwnMemberVerification,
  RequestMemberVerificationResult,
  ReviewMemberVerificationResult,
  ReviewQueuePage,
  SaveVerificationProviderResult,
  VerificationProvider,
} from "@/src/modules/member-verifications/domain/repositories/member-verification-repository";

type Dependencies = {
  memberVerificationRepository: MemberVerificationRepository;
};

type InvalidInput = { status: "invalid_input" };

const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const HTTPS_PROTOCOL = "https:";

function normalizeSlug(tribeSlug: string): string {
  return tribeSlug.trim().toLowerCase();
}

function normalizeText(value: string, maxLength: number): string | null {
  if (CONTROL_CHARACTERS_PATTERN.test(value)) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length <= maxLength ? normalized : null;
}

/**
 * Accepts only absolute HTTPS links for provider instructions.
 *
 * @param value - Raw URL or empty string.
 * @returns The URL, null when empty, or undefined when invalid.
 */
function normalizeHttpsUrl(value: string): string | null | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > VERIFICATION_PROVIDER_LIMITS.linkUrlMaxLength) {
    return undefined;
  }

  try {
    return new URL(trimmed).protocol === HTTPS_PROTOCOL ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function listVerificationProviders({ memberVerificationRepository }: Dependencies) {
  return async (query: {
    includeInactive: boolean;
    tribeSlug: string;
  }): Promise<VerificationProvider[] | null> =>
    memberVerificationRepository.listProviders({
      includeInactive: query.includeInactive,
      tribeSlug: normalizeSlug(query.tribeSlug),
    });
}

export function saveVerificationProvider({ memberVerificationRepository }: Dependencies) {
  return async (command: {
    correlationId: string;
    displayName: string;
    instructions: string;
    isActive: boolean;
    key: string;
    linkUrl: string;
    providerId: string | null;
    tribeSlug: string;
  }): Promise<SaveVerificationProviderResult | InvalidInput> => {
    const key = command.key.trim().toLowerCase();
    const displayName = normalizeText(
      command.displayName,
      VERIFICATION_PROVIDER_LIMITS.displayNameMaxLength
    );
    const instructions = normalizeText(
      command.instructions,
      VERIFICATION_PROVIDER_LIMITS.instructionsMaxLength
    );
    const linkUrl = normalizeHttpsUrl(command.linkUrl);

    if (
      !VERIFICATION_PROVIDER_LIMITS.keyPattern.test(key) ||
      key.length > VERIFICATION_PROVIDER_LIMITS.keyMaxLength ||
      !displayName ||
      instructions === null ||
      linkUrl === undefined
    ) {
      return { status: "invalid_input" };
    }

    return memberVerificationRepository.saveProvider({
      correlationId: command.correlationId,
      displayName,
      instructions,
      isActive: command.isActive,
      key,
      linkUrl,
      providerId: command.providerId,
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
  };
}

export function listOwnMemberVerifications({ memberVerificationRepository }: Dependencies) {
  return async ({ tribeSlug }: { tribeSlug: string }): Promise<OwnMemberVerification[]> =>
    memberVerificationRepository.listOwn({ tribeSlug: normalizeSlug(tribeSlug) });
}

/**
 * Adapter of the product-access reader port: the member's own states only.
 */
export function listOwnVerificationStates({ memberVerificationRepository }: Dependencies) {
  return async ({ tribeSlug }: { tribeSlug: string }): Promise<MemberVerificationStatus[]> =>
    (await memberVerificationRepository.listOwn({ tribeSlug: normalizeSlug(tribeSlug) })).map(
      (verification) => verification.status
    );
}

/**
 * Requests (or re-requests) the verification of the member's own relation
 * with a provider. Selecting a provider never verifies anything.
 */
export function requestMemberVerification({ memberVerificationRepository }: Dependencies) {
  return async (command: {
    correlationId: string;
    declaredEmail: string;
    providerId: string;
    tribeSlug: string;
  }): Promise<RequestMemberVerificationResult | InvalidInput> => {
    const trimmedEmail = command.declaredEmail.trim().toLowerCase();

    if (
      trimmedEmail.length > MEMBER_VERIFICATION_LIMITS.declaredEmailMaxLength ||
      (trimmedEmail.length > 0 && !EMAIL_PATTERN.test(trimmedEmail))
    ) {
      return { status: "invalid_input" };
    }

    return memberVerificationRepository.request({
      correlationId: command.correlationId,
      declaredEmail: trimmedEmail.length > 0 ? trimmedEmail : null,
      providerId: command.providerId,
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
  };
}

export function listVerificationReviewQueue({ memberVerificationRepository }: Dependencies) {
  return async (query: {
    page: number;
    pageSize?: number;
    search: string | null;
    status: MemberVerificationStatus | null;
    tribeSlug: string;
  }): Promise<ReviewQueuePage | { status: "forbidden" | "not_found" }> =>
    memberVerificationRepository.listReviewQueue({
      page: Math.max(1, Math.trunc(query.page) || 1),
      pageSize: Math.min(
        VERIFICATION_REVIEW_QUEUE_PAGE.maxPageSize,
        Math.max(1, Math.trunc(query.pageSize ?? VERIFICATION_REVIEW_QUEUE_PAGE.defaultPageSize))
      ),
      search:
        query.search?.trim().slice(0, VERIFICATION_REVIEW_QUEUE_PAGE.searchMaxLength) || null,
      status: query.status,
      tribeSlug: normalizeSlug(query.tribeSlug),
    });
}

/**
 * Applies a reviewer decision with compare-and-swap on the expected version.
 */
export function reviewMemberVerification({ memberVerificationRepository }: Dependencies) {
  return async (command: {
    correlationId: string;
    decision: MemberVerificationDecision;
    expectedVersion: number;
    reason: string;
    tribeSlug: string;
    verificationId: string;
  }): Promise<ReviewMemberVerificationResult | InvalidInput> => {
    const reason = normalizeText(command.reason, MEMBER_VERIFICATION_LIMITS.reasonMaxLength);

    if (reason === null || !Number.isInteger(command.expectedVersion) || command.expectedVersion < 1) {
      return { status: "invalid_input" };
    }

    return memberVerificationRepository.review({
      correlationId: command.correlationId,
      decision: command.decision,
      expectedVersion: command.expectedVersion,
      reason:
        reason.length >= MEMBER_VERIFICATION_LIMITS.reasonMinLength ? reason : null,
      tribeSlug: normalizeSlug(command.tribeSlug),
      verificationId: command.verificationId,
    });
  };
}
