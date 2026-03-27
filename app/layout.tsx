import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";
import styles from "./layout.module.scss";

const ROOT_LAYOUT_DOCUMENT = {
  language: "es",
  scrollBehavior: "smooth",
} as const;

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "AcademiaOnline",
  description:
    "AcademiaOnline: la plataforma donde los usuarios pueden aprender, compartir conocimientos y conectar con una comunidad enfocada en el crecimiento personal y profesional.",
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
    >
      <body className={styles.RootLayout__body}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
