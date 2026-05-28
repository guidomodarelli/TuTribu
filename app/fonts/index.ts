import localFont from "next/font/local";

/**
 * Self-hosted product fonts. The WOFF2 files in this folder are the `latin`
 * subsets exported from Google Fonts, so the build and runtime never reach out
 * to Google. Each loader exposes a CSS variable consumed by the `--font-*`
 * tokens in `app/globals.css`.
 */
export const spaceGrotesk = localFont({
  src: "./space-grotesk-latin-variable.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

export const ibmPlexMono = localFont({
  src: [
    {
      path: "./ibm-plex-mono-latin-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./ibm-plex-mono-latin-500.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-ibm-plex-mono",
  preload: false,
  display: "swap",
});
