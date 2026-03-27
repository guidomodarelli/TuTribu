export interface CommunityCreatorWhitelistRepository {
  isEmailAllowed(email: string): Promise<boolean>;
}
