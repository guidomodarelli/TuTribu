import { notFound } from "next/navigation";

import { AcademyActivation } from "@/components/academy/academy-activation";
import { TribeSettingsManagement } from "@/components/tribes/tribe-settings-management";
import { toAcademySettingsDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academySettingsDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { ROUTES } from "@/src/constants/routes";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_SETTINGS_PAGE = {
  operation: "tribe-settings-page",
  resolveAcademySettingsFailureMessage: "Failed to resolve academy settings",
  resolveIdentityFailureMessage: "Failed to resolve tribe identity",
} as const;

/**
 * Leader-only tribe settings. Identity lives on the tribe itself, so it is
 * managed here instead of inside the story editor.
 */
export default async function TribeSettingsPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
      callbackPath: ROUTES.tribes.settings(slug),
      operation: TRIBE_SETTINGS_PAGE.operation,
      slug,
    });
  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(tribe.slug);

  if (membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active) {
    notFound();
  }

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);

  if (currentMembership?.role !== TRIBE_MEMBER_ROLE.leader) {
    notFound();
  }

  const identity = await modules.tribes.useCases
    .getTribeIdentity({ tribeSlug: tribe.slug })
    .catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_SETTINGS_PAGE.resolveIdentityFailureMessage,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });
      notFound();
    });

  // The academy section is optional: a failure is logged and the rest of the
  // settings stay usable.
  const academySettings = await modules.productAccess.useCases
    .getAcademySettings({ tribeSlug: tribe.slug })
    .then((settings) =>
      settings ? academySettingsDtoSchema.parse(toAcademySettingsDto(settings)) : null
    )
    .catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_SETTINGS_PAGE.resolveAcademySettingsFailureMessage,
        metadata: { slug, viewerId: authenticatedMember.id },
      });

      return null;
    });

  return (
    <main className={styles.TribeSettingsPage}>
      <TribeSettingsManagement identity={identity} tribeSlug={tribe.slug} />
      {academySettings ? (
        <AcademyActivation settings={academySettings} tribeSlug={tribe.slug} />
      ) : null}
    </main>
  );
}
