"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  MEMBER_SESSION_KEEP_ALIVE_MIN_INTERVAL_MS,
  MEMBER_SESSION_REFRESH_STATUS,
} from "@/src/modules/auth/constants/session";
import { refreshMemberSession } from "@/src/modules/auth/infrastructure/better-auth/client";

const VISIBLE_DOCUMENT_STATE = "visible";

/**
 * Keeps the 180-day member session sliding while the member uses the app.
 *
 * Server renders only read the session, so the browser cookie is renewed here:
 * once when the platform loads and again when the tab becomes visible after
 * the throttle window. When the server no longer recognizes the session the
 * route is refreshed, because the authentication state changed and every
 * server-rendered view must stop showing the member.
 *
 * @param isAuthenticated - Whether the server rendered the page for a member.
 */
export function useMemberSessionKeepAlive(isAuthenticated: boolean): void {
  const { refresh } = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const abortController = new AbortController();
    let lastRefreshStartedAt: number | null = null;
    let isRefreshInFlight = false;

    const renewSession = async () => {
      const now = Date.now();
      const isThrottled =
        lastRefreshStartedAt !== null &&
        now - lastRefreshStartedAt < MEMBER_SESSION_KEEP_ALIVE_MIN_INTERVAL_MS;

      if (isRefreshInFlight || isThrottled) {
        return;
      }

      isRefreshInFlight = true;
      lastRefreshStartedAt = now;
      const status = await refreshMemberSession(abortController.signal);
      isRefreshInFlight = false;

      if (
        !abortController.signal.aborted &&
        status === MEMBER_SESSION_REFRESH_STATUS.expired
      ) {
        refresh();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === VISIBLE_DOCUMENT_STATE) {
        void renewSession();
      }
    };

    void renewSession();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      abortController.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, refresh]);
}
