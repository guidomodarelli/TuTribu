"use client";

import { useEffect, useState } from "react";
import type { SitepingConfig, SitepingInstance } from "@siteping/widget";

import {
  SITEPING_API_ENDPOINT,
  SITEPING_IDENTITY_ENDPOINT,
} from "@/src/modules/siteping/constants/siteping";
import type { SitepingIdentityResult } from "@/src/modules/siteping/application/results/siteping-feedback-result";
import { installSitepingDismissGuard } from "@/components/providers/siteping-provider/siteping-dismiss-guard";

import "./siteping-overlay.scss";

const SITEPING_PROVIDER_CONFIG = {
  captureDiagnostics: true,
  deepLink: true,
  enableScreenshot: false,
  locale: "es",
  position: "bottom-right",
  theme: "auto",
} as const;

type SitepingProviderState = SitepingIdentityResult | null;

function SitepingWidgetMount({ config }: { config: SitepingIdentityResult }) {
  useEffect(() => installSitepingDismissGuard(), []);

  useEffect(() => {
    let isMounted = true;
    let sitepingInstance: SitepingInstance | null = null;
    const sitepingConfig: SitepingConfig = {
      captureDiagnostics: SITEPING_PROVIDER_CONFIG.captureDiagnostics,
      deepLink: SITEPING_PROVIDER_CONFIG.deepLink,
      enableScreenshot: SITEPING_PROVIDER_CONFIG.enableScreenshot,
      endpoint: SITEPING_API_ENDPOINT,
      forceShow: config.enabled,
      identity: config.identity ?? undefined,
      locale: SITEPING_PROVIDER_CONFIG.locale,
      position: SITEPING_PROVIDER_CONFIG.position,
      projectName: config.projectName,
      theme: SITEPING_PROVIDER_CONFIG.theme,
    };

    import("@siteping/widget")
      .then(({ initSiteping }) => {
        if (isMounted) {
          sitepingInstance = initSiteping(sitepingConfig);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      sitepingInstance?.destroy();
    };
  }, [config]);

  return null;
}

export function SitepingProvider() {
  const [state, setState] = useState<SitepingProviderState>(null);

  useEffect(() => {
    let isCurrent = true;

    fetch(SITEPING_IDENTITY_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((identity: SitepingProviderState) => {
        if (isCurrent) {
          setState(identity);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setState(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  if (!state?.enabled || !state.identity) {
    return null;
  }

  return <SitepingWidgetMount config={state} />;
}
