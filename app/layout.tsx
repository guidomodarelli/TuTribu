import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";

import { AppProviders } from "@/components/providers/app-providers";
import { siteConfig } from "@/lib/site-config";
import {
  DARK_THEME_CLASS_NAME,
  DARK_THEME_MODE,
  LIGHT_THEME_MODE,
  SYSTEM_THEME_MEDIA_QUERY,
  SYSTEM_THEME_MODE,
  THEME_MODE_ATTRIBUTE_VALUES,
  THEME_MODE_STORAGE_KEY,
} from "@/src/constants/theme-mode";
import "./globals.css";
import styles from "./layout.module.scss";

const ROOT_LAYOUT_DOCUMENT = {
  language: "es",
  scrollBehavior: "smooth",
} as const;
const THEME_MODE_BOOTSTRAP_SCRIPT_ID = "theme-mode-bootstrap-script";
const THEME_MODE_BOOTSTRAP_SCRIPT_STRATEGY = "beforeInteractive" as const;
const THEME_MODE_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var storageKey = ${JSON.stringify(THEME_MODE_STORAGE_KEY)};
    var themeMode = window.localStorage.getItem(storageKey);
    var validThemeModes = ${JSON.stringify(THEME_MODE_ATTRIBUTE_VALUES)};

    if (validThemeModes.indexOf(themeMode) === -1) {
      themeMode = ${JSON.stringify(SYSTEM_THEME_MODE)};
    }

    var resolvedThemeMode = themeMode;

    if (themeMode === ${JSON.stringify(SYSTEM_THEME_MODE)}) {
      resolvedThemeMode = window.matchMedia(${JSON.stringify(SYSTEM_THEME_MEDIA_QUERY)}).matches ? ${JSON.stringify(DARK_THEME_MODE)} : ${JSON.stringify(LIGHT_THEME_MODE)};
    }

    document.documentElement.classList.toggle(${JSON.stringify(DARK_THEME_CLASS_NAME)}, resolvedThemeMode === ${JSON.stringify(DARK_THEME_MODE)});
  } catch {
    document.documentElement.classList.remove(${JSON.stringify(DARK_THEME_CLASS_NAME)});
  }
})();
`;

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  preload: false,
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description:
    `${siteConfig.name}: la plataforma donde los usuarios pueden aprender, compartir conocimientos y conectar con una tribu enfocada en el crecimiento personal y profesional.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={ROOT_LAYOUT_DOCUMENT.language}
      data-scroll-behavior={ROOT_LAYOUT_DOCUMENT.scrollBehavior}
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} ${styles.RootLayout}`}
      suppressHydrationWarning
    >
      <head>
        <Script id={THEME_MODE_BOOTSTRAP_SCRIPT_ID} strategy={THEME_MODE_BOOTSTRAP_SCRIPT_STRATEGY}>
          {THEME_MODE_BOOTSTRAP_SCRIPT}
        </Script>
      </head>
      <body className={styles.RootLayout__body}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
