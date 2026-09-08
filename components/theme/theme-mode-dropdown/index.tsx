"use client";

import { useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "beez-ui";

import {
  applyThemeMode,
  getStoredThemeMode,
  isThemeMode,
  storeThemeMode,
} from "./theme-mode-preference";
import {
  DARK_THEME_MODE,
  LIGHT_THEME_MODE,
  SYSTEM_THEME_MODE,
  SYSTEM_THEME_MEDIA_QUERY,
  type ThemeMode,
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
  mediaQueryChangeEvent: "change",
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

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return SYSTEM_THEME_MODE;
  }

  return getStoredThemeMode();
}

export function ThemeModeDropdown() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);

  useEffect(() => {
    applyThemeMode(themeMode);

    if (themeMode !== SYSTEM_THEME_MODE || !window.matchMedia) {
      return;
    }

    const mediaQueryList = window.matchMedia(SYSTEM_THEME_MEDIA_QUERY);
    const handleSystemThemeChange = () => {
      applyThemeMode(SYSTEM_THEME_MODE);
    };

    mediaQueryList.addEventListener(
      THEME_MODE_DROPDOWN_UI.mediaQueryChangeEvent,
      handleSystemThemeChange
    );

    return () => {
      mediaQueryList.removeEventListener(
        THEME_MODE_DROPDOWN_UI.mediaQueryChangeEvent,
        handleSystemThemeChange
      );
    };
  }, [themeMode]);

  const handleThemeModeChange = (nextThemeMode: string) => {
    if (!isThemeMode(nextThemeMode)) {
      return;
    }

    setThemeMode(nextThemeMode);
    storeThemeMode(nextThemeMode);
    applyThemeMode(nextThemeMode);
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
          value={themeMode}
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
