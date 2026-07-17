import { ImageResponse } from "next/og";

import { getCachedPublicTribeStoryAbout } from "@/src/modules/tribes/infrastructure/cache/tribe-story-about-cache";
import { siteConfig } from "@/lib/site-config";

export const alt = "Historia de la tribu";
export const size = {
  height: 630,
  width: 1200,
};
export const contentType = "image/png";

const OG_IMAGE_COPY = {
  membersSuffix: "miembros",
  storyEyebrow: "Historia",
} as const;

const OG_IMAGE_STYLE = {
  background: "#1a1a1a",
  eyebrowColor: "#9ca3af",
  foreground: "#fafafa",
  metaColor: "#d4d4d8",
} as const;

/**
 * Fallback Open Graph card for tribe story pages without an uploaded cover:
 * tribe name plus member count over a neutral background. It reads the cached
 * anonymous snapshot, so it only renders data a logged-out visitor may see.
 */
export default async function TribeStoryOpenGraphImage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { stats } = await getCachedPublicTribeStoryAbout(slug).catch(() => ({
    stats: null,
  }));
  const title = stats?.name ?? siteConfig.name;
  const membersLine = stats
    ? `${stats.memberCount} ${OG_IMAGE_COPY.membersSuffix}`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "flex-start",
          background: OG_IMAGE_STYLE.background,
          color: OG_IMAGE_STYLE.foreground,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 96,
          width: "100%",
        }}
      >
        <div
          style={{
            color: OG_IMAGE_STYLE.eyebrowColor,
            fontSize: 36,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {OG_IMAGE_COPY.storyEyebrow}
        </div>
        <div
          style={{
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 24,
          }}
        >
          {title}
        </div>
        {membersLine ? (
          <div
            style={{
              color: OG_IMAGE_STYLE.metaColor,
              fontSize: 40,
              marginTop: 32,
            }}
          >
            {membersLine}
          </div>
        ) : null}
      </div>
    ),
    size
  );
}
