const IN_APP_BROWSER_USER_AGENT_TOKENS = [
  "MercadoPago",
  "MercadoLibre",
  "MLWebKit",
  "FBAN",
  "FBAV",
  "Instagram",
  "Line/",
  "MicroMessenger",
  "Twitter",
] as const;

const IOS_DEVICE_TOKENS = ["iPhone", "iPad", "iPod"] as const;

const SAFARI_USER_AGENT_TOKEN = "Safari/";
const IOS_MOBILE_USER_AGENT_TOKEN = "Mobile/";
const MERCADO_PAGO_USER_AGENT_TOKENS = [
  "MercadoPago",
  "MercadoLibre",
  "MLWebKit",
] as const;

export type InAppBrowserDetectionResult = {
  isInAppBrowser: boolean;
  isIos: boolean;
  isMercadoPago: boolean;
};

export function detectInAppBrowser(
  userAgent: string | null | undefined
): InAppBrowserDetectionResult {
  if (!userAgent) {
    return { isInAppBrowser: false, isIos: false, isMercadoPago: false };
  }

  const isIos = IOS_DEVICE_TOKENS.some((token) => userAgent.includes(token));
  const isMercadoPago = MERCADO_PAGO_USER_AGENT_TOKENS.some((token) =>
    userAgent.includes(token)
  );
  const hasInAppToken = IN_APP_BROWSER_USER_AGENT_TOKENS.some((token) =>
    userAgent.includes(token)
  );
  const isIosWebView =
    isIos &&
    userAgent.includes(IOS_MOBILE_USER_AGENT_TOKEN) &&
    !userAgent.includes(SAFARI_USER_AGENT_TOKEN);

  return {
    isInAppBrowser: hasInAppToken || isIosWebView,
    isIos,
    isMercadoPago,
  };
}
