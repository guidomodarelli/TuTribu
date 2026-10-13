/** Owns clock-driven terminal expiration without a new presentation or invitation release. @module admission-request-expiration */
export type AdmissionExpirationCommand = { limit: number };

/** Executes one bounded atomic batch using current backend authority and database time. */
export interface AdmissionRequestExpiration {
  /** @param command - Backend-owned batch bound. @returns Confirmed expirations only after commit. */
  expire(command: AdmissionExpirationCommand): Promise<number>;
}
