"use client";

import { useEffect, useRef, useState } from "react";
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
  /**
   * Whether the slide is the one the gallery currently shows. Leaving the
   * slide unmounts a playing player so its audio never keeps running behind
   * another image. Defaults to `true` for standalone use.
   */
  isActive?: boolean;
  title: string;
  videoProvider: VideoProvider;
};

/**
 * Video slide with a poster and play button: the provider iframe mounts only
 * after the viewer chooses to play, following the feed gallery pattern so the
 * carousel never loads every player upfront. Playback stops when the gallery
 * moves to another slide.
 */
export function TribeStoryVideoSlide({
  externalVideoId,
  isActive = true,
  title,
  videoProvider,
}: TribeStoryVideoSlideProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<HTMLIFrameElement | null>(null);
  const shouldFocusPlayerRef = useRef(false);
  const thumbnailSource = buildVideoThumbnailSource(
    videoProvider,
    externalVideoId
  );

  // Derived reset during render: an inactive slide never keeps a live player.
  if (!isActive && isPlaying) {
    setIsPlaying(false);
  }

  // The play button unmounts when the player appears; hand focus to the
  // player so keyboard users keep their place instead of landing on <body>.
  useEffect(() => {
    if (isPlaying && shouldFocusPlayerRef.current) {
      shouldFocusPlayerRef.current = false;
      playerRef.current?.focus();
    }
  }, [isPlaying]);

  if (isPlaying) {
    return (
      <iframe
        allow={PLAYER_IFRAME_ALLOW}
        allowFullScreen
        className={styles.TribeStoryVideoSlide__video}
        ref={playerRef}
        src={buildPlayerEmbedSource(videoProvider, externalVideoId)}
        title={title}
      />
    );
  }

  return (
    <button
      aria-label={TRIBE_STORY_VIDEO_SLIDE_COPY.playLabel(title)}
      className={styles.TribeStoryVideoSlide}
      onClick={() => {
        shouldFocusPlayerRef.current = true;
        setIsPlaying(true);
      }}
      type="button"
    >
      {thumbnailSource ? (
        <Image
          alt=""
          className={styles.TribeStoryVideoSlide__thumbnail}
          fill
          sizes={VIDEO_THUMBNAIL_SIZES}
          src={thumbnailSource}
          unoptimized
        />
      ) : null}
      <span aria-hidden className={styles.TribeStoryVideoSlide__playBadge}>
        <PlayIcon className={styles.TribeStoryVideoSlide__playIcon} />
      </span>
    </button>
  );
}
