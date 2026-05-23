import { VIDEO_PROVIDER } from "@/src/modules/courses/constants/courses";
import {
  InvalidVideoUrlError,
  parseExternalVideoUrl,
} from "@/src/modules/courses/domain/value-objects/external-video-url";

describe("parseExternalVideoUrl", () => {
  describe("vimeo", () => {
    it("parses a canonical vimeo URL", () => {
      expect(parseExternalVideoUrl("https://vimeo.com/123456789")).toEqual({
        externalId: "123456789",
        provider: VIDEO_PROVIDER.vimeo,
      });
    });

    it("parses a vimeo URL with the unlisted hash in the path", () => {
      expect(
        parseExternalVideoUrl("https://vimeo.com/123456789/abcdef0123")
      ).toEqual({
        externalId: "123456789:abcdef0123",
        provider: VIDEO_PROVIDER.vimeo,
      });
    });

    it("parses a player.vimeo.com URL with the h query param", () => {
      expect(
        parseExternalVideoUrl(
          "https://player.vimeo.com/video/123456789?h=abcdef0123"
        )
      ).toEqual({
        externalId: "123456789:abcdef0123",
        provider: VIDEO_PROVIDER.vimeo,
      });
    });

    it("trims surrounding whitespace", () => {
      expect(
        parseExternalVideoUrl("   https://vimeo.com/123456789  ")
      ).toEqual({
        externalId: "123456789",
        provider: VIDEO_PROVIDER.vimeo,
      });
    });
  });

  describe("wistia", () => {
    it("parses an account medias URL", () => {
      expect(
        parseExternalVideoUrl("https://acme.wistia.com/medias/abc12345xy")
      ).toEqual({
        externalId: "abc12345xy",
        provider: VIDEO_PROVIDER.wistia,
      });
    });

    it("parses a fast.wistia.net embed iframe URL", () => {
      expect(
        parseExternalVideoUrl(
          "https://fast.wistia.net/embed/iframe/abc12345xy"
        )
      ).toEqual({
        externalId: "abc12345xy",
        provider: VIDEO_PROVIDER.wistia,
      });
    });

    it("parses a fast.wistia.com embed iframe URL", () => {
      expect(
        parseExternalVideoUrl(
          "https://fast.wistia.com/embed/iframe/abc12345xy"
        )
      ).toEqual({
        externalId: "abc12345xy",
        provider: VIDEO_PROVIDER.wistia,
      });
    });

    it("rejects a wistia URL with too short an id", () => {
      expect(() =>
        parseExternalVideoUrl("https://acme.wistia.com/medias/short")
      ).toThrow(InvalidVideoUrlError);
    });
  });

  describe("loom", () => {
    it("parses a loom share URL", () => {
      expect(
        parseExternalVideoUrl(
          "https://www.loom.com/share/0123456789abcdef0123456789abcdef"
        )
      ).toEqual({
        externalId: "0123456789abcdef0123456789abcdef",
        provider: VIDEO_PROVIDER.loom,
      });
    });

    it("parses a loom embed URL", () => {
      expect(
        parseExternalVideoUrl(
          "https://www.loom.com/embed/0123456789abcdef0123456789abcdef"
        )
      ).toEqual({
        externalId: "0123456789abcdef0123456789abcdef",
        provider: VIDEO_PROVIDER.loom,
      });
    });

    it("rejects a loom URL with an id of unexpected length", () => {
      expect(() =>
        parseExternalVideoUrl("https://www.loom.com/share/abc123")
      ).toThrow(InvalidVideoUrlError);
    });
  });

  describe("youtube", () => {
    it("parses a watch URL", () => {
      expect(
        parseExternalVideoUrl(
          "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
      ).toEqual({
        externalId: "dQw4w9WgXcQ",
        provider: VIDEO_PROVIDER.youtube,
      });
    });

    it("parses a youtu.be short URL", () => {
      expect(parseExternalVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
        externalId: "dQw4w9WgXcQ",
        provider: VIDEO_PROVIDER.youtube,
      });
    });

    it("parses an embed URL", () => {
      expect(
        parseExternalVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")
      ).toEqual({
        externalId: "dQw4w9WgXcQ",
        provider: VIDEO_PROVIDER.youtube,
      });
    });

    it("parses a shorts URL", () => {
      expect(
        parseExternalVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")
      ).toEqual({
        externalId: "dQw4w9WgXcQ",
        provider: VIDEO_PROVIDER.youtube,
      });
    });

    it("rejects a youtube URL with a malformed id", () => {
      expect(() =>
        parseExternalVideoUrl("https://www.youtube.com/watch?v=short")
      ).toThrow(InvalidVideoUrlError);
    });
  });

  describe("errors", () => {
    it("rejects an empty string", () => {
      expect(() => parseExternalVideoUrl("")).toThrow(InvalidVideoUrlError);
    });

    it("rejects whitespace only", () => {
      expect(() => parseExternalVideoUrl("   ")).toThrow(InvalidVideoUrlError);
    });

    it("rejects a non-URL string", () => {
      expect(() => parseExternalVideoUrl("not-a-url")).toThrow(
        InvalidVideoUrlError
      );
    });

    it("rejects a bare numeric id (no longer supported)", () => {
      expect(() => parseExternalVideoUrl("123456789")).toThrow(
        InvalidVideoUrlError
      );
    });

    it("rejects a URL from an unsupported provider", () => {
      expect(() =>
        parseExternalVideoUrl("https://www.dailymotion.com/video/x7tgad0")
      ).toThrow(InvalidVideoUrlError);
    });
  });
});
