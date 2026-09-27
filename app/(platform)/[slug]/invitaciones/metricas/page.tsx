import { notFound } from "next/navigation";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "beez-ui";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { TribeInvitationConversionMetricResult } from "@/src/modules/tribes/application/results/tribe-invitation-result";
import { ROUTES } from "@/src/constants/routes";
import { resolveVisibleTribePageAccess } from "../../tribe-page-access";
import styles from "./styles.module.scss";

const INVITATION_METRICS_PAGE_COPY = {
  campaignFallback: "Sin campaña",
  description:
    "Revisá altas y membresías pagas activas atribuidas al último link de invitación usado.",
  directChannelLabel: "Directo",
  emptyState: "Todavía no hay conversiones atribuidas a links activos.",
  mercadoPagoAccountFallback: "Sin cuenta MP",
  referrerFallback: "Sin referente",
  title: "Métricas de invitaciones",
} as const;

const INVITATION_METRICS_PAGE_LOG = {
  operation: "tribe-invitation-metrics-page",
  resolveMetricsFailureMessage:
    "Failed to resolve tribe invitation conversion metrics",
} as const;

const INVITATION_MANAGER_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

const CHANNEL_LABEL: Record<string, string> = {
  direct: "Directo",
  instagram: "Instagram",
  other: "Otro",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
};

const INVITATION_METRICS_REVENUE_FORMAT = {
  accountEmailPrefix: " (",
  accountEmailSuffix: ")",
  centsDivisor: 100,
  currency: "ARS",
  locale: "es-AR",
  maximumFractionDigits: 0,
  style: "currency",
} as const;

const INVITATION_METRICS_ROW_KEY = {
  emptyPaymentGroup: "without-payment-account",
  separator: "::",
} as const;

const ARS_REVENUE_FORMATTER = new Intl.NumberFormat(
  INVITATION_METRICS_REVENUE_FORMAT.locale,
  {
    currency: INVITATION_METRICS_REVENUE_FORMAT.currency,
    maximumFractionDigits:
      INVITATION_METRICS_REVENUE_FORMAT.maximumFractionDigits,
    style: INVITATION_METRICS_REVENUE_FORMAT.style,
  }
);

function formatRevenue(revenueCents: number): string {
  return ARS_REVENUE_FORMATTER.format(
    revenueCents / INVITATION_METRICS_REVENUE_FORMAT.centsDivisor
  );
}

function formatChannel(channel: string | null): string {
  if (!channel) {
    return INVITATION_METRICS_PAGE_COPY.directChannelLabel;
  }

  return CHANNEL_LABEL[channel] ?? INVITATION_METRICS_PAGE_COPY.directChannelLabel;
}

function formatMercadoPagoAccount(
  metric: TribeInvitationConversionMetricResult
): string {
  if (metric.mercadoPagoAccountLabel && metric.mercadoPagoAccountEmail) {
    return (
      metric.mercadoPagoAccountLabel +
      INVITATION_METRICS_REVENUE_FORMAT.accountEmailPrefix +
      metric.mercadoPagoAccountEmail +
      INVITATION_METRICS_REVENUE_FORMAT.accountEmailSuffix
    );
  }

  return (
    metric.mercadoPagoAccountLabel ??
    metric.mercadoPagoAccountEmail ??
    INVITATION_METRICS_PAGE_COPY.mercadoPagoAccountFallback
  );
}

function buildMetricRowKey(
  metric: TribeInvitationConversionMetricResult
): string {
  return [
    metric.invitationId,
    metric.paymentIntegrationId ??
      metric.mercadoPagoAccountLabel ??
      metric.mercadoPagoAccountEmail ??
      INVITATION_METRICS_ROW_KEY.emptyPaymentGroup,
  ].join(INVITATION_METRICS_ROW_KEY.separator);
}

export default async function TribeInvitationMetricsPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, tribe, logger, modules } =
    await resolveVisibleTribePageAccess({
      callbackPath: ROUTES.tribes.invitationMetrics(slug),
      operation: INVITATION_METRICS_PAGE_LOG.operation,
      slug,
    });

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);

  if (
    currentMembership?.role !== INVITATION_MANAGER_ROLE.leader &&
    currentMembership?.role !== INVITATION_MANAGER_ROLE.guardian
  ) {
    notFound();
  }

  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(tribe.slug);

  if (membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active) {
    notFound();
  }

  const metrics = await modules.tribes.useCases
    .getTribeInvitationConversionMetrics({
      tribeSlug: tribe.slug,
    })
    .catch((error: unknown) => {
      logger.error({
        message: INVITATION_METRICS_PAGE_LOG.resolveMetricsFailureMessage,
        error,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });

      return [];
    });

  return (
    <main className={styles.TribeInvitationMetricsPage}>
      <header className={styles.TribeInvitationMetricsPage__header}>
        <h1 className={styles.TribeInvitationMetricsPage__title}>
          {INVITATION_METRICS_PAGE_COPY.title}
        </h1>
        <p className={styles.TribeInvitationMetricsPage__description}>
          {INVITATION_METRICS_PAGE_COPY.description}
        </p>
      </header>
      {metrics.length > 0 ? (
        <Table className={styles.TribeInvitationMetricsPage__table}>
          <TableHeader>
            <TableRow>
              <TableHead>Canal</TableHead>
              <TableHead>Campaña</TableHead>
              <TableHead>Referente</TableHead>
              <TableHead>Inscripciones</TableHead>
              <TableHead>Pagas activas</TableHead>
              <TableHead>Ingresos estimados</TableHead>
              <TableHead>Cuenta MP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((metric) => (
              <TableRow key={buildMetricRowKey(metric)}>
                <TableCell>{formatChannel(metric.channel)}</TableCell>
                <TableCell>
                  {metric.campaignName ??
                    INVITATION_METRICS_PAGE_COPY.campaignFallback}
                </TableCell>
                <TableCell>
                  {metric.referrerHandle ??
                    INVITATION_METRICS_PAGE_COPY.referrerFallback}
                </TableCell>
                <TableCell>{metric.signups}</TableCell>
                <TableCell>{metric.paidActive}</TableCell>
                <TableCell>{formatRevenue(metric.revenueCents)}</TableCell>
                <TableCell>{formatMercadoPagoAccount(metric)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className={styles.TribeInvitationMetricsPage__empty}>
          {INVITATION_METRICS_PAGE_COPY.emptyState}
        </p>
      )}
    </main>
  );
}
