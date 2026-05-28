import "server-only";

import { GOOGLE_USERINFO_ENDPOINT } from "@/src/modules/auth/constants/google-profile";
import type { ExternalProfilePictureProvider } from "@/src/modules/auth/domain/repositories/external-profile-picture-provider";

/**
 * Resolves a usable Google access token for a member. Implementations encapsulate
 * the offline-credential handling (decryption and refresh) so this adapter only
 * deals with the userinfo request.
 */
type GoogleAccessTokenResolver = (userId: string) => Promise<string | null>;

type FetchImplementation = typeof fetch;

type GoogleProfilePictureProviderDependencies = {
  /** HTTP client used to call the userinfo endpoint. Defaults to global fetch. */
  fetchImplementation?: FetchImplementation;
  /** Resolver for a fresh Google access token scoped to the member. */
  getAccessToken: GoogleAccessTokenResolver;
};

type GoogleUserInfo = {
  picture?: unknown;
};

const GOOGLE_PROFILE_ERROR_MESSAGE = {
  userInfoRequestFailed: "Google userinfo request failed with status",
} as const;

/**
 * Reads a member's current Google profile picture from the OpenID userinfo
 * endpoint, using a freshly resolved access token.
 *
 * The userinfo endpoint is preferred over decoding a refreshed id token because
 * the id token returned by a token refresh can be a stale, previously stored
 * value.
 */
export class GoogleProfilePictureProvider
  implements ExternalProfilePictureProvider
{
  private readonly fetchImplementation: FetchImplementation;
  private readonly getAccessToken: GoogleAccessTokenResolver;

  constructor({
    fetchImplementation = fetch,
    getAccessToken,
  }: GoogleProfilePictureProviderDependencies) {
    this.fetchImplementation = fetchImplementation;
    this.getAccessToken = getAccessToken;
  }

  async getCurrentPictureUrl(userId: string): Promise<string | null> {
    const accessToken = await this.getAccessToken(userId);

    if (!accessToken) {
      return null;
    }

    const response = await this.fetchImplementation(GOOGLE_USERINFO_ENDPOINT, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `${GOOGLE_PROFILE_ERROR_MESSAGE.userInfoRequestFailed} ${response.status}`
      );
    }

    const userInfo = (await response.json()) as GoogleUserInfo;
    const picture = userInfo.picture;

    return typeof picture === "string" && picture.length > 0 ? picture : null;
  }
}
