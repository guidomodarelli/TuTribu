"use client";

import { useMemo, useState } from "react";
import { ClipboardIcon, LinkIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import type { TribeInvitationListItemResult } from "@/src/modules/tribes/application/results/tribe-invitation-result";
import styles from "./styles.module.scss";

const INVITATION_MANAGEMENT_COPY = {
  copiedMessage: "Link copiado.",
  copyButton: "Copiar link",
  createButton: "Crear link",
  createdByFallback: "Otro miembro",
  description:
    "Creá links reutilizables para que nuevas personas entren a la tribu con Google.",
  emptyState: "Todavía no hay invitaciones activas.",
  fallbackCopyError: "No pudimos copiar el link.",
  fallbackCreateError: "No pudimos crear la invitación.",
  fallbackRevokeError: "No pudimos revocar la invitación.",
  itemTitle: "Link activo",
  revokeButton: "Revocar",
  title: "Invitaciones",
} as const;

const INVITATION_MANAGEMENT_ROUTE = {
  apiTribes: "/api/tribes/",
  invitationsSegment: "/invitations",
  segmentSeparator: "/",
} as const;

const INVITATION_MANAGEMENT_REQUEST = {
  dateStyle: "medium",
  deleteMethod: "DELETE",
  locale: "es",
  postMethod: "POST",
  timeStyle: "short",
  buttonType: "button",
  outlineVariant: "outline",
} as const;
const INVITATION_CREATED_AT_FORMATTER = new Intl.DateTimeFormat(
  INVITATION_MANAGEMENT_REQUEST.locale,
  {
    dateStyle: INVITATION_MANAGEMENT_REQUEST.dateStyle,
    timeStyle: INVITATION_MANAGEMENT_REQUEST.timeStyle,
    timeZone: BUENOS_AIRES_TIME_ZONE,
  }
);

type InvitationResponse = {
  invitation?: TribeInvitationListItemResult;
  invitationUrl?: string;
  message?: string;
};

type TribeInvitationManagementProps = {
  invitations: TribeInvitationListItemResult[];
  tribeSlug: string;
};

function buildInvitationsEndpoint(tribeSlug: string): string {
  return (
    INVITATION_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    INVITATION_MANAGEMENT_ROUTE.invitationsSegment
  );
}

function buildInvitationEndpoint(tribeSlug: string, invitationId: string): string {
  return (
    buildInvitationsEndpoint(tribeSlug) +
    INVITATION_MANAGEMENT_ROUTE.segmentSeparator +
    invitationId
  );
}

async function submitInvitationRequest(
  url: string,
  method: string
): Promise<InvitationResponse> {
  const response = await fetch(url, { method });
  const responseBody = (await response.json().catch(() => ({}))) as InvitationResponse;

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? INVITATION_MANAGEMENT_COPY.fallbackCreateError
    );
  }

  return responseBody;
}

function formatCreatedAt(value: string): string {
  return INVITATION_CREATED_AT_FORMATTER.format(new Date(value));
}

export function TribeInvitationManagement({
  invitations,
  tribeSlug,
}: TribeInvitationManagementProps) {
  const [invitationItems, setInvitationItems] = useState(invitations);
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null);
  const hasActiveInvitations = invitationItems.length > 0;
  const formattedInvitations = useMemo(
    () =>
      invitationItems.map((invitation) => ({
        ...invitation,
        createdAtLabel: formatCreatedAt(invitation.createdAt),
      })),
    [invitationItems]
  );

  const copyInvitationUrl = async (invitationUrl: string) => {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      toast.success(INVITATION_MANAGEMENT_COPY.copiedMessage);
    } catch {
      toast.error(INVITATION_MANAGEMENT_COPY.fallbackCopyError);
    }
  };

  const handleCreateInvitation = async () => {
    setPendingInvitationId(INVITATION_MANAGEMENT_COPY.createButton);

    try {
      const response = await submitInvitationRequest(
        buildInvitationsEndpoint(tribeSlug),
        INVITATION_MANAGEMENT_REQUEST.postMethod
      );

      if (response.invitation) {
        setInvitationItems((currentItems) => [
          response.invitation!,
          ...currentItems,
        ]);
      }

      if (response.invitationUrl) {
        await copyInvitationUrl(response.invitationUrl);
      }

      toast.success(response.message ?? INVITATION_MANAGEMENT_COPY.createButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : INVITATION_MANAGEMENT_COPY.fallbackCreateError
      );
    } finally {
      setPendingInvitationId(null);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    setPendingInvitationId(invitationId);

    try {
      const response = await submitInvitationRequest(
        buildInvitationEndpoint(tribeSlug, invitationId),
        INVITATION_MANAGEMENT_REQUEST.deleteMethod
      );

      setInvitationItems((currentItems) =>
        currentItems.filter((invitation) => invitation.id !== invitationId)
      );
      toast.success(response.message ?? INVITATION_MANAGEMENT_COPY.revokeButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : INVITATION_MANAGEMENT_COPY.fallbackRevokeError
      );
    } finally {
      setPendingInvitationId(null);
    }
  };

  return (
    <section className={styles.TribeInvitationManagement}>
      <header className={styles.TribeInvitationManagement__header}>
        <h1 className={styles.TribeInvitationManagement__title}>
          {INVITATION_MANAGEMENT_COPY.title}
        </h1>
        <p className={styles.TribeInvitationManagement__description}>
          {INVITATION_MANAGEMENT_COPY.description}
        </p>
      </header>
      <div className={styles.TribeInvitationManagement__actions}>
        <Button
          disabled={Boolean(pendingInvitationId)}
          onClick={() => {
            void handleCreateInvitation();
          }}
          type={INVITATION_MANAGEMENT_REQUEST.buttonType}
        >
          <LinkIcon />
          {INVITATION_MANAGEMENT_COPY.createButton}
        </Button>
      </div>
      {hasActiveInvitations ? (
        <ol
          aria-label="Invitaciones activas"
          className={styles.TribeInvitationManagement__list}
        >
          {formattedInvitations.map((invitation) => (
            <li
              className={styles.TribeInvitationManagement__item}
              key={invitation.id}
            >
              <div className={styles.TribeInvitationManagement__itemSummary}>
                <p className={styles.TribeInvitationManagement__itemTitle}>
                  {INVITATION_MANAGEMENT_COPY.itemTitle}
                </p>
                <span className={styles.TribeInvitationManagement__meta}>
                  {invitation.createdByName ??
                    INVITATION_MANAGEMENT_COPY.createdByFallback}{" "}
                  · {invitation.createdAtLabel}
                </span>
              </div>
              <div className={styles.TribeInvitationManagement__itemActions}>
                {invitation.invitationUrl ? (
                  <Button
                    disabled={pendingInvitationId === invitation.id}
                    onClick={() => {
                      void copyInvitationUrl(invitation.invitationUrl!);
                    }}
                    type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                    variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <ClipboardIcon />
                    {INVITATION_MANAGEMENT_COPY.copyButton}
                  </Button>
                ) : null}
                <Button
                  disabled={pendingInvitationId === invitation.id}
                  onClick={() => {
                    void handleRevokeInvitation(invitation.id);
                  }}
                  type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                  variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                >
                  <Trash2Icon />
                  {INVITATION_MANAGEMENT_COPY.revokeButton}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.TribeInvitationManagement__empty}>
          {INVITATION_MANAGEMENT_COPY.emptyState}
        </p>
      )}
    </section>
  );
}
