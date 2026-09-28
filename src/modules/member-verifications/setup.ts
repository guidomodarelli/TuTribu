/**
 * Composes member verification use cases with their repository port.
 *
 * @module member-verifications-setup
 */

import {
  listOwnMemberVerifications,
  listOwnVerificationStates,
  listVerificationProviders,
  listVerificationReviewQueue,
  requestMemberVerification,
  reviewMemberVerification,
  saveVerificationProvider,
} from "@/src/modules/member-verifications/application/use-cases/manage-member-verifications-use-cases";
import type { MemberVerificationRepository } from "@/src/modules/member-verifications/domain/repositories/member-verification-repository";

export function buildMemberVerificationsModule({
  memberVerificationRepository,
}: {
  memberVerificationRepository: MemberVerificationRepository;
}) {
  return {
    useCases: {
      listOwnMemberVerifications: listOwnMemberVerifications({ memberVerificationRepository }),
      listOwnVerificationStates: listOwnVerificationStates({ memberVerificationRepository }),
      listVerificationProviders: listVerificationProviders({ memberVerificationRepository }),
      listVerificationReviewQueue: listVerificationReviewQueue({ memberVerificationRepository }),
      requestMemberVerification: requestMemberVerification({ memberVerificationRepository }),
      reviewMemberVerification: reviewMemberVerification({ memberVerificationRepository }),
      saveVerificationProvider: saveVerificationProvider({ memberVerificationRepository }),
    },
  };
}
