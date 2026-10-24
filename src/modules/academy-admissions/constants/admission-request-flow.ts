/** Names the applicant's guided request flow: its modes, step order and copy. @module admission-request-flow-constants */

/** `submit` presents a new request; `apply` attaches a checked contact to a pending request. */
export type AdmissionRequestFlowMode = "submit" | "apply";
export const ADMISSION_REQUEST_FLOW_MODE = { submit: "submit", apply: "apply" } as const satisfies Record<AdmissionRequestFlowMode, AdmissionRequestFlowMode>;

/** A step of the flow; the ones present depend on the mode and on whether the academy asks for a code. */
export type AdmissionRequestFlowStep = "details" | "send" | "verify" | "finish";

/**
 * @param mode - Whether the flow submits a new request or applies a code to a pending one.
 * @param verification - Whether the academy asks for a contact code.
 * @returns The ordered steps, so a container can open one by its id.
 */
export function admissionRequestFlowSteps(mode: AdmissionRequestFlowMode, verification: boolean): AdmissionRequestFlowStep[] {
  return [...(mode === ADMISSION_REQUEST_FLOW_MODE.submit ? ["details" as const] : []), ...(verification ? ["send" as const, "verify" as const] : []), "finish"];
}

export const ADMISSION_REQUEST_FLOW_COPY = {
  submitLabel: "Solicitar ingreso a la academia", applyLabel: "Comprobar el contacto de tu solicitud",
  detailsTitle: "Tus datos", detailsDescription: "Completá los datos que van a ver los responsables de la academia.",
  sendTitle: "Enviar código", sendDescription: "Confirmá el contacto y te enviamos un código para comprobarlo.", sendAction: "Enviar código de ingreso",
  sendConfirmRequired: "Marcá la confirmación del contacto y del envío para continuar.", noCountries: "La academia todavía no tiene países habilitados para este teléfono.",
  verifyTitle: "Comprobar código", verifyDescription: "Ingresá el código que te enviamos.", verifyAction: "Comprobar código", codeMissing: "Primero enviá el código de ingreso.", resendLabel: "¿No te llegó el código?",
  submitTitle: "Enviar solicitud", submitDescription: "Revisá tus datos y confirmá la solicitud.", submitConfirmRequired: "Marcá la confirmación para enviar la solicitud.",
  applyTitle: "Aplicar a tu solicitud", applyDescription: "Sumá el contacto comprobado a tu solicitud pendiente.", applyAction: "Aplicar prueba a esta solicitud", applyReady: "El código está comprobado. Aplicalo para completar tu solicitud pendiente.",
  proofRequired: "Comprobá el código antes de enviar la solicitud.", applyProofRequired: "Comprobá el código antes de aplicarlo a tu solicitud.", proofChecked: "Código comprobado para este ingreso.",
  phoneFact: "Teléfono", whatsappFact: "WhatsApp", messageFact: "Mensaje", codeFact: "Código de contacto", codeChecked: "Comprobado", codePending: "Todavía sin comprobar", empty: "Sin completar",
} as const;
