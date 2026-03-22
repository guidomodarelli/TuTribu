import type { AuthenticatedMember } from "../entities/authenticated-member";

export interface AuthSessionRepository {
  getAuthenticatedMember(): Promise<AuthenticatedMember | null>;
}
