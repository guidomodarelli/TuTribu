import { detectInAppBrowser } from "@/src/modules/shared/infrastructure/http/in-app-browser-detection";

const SAFARI_IOS_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const CHROME_DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CHROME_ANDROID_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const MERCADO_PAGO_IOS_WEBVIEW_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MercadoPago/12.34.5";
const GENERIC_IOS_WEBVIEW_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const INSTAGRAM_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0";

describe("detectInAppBrowser", () => {
  it("returns no detection when the user agent is missing", () => {
    expect(detectInAppBrowser(null)).toEqual({
      isInAppBrowser: false,
      isIos: false,
      isMercadoPago: false,
    });
  });

  it("identifies Safari on iOS as a regular browser", () => {
    expect(detectInAppBrowser(SAFARI_IOS_USER_AGENT)).toEqual({
      isInAppBrowser: false,
      isIos: true,
      isMercadoPago: false,
    });
  });

  it("identifies desktop Chrome as a regular browser", () => {
    expect(detectInAppBrowser(CHROME_DESKTOP_USER_AGENT)).toEqual({
      isInAppBrowser: false,
      isIos: false,
      isMercadoPago: false,
    });
  });

  it("identifies Android Chrome as a regular browser", () => {
    expect(detectInAppBrowser(CHROME_ANDROID_USER_AGENT)).toEqual({
      isInAppBrowser: false,
      isIos: false,
      isMercadoPago: false,
    });
  });

  it("flags the Mercado Pago iOS in-app browser", () => {
    expect(detectInAppBrowser(MERCADO_PAGO_IOS_WEBVIEW_USER_AGENT)).toEqual({
      isInAppBrowser: true,
      isIos: true,
      isMercadoPago: true,
    });
  });

  it("flags a generic iOS WKWebView with no Safari token", () => {
    expect(detectInAppBrowser(GENERIC_IOS_WEBVIEW_USER_AGENT)).toEqual({
      isInAppBrowser: true,
      isIos: true,
      isMercadoPago: false,
    });
  });

  it("flags the Instagram in-app browser", () => {
    expect(detectInAppBrowser(INSTAGRAM_USER_AGENT)).toEqual({
      isInAppBrowser: true,
      isIos: true,
      isMercadoPago: false,
    });
  });
});
