/**
 * Academy access use cases: own status, offer, configuration, bonuses and the
 * management list. Input normalization and business limits live here; the
 * repository enforces roles, tribe isolation and concurrency in SQL.
 *
 * @module manage-academy-access-use-cases
 */

import type {
  OwnAcademyRenewalReader,
  OwnVerificationStatesReader,
} from "@/src/modules/product-access/application/ports/academy-cross-module-readers";
import {
  ACADEMY_BONUS_LIMITS,
  ACADEMY_MEMBERS_PAGE,
  ACADEMY_OFFER_LIMITS,
  MILLISECONDS_PER_DAY,
  type TribeAccessModel,
} from "@/src/modules/product-access/constants/product-access";
import type {
  AcademyPublicOffer,
  AcademySettings,
  AcademySettingsMutationResult,
  GrantAcademyBonusResult,
  ListAcademyMembersResult,
  ProductAccessRepository,
  RevokeAcademyBonusResult,
} from "@/src/modules/product-access/domain/repositories/product-access-repository";
import {
  buildAcademyAccessStatus,
  type AcademyAccessStatus,
} from "@/src/modules/product-access/domain/services/academy-access-status";

export type ProductAccessClock = () => Date;

type ProductAccessDependencies = {
  productAccessRepository: ProductAccessRepository;
};

// Control characters (except tab and newline) are never accepted in copy.
const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalizeSlug(tribeSlug: string): string {
  return tribeSlug.trim().toLowerCase();
}

/**
 * Normalizes free text written by a leader: trims, collapses trailing spaces
 * per line and rejects control characters. HTML is never interpreted (React
 * renders it as text), so no markup survives as markup.
 *
 * @param value - Raw text.
 * @param maxLength - Maximum length after normalization.
 * @returns Normalized text or null when invalid.
 */
function normalizeCopy(value: string, maxLength: number): string | null {
  if (CONTROL_CHARACTERS_PATTERN.test(value)) {
    return null;
  }

  const normalized = value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  return normalized.length <= maxLength ? normalized : null;
}

function normalizeReason(reason: string): string | null {
  const normalized = normalizeCopy(reason, ACADEMY_BONUS_LIMITS.reasonMaxLength);

  return normalized !== null && normalized.length >= ACADEMY_BONUS_LIMITS.reasonMinLength
    ? normalized
    : null;
}

export type GetOwnAcademyAccessResult =
  | { access: AcademyAccessStatus; accessModel: TribeAccessModel; status: "ok" }
  | { status: "not_found" };

/**
 * Reads the authoritative academy status of the current member.
 */
export function getOwnAcademyAccess({
  isAcademySalesActivationAllowed,
  now,
  ownAcademyRenewalReader,
  ownVerificationStatesReader,
  productAccessRepository,
}: ProductAccessDependencies & {
  isAcademySalesActivationAllowed: () => boolean;
  now: ProductAccessClock;
  ownAcademyRenewalReader: OwnAcademyRenewalReader;
  ownVerificationStatesReader: OwnVerificationStatesReader;
}) {
  return async ({ tribeSlug }: { tribeSlug: string }): Promise<GetOwnAcademyAccessResult> => {
    const normalizedSlug = normalizeSlug(tribeSlug);
    const snapshot = await productAccessRepository.readOwnAccessSnapshot({
      tribeSlug: normalizedSlug,
    });

    if (!snapshot) {
      return { status: "not_found" };
    }

    const [verificationStates, renewalStatus] = await Promise.all([
      ownVerificationStatesReader.listOwnVerificationStates({ tribeSlug: normalizedSlug }),
      ownAcademyRenewalReader.getOwnAcademyRenewalStatus({ tribeSlug: normalizedSlug }),
    ]);

    return {
      access: buildAcademyAccessStatus(
        {
          firstActivatedAt: snapshot.firstActivatedAt,
          grants: snapshot.grants,
          membership: snapshot.membership,
          offerPurchasable: snapshot.offerPurchasable && isAcademySalesActivationAllowed(),
          renewalStatus,
          verificationStates,
        },
        now()
      ),
      accessModel: snapshot.accessModel,
      status: "ok",
    };
  };
}

export function getAcademyPublicOffer({ productAccessRepository }: ProductAccessDependencies) {
  return async ({ tribeSlug }: { tribeSlug: string }): Promise<AcademyPublicOffer | null> =>
    productAccessRepository.getPublicOffer({ tribeSlug: normalizeSlug(tribeSlug) });
}

export function getAcademySettings({ productAccessRepository }: ProductAccessDependencies) {
  return async ({ tribeSlug }: { tribeSlug: string }): Promise<AcademySettings | null> =>
    productAccessRepository.getAcademySettings({ tribeSlug: normalizeSlug(tribeSlug) });
}

export type AcademyUseCaseInvalidInput = { status: "invalid_input" };

