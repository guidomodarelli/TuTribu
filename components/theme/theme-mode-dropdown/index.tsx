"use client";

import { MonitorIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, useTheme } from "beez-ui";

import { isThemeMode } from "@/lib/theme-mode";
import {
  DARK_THEME_MODE,
  LIGHT_THEME_MODE,
  SYSTEM_THEME_MODE,
} from "@/src/constants/theme-mode";
import styles from "./styles.module.scss";

const THEME_MODE_DROPDOWN_COPY = {
  label: "Cambiar tema",
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

/** Renders the shared theme selection without owning storage or document mutations. */
export function ThemeModeDropdown() {
  const { theme = SYSTEM_THEME_MODE, setTheme } = useTheme();

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
          aria-label={THEME_MODE_DROPDOWN_COPY.label}
          className={styles.ThemeModeDropdown}
        >
          <SunMoonIcon aria-hidden className={styles.ThemeModeDropdown__triggerIcon} />
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
