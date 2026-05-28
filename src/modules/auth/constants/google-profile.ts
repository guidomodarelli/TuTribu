/**
 * Provider identifier used by Better Auth for the Google social provider.
 */
export const GOOGLE_PROVIDER_ID = "google";

/**
 * Google OpenID Connect userinfo endpoint. Returns the current profile claims
 * (including `picture`) for the access token presented as a Bearer credential.
 */
export const GOOGLE_USERINFO_ENDPOINT =
  "https://openidconnect.googleapis.com/v1/userinfo";
