/** Derives native account/contact and reads only a safe candidate for explicit resend. @module read-current-admission-challenge-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { AdmissionCurrentChallengeReader } from "../../domain/repositories/admission-current-challenge-reader";
import { normalizeAdmissionContact } from "../../domain/value-objects/admission-contact";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "../../constants/admission-contact";
import { ADMISSION_VERIFICATION_PURPOSE } from "../../constants/admission-eligibility";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { admissionCurrentChallengeSelectionSchema } from "../results/admission-current-challenge-schemas";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** The browser proposes a contact/channel, but cannot select actor, email, purpose or connection. */
export type ReadCurrentAdmissionChallengeInput = { tribeId: string; requestId: string; previousRequestId: string; expectedPolicyVersion: number; channel: "email" | "sms" | "whatsapp"; phone?: string; country?: string };

/** No dispatcher or mutation owner is reachable from this read. */
export class ReadCurrentAdmissionChallengeUseCase {
  /** @param accounts - Current native private account/session. @param reader - Owned exact-contact query, without transport. @param clock - Fresh time after identity lookup. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly reader: AdmissionCurrentChallengeReader, private readonly clock: () => Date) {}
  /** @param input - Boundary-validated proposed contact and prior request lineage. @returns Minimal current selection or a safe failure; no code is emitted. */
  async execute(input: ReadCurrentAdmissionChallengeInput) {
    try {
      const account = await this.accounts.getAuthenticatedAccount();
      if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      if (input.country && !input.phone) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const normalized = normalizeAdmissionContact(input.phone ? { type: ADMISSION_CONTACT_TYPE.phone, value: input.phone, country: input.country } : { type: ADMISSION_CONTACT_TYPE.email, value: account.normalizedEmail });
      if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid || normalized.contact.type === ADMISSION_CONTACT_TYPE.email && input.channel !== MESSAGING_PUBLIC_CHANNEL.email || normalized.contact.type === ADMISSION_CONTACT_TYPE.phone && input.channel === MESSAGING_PUBLIC_CHANNEL.email) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const result = await this.reader.readCurrent({ userId: account.userId, sessionId: account.session.id, tribeId: input.tribeId, requestId: input.requestId, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, previousRequestId: input.previousRequestId, expectedPolicyVersion: input.expectedPolicyVersion, contact: normalized.contact, channel: input.channel });
      const parsed = admissionCurrentChallengeSelectionSchema.safeParse(result);
      if (!parsed.success || parsed.data.current && (normalized.contact.type === ADMISSION_CONTACT_TYPE.email ? parsed.data.current.challenge.channel !== MESSAGING_PUBLIC_CHANNEL.email : parsed.data.current.challenge.channel === MESSAGING_PUBLIC_CHANNEL.email)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed.data };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
