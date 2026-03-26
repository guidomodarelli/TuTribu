"use client";

export function navigateToGoogleAuthStart(callbackUrl: string) {
  const nextPath = encodeURIComponent(callbackUrl);
  window.location.assign(`/auth/google/start?next=${nextPath}`);
}
