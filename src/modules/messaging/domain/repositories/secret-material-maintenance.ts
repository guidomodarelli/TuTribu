/** Owns bounded credential-byte destruction without decryption, provider access or human recency. @module secret-material-maintenance */
export interface SecretMaterialMaintenance {
  /**
   * Destroys due retired bytes while preserving their immutable historical references.
   * @param limit - Backend-owned bounded batch, never a public filter.
   * @returns Number of confirmed purged envelopes.
   */
  purgeRetired(limit:number):Promise<number>;
}
