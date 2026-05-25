export const WHATSAPP_VALIDATION_MESSAGE = {
  invalidPhone:
    "Ingresá un número válido en formato internacional (ej.: +54 9 11 1234 5678).",
  missingPhone:
    "Completá el teléfono de WhatsApp para guardar ese botón.",
} as const;

export const WHATSAPP_PHONE_NON_DIGIT_PATTERN = /\D/g;
