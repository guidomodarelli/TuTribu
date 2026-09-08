/** Composes the root document; AppProviders owns theme bootstrapping and hydration. */
import type { Metadata } from "next";

import { AppProviders } from "@/components/providers/app-providers";
import { siteConfig } from "@/lib/site-config";
import { getSitepingEnvironment } from "@/src/modules/siteping/infrastructure/environment/siteping-environment";
import { geist, ibmPlexMono, poppins } from "./fonts";
import "./globals.css";
import styles from "./layout.module.scss";

const ROOT_LAYOUT_DOCUMENT = {
  language: "es",
  scrollBehavior: "smooth",
} as const;
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
  const sitepingEnvironment = getSitepingEnvironment();

  return (
    <html
      lang={ROOT_LAYOUT_DOCUMENT.language}
      data-scroll-behavior={ROOT_LAYOUT_DOCUMENT.scrollBehavior}
      className={`${geist.variable} ${poppins.variable} ${ibmPlexMono.variable} ${styles.RootLayout}`}
      suppressHydrationWarning
    >
      <body className={styles.RootLayout__body}>
        <AppProviders isSitepingEnabled={sitepingEnvironment.enabled}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
