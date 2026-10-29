/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the
 * Arc Pro license (https://uiarc.dev/license). Not covered by this project's
 * license; do not redistribute it on its own.
 *
 * Adapted from the Arc "Sidebar rail" block (App rail): the sample data became
 * TuTribu's tribe navigation, rows navigate through the router, the open state
 * persists in the `sidebar_state` cookie read by the platform layout, the
 * shell fills the viewport with window scrolling, and the copy is in Spanish.
 * Rows with subsections open as disclosure groups whose children carry the
 * active highlight; in the icon rail the group row navigates to its first page.
 */

"use client";

import { ChevronDownIcon, ChevronRightIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  AnimatePresence,
  LayoutGroup,
  m,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Transition,
  type Variants,
} from "motion/react";
import { Dialog, Tooltip as TooltipPrimitive } from "radix-ui";
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";

import { TribeSwitcher } from "@/components/platform/tribe-switcher";
import { siteConfig } from "@/lib/site-config";
import { ROUTES } from "@/src/constants/routes";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import { AnimatedCollapse, Avatar, SIDEBAR_COOKIE_COLLAPSED_VALUE, SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME, SIDEBAR_COOKIE_OPEN_VALUE } from "@golfo/ui";
import { APP_RAIL_INSTANT, APP_RAIL_MOTION } from "../app-rail-motion";
import {
  resolveAppRailNavigation,
  type AppRailEntry,
  type AppRailSection,
} from "../app-rail-navigation";
import styles from "./styles.module.scss";

/** Sidebar width when open, in pixels. */
const FULL_WIDTH_PX = 240;
/** Icon rail width, in pixels. */
const RAIL_WIDTH_PX = 64;
/** Below this shell width the sidebar leaves the layout and opens as a sheet. Matches the container query in the styles. */
const COMPACT_WIDTH_PX = 480;
/** Below this shell width the opened sidebar floats over the page from the rail instead of squeezing it. */
const FLOAT_WIDTH_PX = 640;
/** Below this shell width the sidebar starts as the icon rail, so the page keeps room to read. */
const ROOMY_WIDTH_PX = 760;
/** How long a picked row's highlight gets to land before a floating panel or sheet slides away. */
const SETTLE_MS = 200;
/** Heading height in the open sidebar and in the rail, where it only holds a divider, in pixels. */
const HEADING_HEIGHT_PX = 32;
const HEADING_RAIL_HEIGHT_PX = 17;
/** Sideways drift of labels while they fade out of the rail, in pixels. */
const LABEL_DRIFT_PX = -6;
/** Resting horizontal scale of a rail divider while the sidebar is open. */
const DIVIDER_REST_SCALE = 0.3;
/** Sheet width used before it is measured, in pixels. */
const SHEET_FALLBACK_WIDTH_PX = 288;
/** A drag past this distance or speed to the left closes the sheet. */
const SHEET_DISMISS_OFFSET_PX = -72;
const SHEET_DISMISS_VELOCITY = -480;
const SHEET_DRAG_ELASTIC = { left: 0.9, right: 0.04 } as const;
const SHEET_HIDDEN_X = "-100%";
const PERCENT_SUFFIX = "%";
const PERCENT_SCALE = 100;
/** How far the panel divider of the toggle glyph slides when the rail is folded. */
const PANEL_GLYPH_FOLDED_SHIFT = -2.5;
const TOOLTIP_DELAY_MS = 250;
const TOOLTIP_SKIP_DELAY_MS = 300;
const RAIL_TIP_SIDE_OFFSET_PX = 14;
const RAIL_TIP_COLLISION_PADDING_PX = 8;
const ROW_HIGHLIGHT_RADIUS_PX = 8;
/** Rotation of a group chevron while its subsections are open, in degrees. */
const CHEVRON_OPEN_DEGREES = 90;
const TRIBE_LOGO_SIZE_PX = 28;
const BRAND_MARK_LENGTH = 2;
/** Fading labels leave quickly and return a beat after the width starts opening, in seconds. */
const LABEL_EXIT_SECONDS = 0.14;
const LABEL_ENTER_SECONDS = 0.24;
const LABEL_ENTER_DELAY_SECONDS = 0.1;
/** Rail-only marks arrive once the labels have cleared, and leave first when the rail opens. */
const MARK_ENTER_SECONDS = 0.2;
const MARK_ENTER_DELAY_SECONDS = 0.16;
const MARK_EXIT_SECONDS = 0.12;

/** Key that folds and unfolds the rail, or opens the sheet on narrow screens. */
const RAIL_SHORTCUT_KEY = "[";
const ESCAPE_KEY = "Escape";
const ALT_GRAPH_MODIFIER = "AltGraph";
const TEXT_ENTRY_TAG_NAMES = new Set(["INPUT", "SELECT", "TEXTAREA"]);
/** Menus and dialogs own their keyboard, so the shortcut stays out of their way. */
const SHORTCUT_EXCLUDED_CONTAINER_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
const CURRENT_ROW_SELECTOR = "[aria-current='page']";
const INERT_SELECTOR = "[inert]";
const DRAGGING_ATTRIBUTE = "data-dragging";
const COOKIE_PATH = "/";

const APP_RAIL_UI = {
  breadcrumbLabel: "Ruta de navegación",
  closeNavigationLabel: "Cerrar navegación",
  collapseLabel: "Contraer barra lateral",
  collapsedAnnouncement: "Barra lateral contraída",
  expandLabel: "Expandir barra lateral",
  expandedAnnouncement: "Barra lateral expandida",
  navigationLabel: "Navegación principal",
  openNavigationLabel: "Abrir navegación",
  noTribesMessage: "Todavía no formas parte de ninguna tribu",
  profileSubtitle: "Tu cuenta",
  sheetTitle: "Navegación",
  shellLabel: "TuTribu",
  tribesSubtitle: "Tus tribus",
} as const;

const TRIBE_ROLE_LABELS: Record<MemberTribeListItemResult["role"], string> = {
  guardian: "Guardián",
  leader: "Líder",
  tribemate: "Integrante",
};

const CURRENT_PAGE = "page";
const BUTTON_TYPE = "button";
const DIALOG_POPUP = "dialog";
const TIP_SIDE_RIGHT = "right";
const TIP_SIDE_BOTTOM = "bottom";
const DRAG_AXIS = "x";
const POP_LAYOUT = "popLayout";

type NavigationVariant = "side" | "sheet";

type AppRailShellProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  children: ReactNode;
  /** Open state restored from the `sidebar_state` cookie; undefined lets the width decide. */
  defaultOpen?: boolean;
  /** Controls at the end of the top bar, such as notifications and the account menu. */
  headerActions?: ReactNode;
  /** Content right after the breadcrumb, such as the private tribe badge. */
  headerAside?: ReactNode;
  memberTribes: MemberTribeListItemResult[];
};

