/**
 * Port of the academy product access: per-tribe configuration, grants and
 * the member access snapshot. Implementations must enforce tribe isolation,
 * roles and concurrency in the data layer (the runtime role bypasses RLS).
 *
 * @module product-access-repository
 */

import type {
  AccessGrantSourceType,
  TribeAccessModel,
} from "@/src/modules/product-access/constants/product-access";
import type {
  AccessGrantInterval,
  AccessMembershipSnapshot,
} from "@/src/modules/product-access/domain/services/academy-access-policy";

export type TribeSlugQuery = {
  tribeSlug: string;
};

export type OwnAcademyAccessSnapshot = {
  accessModel: TribeAccessModel;
  admissionEnabled: boolean;
  firstActivatedAt: Date | null;
  grants: AccessGrantInterval[];
  membership: AccessMembershipSnapshot;
  /** Sales enabled and a current academy price synchronized with the provider. */
  offerPurchasable: boolean;
  salesEnabled: boolean;
};

export type AcademyOfferContent = {
  benefits: string[];
  description: string;
  title: string;
};

export type AcademyPublicOffer = AcademyOfferContent & {
  admissionEnabled: boolean;
  offerVersion: number;
  price: {
    amountCents: number;
    currency: string;
    frequency: string;
  } | null;
  salesEnabled: boolean;
  tribeName: string;
};

export type AcademySettings = AcademyOfferContent & {
  accessModel: TribeAccessModel;
  admissionEnabled: boolean;
  configVersion: number;
  offerVersion: number;
  salesEnabled: boolean;
};

export type SaveAcademyOfferCommand = AcademyOfferContent & {
  correlationId: string;
  expectedConfigVersion: number;
  tribeSlug: string;
};

export type SetAcademyAvailabilityCommand = {
  admissionEnabled: boolean;
  correlationId: string;
  expectedConfigVersion: number;
  salesEnabled: boolean;
  tribeSlug: string;
};

export type AcademySettingsMutationResult =
  | { settings: AcademySettings; status: "updated" }
  | { settings: AcademySettings; status: "conflict" }
  | { status: "forbidden" | "not_academy" | "not_found" };

export type GrantAcademyBonusCommand = {
  allowUnverifiedRecipient: boolean;
  correlationId: string;
  endsAt: Date;
  idempotencyKey: string;
  reason: string;
  recipientUserId: string;
  /** Existing bonus replaced atomically (revoked in the same transaction). */
  replacesGrantId: string | null;
  tribeSlug: string;
};

export type AcademyGrantView = {
  endsAt: Date | null;
  id: string;
  revokedAt: Date | null;
  sourceType: AccessGrantSourceType;
  startsAt: Date;
};

export type GrantAcademyBonusResult =
  | { grant: AcademyGrantView; hasActiveRenewal: boolean; status: "created" | "replayed" }
  | {
      status:
        | "forbidden"
        | "idempotency_conflict"
        | "not_academy"
        | "not_found"
        | "recipient_not_eligible"
        | "recipient_not_verified"
        | "replaced_grant_not_found";
    };

export type RevokeAcademyBonusCommand = {
  correlationId: string;
  grantId: string;
  reason: string;
  tribeSlug: string;
};

export type RevokeAcademyBonusResult =
  | { status: "already_revoked" | "revoked" }
  | { status: "forbidden" | "not_found" };

export type ListAcademyMembersQuery = {
  page: number;
  pageSize: number;
  search: string | null;
  tribeSlug: string;
};

export type AcademyMemberSourceView = AcademyGrantView & {
  /** Private leader note (bonus reason); null for guardians. */
  note: string | null;
};

export type AcademyMemberAccessRow = {
  displayName: string;
  /** Leaders see every source; guardians only see whether access exists. */
  grants: AcademyMemberSourceView[];
  hasAcademyAccess: boolean;
  isVerified: boolean;
  membershipStatus: string;
  renewalStatus: string | null;
  role: string;
  userId: string;
};

export type AcademyMembersPage = {
  members: AcademyMemberAccessRow[];
  total: number;
  viewerRole: "guardian" | "leader";
};

export type ListAcademyMembersResult =
  | { page: AcademyMembersPage; status: "ok" }
  | { status: "forbidden" | "not_found" };

export type ActivateAcademyCommand = {
  expectedConfigVersion: number;
  tribeSlug: string;
};

/**
 * Self-service activation by the active leader. Current members keep full
 * access; only later entrants start as basic members.
 */
export type ActivateAcademyResult =
  | { settings: AcademySettings; status: "activated" | "already_academy" }
  | { settings: AcademySettings; status: "conflict" }
  | { status: "forbidden" | "not_found" };

export type ProductAccessRepository = {
  activateAcademy(command: ActivateAcademyCommand): Promise<ActivateAcademyResult>;
  getAcademySettings(query: TribeSlugQuery): Promise<AcademySettings | null>;
  getPublicOffer(query: TribeSlugQuery): Promise<AcademyPublicOffer | null>;
  grantBonus(command: GrantAcademyBonusCommand): Promise<GrantAcademyBonusResult>;
  listMembers(query: ListAcademyMembersQuery): Promise<ListAcademyMembersResult>;
  readOwnAccessSnapshot(query: TribeSlugQuery): Promise<OwnAcademyAccessSnapshot | null>;
  revokeBonus(command: RevokeAcademyBonusCommand): Promise<RevokeAcademyBonusResult>;
  saveOffer(command: SaveAcademyOfferCommand): Promise<AcademySettingsMutationResult>;
  setAvailability(
    command: SetAcademyAvailabilityCommand
  ): Promise<AcademySettingsMutationResult>;
};
