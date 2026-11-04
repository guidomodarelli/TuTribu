/**
 * Ports the academy access use cases read from other modules. They are
 * implemented by `member-verifications` and `subscriptions` infrastructure and
 * composed in `src/modules/setup.ts`, so product-access never imports their
 * repositories.
 *
 * @module academy-cross-module-readers
 */

import type { AcademyRenewalStatus } from "@/src/modules/product-access/constants/product-access";
import type { MemberVerificationState } from "@/src/modules/product-access/domain/services/academy-access-status";

export type OwnVerificationStatesReader = {
  listOwnVerificationStates(query: {
    tribeSlug: string;
  }): Promise<MemberVerificationState[]>;
};

/** Renewal of the member's academy subscription, read by the subscriptions module. */
export type OwnAcademyRenewalState = {
  /** The last recorded invoice of that subscription was rejected by the provider. */
  lastPaymentRejected: boolean;
  status: AcademyRenewalStatus;
};

export type OwnAcademyRenewalReader = {
  getOwnAcademyRenewal(query: { tribeSlug: string }): Promise<OwnAcademyRenewalState>;
};
