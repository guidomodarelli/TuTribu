/** Own scoped query ports stay independent of provider DTOs and public transport. @module admission-query-reader */
import type { AdmissionCommandScope } from "./admission-repositories";
/** The infrastructure owner must restrict this read to the current account before projecting its own result. */
export interface AdmissionOwnRequestReader<Result> {
  /** @param scope - Server-derived user/session/tribe and safe correlation. @returns Own current request or genuine absence, without effects. */
  readOwn(scope: AdmissionCommandScope & { admissionRequestId?: string }): Promise<Result | null>;
}
/** Public tribe/policy facts are separate from current account state and expose no list/invitation matches. */
export type AdmissionOverviewFacts<Request = unknown> = {
  tribe: { id: string; slug: string; name: string; accessModel: "academy"; controlActivated: boolean; evaluatorEnabled: boolean };
  policy: { mode: "manual_review" | "allowlist"; contactType: "email" | "phone"; requiresAdditionalVerification: boolean; isOpen: boolean; version: number } | null;
  membership: { role: "leader" | "guardian" | "tribemate"; status: "active" | "muted" | "blocked" | "removed"; statusReason: string; commercialRecoveryStatus: "active" | "muted" | null } | null;
  request: Request | null; recoveryLocked: boolean;
  /** Applicant-facing choices are hints only; issuance rechecks policy, country, capability and budgets. */
  verification?: { channel: "email" | "sms" | "whatsapp"; allowedCountries: readonly string[]; allowedAlternative?: "sms" };
};
/** Overview is a read-only projection; anonymous scope may receive public facts only. */
export interface AdmissionOverviewReader<Request> {
  /** @param query - Validated slug/correlation. @param scope - Current server account/session or explicit anonymous access. @returns Current own facts or genuine absence, with no mutation. */
  readOverview(query: { slug: string; requestId: string }, scope: Pick<AdmissionCommandScope, "userId" | "sessionId"> | null): Promise<AdmissionOverviewFacts<Request> | null>;
}
/** Resolves a public slug to internal tenant identity without granting permission or returning provider data. */
export interface AdmissionTribeIdentityReader {
  readIdentity(query: { slug: string; requestId: string }): Promise<{ id: string; slug: string } | null>;
}
