"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { LoaderIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button, DropdownMenu, WhatsappIcon, buttonClassName, cn } from "@golfo/ui";

import { ROUTES } from "@/src/constants/routes";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import type { TribeSupportSettings } from "@/src/modules/tribes/domain/repositories/tribe-support-repository";
import { TribeSupportConfigDialog } from "@/components/tribes/tribe-support-config-dialog";


import styles from "./styles.module.scss";

const SUPPORT_BUTTON_COPY = {
  configureLabel: "Configurar",
  loadingLabel: "Cargando soporte",
  menuLabel: "Soporte",
  openLinkLabel: "Abrir enlace",
  triggerLabelLeader: "Botón de soporte",
  triggerLabelMember: "Abrir WhatsApp de soporte",
} as const;

const SUPPORT_BUTTON_UI = {
  align: "end",
  buttonSize: "sm",
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

/** The member WhatsApp link is an external `<a>`, so it takes the same look as the leader `Button`. */
const MEMBER_SUPPORT_LINK_CLASS_NAME = buttonClassName({
  className: styles.TribeSupportButton,
  size: SUPPORT_BUTTON_UI.buttonSize,
  variant: SUPPORT_BUTTON_UI.buttonVariant,
});

/** Icon shown once the support settings resolve; it pops in after the loader. */
const RESOLVED_ICON_CLASS_NAME = cn(
  styles.TribeSupportButton__icon,
  styles["TribeSupportButton__icon--resolved"]
);

type TribeSupportButtonProps = {
  memberTribes: MemberTribeListItemResult[];
};

type FetchResponseBody = {
  settings: TribeSupportSettings | null;
};

/**
 * Combines the effect abort signal with a request timeout. `AbortSignal.any`
 * only exists since Safari 17.4, so older WebKit gets an equivalent controller
 * aborted by a timer; without it the request would throw synchronously and
 * members would never see the support button.
 * @param effectSignal - Signal aborted when the effect is cleaned up.
 * @param timeoutMs - Maximum request duration.
 * @returns The combined signal and a cleanup that releases the fallback timer.
 */
function createTimeoutSignal(
  effectSignal: AbortSignal,
  timeoutMs: number
): { dispose: () => void; signal: AbortSignal } {
  if (
    typeof AbortSignal.any === "function" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return {
      dispose: () => {},
      signal: AbortSignal.any([effectSignal, AbortSignal.timeout(timeoutMs)]),
    };
  }

  const fallbackController = new AbortController();
  const abortFallback = () => {
    fallbackController.abort();
  };
  const timeoutId = window.setTimeout(abortFallback, timeoutMs);

  effectSignal.addEventListener("abort", abortFallback, { once: true });

  return {
    dispose: () => {
      window.clearTimeout(timeoutId);
      effectSignal.removeEventListener("abort", abortFallback);
    },
    signal: fallbackController.signal,
  };
}

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

/**
 * Loads the support settings of the active tribe and keeps them in sync with
 * the leader's saves. Switching tribes cancels the previous request.
 * @param activeTribeSlug - Slug of the tribe the viewer is on, or `null`.
 * @returns Loaded settings, whether the load finished, the dialog state and
 * the save handler.
 */
function useTribeSupportSettings(activeTribeSlug: string | null) {
  const [settings, setSettings] = useState<TribeSupportSettings | null>(null);
  const [isFetched, setIsFetched] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    const requestSignal = createTimeoutSignal(
      abortController.signal,
      SUPPORT_FETCH_TIMEOUT_MS
    );
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
          { signal: requestSignal.signal }
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
      requestSignal.dispose();
    };
  }, [activeTribeSlug]);

  const handleSavedSettings = useCallback(
    (savedSettings: TribeSupportSettings) => {
      setSettings(savedSettings);
      setIsFetched(true);
    },
    []
  );

  return {
    handleSavedSettings,
    isDialogOpen,
    isFetched,
    setIsDialogOpen,
    settings,
  };
}

