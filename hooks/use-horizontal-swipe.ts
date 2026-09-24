"use client";

import { useRef, type TouchEvent } from "react";

import {
  resolveHorizontalSwipe,
  type HorizontalSwipeDirection,
} from "@/lib/gestures/horizontal-swipe";

type SwipeStart = {
  identifier: number;
  startTime: number;
  x: number;
  y: number;
};

/**
 * Touch handlers to spread on the swipe surface.
 */
export type HorizontalSwipeHandlers = {
  onTouchCancel: () => void;
  onTouchEnd: (event: TouchEvent<HTMLElement>) => void;
  onTouchStart: (event: TouchEvent<HTMLElement>) => void;
};

/**
 * Detects horizontal one-finger swipes. Touch events are used instead of
 * Pointer Events because browsers fire `pointercancel` as soon as they start
 * scrolling, and WebKit (iOS Safari and every iOS browser) has only partial
 * `touch-action` support to prevent it, while `touchend` is delivered on
 * both engines. The handlers never call `preventDefault`, so native vertical
 * scrolling and pinch-zoom keep working; mouse drags never trigger a swipe.
 *
 * @param onSwipe - Called once per recognised swipe.
 * @returns Handlers for the swipe surface.
 */
export function useHorizontalSwipe(
  onSwipe: (direction: HorizontalSwipeDirection) => void
): HorizontalSwipeHandlers {
  const swipeStartRef = useRef<SwipeStart | null>(null);

  return {
    onTouchCancel: () => {
      swipeStartRef.current = null;
    },
    onTouchEnd: (event) => {
      const swipeStart = swipeStartRef.current;
      const endTouch = swipeStart
        ? Array.from(event.changedTouches).find(
            (touch) => touch.identifier === swipeStart.identifier
          )
        : undefined;

      swipeStartRef.current = null;

      if (!swipeStart || !endTouch) {
        return;
      }

      const direction = resolveHorizontalSwipe({
        deltaX: endTouch.clientX - swipeStart.x,
        deltaY: endTouch.clientY - swipeStart.y,
        durationMs: event.timeStamp - swipeStart.startTime,
      });

      if (direction) {
        onSwipe(direction);
      }
    },
    onTouchStart: (event) => {
      const [firstTouch] = Array.from(event.touches);

      // A second finger (pinch-zoom) cancels the gesture.
      swipeStartRef.current =
        event.touches.length === 1 && firstTouch
          ? {
              identifier: firstTouch.identifier,
              startTime: event.timeStamp,
              x: firstTouch.clientX,
              y: firstTouch.clientY,
            }
          : null;
    },
  };
}