function labelTiming(collapsed: boolean, reduce: boolean) {
  if (reduce) return APP_RAIL_INSTANT;
  return collapsed
    ? { duration: LABEL_EXIT_SECONDS, ease: APP_RAIL_MOTION.ease.standard }
    : { delay: LABEL_ENTER_DELAY_SECONDS, duration: LABEL_ENTER_SECONDS, ease: APP_RAIL_MOTION.ease.enter };
}

function markTiming(collapsed: boolean, reduce: boolean) {
  if (reduce) return APP_RAIL_INSTANT;
  return collapsed
    ? { delay: MARK_ENTER_DELAY_SECONDS, duration: MARK_ENTER_SECONDS, ease: APP_RAIL_MOTION.ease.enter }
    : { duration: MARK_EXIT_SECONDS, ease: APP_RAIL_MOTION.ease.standard };
}

const rise: Variants = {
  gone: { filter: `blur(${APP_RAIL_MOTION.blur.subtlePx}px)`, opacity: 0, y: LABEL_DRIFT_PX },
  hidden: { filter: `blur(${APP_RAIL_MOTION.blur.softPx}px)`, opacity: 0, y: -LABEL_DRIFT_PX },
  shown: { filter: "blur(0px)", opacity: 1, y: 0 },
};

/**
 * Whether a keyboard event should toggle the rail: the `[` key, outside
 * text entry, menus and dialogs, and not already handled by someone else.
 */
function isRailShortcut(event: KeyboardEvent): boolean {
  if (
    event.key !== RAIL_SHORTCUT_KEY ||
    event.metaKey ||
    event.defaultPrevented
  ) {
    return false;
  }

  // Keyless events are discarded before using KeyboardEvent-only modifier APIs.
  // Layouts that type `[` with AltGr (reported as Ctrl+Alt) or Option still produce the key itself.
  const typedWithAltGraph = event.getModifierState(ALT_GRAPH_MODIFIER) || (event.ctrlKey && event.altKey);
  if (event.ctrlKey && !typedWithAltGraph) return false;

  const target = event.target instanceof HTMLElement ? event.target : null;

  return !(
    target &&
    (target.isContentEditable ||
      TEXT_ENTRY_TAG_NAMES.has(target.tagName) ||
      target.closest(SHORTCUT_EXCLUDED_CONTAINER_SELECTOR))
  );
}

/** Keeps the open state for the next server render of the platform layout. */
function persistOpenState(open: boolean) {
  const value = open ? SIDEBAR_COOKIE_OPEN_VALUE : SIDEBAR_COOKIE_COLLAPSED_VALUE;

  document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=${COOKIE_PATH}; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}

function getBrandMark(name: string): string {
  return name.trim().slice(0, BRAND_MARK_LENGTH).toUpperCase();
}

