/** Defines the safe deterministic SSR snapshot without recipient or token material. @module personal-invitation-page-state */
import type { z } from "zod";
import type { personalInvitationOverviewSchema } from "../../constants/personal-invitation-overview-schemas";
import type { AdmissionErrorCode } from "./admission-errors";
export { personalInvitationPageStateSchema } from "../../constants/personal-invitation-page";
/** Only own public data crosses from the page loader into its browser container. */
export type PersonalInvitationPageState = { kind: "ready"; preview: z.infer<typeof personalInvitationOverviewSchema>; viewerId: string | null; renderedAt: string } | { kind: "unavailable"; code: AdmissionErrorCode; message: string };
