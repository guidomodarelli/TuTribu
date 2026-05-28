/**
 * Port for reading and updating the persisted profile image of a member.
 *
 * Implementations operate on the authentication user store and must not embed
 * provider-specific details or business rules.
 */
export interface MemberProfileRepository {
  /**
   * Returns the currently stored profile image URL for a member.
   *
   * @param userId - Identifier of the member whose image is read.
   * @returns The stored image URL, or `null` when the member has none.
   */
  getImage(userId: string): Promise<string | null>;

  /**
   * Persists a new profile image URL for a member.
   *
   * @param userId - Identifier of the member whose image is updated.
   * @param imageUrl - The new image URL to store.
   */
  updateImage(userId: string, imageUrl: string): Promise<void>;
}
