import { notFound } from "next/navigation";

import { AcademyVerification } from "@/components/academy/academy-verification";
import { ROUTES } from "@/src/constants/routes";
import {
  toMemberVerificationDto,
  toVerificationProviderDto,
} from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import {
  memberVerificationDtoSchema,
  verificationProviderDtoSchema,
} from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import { resolveVisibleTribePageAccess } from "../../tribe-page-access";

const VERIFICATION_PAGE = {
  failureMessage: "Failed to resolve academy verification page",
  operation: "tribe-academy-verification-page",
} as const;

/**
 * Own verification onboarding (academy free allowlist: members without
 * community access can use it). Only the member's own relations are loaded.
 */
export default async function TribeAcademyVerificationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, logger, modules, tribe } = await resolveVisibleTribePageAccess({
    allowWithoutCommunityAccess: true,
    callbackPath: ROUTES.tribes.academyVerification(slug),
    operation: VERIFICATION_PAGE.operation,
    slug,
  });
  const data = await Promise.all([
    modules.memberVerifications.useCases.listVerificationProviders({
      includeInactive: false,
      tribeSlug: tribe.slug,
    }),
    modules.memberVerifications.useCases.listOwnMemberVerifications({ tribeSlug: tribe.slug }),
  ])
    .then(([providers, verifications]) =>
      providers
        ? {
            providers: providers.map((provider) =>
              verificationProviderDtoSchema.parse(toVerificationProviderDto(provider))
            ),
            verifications: verifications.map((verification) =>
              memberVerificationDtoSchema.parse(toMemberVerificationDto(verification))
            ),
          }
        : null
    )
    .catch((error: unknown) => {
      logger.error({
        error,
        message: VERIFICATION_PAGE.failureMessage,
        metadata: { slug, viewerId: authenticatedMember.id },
      });

      return null;
    });

  if (!data) {
    notFound();
  }

  return (
    <AcademyVerification
      providers={data.providers}
      tribeSlug={tribe.slug}
      verifications={data.verifications}
    />
  );
}
