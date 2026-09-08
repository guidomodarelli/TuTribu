"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, WhatsappIcon } from "beez-ui";

import { ROUTES } from "@/src/constants/routes";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import type { TribeSupportSettings } from "@/src/modules/tribes/domain/repositories/tribe-support-repository";
import { TribeSupportConfigDialog } from "@/components/tribes/tribe-support-config-dialog";

import styles from "./styles.module.scss";

const SUPPORT_BUTTON_COPY = {
  configureLabel: "Configurar",
  loadingLabel: "Cargando soporte",
  openLinkLabel: "Abrir enlace",
  triggerLabelLeader: "Botón de soporte",
  triggerLabelMember: "Abrir WhatsApp de soporte",
} as const;

const SUPPORT_BUTTON_UI = {
  align: "end",
  buttonSize: "icon",
  buttonType: "button",
  buttonVariant: "ghost",
  nestedRouteSeparator: "/",
} as const;

const SUPPORT_BUTTON_REQUEST = {
  apiPrefix: "/api/tribes/",
  supportSegment: "/support",
} as const;

const SUPPORT_BUTTON_LINK = {
  baseUrl: "https://wa.me/",
  messageQueryName: "text",
  newTabRel: "noopener noreferrer",
  newTabTarget: "_blank",
  querySeparator: "?",
  valueSeparator: "=",
} as const;

const SUPPORT_BUTTON_ROLE = {
  leader: "leader",
} as const;

const SUPPORT_BUTTON_MEMBERSHIP_STATUS = {
  active: "active",
} as const;

const SUPPORT_PHONE_NON_DIGIT_PATTERN = /\D/g;

const SUPPORT_FETCH_TIMEOUT_MS = 15000;

type TribeSupportButtonProps = {
  memberTribes: MemberTribeListItemResult[];
};

type FetchResponseBody = {
  settings: TribeSupportSettings | null;
};

function isSameOrNestedPath(pathname: string, routePath: string): boolean {
  return (
    pathname === routePath ||
    pathname.startsWith(`${routePath}${SUPPORT_BUTTON_UI.nestedRouteSeparator}`)
  );
}

function findActiveTribe(
  pathname: string,
  memberTribes: MemberTribeListItemResult[]
): MemberTribeListItemResult | null {
  return (
    memberTribes.find((tribe) =>
      isSameOrNestedPath(pathname, ROUTES.tribes.bySlug(tribe.slug))
    ) ?? null
  );
}

function buildWhatsappUrl(settings: TribeSupportSettings): string {
  const normalizedPhoneNumber = settings.phoneNumber.replace(
    SUPPORT_PHONE_NON_DIGIT_PATTERN,
    ""
  );
  const messageQuery = settings.message
    ? SUPPORT_BUTTON_LINK.querySeparator +
      SUPPORT_BUTTON_LINK.messageQueryName +
      SUPPORT_BUTTON_LINK.valueSeparator +
      encodeURIComponent(settings.message)
    : "";

  return SUPPORT_BUTTON_LINK.baseUrl + normalizedPhoneNumber + messageQuery;
}

