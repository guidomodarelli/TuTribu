import { GOOGLE_USERINFO_ENDPOINT } from "@/src/modules/auth/constants/google-profile";
import { GoogleProfilePictureProvider } from "@/src/modules/auth/infrastructure/profile/google-profile-picture-provider";

const MEMBER_ID = "member-1";
const ACCESS_TOKEN = "ya29.access-token";
const PICTURE_URL = "https://lh3.googleusercontent.com/a/current=s96-c";

function createJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    json: jest.fn().mockResolvedValue(body),
    ok,
    status,
  } as unknown as Response;
}

describe("GoogleProfilePictureProvider", () => {
  it("returns the current picture from the userinfo endpoint", async () => {
    const fetchImplementation = jest
      .fn()
      .mockResolvedValue(createJsonResponse({ picture: PICTURE_URL }));
    const getAccessToken = jest.fn().mockResolvedValue(ACCESS_TOKEN);

    const provider = new GoogleProfilePictureProvider({
      fetchImplementation,
      getAccessToken,
    });

    const result = await provider.getCurrentPictureUrl(MEMBER_ID);

    expect(result).toBe(PICTURE_URL);
    expect(getAccessToken).toHaveBeenCalledWith(MEMBER_ID);
    expect(fetchImplementation).toHaveBeenCalledWith(
      GOOGLE_USERINFO_ENDPOINT,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      })
    );
  });

  it("returns null when the userinfo response has no picture", async () => {
    const provider = new GoogleProfilePictureProvider({
      fetchImplementation: jest
        .fn()
        .mockResolvedValue(createJsonResponse({ sub: "google-user-id" })),
      getAccessToken: jest.fn().mockResolvedValue(ACCESS_TOKEN),
    });

    expect(await provider.getCurrentPictureUrl(MEMBER_ID)).toBeNull();
  });

  it("returns null when no access token is available", async () => {
    const fetchImplementation = jest.fn();
    const provider = new GoogleProfilePictureProvider({
      fetchImplementation,
      getAccessToken: jest.fn().mockResolvedValue(null),
    });

    expect(await provider.getCurrentPictureUrl(MEMBER_ID)).toBeNull();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("throws when the userinfo request fails", async () => {
    const provider = new GoogleProfilePictureProvider({
      fetchImplementation: jest
        .fn()
        .mockResolvedValue(createJsonResponse({}, false, 401)),
      getAccessToken: jest.fn().mockResolvedValue(ACCESS_TOKEN),
    });

    await expect(provider.getCurrentPictureUrl(MEMBER_ID)).rejects.toThrow();
  });
});
