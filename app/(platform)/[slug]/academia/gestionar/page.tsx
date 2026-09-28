import { notFound } from "next/navigation";

import {
  AcademyManagement,
  type AcademyManagementProps,
} from "@/components/academy/academy-management";
import { ROUTES } from "@/src/constants/routes";
import {
  toReviewQueueItemDto,
  toVerificationProviderDto,
} from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import {
  reviewQueueItemDtoSchema,
  verificationProviderDtoSchema,
} from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import {
  toAcademyMembersPageDto,
  toAcademySettingsDto,
} from "@/src/modules/product-access/application/results/academy-dto-mappers";
import {
  academyMembersPageDtoSchema,
  academySettingsDtoSchema,
} from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { resolveVisibleTribePageAccess } from "../../tribe-page-access";

const MANAGEMENT_PAGE = {
  failureMessage: "Failed to resolve academy management page",
  firstPage: 1,
  operation: "tribe-academy-management-page",
  pendingStatus: "pending",
} as const;

type RequestModules = Awaited<ReturnType<typeof resolveVisibleTribePageAccess>>["modules"];

/**
 * Loads the management data allowed for the viewer role. Returns null when
 * the viewer is not an active leader or guardian.
 */
async function loadManagementProps(
  modules: RequestModules,
  tribeSlug: string
): Promise<AcademyManagementProps | null> {
  const [membersResult, queue] = await Promise.all([
    modules.productAccess.useCases.listAcademyMembers({
      page: MANAGEMENT_PAGE.firstPage,
      search: null,
      tribeSlug,
    }),
    modules.memberVerifications.useCases.listVerificationReviewQueue({
      page: MANAGEMENT_PAGE.firstPage,
      search: null,
      status: MANAGEMENT_PAGE.pendingStatus,
      tribeSlug,
    }),
  ]);

  if (membersResult.status !== "ok" || "status" in queue) {
    return null;
  }

  const viewerRole = membersResult.page.viewerRole;
  const [settings, providers] =
    viewerRole === "leader"
      ? await Promise.all([
          modules.productAccess.useCases.getAcademySettings({ tribeSlug }),
          modules.memberVerifications.useCases.listVerificationProviders({
            includeInactive: true,
            tribeSlug,
          }),
        ])
      : [null, null];

  return {
    initialMembers: academyMembersPageDtoSchema.parse(
      toAcademyMembersPageDto(membersResult.page, MANAGEMENT_PAGE.firstPage)
    ),
    initialQueue: {
      items: queue.items.map((item) => reviewQueueItemDtoSchema.parse(toReviewQueueItemDto(item))),
      page: MANAGEMENT_PAGE.firstPage,
      total: queue.total,
    },
    providers: providers
      ? providers.map((provider) =>
          verificationProviderDtoSchema.parse(toVerificationProviderDto(provider))
        )
      : null,
    settings: settings ? academySettingsDtoSchema.parse(toAcademySettingsDto(settings)) : null,
    tribeSlug,
    viewerRole,
  };
}

/**
 * Academy management for active leaders and guardians. Sections and data
 * depend on the role resolved by the server (leaders: configuration,
 * providers and private notes; guardians: review and access overview).
 */
export default async function TribeAcademyManagementPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, logger, modules, tribe } = await resolveVisibleTribePageAccess({
    callbackPath: ROUTES.tribes.academyManage(slug),
    operation: MANAGEMENT_PAGE.operation,
    slug,
  });
  const managementProps = await loadManagementProps(modules, tribe.slug).catch(
    (error: unknown) => {
      logger.error({
        error,
        message: MANAGEMENT_PAGE.failureMessage,
        metadata: { slug, viewerId: authenticatedMember.id },
      });

      return null;
    }
  );

  if (!managementProps) {
    notFound();
  }

  return <AcademyManagement {...managementProps} />;
}