/**
 * Leader menu entries: open the configured support link or edit it.
 * @param linkHref - WhatsApp link of the configured support.
 * @param onConfigure - Opens the configuration dialog.
 * @returns The dropdown menu items.
 */
function buildLeaderSupportMenuItems(
  linkHref: string,
  onConfigure: () => void
): ComponentProps<typeof DropdownMenu>["items"] {
  return [
    {
      href: linkHref,
      label: SUPPORT_BUTTON_COPY.openLinkLabel,
      rel: SUPPORT_BUTTON_LINK.newTabRel,
      target: SUPPORT_BUTTON_LINK.newTabTarget,
    },
    {
      label: SUPPORT_BUTTON_COPY.configureLabel,
      onSelect: onConfigure,
    },
  ];
}

/**
 * Only active leaders configure the support button.
 * @param tribe - Active tribe of the viewer.
 * @returns Whether the viewer manages the tribe support.
 */
function canManageTribeSupport(tribe: MemberTribeListItemResult): boolean {
  return (
    tribe.role === SUPPORT_BUTTON_ROLE.leader &&
    tribe.membershipStatus === SUPPORT_BUTTON_MEMBERSHIP_STATUS.active
  );
}

/** Disabled spinner shown to leaders while the support settings load. */
function TribeSupportLoadingButton() {
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
        className={cn(
          styles.TribeSupportButton__icon,
          styles["TribeSupportButton__icon--spinning"]
        )}
      />
    </Button>
  );
}

/**
 * WhatsApp link that members use to contact the tribe support.
 * @param props - Configured support settings.
 * @returns The support link, opened in a new tab.
 */
function TribeMemberSupportLink({ settings }: { settings: TribeSupportSettings }) {
  return (
    <a className={MEMBER_SUPPORT_LINK_CLASS_NAME} aria-label={SUPPORT_BUTTON_COPY.triggerLabelMember}
      href={buildWhatsappUrl(settings)}
      rel={SUPPORT_BUTTON_LINK.newTabRel}
      target={SUPPORT_BUTTON_LINK.newTabTarget}
    >
      <WhatsappIcon aria-hidden className={RESOLVED_ICON_CLASS_NAME} />
    </a>
  );
}

export function TribeSupportButton({ memberTribes }: TribeSupportButtonProps) {
  const pathname = usePathname();
  const activeTribe = useMemo(
    () => findActiveTribe(pathname, memberTribes),
    [pathname, memberTribes]
  );
  const activeTribeSlug = activeTribe?.slug ?? null;
  const { handleSavedSettings, isDialogOpen, isFetched, setIsDialogOpen, settings } =
    useTribeSupportSettings(activeTribeSlug);

  if (!activeTribe) {
    return null;
  }

  const canManageSupport = canManageTribeSupport(activeTribe);

  if (!isFetched) {
    if (!canManageSupport) {
      return null;
    }

    return <TribeSupportLoadingButton />;
  }

  if (!canManageSupport) {
    if (!settings) {
      return null;
    }

    return <TribeMemberSupportLink settings={settings} />;
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
          <WhatsappIcon aria-hidden className={RESOLVED_ICON_CLASS_NAME} />
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
      <DropdownMenu
        align={SUPPORT_BUTTON_UI.align}
        items={buildLeaderSupportMenuItems(linkHref, () =>
          setIsDialogOpen(true)
        )}
        label={SUPPORT_BUTTON_COPY.menuLabel}
        trigger={
          <Button
            aria-label={SUPPORT_BUTTON_COPY.triggerLabelLeader}
            className={styles.TribeSupportButton}
            size={SUPPORT_BUTTON_UI.buttonSize}
            type={SUPPORT_BUTTON_UI.buttonType}
            variant={SUPPORT_BUTTON_UI.buttonVariant}
          >
            <WhatsappIcon aria-hidden className={RESOLVED_ICON_CLASS_NAME} />
          </Button>
        }
      />
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