function RailTip({ enabled, label, note, children }: { enabled: boolean; label: string; note?: string; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  // Closing the rail while a tip is open should not leave it armed for the next collapse.
  if (!enabled && open) setOpen(false);

  return (
    <TooltipPrimitive.Root open={enabled && open} onOpenChange={(next) => setOpen(next && enabled)}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className={styles.AppRailShell__tip}
          collisionPadding={RAIL_TIP_COLLISION_PADDING_PX}
          side={TIP_SIDE_RIGHT}
          sideOffset={RAIL_TIP_SIDE_OFFSET_PX}
        >
          {label}
          {note ? <span className={styles.AppRailShell__tipNote}>{note}</span> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

type NavRowProps = {
  collapsed: boolean;
  entry: AppRailEntry;
  layoutId: string;
  onSelect: () => void;
  reduce: boolean;
  tips: boolean;
};

function NavRow({ collapsed, entry, layoutId, onSelect, reduce, tips }: NavRowProps) {
  const Icon = entry.icon;
  const fade = labelTiming(collapsed, reduce);

  return (
    <RailTip enabled={tips} label={entry.label} note={entry.badge}>
      <button
        type={BUTTON_TYPE}
        className={`${styles.AppRailShell__item} ${entry.isActive ? styles["AppRailShell__item--lit"] : ""}`}
        aria-current={entry.isActive ? CURRENT_PAGE : undefined}
        aria-label={collapsed ? entry.label : undefined}
        onClick={onSelect}
      >
        {entry.isActive ? <RowHighlight layoutId={layoutId} reduce={reduce} /> : null}
        <Icon className={styles.AppRailShell__icon} aria-hidden="true" />
        <m.span
          className={styles.AppRailShell__label}
          aria-hidden={collapsed}
          initial={false}
          animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? LABEL_DRIFT_PX : 0 }}
          transition={fade}
        >
          {entry.label}
        </m.span>
        {entry.badge ? (
          <m.span
            className={styles.AppRailShell__badge}
            aria-hidden={collapsed}
            initial={false}
            animate={{ opacity: collapsed ? 0 : 1 }}
            transition={fade}
          >
            {entry.badge}
          </m.span>
        ) : null}
      </button>
    </RailTip>
  );
}

/** The shared highlight that springs between the active rows of one navigation. */
function RowHighlight({ layoutId, reduce }: { layoutId: string; reduce: boolean }) {
  return (
    <m.span
      layoutId={layoutId}
      className={styles.AppRailShell__highlight}
      style={{ borderRadius: ROW_HIGHLIGHT_RADIUS_PX }}
      transition={reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.morph}
    />
  );
}

type NavGroupChildrenProps = {
  entries: AppRailEntry[];
  label: string;
  layoutId: string;
  onSelectHref: (href: string) => void;
  panelId: string;
  reduce: boolean;
  /** Whether the group is open in the wide sidebar; a hidden list is inert and never holds the highlight. */
  shown: boolean;
};

/** The subsection rows of a group; the open page keeps the highlight only while the list is shown. */
function NavGroupChildren({ entries, label, layoutId, onSelectHref, panelId, reduce, shown }: NavGroupChildrenProps) {
  return (
    <ul id={panelId} className={styles.AppRailShell__children} aria-label={label} inert={!shown}>
      {entries.map((child) => (
        <li key={child.id}>
          <button
            type={BUTTON_TYPE}
            className={`${styles.AppRailShell__item} ${styles["AppRailShell__item--nested"]} ${shown && child.isActive ? styles["AppRailShell__item--lit"] : ""}`}
            aria-current={child.isActive ? CURRENT_PAGE : undefined}
            onClick={() => onSelectHref(child.href)}
          >
            {shown && child.isActive ? <RowHighlight layoutId={layoutId} reduce={reduce} /> : null}
            <span className={styles.AppRailShell__label}>{child.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type NavGroupProps = NavRowProps & { onExpand?: () => void; onSelectHref: (href: string) => void; panelId: string };

/**
 * A row with subsections, as in the block's Projects group: it toggles its
 * children with a turning chevron, keeps the highlight while its open page is
 * hidden, and in the icon rail widens the sidebar to reveal the group. The
 * group opens by itself when navigation lands on one of its pages.
 */
function NavGroup({ collapsed, entry, layoutId, onExpand, onSelectHref, panelId, reduce, tips }: NavGroupProps) {
  const Icon = entry.icon;
  const fade = labelTiming(collapsed, reduce);
  const children = entry.children ?? [];
  const holdsActive = children.some((child) => child.isActive);
  const [open, setOpen] = useState(holdsActive);
  const [followedActive, setFollowedActive] = useState(holdsActive);
  if (holdsActive !== followedActive) {
    setFollowedActive(holdsActive);
    if (holdsActive) setOpen(true);
  }
  const shown = open && !collapsed;
  const lit = holdsActive && !shown;

  function toggle() {
    // In the rail a group has nowhere to open, so the sidebar widens to reveal it.
    if (collapsed && onExpand) {
      onExpand();
      setOpen(true);
      return;
    }
    setOpen((current) => !current);
  }

  return (
    <>
      <RailTip enabled={tips} label={entry.label}>
        <button
          type={BUTTON_TYPE}
          className={`${styles.AppRailShell__item} ${lit ? styles["AppRailShell__item--lit"] : ""}`}
          aria-expanded={shown}
          aria-controls={panelId}
          aria-label={collapsed ? entry.label : undefined}
          onClick={toggle}
        >
          {lit ? <RowHighlight layoutId={layoutId} reduce={reduce} /> : null}
          <Icon className={styles.AppRailShell__icon} aria-hidden="true" />
          <m.span
            className={styles.AppRailShell__label}
            aria-hidden={collapsed}
            initial={false}
            animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? LABEL_DRIFT_PX : 0 }}
            transition={fade}
          >
            {entry.label}
          </m.span>
          <m.span
            className={styles.AppRailShell__chevron}
            aria-hidden="true"
            initial={false}
            animate={{ opacity: collapsed ? 0 : 1, rotate: open ? CHEVRON_OPEN_DEGREES : 0 }}
            transition={{ opacity: fade, rotate: reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.snappy }}
          >
            <ChevronRightIcon aria-hidden="true" />
          </m.span>
        </button>
      </RailTip>
      <AnimatedCollapse isOpen={shown}>
        <NavGroupChildren entries={children} label={entry.label} layoutId={layoutId} onSelectHref={onSelectHref} panelId={panelId} reduce={reduce} shown={shown} />
      </AnimatedCollapse>
    </>
  );
}

type NavigationProps = {
  baseId: string;
  collapsed: boolean;
  /** Note under the sections, such as the empty state of the tribes list; hidden in the rail. */
  footnote?: string;
  /** Widens the icon rail; only the side variant folds into a rail. */
  onExpand?: () => void;
  onSelect: (href: string) => void;
  reduce: boolean;
  sections: AppRailSection[];
  variant: NavigationVariant;
};

function Navigation({ baseId, collapsed, footnote, onExpand, onSelect, reduce, sections, variant }: NavigationProps) {
  const tips = variant === "side" && collapsed;
  const layoutId = `${variant}-active`;
  const fade = labelTiming(collapsed, reduce);
  const mark = markTiming(collapsed, reduce);
  const height = reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.smooth;

  return (
    <m.nav className={styles.AppRailShell__nav} aria-label={APP_RAIL_UI.navigationLabel} layoutScroll>
      {sections.map((section) => {
        const headingId = `${baseId}-${variant}-${section.id}`;

        return (
          <div
            key={section.id}
            className={styles.AppRailShell__section}
            role={section.heading ? "group" : undefined}
            aria-labelledby={section.heading ? headingId : undefined}
          >
            {section.heading ? (
              <m.div
                className={styles.AppRailShell__heading}
                initial={false}
                animate={{ height: collapsed ? HEADING_RAIL_HEIGHT_PX : HEADING_HEIGHT_PX }}
                transition={height}
              >
                <m.span
                  id={headingId}
                  className={styles.AppRailShell__headingText}
                  initial={false}
                  animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? LABEL_DRIFT_PX : 0 }}
                  transition={fade}
                >
                  {section.heading}
                </m.span>
                <m.span
                  className={styles.AppRailShell__divider}
                  aria-hidden="true"
                  data-visible={collapsed}
                  initial={false}
                  animate={{ opacity: collapsed ? 1 : 0, scaleX: collapsed ? 1 : DIVIDER_REST_SCALE }}
                  transition={mark}
                />
              </m.div>
            ) : null}
            <ul className={styles.AppRailShell__list}>
              {section.entries.map((entry) => (
                <li key={entry.id}>
                  {entry.children?.length ? (
                    <NavGroup
                      collapsed={collapsed}
                      entry={entry}
                      layoutId={layoutId}
                      onExpand={onExpand}
                      onSelect={() => onSelect(entry.href)}
                      onSelectHref={onSelect}
                      panelId={`${baseId}-${variant}-${entry.id}-list`}
                      reduce={reduce}
                      tips={tips}
                    />
                  ) : (
                    <NavRow
                      collapsed={collapsed}
                      entry={entry}
                      layoutId={layoutId}
                      onSelect={() => onSelect(entry.href)}
                      reduce={reduce}
                      tips={tips}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {footnote && !collapsed ? <p className={styles.AppRailShell__footnote}>{footnote}</p> : null}
    </m.nav>
  );
}

type BrandProps = {
  collapsed: boolean;
  memberTribes: MemberTribeListItemResult[];
  onNavigate: (href: string) => void;
  onTribeSwitch: () => void;
  reduce: boolean;
  tribe?: MemberTribeListItemResult;
};

type RailLabelStackProps = {
  collapsed: boolean;
  detail: string;
  reduce: boolean;
  title: string;
};

/** Title and detail beside a rail icon; they fade and drift out while the rail collapses. */
function RailLabelStack({ collapsed, detail, reduce, title }: RailLabelStackProps) {
  return (
    <m.span
      className={styles.AppRailShell__stack}
      initial={false}
      animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? LABEL_DRIFT_PX : 0 }}
      transition={labelTiming(collapsed, reduce)}
    >
      <strong className={styles.AppRailShell__stackTitle}>{title}</strong>
      <span className={styles.AppRailShell__stackDetail}>{detail}</span>
    </m.span>
  );
}

/** Workspace row: the tribe switcher trigger inside a tribe, the home link elsewhere. */
function Brand({ collapsed, memberTribes, onNavigate, onTribeSwitch, reduce, tribe }: BrandProps) {
  const name = tribe?.name ?? siteConfig.name;
  const subtitle = tribe ? TRIBE_ROLE_LABELS[tribe.role] : APP_RAIL_UI.tribesSubtitle;
  const identity = (
    <>
      {tribe?.logoUrl ? (
        <Image
          alt=""
          className={styles.AppRailShell__logo}
          height={TRIBE_LOGO_SIZE_PX}
          src={tribe.logoUrl}
          unoptimized
          width={TRIBE_LOGO_SIZE_PX}
        />
      ) : (
        <span className={styles.AppRailShell__mark} aria-hidden="true">
          {tribe ? getBrandMark(tribe.name) : siteConfig.brandMark}
        </span>
      )}
      <RailLabelStack collapsed={collapsed} detail={subtitle} reduce={reduce} title={name} />
    </>
  );

  if (!tribe) {
    return (
      <button
        type={BUTTON_TYPE}
        className={styles.AppRailShell__brand}
        aria-label={name}
        onClick={() => onNavigate(ROUTES.home)}
      >
        {identity}
      </button>
    );
  }

  return (
    <TribeSwitcher
      className={styles.AppRailShell__switcher}
      dropdownTrigger={
        <button type={BUTTON_TYPE} className={styles.AppRailShell__brand}>
          {identity}
          <ChevronDownIcon aria-hidden="true" className={styles.AppRailShell__brandChevron} />
        </button>
      }
      memberTribes={memberTribes}
      onNavigate={onTribeSwitch}
      showPrivateBadge={false}
    />
  );
}

function Profile({ collapsed, member, reduce }: { collapsed: boolean; member: AuthenticatedMemberResult; reduce: boolean }) {
  return (
    <div className={styles.AppRailShell__profile}>
      {/* Decorative: the name is shown next to it. */}
      <Avatar aria-hidden fallback={member.avatarFallback} name={member.name} size="sm" src={member.image} />
      <RailLabelStack collapsed={collapsed} detail={APP_RAIL_UI.profileSubtitle} reduce={reduce} title={member.name} />
    </div>
  );
}

/** The divider in the panel icon slides with the sidebar, so the control shows what it is about to do. */
function PanelGlyph({ collapsed, reduce }: { collapsed: boolean; reduce: boolean }) {
  return (
    <svg
      className={styles.AppRailShell__glyph}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="3.5" />
      <m.path
        d="M8.25 4.25v11.5"
        initial={false}
        animate={{ x: collapsed ? PANEL_GLYPH_FOLDED_SHIFT : 0 }}
        transition={reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.smooth}
      />
    </svg>
  );
}

/** @param value - Sheet offset, in pixels or as a percentage of its width. @param width - Measured sheet width. @returns The offset as a fraction of the sheet width; NaN when it cannot be read. */
function sheetShift(value: number | string, width: number): number {
  if (typeof value === "number") return value / width;
  return value.endsWith(PERCENT_SUFFIX) ? Number.parseFloat(value) / PERCENT_SCALE : Number.parseFloat(value) / width;
}

/**
 * The [ shortcut toggles the rail, or the sheet when the shell is narrow. It stays out of text fields, menus and dialogs.
 * It subscribes again after every render, so the handler always sees the current rail state.
 */
function useRailShortcut(frame: HTMLElement | null, toggleRail: () => void, toggleSheet: () => void) {
  useEffect(() => {
    if (!frame) return;

    function onKey(event: KeyboardEvent) {
      if (!isRailShortcut(event) || !frame) return;
      event.preventDefault();
      if (frame.clientWidth < COMPACT_WIDTH_PX) {
        toggleSheet();
        return;
      }
      toggleRail();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

/**
 * Folds the overlaid rail when Escape leaves the shell unhandled. The listener sits on `window`, above the root where
 * React dispatches its handlers, so a control inside the shell that handles Escape first (a menu, a dialog) marks the
 * event as handled and keeps the rail open.
 * @param frame - Shell element; keys pressed outside it do not fold the rail.
 * @param overlaid - Whether the rail floats over the content.
 * @param fold - Folds the rail.
 */
function useOverlaidRailEscape(frame: HTMLElement | null, overlaid: boolean, fold: () => void) {
  const onFold = useEffectEvent(fold);

  useEffect(() => {
    if (!frame || !overlaid) return;

    function onKey(event: KeyboardEvent) {
      if (event.key !== ESCAPE_KEY || event.defaultPrevented || !(event.target instanceof Node) || !frame?.contains(event.target)) return;
      event.preventDefault();
      onFold();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frame, overlaid]);
}

type ResponsiveRailSetters = {
  setCollapsed: (collapsed: boolean) => void;
  setFloating: (floating: boolean) => void;
  setSettling: (settling: boolean) => void;
  setSheetOpen: (open: boolean) => void;
};

/** A mid-width shell starts on the rail; crossing the threshold later folds or opens it once, and a sheet has no place in the wide layout. */
function useResponsiveRail(frame: HTMLElement | null, { setCollapsed, setFloating, setSettling, setSheetOpen }: ResponsiveRailSetters) {
  const roomy = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    if (!frame) return;

    const fit = () => {
      const width = frame.clientWidth;
      if (width >= COMPACT_WIDTH_PX) setSheetOpen(false);
      const floats = width >= COMPACT_WIDTH_PX && width < FLOAT_WIDTH_PX;
      setFloating(floats);
      const nextRoomy = width >= ROOMY_WIDTH_PX;
      if (roomy.current === null) {
        // The first fit keeps the saved preference on a roomy shell and only folds a narrow one.
        roomy.current = nextRoomy;
        if (!nextRoomy) setCollapsed(true);
      } else if (roomy.current !== nextRoomy) {
        roomy.current = nextRoomy;
        setCollapsed(!nextRoomy);
      } else if (floats) {
        // A panel left open while the shell narrows would cover the page, so it folds back to the rail.
        setCollapsed(true);
      }
    };

    fit();
    const settle = requestAnimationFrame(() => setSettling(false));
    const observer = new ResizeObserver(fit);
    observer.observe(frame);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(settle);
    };
  }, [frame, setCollapsed, setFloating, setSettling, setSheetOpen]);
}

/**
 * Open state of the rail, the floating panel and the sheet, with the navigation that closes them once a row is picked.
 * @param options - Saved open state, the reduced-motion preference and the router push.
 * @returns The shell state, its refs and handlers.
 */
function useAppRailShellState({ defaultOpen, prefersReduced, push }: { defaultOpen?: boolean; prefersReduced: boolean; push: (href: string) => void }) {
  // The first measurement settles the layout before paint, so it never animates.
  const [settling, setSettling] = useState(true);
  const reduce = prefersReduced || settling;
  const [collapsed, setCollapsed] = useState(defaultOpen === false);
  const [floating, setFloating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const draggingRef = useRef(false);
  const closeTimerRef = useRef(0);

  function setRail(nextCollapsed: boolean) {
    setCollapsed(nextCollapsed);
    setStatus(nextCollapsed ? APP_RAIL_UI.collapsedAnnouncement : APP_RAIL_UI.expandedAnnouncement);
    persistOpenState(!nextCollapsed);
  }

  function toggleRail() {
    setRail(!collapsed);
  }

  useRailShortcut(frame, toggleRail, () => setSheetOpen((open) => !open));
  useResponsiveRail(frame, { setCollapsed, setFloating, setSettling, setSheetOpen });
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const overlaid = floating && !collapsed;

  function select(href: string, fromSheet = false) {
    if (fromSheet && draggingRef.current) return;
    push(href);
    if (!fromSheet && !overlaid) return;
    // Let the highlight arrive before the sheet or the floating panel slides away.
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(
      () => (fromSheet ? setSheetOpen(false) : setRail(true)),
      reduce ? 0 : SETTLE_MS
    );
  }

  useOverlaidRailEscape(frame, overlaid, () => setRail(true));

  return { collapsed, draggingRef, floating, menuButtonRef, overlaid, reduce, select, setFrame, setRail, setSheetOpen, sheetOpen, sheetRef, status, toggleRail };
}

type RailContentProps = {
  authenticatedMember: AuthenticatedMemberResult | null;
  baseId: string;
  footnote?: string;
  memberTribes: MemberTribeListItemResult[];
  navigation: ReturnType<typeof resolveAppRailNavigation>;
};

type RailSidebarProps = RailContentProps & {
  view: { collapsed: boolean; floating: boolean; overlaid: boolean; reduce: boolean };
  onExpand: () => void;
  onSelect: (href: string) => void;
  sidebarId: string;
};

/** The slot holds the sidebar's place in the row. On a floating shell it keeps the rail's width and the panel opens over the page. */
function RailSidebar({ authenticatedMember, baseId, footnote, memberTribes, navigation, onExpand, onSelect, sidebarId, view }: RailSidebarProps) {
  const { collapsed, reduce } = view;

  return (
    <m.div
      className={styles.AppRailShell__slot}
      initial={false}
      animate={{ width: view.floating || collapsed ? RAIL_WIDTH_PX : FULL_WIDTH_PX }}
      transition={reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.smooth}
    >
      <m.div
        id={sidebarId}
        className={styles.AppRailShell__sidebar}
        initial={false}
        animate={{ width: collapsed ? RAIL_WIDTH_PX : FULL_WIDTH_PX }}
        transition={reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.smooth}
        data-collapsed={collapsed || undefined}
        data-floating={view.overlaid || undefined}
      >
        <div className={styles.AppRailShell__brandRow}>
          <Brand
            collapsed={collapsed}
            memberTribes={memberTribes}
            onNavigate={onSelect}
            onTribeSwitch={() => undefined}
            reduce={reduce}
            tribe={navigation.activeTribe}
          />
        </div>
        <Navigation
          variant="side"
          baseId={baseId}
          collapsed={collapsed}
          sections={navigation.sections}
          footnote={footnote}
          reduce={reduce}
          onExpand={onExpand}
          onSelect={onSelect}
        />
        {authenticatedMember ? <Profile collapsed={collapsed} member={authenticatedMember} reduce={reduce} /> : null}
      </m.div>
    </m.div>
  );
}

/** Dims the page under a floating panel; a click folds the panel back to the rail. */
function FloatScrim({ onClose, overlaid, reduce }: { onClose: () => void; overlaid: boolean; reduce: boolean }) {
  return (
    <AnimatePresence>
      {overlaid ? (
        <m.div
          key="float-scrim"
          className={`${styles.AppRailShell__scrim} ${styles["AppRailShell__scrim--float"]}`}
          aria-hidden="true"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? APP_RAIL_INSTANT : { duration: APP_RAIL_MOTION.durationStandard, ease: APP_RAIL_MOTION.ease.standard }}
        />
      ) : null}
    </AnimatePresence>
  );
}

/** The rail toggle of the top bar, with its shortcut in the tooltip. */
function RailToggle({ collapsed, onToggle, reduce, sidebarId }: { collapsed: boolean; onToggle: () => void; reduce: boolean; sidebarId: string }) {
  const toggleLabel = collapsed ? APP_RAIL_UI.expandLabel : APP_RAIL_UI.collapseLabel;

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <button
          type={BUTTON_TYPE}
          className={`${styles.AppRailShell__iconButton} ${styles.AppRailShell__railToggle}`}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          aria-controls={sidebarId}
          aria-keyshortcuts={RAIL_SHORTCUT_KEY}
          onClick={onToggle}
        >
          <PanelGlyph collapsed={collapsed} reduce={reduce} />
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className={styles.AppRailShell__tip} side={TIP_SIDE_BOTTOM} sideOffset={RAIL_TIP_COLLISION_PADDING_PX}>
          <span className={styles.AppRailShell__shortcut}>
            {toggleLabel}
            <kbd className={styles.AppRailShell__key}>{RAIL_SHORTCUT_KEY}</kbd>
          </span>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/**
 * Every parent label is measured up front, so a crumb that swaps one parent for another can spring between real widths.
 * @param sizersRef - Hidden container holding one sizer per parent label.
 * @returns The measured width of each label.
 */
function useMeasuredLabelWidths(sizersRef: RefObject<HTMLSpanElement | null>) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const node = sizersRef.current;
    if (!node) return;

    const measure = () =>
      setWidths(
        Object.fromEntries(
          Array.from(node.children, (child) => [
            (child as HTMLElement).dataset.label ?? "",
            (child as HTMLElement).offsetWidth,
          ])
        )
      );

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sizersRef]);
  return widths;
}

type BreadcrumbsProps = {
  crumbCurrent?: string;
  crumbParent?: string;
  crumbRoot: string;
  parentLabels: string[];
  reduce: boolean;
};

/** The open section's crumb: it rises in and out with the trail, and swaps its label in place while it stays. */
function CurrentCrumb({ label, swap }: { label: string; swap: Transition }) {
  // While leaving, the root crumb is already the current page, so this one stops announcing itself.
  const isPresent = useIsPresent();

  return (
    <m.li
      className={`${styles.AppRailShell__crumb} ${styles["AppRailShell__crumb--current"]}`}
      aria-current={isPresent ? CURRENT_PAGE : undefined}
      variants={rise}
      initial="hidden"
      animate="shown"
      exit="gone"
      transition={swap}
    >
      <AnimatePresence mode={POP_LAYOUT} initial={false}>
        <m.span
          key={label}
          className={styles.AppRailShell__crumbText}
          variants={rise}
          initial="hidden"
          animate="shown"
          exit="gone"
          transition={swap}
        >
          {label}
        </m.span>
      </AnimatePresence>
    </m.li>
  );
}

/** Animated breadcrumb: the parent and current labels swap in place, and the parent's width springs between measured labels. */
function Breadcrumbs({ crumbCurrent, crumbParent, crumbRoot, parentLabels, reduce }: BreadcrumbsProps) {
  const sizersRef = useRef<HTMLSpanElement>(null);
  const parentWidths = useMeasuredLabelWidths(sizersRef);
  const swap = reduce
    ? APP_RAIL_INSTANT
    : { duration: APP_RAIL_MOTION.durationStandard, ease: APP_RAIL_MOTION.ease.enter };

  return (
    <nav className={styles.AppRailShell__crumbs} aria-label={APP_RAIL_UI.breadcrumbLabel}>
      <ol className={styles.AppRailShell__crumbList}>
        <li
          className={`${styles.AppRailShell__crumb} ${crumbCurrent ? styles["AppRailShell__crumb--root"] : styles["AppRailShell__crumb--current"]}`}
          aria-current={crumbCurrent ? undefined : CURRENT_PAGE}
        >
          {crumbRoot}
        </li>
        <AnimatePresence initial={false}>
          {crumbParent && crumbCurrent ? (
            <m.li
              key="parent"
              className={`${styles.AppRailShell__crumb} ${styles["AppRailShell__crumb--parent"]}`}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.morph}
            >
              {/* The parent can change while the crumb stays, so its width follows the new label instead of snapping. */}
              <m.span
                className={styles.AppRailShell__crumbSwap}
                initial={false}
                animate={{ width: parentWidths[crumbParent] ?? "auto" }}
                transition={reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.morph}
              >
                <AnimatePresence mode={POP_LAYOUT} initial={false}>
                  <m.span key={crumbParent} variants={rise} initial="hidden" animate="shown" exit="gone" transition={swap}>
                    {crumbParent}
                  </m.span>
                </AnimatePresence>
              </m.span>
            </m.li>
          ) : null}
        </AnimatePresence>
        {/* Mounted outside the condition so the current crumb plays its exit when the route drops it. */}
        <AnimatePresence initial={false}>
          {crumbCurrent ? <CurrentCrumb key="current" label={crumbCurrent} swap={swap} /> : null}
        </AnimatePresence>
      </ol>
      <span ref={sizersRef} className={styles.AppRailShell__crumbSizers} aria-hidden="true">
        {parentLabels.map((label) => (
          <span key={label} className={styles.AppRailShell__crumbSizer} data-label={label}>
            {label}
          </span>
        ))}
      </span>
    </nav>
  );
}

/** The sheet's own content: its title, workspace row, close button, navigation and profile. */
function SheetBody({ authenticatedMember, baseId, footnote, memberTribes, navigation, onClose, onSelect, reduce }: RailContentProps & { onClose: () => void; onSelect: (href: string) => void; reduce: boolean }) {
  return (
    <>
      <Dialog.Title className={styles.AppRailShell__srOnly}>{APP_RAIL_UI.sheetTitle}</Dialog.Title>
      <div className={styles.AppRailShell__sheetHead}>
        <Brand
          collapsed={false}
          memberTribes={memberTribes}
          onNavigate={onSelect}
          onTribeSwitch={onClose}
          reduce={reduce}
          tribe={navigation.activeTribe}
        />
        <Dialog.Close asChild>
          <button type={BUTTON_TYPE} className={styles.AppRailShell__iconButton} aria-label={APP_RAIL_UI.closeNavigationLabel}>
            <XIcon className={styles.AppRailShell__closeIcon} aria-hidden="true" />
          </button>
        </Dialog.Close>
      </div>
      <Navigation
        variant="sheet"
        baseId={baseId}
        collapsed={false}
        sections={navigation.sections}
        footnote={footnote}
        reduce={reduce}
        onSelect={onSelect}
      />
      {authenticatedMember ? <Profile collapsed={false} member={authenticatedMember} reduce={reduce} /> : null}
    </>
  );
}

type NavigationSheetProps = RailContentProps & {
  draggingRef: RefObject<boolean>;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onSelect: (href: string) => void;
  open: boolean;
  prefersReduced: boolean;
  reduce: boolean;
  sheetRef: RefObject<HTMLDivElement | null>;
};

/** Narrow-screen navigation: a draggable sheet whose scrim follows the drag. */
function NavigationSheet({ draggingRef, menuButtonRef, onOpenChange, onSelect, open, prefersReduced, reduce, sheetRef, ...content }: NavigationSheetProps) {
  // The scrim follows the sheet, so a drag to dismiss lightens the page under the finger instead of waiting for release.
  const sheetX = useMotionValue<number | string>(SHEET_HIDDEN_X);
  const scrimOpacity = useTransform(sheetX, (value) => {
    const width = sheetRef.current?.offsetWidth || SHEET_FALLBACK_WIDTH_PX;
    const shift = sheetShift(value, width);
    return Math.min(1, Math.max(0, 1 + (Number.isFinite(shift) ? shift : -1)));
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div className={`${styles.AppRailShell__scrim} ${styles["AppRailShell__scrim--sheet"]}`} style={{ opacity: scrimOpacity }} />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                menuButtonRef.current?.focus({ preventScroll: true });
              }}
              onOpenAutoFocus={(event) => {
                const current = sheetRef.current?.querySelector<HTMLElement>(CURRENT_ROW_SELECTOR);
                if (current && !current.closest(INERT_SELECTOR)) {
                  event.preventDefault();
                  current.focus();
                }
              }}
            >
              <m.div
                ref={sheetRef}
                className={styles.AppRailShell__sheet}
                style={{ x: sheetX }}
                initial={{ x: SHEET_HIDDEN_X }}
                animate={{ x: 0 }}
                exit={{ x: SHEET_HIDDEN_X }}
                transition={reduce ? APP_RAIL_INSTANT : APP_RAIL_MOTION.spring.smooth}
                drag={prefersReduced ? false : DRAG_AXIS}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={SHEET_DRAG_ELASTIC}
                dragMomentum={false}
                onDragStart={() => {
                  draggingRef.current = true;
                  sheetRef.current?.setAttribute(DRAGGING_ATTRIBUTE, "");
                }}
                onDragEnd={(_, info) => {
                  sheetRef.current?.removeAttribute(DRAGGING_ATTRIBUTE);
                  window.setTimeout(() => {
                    draggingRef.current = false;
                  }, 0);
                  if (info.offset.x < SHEET_DISMISS_OFFSET_PX || info.velocity.x < SHEET_DISMISS_VELOCITY) onOpenChange(false);
                }}
              >
                <SheetBody {...content} onClose={() => onOpenChange(false)} onSelect={onSelect} reduce={reduce} />
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/**
 * Platform shell adapted from the Arc "Sidebar rail" block: a sidebar that
 * folds into an icon rail, floats over the page on mid widths and slides in
 * as a draggable sheet on narrow screens, plus a top bar with the rail
 * toggle, an animated breadcrumb and the page controls.
 */
export function AppRailShell({
  authenticatedMember,
  children,
  defaultOpen,
  headerActions,
  headerAside,
  memberTribes,
}: AppRailShellProps) {
  const pathname = usePathname();
  const { push } = useRouter();
  const baseId = useId();
  const prefersReduced = Boolean(useReducedMotion());
  const { collapsed, draggingRef, floating, menuButtonRef, overlaid, reduce, select, setFrame, setRail, setSheetOpen, sheetOpen, sheetRef, status, toggleRail } =
    useAppRailShellState({ defaultOpen, prefersReduced, push });
  const sidebarId = `${baseId}-sidebar`;
  const navigation = resolveAppRailNavigation(pathname, memberTribes);
  const tribe = navigation.activeTribe;
  const parentLabels = Array.from(
    new Set(navigation.sections.flatMap((section) => (section.heading ? [section.heading] : [])))
  );
  const footnote = authenticatedMember && !tribe && memberTribes.length === 0 ? APP_RAIL_UI.noTribesMessage : undefined;
  const content = { authenticatedMember, baseId, footnote, memberTribes, navigation };

  return (
    <LayoutGroup id={baseId}>
      <TooltipPrimitive.Provider delayDuration={TOOLTIP_DELAY_MS} skipDelayDuration={TOOLTIP_SKIP_DELAY_MS}>
        <section ref={setFrame} className={styles.AppRailShell} aria-label={APP_RAIL_UI.shellLabel}>
          <RailSidebar
            {...content}
            view={{ collapsed, floating, overlaid, reduce }}
            onExpand={() => setRail(false)}
            onSelect={(href) => select(href)}
            sidebarId={sidebarId}
          />
          <FloatScrim overlaid={overlaid} reduce={reduce} onClose={() => setRail(true)} />

          <main className={styles.AppRailShell__main}>
            <header className={styles.AppRailShell__topbar}>
              <RailToggle collapsed={collapsed} onToggle={toggleRail} reduce={reduce} sidebarId={sidebarId} />
              <button
                ref={menuButtonRef}
                type={BUTTON_TYPE}
                className={`${styles.AppRailShell__iconButton} ${styles.AppRailShell__menuButton}`}
                aria-label={APP_RAIL_UI.openNavigationLabel}
                aria-haspopup={DIALOG_POPUP}
                aria-expanded={sheetOpen}
                aria-keyshortcuts={RAIL_SHORTCUT_KEY}
                onClick={() => setSheetOpen(true)}
              >
                <PanelGlyph collapsed={false} reduce={reduce} />
              </button>
              <Breadcrumbs
                crumbCurrent={navigation.currentLabel}
                crumbParent={navigation.currentParent}
                crumbRoot={tribe?.name ?? siteConfig.name}
                parentLabels={parentLabels}
                reduce={reduce}
              />
              {headerAside}
              <div className={styles.AppRailShell__actions}>{headerActions}</div>
            </header>
            <div className={styles.AppRailShell__content}>{children}</div>
            <p className={styles.AppRailShell__srOnly} role="status" aria-live="polite">
              {status}
            </p>
          </main>

          <NavigationSheet
            {...content}
            draggingRef={draggingRef}
            menuButtonRef={menuButtonRef}
            onOpenChange={setSheetOpen}
            onSelect={(href) => select(href, true)}
            open={sheetOpen}
            prefersReduced={prefersReduced}
            reduce={reduce}
            sheetRef={sheetRef}
          />
        </section>
      </TooltipPrimitive.Provider>
    </LayoutGroup>
  );
}
