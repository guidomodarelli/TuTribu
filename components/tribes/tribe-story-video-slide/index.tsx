"use client";

import { useState } from "react";
import { PlayIcon } from "lucide-react";
import Image from "next/image";

import {
  PLAYER_IFRAME_ALLOW,
  buildPlayerEmbedSource,
} from "@/src/modules/shared/application/video/build-player-embed-source";
import { buildVideoThumbnailSource } from "@/src/modules/shared/application/video/build-video-thumbnail-source";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import styles from "./styles.module.scss";

const TRIBE_STORY_VIDEO_SLIDE_COPY = {
  playLabel: (title: string) => `Reproducir ${title}`,
} as const;

const VIDEO_THUMBNAIL_SIZES = "(min-width: 64rem) 40rem, 100vw";

type TribeStoryVideoSlideProps = {
  externalVideoId: string;
  title: string;
  videoProvider: VideoProvider;
};

/**
 * Video slide with a poster and play button: the provider iframe mounts only
 * after the viewer chooses to play, following the feed gallery pattern so the
 * carousel never loads every player upfront.
 */
export function TribeStoryVideoSlide({
  externalVideoId,
  title,
  videoProvider,
}: TribeStoryVideoSlideProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const thumbnailSource = buildVideoThumbnailSource(
    videoProvider,
    externalVideoId
  );

  if (isPlaying) {
    return (
      <iframe
        allow={PLAYER_IFRAME_ALLOW}
        allowFullScreen
        className={styles.TribeStoryVideoSlide__video}
        src={buildPlayerEmbedSource(videoProvider, externalVideoId)}
        title={title}
      />
    );
  }

  return (
    <button
      aria-label={TRIBE_STORY_VIDEO_SLIDE_COPY.playLabel(title)}
      className={styles.TribeStoryVideoSlide}
      onClick={() => setIsPlaying(true)}
      type="button"
    >
      {thumbnailSource ? (
        <Image
          alt={title}
          className={styles.TribeStoryVideoSlide__thumbnail}
          fill
          sizes={VIDEO_THUMBNAIL_SIZES}
          src={thumbnailSource}
          unoptimized
        />
      ) : null}
      <span className={styles.TribeStoryVideoSlide__playBadge}>
        <PlayIcon className={styles.TribeStoryVideoSlide__playIcon} />
      </span>
    </button>
  );
}
