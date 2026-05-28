/**
 * Port for resolving the current profile picture URL of a member from the
 * external identity provider (for example, Google) using stored offline
 * credentials.
 *
 * Implementations own the provider integration details. They may throw when the
 * provider cannot be reached or the credentials are unusable; callers decide how
 * to react to those failures.
 */
export interface ExternalProfilePictureProvider {
  /**
   * Resolves the current profile picture URL for a member.
   *
   * @param userId - Identifier of the member whose picture is requested.
   * @returns The current picture URL, or `null` when the provider exposes none.
   */
  getCurrentPictureUrl(userId: string): Promise<string | null>;
}
