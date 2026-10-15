"use client";

/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the
 * Arc Pro license (https://uiarc.dev/license). Not covered by this project's
 * license; do not redistribute it on its own.
 */

import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { SidebarTrigger, SPRING_PANEL, Tooltip, TooltipContent, TooltipTrigger, useSidebar } from "beez-ui";
import styles from "./styles.module.scss";

/** Key that folds and unfolds the rail, or opens the sheet on phones. */
const APP_RAIL_SHORTCUT_KEY = "[";

const APP_RAIL_TOGGLE_UI = {
  announcementCollapsed: "Barra lateral contraída",
  announcementExpanded: "Barra lateral expandida",
  collapseLabel: "Contraer barra lateral",
  expandLabel: "Expandir barra lateral",
  openNavigationLabel: "Abrir navegación",
  popupKind: "dialog",
  tooltipSide: "bottom",
} as const;

/** Text controls keep the key as text: the shortcut only applies outside them. */
const TEXT_ENTRY_TAG_NAMES = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/** Menus and dialogs own their keyboard, so the shortcut stays out of their way. */
const SHORTCUT_EXCLUDED_CONTAINER_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** How far the panel divider of the glyph slides toward the edge when the rail is folded. */
const PANEL_GLYPH_FOLDED_SHIFT = -2.5;
const INSTANT_TRANSITION = { duration: 0 } as const;

/**
 * Whether a keyboard event should toggle the rail: the bare `[` key, outside
 * text entry, menus and dialogs, and not already handled by someone else.
 *
 * @param event - Window keydown event.
 * @returns True when the shortcut applies.
 */
function isRailShortcut(event: KeyboardEvent): boolean {
  if (
    event.key !== APP_RAIL_SHORTCUT_KEY ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.defaultPrevented
  ) {
    return false;
  }

  const target = event.target instanceof HTMLElement ? event.target : null;

  if (!target) {
    return true;
  }

  return !(
    target.isContentEditable ||
    TEXT_ENTRY_TAG_NAMES.has(target.tagName) ||
    target.closest(SHORTCUT_EXCLUDED_CONTAINER_SELECTOR)
  );
}

/**
 * Panel icon whose divider slides with the sidebar, so the control shows what
 * it is about to do.
 */
function PanelGlyph({ collapsed, reduce }: { collapsed: boolean; reduce: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.AppRailToggle__glyph}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
      viewBox="0 0 20 20"
    >
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="3.5" />
      <motion.path
        d="M8.25 4.25v11.5"
        initial={false}
        animate={{ x: collapsed ? PANEL_GLYPH_FOLDED_SHIFT : 0 }}
        transition={reduce ? INSTANT_TRANSITION : SPRING_PANEL}
      />
    </svg>
  );
}

/**
 * App rail toggle of the platform header: folds the sidebar into its icon rail
 * on wider screens and opens the navigation sheet on phones. Also listens to
 * the `[` shortcut and announces each fold to assistive technology.
 */
export function AppRailToggle() {
  const { isMobile, open, reduce, toggleSidebar } = useSidebar();
  const [announcement, setAnnouncement] = useState("");
  const collapsed = !open;
  const label = isMobile
    ? APP_RAIL_TOGGLE_UI.openNavigationLabel
    : collapsed
      ? APP_RAIL_TOGGLE_UI.expandLabel
      : APP_RAIL_TOGGLE_UI.collapseLabel;

  // The sheet announces itself as a dialog; only the rail needs a status message.
  const announceFold = () => {
    if (!isMobile) {
      setAnnouncement(
        collapsed
          ? APP_RAIL_TOGGLE_UI.announcementExpanded
          : APP_RAIL_TOGGLE_UI.announcementCollapsed
      );
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isRailShortcut(event)) {
        return;
      }

      event.preventDefault();
      announceFold();
      toggleSidebar();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarTrigger
            aria-label={label}
            aria-haspopup={isMobile ? APP_RAIL_TOGGLE_UI.popupKind : undefined}
            aria-keyshortcuts={APP_RAIL_SHORTCUT_KEY}
            className={styles.AppRailToggle}
            onClick={announceFold}
          >
            <PanelGlyph collapsed={collapsed && !isMobile} reduce={reduce} />
          </SidebarTrigger>
        </TooltipTrigger>
        <TooltipContent side={APP_RAIL_TOGGLE_UI.tooltipSide}>
          <span className={styles.AppRailToggle__shortcut}>
            {label}
            <kbd className={styles.AppRailToggle__key}>{APP_RAIL_SHORTCUT_KEY}</kbd>
          </span>
        </TooltipContent>
      </Tooltip>
      <p className={styles.AppRailToggle__announcement} role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
