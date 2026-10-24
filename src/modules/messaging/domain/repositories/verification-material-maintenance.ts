/** Owns bounded destruction of recoverable OTP bytes without verifying a code or releasing usage. @module verification-material-maintenance */
export type VerificationMaterialPurgeCommand = { limit: number; deliveryId?: string };

/** Private backend maintenance, independently authorized before and after every mutation. */
export interface VerificationMaterialMaintenance {
  /** Removes only expired, retired or terminal material; current unknown/in-flight needs retain their identity. */
  purge(command: VerificationMaterialPurgeCommand): Promise<number>;
}
