"use client";

/**
 * Horizontal channel chips that filter the round through server-rendered
 * pages. The active chip is marked with a shared highlight that glides to the
 * chip the viewer taps while the filtered page loads.
 */
import { LayoutGroup, motion } from "motion/react";
import { type MouseEvent, useEffect, useId, useRef, useState } from "react";

import { Link } from "@/components/navigation/link";
import type { TribeChannelResult } from "@/src/modules/messages/application/results/tribe-round-result";

import styles from "./styles.module.scss";
import { cn, SPRING_LAYOUT } from "beez-ui";

/** Identifier of the "all channels" chip, which has no channel id. */
const ALL_CHANNELS_FILTER_ID = "all";

/** Attribute values and identifiers used by the chip strip markup. */
const ROUND_CHANNEL_FILTERS_UI = {
  ariaCurrentPage: "page",
  // A `data-slot` opts the chip out of the beez-ui link hover fade, whose
  // partial opacity would lift the gliding indicator above neighbor chips.
  chipSlot: "round-channel-filter-chip",
  indicatorLayoutId: "round-channel-filter-indicator",
  primaryMouseButton: 0,
} as const;

/** Share of the free space kept on each side when centering the active chip. */
const ACTIVE_CHIP_CENTERING_DIVISOR = 2;

type RoundChannelFiltersProps = {
  activeChannelId: string | null;
  allChannelsLabel: string;
  /** Builds the first page href for a channel slug, or for all channels with `null`. */
  buildChannelHref: (channelSlug: string | null) => string;
  channels: TribeChannelResult[];
  navigationLabel: string;
};

/**
 * Reports whether a click opens the link in the same tab, the only case where
 * the chip should show the pending selection right away.
 *
 * @param event - Click on a channel chip.
 * @returns `true` for a plain primary-button click.
 */
function isSameTabNavigationClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === ROUND_CHANNEL_FILTERS_UI.primaryMouseButton &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Scrolls the chip strip horizontally, without moving the page, so the active
 * chip is fully visible. On phones the strip overflows and a channel near the
 * end would otherwise render selected but off-screen.
 *
 * @param strip - Horizontally scrollable chip container.
 * @param chip - Active chip element.
 */
function revealActiveChip(strip: HTMLElement, chip: HTMLElement) {
  const chipStart = chip.offsetLeft - strip.offsetLeft;
  const chipEnd = chipStart + chip.offsetWidth;
  const visibleStart = strip.scrollLeft;
  const visibleEnd = visibleStart + strip.clientWidth;

  if (chipStart >= visibleStart && chipEnd <= visibleEnd) {
    return;
  }

  strip.scrollLeft = Math.max(
    0,
    chipStart - (strip.clientWidth - chip.offsetWidth) / ACTIVE_CHIP_CENTERING_DIVISOR
  );
}

/**
 * Renders the channel filter chips of the round.
 *
 * @param props - Channels, active channel, labels and href builder.
 * @returns The channel filter navigation.
 */
export function RoundChannelFilters({
  activeChannelId,
  allChannelsLabel,
  buildChannelHref,
  channels,
  navigationLabel,
}: RoundChannelFiltersProps) {
  const serverActiveFilterId = activeChannelId ?? ALL_CHANNELS_FILTER_ID;
  const [pendingFilterId, setPendingFilterId] = useState<string | null>(null);
  const [renderedServerFilterId, setRenderedServerFilterId] = useState(serverActiveFilterId);

  // A new server filter settles the optimistic highlight; otherwise a later
  // back/forward navigation would keep highlighting the previously tapped chip.
  if (renderedServerFilterId !== serverActiveFilterId) {
    setRenderedServerFilterId(serverActiveFilterId);
    setPendingFilterId(null);
  }

  const selectedFilterId = pendingFilterId ?? serverActiveFilterId;
  const stripRef = useRef<HTMLElement | null>(null);
  const activeChipRef = useRef<HTMLAnchorElement | null>(null);
  // Scopes the shared indicator so two filter strips never trade highlights.
  const layoutGroupId = useId();

  useEffect(() => {
    if (stripRef.current && activeChipRef.current) {
      revealActiveChip(stripRef.current, activeChipRef.current);
    }
  }, [serverActiveFilterId]);

  const filters = [
    { emoji: null, href: buildChannelHref(null), id: ALL_CHANNELS_FILTER_ID, name: allChannelsLabel },
    ...channels.map((channel) => ({
      emoji: channel.emoji,
      href: buildChannelHref(channel.slug),
      id: channel.id,
      name: channel.name,
    })),
  ];

  return (
    <LayoutGroup id={layoutGroupId}>
      <motion.nav
        aria-label={navigationLabel}
        className={styles.RoundChannelFilters}
        layoutScroll
        ref={stripRef}
      >
        {filters.map((filter) => {
          const isSelected = filter.id === selectedFilterId;
          const isCurrentPage = filter.id === serverActiveFilterId;

          return (
            <Link
              aria-current={isCurrentPage ? ROUND_CHANNEL_FILTERS_UI.ariaCurrentPage : undefined}
              data-slot={ROUND_CHANNEL_FILTERS_UI.chipSlot}
              className={cn(
                styles.RoundChannelFilters__chip,
                isSelected && styles["RoundChannelFilters__chip--active"]
              )}
              href={filter.href}
              key={filter.id}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                if (isSameTabNavigationClick(event)) {
                  setPendingFilterId(filter.id);
                }
              }}
              ref={isCurrentPage ? activeChipRef : undefined}
            >
              {isSelected ? (
                <motion.span
                  aria-hidden
                  className={styles.RoundChannelFilters__indicator}
                  layoutId={ROUND_CHANNEL_FILTERS_UI.indicatorLayoutId}
                  transition={SPRING_LAYOUT}
                />
              ) : null}
              {filter.emoji ? (
                <span aria-hidden className={styles.RoundChannelFilters__emoji}>
                  {filter.emoji}
                </span>
              ) : null}
              <span className={styles.RoundChannelFilters__text}>{filter.name}</span>
            </Link>
          );
        })}
      </motion.nav>
    </LayoutGroup>
  );
}
