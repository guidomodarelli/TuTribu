import { describe, it, expect } from "vitest";
import { buildExternalBrowserUrl } from "@/src/modules/shared/infrastructure/http/external-browser-link";

describe("buildExternalBrowserUrl", () => {
  it("builds an iOS Safari deep link by replacing the https scheme", () => {
    expect(
      buildExternalBrowserUrl({
        platform: "ios",
        targetHttpsUrl: "https://tutribu.example.com/matematica-pro",
      })
    ).toBe("x-safari-https://tutribu.example.com/matematica-pro");
  });

  it("preserves query strings on iOS deep links", () => {
    expect(
      buildExternalBrowserUrl({
        platform: "ios",
        targetHttpsUrl:
          "https://tutribu.example.com/matematica-pro?preapproval_id=preapproval-1",
      })
    ).toBe(
      "x-safari-https://tutribu.example.com/matematica-pro?preapproval_id=preapproval-1"
    );
  });

  it("builds an Android Google Chrome navigation deep link", () => {
    expect(
      buildExternalBrowserUrl({
        platform: "android",
        targetHttpsUrl:
          "https://tutribu.example.com/matematica-pro?preapproval_id=preapproval-1",
      })
    ).toBe(
      "googlechrome://navigate?url=https%3A%2F%2Ftutribu.example.com%2Fmatematica-pro%3Fpreapproval_id%3Dpreapproval-1"
    );
  });

  it("returns null for non https URLs to avoid leaking unexpected schemes", () => {
    expect(
      buildExternalBrowserUrl({
        platform: "ios",
        targetHttpsUrl: "http://tutribu.example.com/matematica-pro",
      })
    ).toBeNull();
    expect(
      buildExternalBrowserUrl({
        platform: "android",
        targetHttpsUrl: "ftp://tutribu.example.com/matematica-pro",
      })
    ).toBeNull();
  });
});
