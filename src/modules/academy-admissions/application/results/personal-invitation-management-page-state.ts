/** Defines serialized private management state without authentication/provider/storage contracts. @module personal-invitation-management-page-state */
import type { AdmissionErrorCode } from "../../constants/admission-errors";
import type { PersonalInvitationManagementResult } from "./admission-resource-result";

/** Opaque cursor metadata is never resource authority. */
export type PersonalInvitationManagementBrowserQuery = { limit: number; status?: "active" | "revoked" | "expired" | "redeemed"; cursor?: string };
/** First render derives entirely from this current server snapshot, including its clock. */
export type PersonalInvitationManagementPageState =
  | { kind: "ready"; slug: string; tribeId: string; viewerId: string; renderedAt: string; publicOrigin?: string; contactType: "email" | "phone" | null; requiresAdditionalVerification: boolean; allowedCountries: string[]; hasUsableAllowlist: boolean; page: { items: PersonalInvitationManagementResult[]; nextCursor: string | null }; query: PersonalInvitationManagementBrowserQuery }
  | { kind: "unavailable"; code: AdmissionErrorCode; message: string };
