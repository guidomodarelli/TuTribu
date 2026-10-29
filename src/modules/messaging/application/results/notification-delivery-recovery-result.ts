/** Defines the minimum committed recovery lineage without recipient, credential or provider details. @module notification-delivery-recovery-result */

/** Reports a new explicit delivery while preserving the original transport identity. */
export type NotificationDeliveryRecoveryResult = {
  originalDeliveryId: string;
  recoveryDeliveryId: string;
  originalVersion: number;
  targetConnectionId: string;
  targetConnectionVersion: number;
};
