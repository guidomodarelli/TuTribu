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

export type OwnAcademyRenewalReader = {
  getOwnAcademyRenewalStatus(query: { tribeSlug: string }): Promise<AcademyRenewalStatus>;
};
