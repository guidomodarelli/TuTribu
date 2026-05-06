export interface TribeCreatorWhitelistRepository {
  isEmailAllowed(email: string): Promise<boolean>;
}
