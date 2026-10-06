/** Own port for current global account facts; transport claims and credentials never cross it. */
import type { AuthenticatedAccount } from "../entities/authenticated-account";

export interface AuthenticatedAccountProvider {
  /** Resolves the actual current session/account; a browser success flag is not evidence. */
  getAuthenticatedAccount(): Promise<AuthenticatedAccount | null>;
}