export function TribeSupportButton({ memberTribes }: TribeSupportButtonProps) {
  const pathname = usePathname() ?? "";
  const activeTribe = useMemo(
    () => findActiveTribe(pathname, memberTribes),
    [pathname, memberTribes]
  );
  const activeTribeSlug = activeTribe?.slug ?? null;
  const [settings, setSettings] = useState<TribeSupportSettings | null>(null);
  const [isFetched, setIsFetched] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    let isCurrent = true;

    async function loadSupportSettings() {
      if (!activeTribeSlug) {
        setSettings(null);
        setIsFetched(false);
        setIsDialogOpen(false);
        return;
      }

      setIsFetched(false);
      setSettings(null);

      try {
        const response = await fetch(
          SUPPORT_BUTTON_REQUEST.apiPrefix +
            encodeURIComponent(activeTribeSlug) +
            SUPPORT_BUTTON_REQUEST.supportSegment,
          {
            signal: AbortSignal.any([
              abortController.signal,
              AbortSignal.timeout(SUPPORT_FETCH_TIMEOUT_MS),
            ]),
          }
        );

        if (!isCurrent) {
          return;
        }

        if (!response.ok) {
          setSettings(null);
          setIsFetched(true);
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | FetchResponseBody
          | null;

        if (!isCurrent) {
          return;
        }

        setSettings(payload?.settings ?? null);
        setIsFetched(true);
      } catch {
        if (abortController.signal.aborted || !isCurrent) {
          return;
        }

        setSettings(null);
        setIsFetched(true);
      }
    }

    void loadSupportSettings();

    return () => {
      isCurrent = false;
      abortController.abort();
    };
  }, [activeTribeSlug]);

  const handleSavedSettings = useCallback(
    (savedSettings: TribeSupportSettings) => {
      setSettings(savedSettings);
      setIsFetched(true);
    },
    []
  );

  if (!activeTribe) {
    return null;
  }

  const canManageSupport =
    activeTribe.role === SUPPORT_BUTTON_ROLE.leader &&
    activeTribe.membershipStatus === SUPPORT_BUTTON_MEMBERSHIP_STATUS.active;

  if (!isFetched) {
    if (!canManageSupport) {
      return null;
    }

    return (
      <Button
        aria-busy
        aria-label={SUPPORT_BUTTON_COPY.loadingLabel}
        className={styles.TribeSupportButton}
        disabled
        size={SUPPORT_BUTTON_UI.buttonSize}
        type={SUPPORT_BUTTON_UI.buttonType}
        variant={SUPPORT_BUTTON_UI.buttonVariant}
      >
        <LoaderIcon
          aria-hidden
          className={`${styles.TribeSupportButton__icon} ${styles["TribeSupportButton__icon--spinning"]}`}
        />
      </Button>
    );
  }

  if (!canManageSupport) {
    if (!settings) {
      return null;
    }

    const linkHref = buildWhatsappUrl(settings);

    return (
      <Button
        aria-label={SUPPORT_BUTTON_COPY.triggerLabelMember}
        asChild
        className={styles.TribeSupportButton}
        size={SUPPORT_BUTTON_UI.buttonSize}
        type={SUPPORT_BUTTON_UI.buttonType}
        variant={SUPPORT_BUTTON_UI.buttonVariant}
      >
        <a
          href={linkHref}
          rel={SUPPORT_BUTTON_LINK.newTabRel}
          target={SUPPORT_BUTTON_LINK.newTabTarget}
        >
          <WhatsappIcon aria-hidden className={styles.TribeSupportButton__icon} />
        </a>
      </Button>
    );
  }

  if (!settings) {
    return (
      <>
        <Button
          aria-label={SUPPORT_BUTTON_COPY.triggerLabelLeader}
          className={styles.TribeSupportButton}
          onClick={() => setIsDialogOpen(true)}
          size={SUPPORT_BUTTON_UI.buttonSize}
          type={SUPPORT_BUTTON_UI.buttonType}
          variant={SUPPORT_BUTTON_UI.buttonVariant}
        >
          <WhatsappIcon aria-hidden className={styles.TribeSupportButton__icon} />
        </Button>
        <TribeSupportConfigDialog
          initialSettings={null}
          onOpenChange={setIsDialogOpen}
          onSaved={handleSavedSettings}
          open={isDialogOpen}
          tribeSlug={activeTribe.slug}
        />
      </>
    );
  }

  const linkHref = buildWhatsappUrl(settings);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={SUPPORT_BUTTON_COPY.triggerLabelLeader}
            className={styles.TribeSupportButton}
            size={SUPPORT_BUTTON_UI.buttonSize}
            type={SUPPORT_BUTTON_UI.buttonType}
            variant={SUPPORT_BUTTON_UI.buttonVariant}
          >
            <WhatsappIcon aria-hidden className={styles.TribeSupportButton__icon} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={SUPPORT_BUTTON_UI.align}>
          <DropdownMenuItem asChild>
            <a
              href={linkHref}
              rel={SUPPORT_BUTTON_LINK.newTabRel}
              target={SUPPORT_BUTTON_LINK.newTabTarget}
            >
              {SUPPORT_BUTTON_COPY.openLinkLabel}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsDialogOpen(true)}>
            {SUPPORT_BUTTON_COPY.configureLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TribeSupportConfigDialog
        initialSettings={settings}
        onOpenChange={setIsDialogOpen}
        onSaved={handleSavedSettings}
        open={isDialogOpen}
        tribeSlug={activeTribe.slug}
      />
    </>
  );
}