export function saveAcademyOffer({ productAccessRepository }: ProductAccessDependencies) {
  return async (command: {
    benefits: string[];
    correlationId: string;
    description: string;
    expectedConfigVersion: number;
    title: string;
    tribeSlug: string;
  }): Promise<AcademySettingsMutationResult | AcademyUseCaseInvalidInput> => {
    const title = normalizeCopy(command.title, ACADEMY_OFFER_LIMITS.titleMaxLength);
    const description = normalizeCopy(
      command.description,
      ACADEMY_OFFER_LIMITS.descriptionMaxLength
    );
    const benefits = command.benefits
      .map((benefit) => normalizeCopy(benefit, ACADEMY_OFFER_LIMITS.benefitMaxLength))
      .filter((benefit): benefit is string => benefit !== null && benefit.length > 0);

    if (
      title === null ||
      title.length === 0 ||
      description === null ||
      benefits.length !== command.benefits.filter((benefit) => benefit.trim()).length ||
      benefits.length > ACADEMY_OFFER_LIMITS.maxBenefits
    ) {
      return { status: "invalid_input" };
    }

    return productAccessRepository.saveOffer({
      benefits,
      correlationId: command.correlationId,
      description,
      expectedConfigVersion: command.expectedConfigVersion,
      title,
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
  };
}

/**
 * Opens or pauses admissions and sales. Pausing never cancels renewals, grants
 * or bonuses. Enabling sales is refused while the deployment has not enabled
 * academy sales (the provider period contract still needs external evidence).
 */
export function setAcademyAvailability({
  isAcademySalesActivationAllowed,
  productAccessRepository,
}: ProductAccessDependencies & { isAcademySalesActivationAllowed: () => boolean }) {
  return async (command: {
    admissionEnabled: boolean;
    correlationId: string;
    expectedConfigVersion: number;
    salesEnabled: boolean;
    tribeSlug: string;
  }): Promise<AcademySettingsMutationResult | { status: "sales_activation_disabled" }> => {
    if (command.salesEnabled && !isAcademySalesActivationAllowed()) {
      return { status: "sales_activation_disabled" };
    }

    return productAccessRepository.setAvailability({
      ...command,
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
  };
}

/**
 * Grants a leader bonus that starts now (server clock) and ends at a future
 * date. A bonus for an unverified member requires an explicit exception.
 */
export function grantAcademyBonus({
  now,
  productAccessRepository,
}: ProductAccessDependencies & { now: ProductAccessClock }) {
  return async (command: {
    allowUnverifiedRecipient: boolean;
    correlationId: string;
    endsAt: Date;
    idempotencyKey: string;
    reason: string;
    recipientUserId: string;
    replacesGrantId: string | null;
    tribeSlug: string;
  }): Promise<GrantAcademyBonusResult | AcademyUseCaseInvalidInput> => {
    const reason = normalizeReason(command.reason);
    const currentInstant = now().getTime();
    const endsAtInstant = command.endsAt.getTime();
    const maxEndsAtInstant =
      currentInstant + ACADEMY_BONUS_LIMITS.maxDurationDays * MILLISECONDS_PER_DAY;

    if (
      reason === null ||
      !Number.isFinite(endsAtInstant) ||
      endsAtInstant <= currentInstant ||
      endsAtInstant > maxEndsAtInstant ||
      !UUID_PATTERN.test(command.idempotencyKey) ||
      command.recipientUserId.trim().length === 0 ||
      (command.replacesGrantId !== null && !UUID_PATTERN.test(command.replacesGrantId))
    ) {
      return { status: "invalid_input" };
    }

    return productAccessRepository.grantBonus({
      ...command,
      reason,
      recipientUserId: command.recipientUserId.trim(),
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
  };
}

export function revokeAcademyBonus({ productAccessRepository }: ProductAccessDependencies) {
  return async (command: {
    correlationId: string;
    grantId: string;
    reason: string;
    tribeSlug: string;
  }): Promise<RevokeAcademyBonusResult | AcademyUseCaseInvalidInput> => {
    const reason = normalizeReason(command.reason);

    if (reason === null || !UUID_PATTERN.test(command.grantId)) {
      return { status: "invalid_input" };
    }

    return productAccessRepository.revokeBonus({
      ...command,
      reason,
      tribeSlug: normalizeSlug(command.tribeSlug),
    });
  };
}

export function listAcademyMembers({ productAccessRepository }: ProductAccessDependencies) {
  return async (query: {
    page: number;
    pageSize?: number;
    search: string | null;
    tribeSlug: string;
  }): Promise<ListAcademyMembersResult> => {
    const search = query.search?.trim().slice(0, ACADEMY_MEMBERS_PAGE.searchMaxLength) || null;

    return productAccessRepository.listMembers({
      page: Math.max(1, Math.trunc(query.page) || 1),
      pageSize: Math.min(
        ACADEMY_MEMBERS_PAGE.maxPageSize,
        Math.max(1, Math.trunc(query.pageSize ?? ACADEMY_MEMBERS_PAGE.defaultPageSize))
      ),
      search,
      tribeSlug: normalizeSlug(query.tribeSlug),
    });
  };
}
