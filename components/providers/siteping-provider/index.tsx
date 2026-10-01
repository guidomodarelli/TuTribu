"use client";

import { useEffect, useState } from "react";
import { toast } from "beez-ui";
import type { BeezpingConfig, BeezpingInstance } from "@beezping/widget";
import { SITEPING_API_ENDPOINT, SITEPING_IDENTITY_ENDPOINT } from "@/src/modules/siteping/constants/siteping";
import type { SitepingIdentityResult } from "@/src/modules/siteping/application/results/siteping-feedback-result";
import { sitepingIdentityResultSchema } from "@/src/modules/siteping/infrastructure/api/dto/siteping-identity-result-schema";
import "./siteping-overlay.scss";

/** TuTribu mounts the published widget with its own authenticated backend. */
const BEEZPING_PROVIDER_CONFIG = {
  captureDiagnostics: true, deepLink: true, enableScreenshot: true,
  locale: "es", position: "bottom-right", theme: "auto",
} as const;

/** Expected identity-access rejections do not surface as dependency failures. */
const BEEZPING_IDENTITY_HTTP_STATUS = { unauthorized: 401, forbidden: 403 } as const;

/** Notifications belong to the optional reporting tools, not the page's main flow. */
const BEEZPING_PROVIDER_NOTIFICATION = {
  id: "beezping-provider",
  identityError: "No pudimos cargar las herramientas para reportar problemas.",
  widgetError: "No pudimos iniciar las herramientas para reportar problemas. Recargá la página para intentarlo nuevamente.",
} as const;

/** Loads the browser-only widget once access and the public identity are valid.
 * @param config - Identity and project returned by TuTribu's authenticated endpoint.
 * @returns No application markup; Beezping owns its isolated widget surfaces.
 */
function BeezpingWidgetMount({ config }: { config: SitepingIdentityResult }) {
  useEffect(() => {
    let isActive = true;
    let instance: BeezpingInstance | null = null;
    const options: BeezpingConfig = {
      ...BEEZPING_PROVIDER_CONFIG,
      endpoint: SITEPING_API_ENDPOINT, forceShow: config.enabled,
      identity: config.identity ?? undefined, projectName: config.projectName,
    };
    void import("@beezping/widget").then(({ initBeezping }) => {
      if (isActive) instance = initBeezping(options);
    }).catch((error: unknown) => {
      if (isActive) console.error("BeezpingProvider: widget initialization failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
      if (isActive) toast.error(BEEZPING_PROVIDER_NOTIFICATION.widgetError, { id: BEEZPING_PROVIDER_NOTIFICATION.id });
    });
    return () => { isActive = false; instance?.destroy(); };
  }, [config]);
  return null;
}

/** Mounts reporting tools only when the server grants access to the current member.
 * @returns An authorized widget or no reporting UI for an unauthorized identity.
 */
export function SitepingProvider() {
  const [identity, setIdentity] = useState<SitepingIdentityResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;
    void fetch(SITEPING_IDENTITY_ENDPOINT, { signal: controller.signal }).then(async (response) => {
      if (response.status === BEEZPING_IDENTITY_HTTP_STATUS.unauthorized || response.status === BEEZPING_IDENTITY_HTTP_STATUS.forbidden) {
        if (isActive && !controller.signal.aborted) { setIdentity(null); toast.dismiss(BEEZPING_PROVIDER_NOTIFICATION.id); }
        return;
      }
      if (!response.ok) throw new Error("BeezpingProvider: identity request failed (HTTP " + response.status + ")");
      const parsed = sitepingIdentityResultSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("BeezpingProvider: identity response does not match the public DTO", { cause: parsed.error });
      if (isActive && !controller.signal.aborted) { setIdentity(parsed.data); toast.dismiss(BEEZPING_PROVIDER_NOTIFICATION.id); }
    }).catch((error: unknown) => {
      if (!isActive || controller.signal.aborted) return;
      console.error("BeezpingProvider: identity loading failed", { endpoint: SITEPING_IDENTITY_ENDPOINT, errorName: error instanceof Error ? error.name : "UnknownError" });
      setIdentity(null);
      toast.error(BEEZPING_PROVIDER_NOTIFICATION.identityError, {
        id: BEEZPING_PROVIDER_NOTIFICATION.id,
        action: { label: "Reintentar", onClick: () => { toast.dismiss(BEEZPING_PROVIDER_NOTIFICATION.id); setAttempt((previous) => previous + 1); } },
      });
    });
    return () => { isActive = false; controller.abort(); };
  }, [attempt]);
  if (!identity?.enabled || !identity.identity) return null;
  return <BeezpingWidgetMount config={identity} />;
}
