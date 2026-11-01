/** Owns upload, explicit selection, recovery and private download UI behavior. @module allowlist-import-browser-constants */
export const ALLOWLIST_IMPORT_SETTINGS_SEGMENT = "academia/admissions/allowlist/imports";
export const ALLOWLIST_IMPORT_STORAGE_PREFIX = "tutribu-allowlist-import";
export const ALLOWLIST_IMPORT_FILE_NAME_CHARACTERS = 255;
export const ALLOWLIST_IMPORT_DOWNLOAD_RETENTION_MS = 30_000;
export const ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT = 50;
export const ALLOWLIST_IMPORT_FILE_ACCEPT = ".csv,text/csv";
/** Zero-based steps of the guided import: upload the file, review the preview and its errors, confirm and import. */
export const ALLOWLIST_IMPORT_STEP = { upload: 0, review: 1, confirm: 2 } as const;
/** The import write the leader pressed: only that control shows progress while the other writes stay disabled. */
export type AllowlistImportWriteAction = "preview" | "confirm" | "resume" | "reconcile";
/** Resuming pending rows and reconciling earlier confirmations replay a preserved original, unlike a fresh confirmation. */
export const ALLOWLIST_IMPORT_WRITE_ACTION = { preview: "preview", confirm: "confirm", resume: "resume", reconcile: "reconcile" } as const satisfies Record<AllowlistImportWriteAction, AllowlistImportWriteAction>;
export const ALLOWLIST_IMPORT_FILE_NAME = { template: "allowlist-import-template.csv", report: "allowlist-import-report.csv" } as const;
export const ALLOWLIST_IMPORT_BROWSER_PATH = { imports: "allowlist/imports", template: "template", report: "report", confirm: "confirm", policy: "policy" } as const;
export const ALLOWLIST_IMPORT_BROWSER_COPY = {
  checking: "Comprobando acceso…", reading: "Consultando la importación…", uploading: "Leyendo el archivo…", previewing: "Guardando la vista previa…", confirming: "Confirmando las filas seleccionadas…",
  file: "Elegí un CSV válido en UTF-8, con identity,display_name, hasta 10.000 filas y 5 MiB.", confirmation: "Confirmá el paso antes de continuar.", selection: "Elegí al menos una fila válida pendiente.",
  previewed: "La vista previa está lista. Todavía no se agregó ninguna entrada.", confirmed: "La confirmación terminó. Revisá los resultados de cada fila.", partial: "Hay resultados guardados y filas pendientes. Consultá la operación original antes de reanudar.",
  uncertain: "La respuesta no quedó confirmada. Conservamos el borrador y la referencia; consultá la operación original antes de continuar.", absent: "La operación todavía no aparece registrada. Podés consultarla otra vez o descartarla; el archivo y la selección se conservan.", discarded: "Descartamos la operación sin registrar. Revisá el archivo o la selección y confirmá de nuevo.", started: "La operación original sigue en proceso. Consultá el progreso actual; sólo se pueden retomar filas sin resultado.",
  conflict: "La importación cambió. Conservamos tu selección: consultá el progreso actual y confirmá nuevamente las filas pendientes.", policyConflict: "La configuración cambió. Conservamos el archivo: consultá la configuración actual antes de crear otra vista previa.",
  storage: "No pudimos conservar este borrador en el navegador. Revisá el espacio disponible antes de continuar.", account: "La cuenta o el acceso cambió. Volvé a cargar esta página para continuar.",
  noPolicy: "La importación usa el tipo de contacto de las reglas de admisión. Guardalas primero y después importá el CSV.", noPolicyTitle: "Primero guardá las reglas de admisión", noPolicyAction: "Ir a Reglas", expired: "La vista previa venció. Elegí nuevamente el archivo para preparar otra importación.", previewUnavailable: "Esta vista previa ya no se puede confirmar. Creá una vista previa nueva con el mismo archivo para continuar.",
  downloaded: "Se preparó la descarga privada.", empty: "El archivo no contiene filas de datos. Elegí otro CSV para importar.",
  historical: "La operación original quedó confirmada. Sus filas temporales ya no están disponibles; podés elegir otro archivo sin repetir esa escritura.",
  currentReadFailed: "La operación original quedó confirmada. No pudimos consultar el progreso actual; volvé a consultarlo antes de confirmar otro cambio.",
  missingDraft: "El archivo local ya no está disponible. Conservamos las referencias de operaciones; consultá su resultado antes de elegir otro archivo.",
  fileRequired: "Elegí un archivo CSV para continuar.", previewConfirmRequired: "Marcá la confirmación para crear la vista previa.", selectionRequired: "Elegí al menos una fila válida para continuar.",
  importConfirmRequired: "Marcá la confirmación para importar las filas elegidas.", pendingBlocked: "Hay una confirmación anterior sin resultado. Consultá la operación original antes de seguir.", pendingStepBlocked: "Primero consultá la operación original.",
  conflictBlocked: "Consultá el progreso actual antes de importar.", policyConflictBlocked: "Consultá la configuración actual antes de crear otra vista previa.", finished: "Esta importación terminó. Elegí otro archivo para importar más contactos.",
  platformBlocked: "La plataforma no puede proteger esta operación por ahora.", platformConsequence: "Mientras tanto no se pueden crear vistas previas ni importar filas. Podés consultar el progreso y descargar el reporte.",
} as const;
