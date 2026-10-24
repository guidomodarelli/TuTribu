/** Owns the labelled choices of the admission policy editor. @module admission-policy-options */
import { ADMISSION_CONTACT_TYPE } from "./admission-contact";
import { ADMISSION_POLICY_MODE, ADMISSION_PHONE_CHANNEL } from "./admission-policy";

/** Keeps review choices in the same order as the policy editor, each with what it means for applicants. */
export const ADMISSION_POLICY_MODE_OPTIONS = [
  { value: ADMISSION_POLICY_MODE.manualReview, label: "Revisión manual", description: "Cada persona envía una solicitud y vos decidís si la aprobás o la rechazás." },
  { value: ADMISSION_POLICY_MODE.allowlist, label: "Lista de habilitados", description: "Ingresan sin revisión las personas cuyo contacto cargaste en Habilitados." },
] as const;
/** Names the independent admission contact choices. */
export const ADMISSION_POLICY_CONTACT_OPTIONS = [
  { value: ADMISSION_CONTACT_TYPE.email, label: "Correo", description: "Cada persona se identifica con su correo electrónico." },
  { value: ADMISSION_CONTACT_TYPE.phone, label: "Teléfono", description: "Cada persona se identifica con su número de teléfono." },
] as const;
/** Names the explicit phone delivery channel choices. */
export const ADMISSION_POLICY_PHONE_CHANNEL_OPTIONS = [
  { value: ADMISSION_PHONE_CHANNEL.sms, label: "SMS" },
  { value: ADMISSION_PHONE_CHANNEL.whatsapp, label: "WhatsApp" },
] as const;
