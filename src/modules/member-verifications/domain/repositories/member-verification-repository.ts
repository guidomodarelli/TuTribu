/**
 * Port of member verifications and their tribe-configured providers.
 *
 * @module member-verification-repository
 */

import type {
  MemberVerificationDecision,
  MemberVerificationStatus,
} from "@/src/modules/member-verifications/constants/member-verifications";

export type VerificationProvider = {
  displayName: string;
  id: string;
  instructions: string;
  isActive: boolean;
  key: string;
  linkUrl: string | null;
};

export type OwnMemberVerification = {
  declaredEmail: string | null;
  /** Reason of a rejection or revocation, shown to its owner. */
  decisionReason: string | null;
  id: string;
  providerDisplayName: string;
  providerId: string;
  status: MemberVerificationStatus;
  updatedAt: Date;
  version: number;
};

export type ReviewQueueItem = OwnMemberVerification & {
  memberDisplayName: string;
  memberUserId: string;
  reviewedAt: Date | null;
};

export type ReviewQueuePage = {
  items: ReviewQueueItem[];
  total: number;
};

export type SaveVerificationProviderCommand = {
  correlationId: string;
  displayName: string;
  instructions: string;
  isActive: boolean;
  key: string;
  linkUrl: string | null;
  /** Null creates a provider; otherwise updates that provider. */
  providerId: string | null;
  tribeSlug: string;
};

export type SaveVerificationProviderResult =
  | { provider: VerificationProvider; status: "created" | "updated" }
  | { status: "duplicate_key" | "forbidden" | "limit_reached" | "not_found" };

export type RequestMemberVerificationCommand = {
  correlationId: string;
  declaredEmail: string | null;
  providerId: string;
  tribeSlug: string;
};

export type RequestMemberVerificationResult =
  | { status: "created" | "reopened" | "unchanged"; verification: OwnMemberVerification }
  | { status: "forbidden" | "not_found" | "provider_unavailable" };

export type ReviewMemberVerificationCommand = {
  correlationId: string;
  decision: MemberVerificationDecision;
  expectedVersion: number;
  reason: string | null;
  tribeSlug: string;
  verificationId: string;
};

export type ReviewMemberVerificationResult =
  | { status: "updated"; verification: ReviewQueueItem }
  | { status: "conflict"; verification: ReviewQueueItem }
  | { status: "invalid_transition"; verification: ReviewQueueItem }
  | { status: "forbidden" | "not_found" | "reason_required" };

export type ListReviewQueueQuery = {
  page: number;
  pageSize: number;
  search: string | null;
  status: MemberVerificationStatus | null;
  tribeSlug: string;
};

export type MemberVerificationRepository = {
  listOwn(query: { tribeSlug: string }): Promise<OwnMemberVerification[]>;
  listProviders(query: {
    includeInactive: boolean;
    tribeSlug: string;
  }): Promise<VerificationProvider[] | null>;
  listReviewQueue(
    query: ListReviewQueueQuery
  ): Promise<ReviewQueuePage | { status: "forbidden" | "not_found" }>;
  request(command: RequestMemberVerificationCommand): Promise<RequestMemberVerificationResult>;
  review(command: ReviewMemberVerificationCommand): Promise<ReviewMemberVerificationResult>;
  saveProvider(command: SaveVerificationProviderCommand): Promise<SaveVerificationProviderResult>;
};
