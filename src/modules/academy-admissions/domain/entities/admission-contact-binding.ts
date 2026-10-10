/** Describes immutable tribe/contact ownership separately from editable list configuration. @module admission-contact-binding */
import type { AdmissionContact } from "../value-objects/admission-contact";

/** Only the presentation/proof writer creates this binding; list edits, cancellation and revocation cannot reassign it. */
export type AdmissionContactBinding = {
  id: string;
  tribeId: string;
  contact: AdmissionContact;
  ownerUserId: string;
  firstRequestId: string | null;
  firstProofId: string | null;
  evidenceSource: "base" | "local";
  createdAt: Date;
};
