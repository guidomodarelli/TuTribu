import { describe, it, expect } from "vitest";
import {
  InvalidMeetingUrlError,
  normalizeExternalMeetingUrl,
} from "@/src/modules/shared/domain/value-objects/external-meeting-url";

describe("external meeting URL", () => {
  it("normalizes blank meeting links to null", () => {
    expect(normalizeExternalMeetingUrl("   ")).toBeNull();
  });

  it("accepts trimmed http and https meeting links from any provider", () => {
    expect(
      normalizeExternalMeetingUrl(" https://meet.google.com/abc-defg-hij ")
    ).toBe("https://meet.google.com/abc-defg-hij");
    expect(normalizeExternalMeetingUrl("http://zoom.us/j/123456789")).toBe(
      "http://zoom.us/j/123456789"
    );
  });

  it("rejects links outside http and https", () => {
    expect(() => normalizeExternalMeetingUrl("ftp://meet.example.com/event")).toThrow(
      InvalidMeetingUrlError
    );
    expect(() => normalizeExternalMeetingUrl("not-a-url")).toThrow(
      InvalidMeetingUrlError
    );
  });
});
