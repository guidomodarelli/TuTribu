/** Wires the private personal-preview owner without a membership layout or mutation access. @module personal-invitation-preview-route */
import { createPersonalInvitationRequestModule } from "@/src/modules/setup";
import { createPersonalInvitationPreviewHandler } from "@/src/modules/academy-admissions/infrastructure/api/personal-invitation-preview-handler";

/** Reads own preview only; every response is no-store/no-referrer and every diagnostic uses a fixed template. */
export const GET = createPersonalInvitationPreviewHandler(createPersonalInvitationRequestModule);
