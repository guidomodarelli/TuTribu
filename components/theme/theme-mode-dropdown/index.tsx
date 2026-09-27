"use client";

import type { LucideIcon } from "lucide-react";
import { MonitorIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, useTheme, MOTION_TIMING, MOTION_EASE, SPRING_POP } from "beez-ui";
import { useIsHydrated } from "beez-ui/hooks";

import { isThemeMode } from "@/lib/theme-mode";
import {
  DARK_THEME_MODE,
  LIGHT_THEME_MODE,
  SYSTEM_THEME_MODE,
} from "@/src/constants/theme-mode";
import styles from "./styles.module.scss";

const THEME_MODE_DROPDOWN_COPY = {
  label: "Cambiar tema",
  currentModeSeparator: ", actual: ",
  light: "Claro",
  dark: "Oscuro",
  system: "Sistema",
} as const;

const THEME_MODE_DROPDOWN_UI = {
  align: "end",
  buttonSize: "icon",
  buttonType: "button",
  buttonVariant: "ghost",
  side: "bottom",
} as const;

/** Presence key of the neutral icon shown until the stored preference is known. */
const UNRESOLVED_ICON_KEY = "unresolved";

/** Quarter turn the trigger icons rotate through while they swap. */
const ICON_SWAP_ROTATION_DEGREES = 90;
/** Scale the swapped icons shrink to, so the swap reads as one gesture. */
const ICON_SWAP_HIDDEN_SCALE = 0.5;

/** Rotated cross-fade of the trigger icon: the new one turns in, the old one turns out. */
const ICON_SWAP_MOTION = {
  animate: { opacity: 1, rotate: 0, scale: 1, transition: SPRING_POP },
  exit: {
    opacity: 0,
    rotate: ICON_SWAP_ROTATION_DEGREES,
    scale: ICON_SWAP_HIDDEN_SCALE,
    transition: { duration: MOTION_TIMING.exit, ease: MOTION_EASE },
  },
  initial: { opacity: 0, rotate: -ICON_SWAP_ROTATION_DEGREES, scale: ICON_SWAP_HIDDEN_SCALE },
} as const;

const THEME_MODE_OPTIONS = [
  {
    icon: SunIcon,
    label: THEME_MODE_DROPDOWN_COPY.light,
    value: LIGHT_THEME_MODE,
  },
  {
    icon: MoonIcon,
    label: THEME_MODE_DROPDOWN_COPY.dark,
    value: DARK_THEME_MODE,
  },
  {
    icon: MonitorIcon,
    label: THEME_MODE_DROPDOWN_COPY.system,
    value: SYSTEM_THEME_MODE,
  },
] as const;

type ThemeModeOption = (typeof THEME_MODE_OPTIONS)[number];

/**
 * Finds the option of the selected mode. The stored preference only exists in
 * the browser, so it is ignored until hydration to keep the server markup and
 * the first client render identical.
 * @param theme - Selected mode reported by the theme provider.
 * @param isHydrated - Whether the client already committed its first render.
 * @returns The selected option, or `undefined` while it is still unknown.
 */
function findSelectedOption(theme: string, isHydrated: boolean): ThemeModeOption | undefined {
  if (!isHydrated) {
    return undefined;
  }

  return THEME_MODE_OPTIONS.find((themeModeOption) => themeModeOption.value === theme);
}

/**
 * Renders the shared theme selection without owning storage or document
 * mutations. The trigger shows the icon of the selected mode and swaps it with
 * a short rotation when the mode changes.
 */
export function ThemeModeDropdown() {
  const { theme = SYSTEM_THEME_MODE, setTheme } = useTheme();
  const isHydrated = useIsHydrated();
  const selectedOption = findSelectedOption(theme, isHydrated);
  const TriggerIcon: LucideIcon = selectedOption?.icon ?? SunMoonIcon;
  const triggerLabel = selectedOption
    ? `${THEME_MODE_DROPDOWN_COPY.label}${THEME_MODE_DROPDOWN_COPY.currentModeSeparator}${selectedOption.label}`
    : THEME_MODE_DROPDOWN_COPY.label;

  /** Accepts only the application's public theme modes from the radio control. */
  const handleThemeModeChange = (nextThemeMode: string) => {
    if (isThemeMode(nextThemeMode)) setTheme(nextThemeMode);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type={THEME_MODE_DROPDOWN_UI.buttonType}
          variant={THEME_MODE_DROPDOWN_UI.buttonVariant}
          size={THEME_MODE_DROPDOWN_UI.buttonSize}
          aria-label={triggerLabel}
          className={styles.ThemeModeDropdown}
        >
          {/* Keyed by hydration so revealing the stored mode on load is not animated. */}
          <AnimatePresence initial={false} key={String(isHydrated)} mode="popLayout">
            <motion.span
              key={selectedOption?.value ?? UNRESOLVED_ICON_KEY}
              animate={ICON_SWAP_MOTION.animate}
              aria-hidden="true"
              className={styles.ThemeModeDropdown__iconSlot}
              exit={ICON_SWAP_MOTION.exit}
              initial={ICON_SWAP_MOTION.initial}
            >
              <TriggerIcon aria-hidden className={styles.ThemeModeDropdown__triggerIcon} />
            </motion.span>
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={THEME_MODE_DROPDOWN_UI.side}
        align={THEME_MODE_DROPDOWN_UI.align}
        className={styles.ThemeModeDropdown__content}
      >
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={handleThemeModeChange}
        >
          {THEME_MODE_OPTIONS.map((themeModeOption) => {
            const ThemeModeIcon = themeModeOption.icon;

            return (
              <DropdownMenuRadioItem
                key={themeModeOption.value}
                value={themeModeOption.value}
              >
                <ThemeModeIcon aria-hidden />
                {themeModeOption.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
