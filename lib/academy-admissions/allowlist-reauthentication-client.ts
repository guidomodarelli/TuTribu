"use client";
/** Exposes the shared own global intent creator to the list workflow without invoking OAuth or granting authority. @module allowlist-reauthentication-client */
import { createReauthenticationIntentBrowserClient } from "@/src/modules/auth/infrastructure/reauthentication-intent-browser-client";
export const allowlistReauthenticationClient = createReauthenticationIntentBrowserClient();
