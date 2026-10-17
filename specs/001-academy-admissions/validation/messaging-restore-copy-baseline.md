# Copia aislada para el ensayo de restauración

## Alcance de este avance

Se prepara exclusivamente la infraestructura de pruebas de **T199** sobre `1e59fbf6dde85ed03ee26e940251c8c30f381f48`. No cambia ninguna casilla: **196 tareas completas, 16 pendientes y 212 totales**, con **71 temáticas aprobadas**. T199 conserva pendiente el ensayo de secretos, outbox, pruebas y admisión; T201, T203 y OG-02 mantienen sus condiciones originales.

`withRestorableCopy` crea una hija única del padre sintético propio y expone solamente transacciones protegidas, metadata segura y una restauración desde ese padre. La copia no recibe un API de migración, seed ni servidor. La capacidad administrativa y las URI permanecen privadas en el arnés. El padre debe conservar su checkpoint durante el callback.

## Controles y ejecución real

- El padre y la hija se comprueban por ID, nombre único, parentesco y condición no predeterminada. Un prefijo no acredita propiedad. Se rechazan un origen que pasó a ser predeterminado, trabajo SQL activo, un servidor activo o una copia con descendientes.
- La mutación de creación/restauración no se repite automáticamente. La incertidumbre de creación conserva su identidad y las causas de creación y conciliación. Sólo se observan operaciones por GET, con plazo limitado y estados terminales explícitos.
- Antes de restaurar se cierra el pool de la hija. Después se obtiene una conexión nueva y se comprueba que el rol copiado carece de privilegios de superusuario y bypass de RLS. La limpieza retira únicamente la hija exacta y confirma su ausencia antes de terminar.
- El Native ejecutó **dos archivos, ocho casos aprobados, cero fallos y cero omitidos**, con **3.614 inputs estables**. La fila sintética modificada en la hija volvió al valor del padre mediante una restauración real. El contexto y el rol sin bypass siguieron operativos. Esta prueba no demuestra todavía seguridad de secretos ni admisión después de un restore.
- La observación posterior confirmó que permanecían únicamente las tres ramas originales o ajenas, con **cero ramas propias restantes y cero desconocidas**. No se ejecutó SQL ni se restauró ninguna rama original, piloto o productiva.

## Revisión y validación posterior

La revisión Codex encontró un único P3: tres identificadores del pool y del recibo debían residir en el módulo de constantes existente. Se trasladaron conservando sus valores. Después pasaron cinco casos locales; tres casos SQL quedaron omitidos por ausencia de su flag, además de tipos de tests, lint focal y comprobación del diff. El Native de ocho casos conserva carácter histórico anterior a esa extracción mecánica; no se atribuye a hashes nuevos.

La segunda revisión cerró con cero hallazgos accionables y cuatro fuentes estables. El dictamen privado final tiene SHA256 `a36bee336b42bf4dfde4d602fdcbba170bb9c94c38430cc0dd47b4537e596513`. El recibo Native consolidado conserva SHA256 `22c0eae4c082908b45d2a6308434ff55a9c85dd252f35c1c305b67b7d9fd9e54`; el inventario final de ramas, `04de22afd16357e8720017bb729c1d1569666bc6930e959f684cc7d3358980cb`.

## Trabajo pendiente

El archivo `messaging-restore-safety.test.ts` y los cambios funcionales de recuperación se validan por separado. El cierre de T199 exige datos sensibles reales sintéticos y Web Crypto nativo, filas retiradas y restauradas, drivers cerrados, configuración externa fuera del snapshot y rechazo de secretos, envíos y pruebas anteriores hasta una conexión, diagnóstico y política vigentes. Este avance no declara esos resultados, no modifica hosting ni despliega la aplicación.
