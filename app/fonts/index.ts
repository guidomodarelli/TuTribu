import localFont from "next/font/local";

/**
 * Self-hosted product fonts. The WOFF2 files in this folder are the `latin`
 * subsets exported from Google Fonts, so the build and runtime never reach out
 * to Google. Each loader exposes a CSS variable consumed by the `--font-*`
 * tokens in `app/globals.css`.
 */

/**
 * Geist is the base sans-serif typeface for the whole product, matching the
 * shadcn/ui visual language. The latin subset ships as a single variable WOFF2
 * covering the 400-600 weight range used across body copy, controls, and labels.
 */
export const geist = localFont({
  src: "./geist-latin-variable.woff2",
  variable: "--font-geist",
  weight: "400 600",
  display: "swap",
});

/**
 * Poppins (semibold) is reserved exclusively for large page-level display
 * headings. It is not preloaded because only a few entrypoints render a heading
 * with it, so the small static subset is fetched on demand.
 */
export const poppins = localFont({
  src: "./poppins-latin-600.woff2",
  variable: "--font-poppins",
  weight: "600",
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
