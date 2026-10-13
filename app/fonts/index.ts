import localFont from "next/font/local";

/**
 * Self-hosted product fonts. The WOFF2 files in this folder are the `latin`
 * subsets exported from Google Fonts, so the build and runtime never reach out
 * to Google. Each loader exposes a CSS variable consumed by the `--font-*`
 * tokens in `app/globals.css`.
 */

/**
 * Inter is the base sans-serif typeface of Arc, the design system beez-ui follows: body copy, controls, labels and
 * compact headings. The latin subset ships as a single variable WOFF2 covering the 400-500 weights Arc uses.
 */
export const inter = localFont({
  src: "./inter-latin-variable.woff2",
  variable: "--font-inter",
  weight: "400 500",
  display: "swap",
});

/**
 * Geist is Arc's display face, reserved for headings of 30px and up. It is not preloaded because only page-level
 * headings render with it, so the variable subset is fetched on demand.
 */
export const geist = localFont({
  src: "./geist-latin-variable.woff2",
  variable: "--font-geist",
  weight: "400 500",
  preload: false,
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
