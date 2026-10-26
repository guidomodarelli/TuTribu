/** Provides safe Spanish labels for own connection metadata without turning preparation into activation. @module messaging-connection-presentation */
/** Lifecycle, credential mode and capability remain separate visible facts. */
export const MESSAGING_CONNECTION_LABEL={draft:"Borrador",ready:"Preparada",active:"Activa",degraded:"Necesita atención",suspended:"Suspendida",disconnected:"Desconectada"} as const;
export const MESSAGING_CREDENTIAL_LABEL={not_validated:"Falta comprobar la credencial",valid:"Credencial comprobada",invalid:"Credencial no válida",unavailable:"No se pudo comprobar la credencial"} as const;
export const MESSAGING_CREDENTIAL_MODE_LABEL={production:"Cuenta de producción",test:"Cuenta de prueba",unknown:"Tipo de cuenta sin comprobar"} as const;
export const MESSAGING_CAPABILITY_LABEL={unprepared:"Prueba pendiente",prepared:"Canal comprobado",unavailable:"Canal no disponible"} as const;
export const MESSAGING_CHANNEL_LABEL={email:"Correo",sms:"SMS",whatsapp:"WhatsApp"} as const;
/** Guardians receive only an operational summary, never the leader's connection fields. */
export const MESSAGING_OPERATIONAL_ALERT_LABEL={not_configured:"La mensajería todavía no está configurada.",attention_required:"La mensajería necesita atención.",available:"La mensajería está disponible."} as const;
