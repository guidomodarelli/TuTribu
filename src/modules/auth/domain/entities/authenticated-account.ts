/** Models the private current-session projection consumed through feature-owned account ports. */
import type { RecentAuthenticationEvidence } from "./recent-authentication-evidence";

export type AuthenticatedAccount = {
  userId: string; normalizedEmail: string;
  session: { id: string; expiresAt: Date };
  googleAccount: { id: string; subject: string } | null;
  identityEvidence: {
    id: string; userId: string; accountId: string; subject: string; normalizedEmail: string;
    classification: "gmail" | "workspace" | "insufficient"; version: number;
    verifiedAt: Date; invalidatedAt: Date | null;
  } | null;
  recentAuthentication: readonly RecentAuthenticationEvidence[];
};
