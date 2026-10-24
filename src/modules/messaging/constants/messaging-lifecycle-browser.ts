/** Names local lifecycle transport paths and safe operational UI copy. @module messaging-lifecycle-browser-constants */
export const MESSAGING_LIFECYCLE_BROWSER_PATH={suspend:"suspend",disconnect:"disconnect"} as const;
export const MESSAGING_LIFECYCLE_UI_COPY={stopping:"Suspendiendo los nuevos envíos de esta conexión…",retiring:"Comprobando dependencias y retirando la conexión…",stopped:"La conexión quedó suspendida. Los mensajes ya aceptados pueden continuar y conservan su consumo.",compromised:"La conexión quedó suspendida por sospecha de compromiso. Las pruebas afectadas de solicitudes pendientes requieren recomprobación.",retired:"La conexión quedó desconectada. Revocar la clave en Zavu es una acción separada.",pending:"No pudimos confirmar la acción. Consultá el resultado original antes de repetir o iniciar otro cambio.",historical:"La acción original quedó confirmada. Revisá la configuración actual antes de continuar."} as const;
/** Explains which slot each lifecycle action leaves, and names the target and its impact in the confirmation. */
export const MESSAGING_LIFECYCLE_IMPACT_COPY={
  difference:"Suspender detiene los nuevos envíos, pero la conexión sigue ocupando su lugar: una candidata suspendida no se puede activar ni deja guardar otra clave. Desconectar y retirar la quita definitivamente y libera su lugar; para cambiar la clave de una candidata, retirala.",
  /** @param name - Selected connection that would be suspended. */
  activeSuspension:(name:string)=>`«${name}» es la conexión que la academia usa ahora. Mientras esté suspendida no se envían avisos ni códigos de verificación, y las solicitudes que piden comprobar el contacto no pueden avanzar.`,
  /** @param name - Selected connection that would be suspended. */
  activeSuspensionConsent:(name:string)=>`Revisé la conexión, la acción y su impacto: mientras «${name}» esté suspendida, la academia no envía avisos ni códigos de verificación.`,
  /** @param name - Candidate to retire. @param selected - Selection that stays untouched, if any. */
  candidateRetirement:(name:string,selected:string|null)=>`Se retira solo la candidata «${name}» y queda libre el lugar para guardar otra clave.${selected?` La conexión seleccionada «${selected}» no cambia.`:""}`,
  /** @param name - Connection that is both the selection and the candidate. */
  selectedRetirement:(name:string)=>`«${name}» es la conexión seleccionada de la academia. Retirarla también quita la selección: hasta activar otra no se envían avisos ni códigos de verificación.`,
  /** @param name - Connection the confirmation applies to, so the leader never confirms on the wrong one. */
  consent:(name:string)=>`Revisé la conexión, la acción y su impacto y quiero confirmar: se aplica a «${name}».`,
} as const;
/** Copy of the direct replacement of a candidate key from the Clave step. */
export const MESSAGING_KEY_REPLACEMENT_COPY={
  title:"Reemplazar la clave",
  /** @param name - Current candidate. @param credential - Visible credential state. */
  lead:(name:string,credential:string)=>`La clave de «${name}» quedó guardada como conexión candidata (${credential}). Para usar otra clave, primero retirá esta candidata.`,
  /** @param selected - Selection that stays untouched. */
  keepsSelected:(selected:string)=>`La conexión seleccionada «${selected}» no cambia: sigue enviando los avisos y códigos de la academia.`,
  noSelected:"La academia todavía no tiene otra conexión seleccionada, así que no se interrumpe ningún envío.",
  /** @param name - Candidate to retire. */
  consent:(name:string)=>`Confirmo que quiero retirar la candidata «${name}» para guardar otra clave.`,
  action:"Retirar candidata y cargar otra clave",
  credentialAction:"Reemplazar la clave",
  /** @param name - Retired candidate. */
  retired:(name:string)=>`Retiramos la candidata «${name}». Ya podés guardar otra clave.`,
} as const;
