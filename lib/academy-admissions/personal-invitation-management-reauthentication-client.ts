"use client";
/** Creates only an explicit native global confirmation intent; never starts OAuth or a product write. @module personal-invitation-management-reauthentication-client */
import { createReauthenticationIntentBrowserClient } from "@/src/modules/auth/infrastructure/reauthentication-intent-browser-client";
export const personalInvitationManagementReauthenticationClient = createReauthenticationIntentBrowserClient();
