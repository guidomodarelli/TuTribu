# Verificación integral de avisos, lotes y mantenimiento

## Estado y procedencia

La auditoría conserva los seis escenarios de US8 y el alcance completo de T176–T191. El inventario actual es **182 tareas completas, 30 pendientes y 212 totales**, con **71 temáticas aprobadas**. Este documento registra el cierre del modelo T180 y señala las verificaciones que siguen en curso; las demás casillas y los gates operativos conservan sus requisitos.

El código de producto de esta cohorte corresponde a `ff227a521f3d9bcf16b24799459aa87f643bdae8`. El checkpoint `2d688865f8d6606bbd4642dadd900ee6f80a1b2d` agrega el ensayo de caída y su evidencia. La corrección del oráculo de refresco de navegador tiene su repetición funcional completa, detallada abajo.

El checkpoint `b49dcf1c43eb79084bbc80d5232b649161cc5992` guarda esa corrección y catorce ajustes de estado en las dos arquitecturas. Su revisión del checkpoint y de T185–T187 terminó con cero hallazgos accionables y 72 inputs estables; distingue integración alcanzable de los ensayos operativos pendientes. SHA256 del dictamen: `a18dd55b413f32cc11049d71a4a096872f16816171bf45165912fedd1fcc8d09`.

El [CI exacto de `2d688865`](https://github.com/guidomodarelli/TuTribu/actions/runs/39018974323) terminó aprobado: 551 archivos y 5.934 casos aprobados, con 316 archivos y 880 casos omitidos, además de lint, tipos de producto y tests, y build de 56 páginas. El ensayo Native agregado conserva su ejecución independiente; las omisiones de CI no lo acreditan ni sustituyen las cohortes funcionales.

El [CI exacto de `b49dcf1c`](https://github.com/guidomodarelli/TuTribu/actions/runs/39021410830) también terminó aprobado, con los mismos 551 archivos y 5.934 casos aprobados, 316 archivos y 880 casos omitidos, lint, ambos controles de tipos y build de 56 páginas. Las dos ejecuciones se conservan como checkpoints independientes y no se suman como casos distintos.

## Matriz de los seis escenarios

| Criterio íntegro | Recorrido y owners | Pruebas y estado actual |
| --- | --- | --- |
| US-08-AC-01: bandeja y avisos internos disponibles con correo externo apagado | El writer de obligaciones se ejecuta en la transacción de admisión; el inbox y la consulta propia mantienen su autorización independiente del proveedor. | [Obligaciones internas](admission-notification-obligation-writer.md), [almacenamiento de grupos](admission-notification-group-storage.md) y [refresco contextual](admission-contextual-refresh.md). Las pruebas locales actuales, los cuatro recorridos Native de navegador y la repetición SQL de obligaciones y almacenamiento aprobaron. |
| US-08-AC-02: resumen según preferencia, sin correo adicional por reintentos | Preferencia propia y habilitación separadas; selección de fuentes, checkpoint, preparación del grupo completo y dispatcher con el original durable. | [Preparación de grupos](admission-notification-group-preparation.md) y [productor compuesto](admission-notification-producer.md). Las políticas y casos de uso actuales aprobaron, junto con los Native de preferencias, preparación, autoridad y productor. Las cohortes no sustituyen la matriz integral de variantes ni los gates operativos. |
| US-08-AC-03: una caída del proveedor conserva presentación o resolución y la obligación con reintentos acotados | El evento y la obligación se confirman antes del transporte; la persistencia de entrega conserva el original, marker, consumo e incertidumbre. | El [nuevo ensayo de caída y recomposición](admission-notification-outage-restart.md) aprobó con una solicitud pendiente y un único POST controlado. Ese caso no sustituye la variante de resolución ni los demás escenarios. |
| US-08-AC-04: lote explícito de hasta cincuenta con revalidación y resultados por fila | Caso de uso de lote, writer DB-only, ledger y ruta de decisiones; la UI conserva selección, confirmación y progreso. | [Contrato HTTP](batch-decisions-http.md), [elegibilidad](batch-decisions-eligibility.md) y [bandeja documentada](batch-decisions-manual.md). Los nueve casos actuales del caso de uso y dieciocho del componente aprobaron. Los cinco Native de atomicidad aprobaron en la cohorte SQL; el caso HTTP aprobó por separado con el servidor real. |
| US-08-AC-05: abrir un enlace no decide y el rol se comprueba nuevamente | El contenido externo proyecta un enlace autenticado de consulta; los guards de grupo y los writers consultan la autoridad vigente. | Los trece casos actuales de contenido externo y veintitrés de la política de autoridad aprobaron. Los cuatro Native de autoridad y disponibilidad del grupo actual también aprobaron en la cohorte SQL. |
| US-08-AC-06: ingreso automático visible en actividad y métricas, sin revisión manual por defecto | El writer automático registra aprobación; el audience de revisión corresponde a pendiente o recordatorio. La consulta de actividad conserva su recorrido autorizado. | [Actividad y uso](admission-activity-usage-baseline.md). Los seis casos actuales de audience aprobaron. El contraste integral con el ingreso automático y su proyección conserva su comprobación propia; no se infiere sólo de la política de audience. |

Cada fila conserva las variantes, límites y requisitos normativos del spec. La composición de varios owners no convierte una prueba parcial en el recorrido integral de esa fila.

## Cohortes actuales

### Dominio, aplicación, componentes y hooks

La ejecución local sobre `2d688865` terminó con **22 archivos completos, 296 casos aprobados, cero fallidos y cero omitidos o sin ejecutar**. Los **3.603 inputs** conservaron sus hashes durante la ejecución. Incluye dominio y aplicación de notificaciones, caso de uso de lote, mantenimiento, preferencias, componentes de lotes y refresco visible.

Recibos privados: `.git/codex-us8-local-core-target.json`, `.git/codex-us8-local-core-outcome.json`, `.git/codex-us8-local-core-results.json` y su log. Esta ejecución usa entorno sintético cerrado, sin reenviar las credenciales de la conexión original.

La revisión de alcance de T180/T181 inspeccionó sus dieciocho cláusulas y las cadenas actuales, con **337 inputs estables** y **cero brechas de código verificadas**. Contrastó también los 2.087 inputs de runtime del Native de caída y de la cohorte local con sus fuentes actuales, sin diferencias. El dictamen no cierra tareas ni certifica operaciones; conserva separadas las pruebas históricas cuando cambiaron dependencias transitivas. SHA256 del dictamen privado: `028b7e31a95d7b6dd334b0daefff504fb942b6579ee207f6a28701b39d94f265`.

### Cierre del modelo T180

El cierre conserva íntegra su descripción, incluidas ambas restricciones. Los tipos y políticas privados están conectados al writer transaccional y a los owners de preparación, autorización y consulta; no se infiere implementación de tipos aislados. La cobertura actual del modelo se contrasta así:

| Contrato del modelo | Código y recorrido alcanzable | Evidencia actual |
| --- | --- | --- |
| Evento, cuenta, recurso, audience, dedupe y metadata mínima; obligación con el hecho e interno independiente de correo y membresía | `domain/entities/admission-notification.ts`, política de audience, writer de obligaciones dentro de la transacción de admisión y consultas autorizadas del inbox/solicitud propia. | Seis casos locales de audience, siete Native de almacenamiento del inbox y cuatro recorridos Native con presentación y resolución reales sin driver externo. La conservación posterior al fallo tiene el Native de caída independiente. |
| Defaults y preferencias individual/agrupado/diario/omitido; cinco minutos, 09:00 y zona; cortes que excluyen el pasado | Entidad y política de preferencias, política de grupos y port de calendario nativo. La capacidad y habilitación permanecen independientes de la elección personal. | Diecinueve casos locales de preferencia, veintisiete de grupos, ocho de sus casos de uso, tres Native de habilitación y el Native de calendario con sus límites de zona. La persistencia de preferencias conserva su repetición propia en T181. |
| Correo actual confiable, capacidad probada, manifest e intent completos, revalidación y detención por rol/preferencia/recurso; plazo original de hasta 24 h | Políticas de candidato, manifest, contenido y autoridad; readers privados, preparación y guard del grupo completo en el marker y antes de abrir el recurso. | Cuarenta y un casos locales de confianza, veintitrés de autoridad, trece de contenido, tres Native del correo actual y el Native de caída que conserva identidad, grupo, plazo e incertidumbre sin rePOST. |
| Recordatorio lógico único a tres días; contenido sin notas internas; consulta autenticada pasiva; diseño visible de quince segundos e invalidación propia | Política de recordatorio y primitiva única; proyección del contenido; hooks de contexto/centro y contenedores autorizados. | Tres Native de recordatorios, los trece casos de contenido, veintitrés casos locales de los dos hooks y la matriz Native completa de ambos motores a 390/1280. |

Los casos locales de esta tabla pertenecen a la cohorte de 296 y los Native de almacenamiento/calendario/correo/recordatorios a la de diecisiete; no se suman de nuevo ni se presentan todos los 296 como exclusivos de T180. El modelo mantiene las restricciones de transacción, contenido mínimo, clocks y ausencia de autoridad durable de envío. La medición de p95 y el scheduler saludable se exigen antes de activar; su falta no se convierte en una supuesta carencia del modelo ni se certifica con estas pruebas.

Este cierre corresponde a T180. T181 conserva el artefacto de persistencia y su repetición SQL; T176–T179, T183–T191 y los gates conservan sus propios criterios completos. Las comprobaciones de fallos por resolución, la matriz integral de US8 y el driver operativo no se sustituyen por el cierre del modelo.

### PostgreSQL real

La primera cohorte de catorce archivos se detuvo en elegibilidad: dos casos aprobados y uno fallido al no poder confirmar la retirada de su rama. Los trece archivos restantes no se ejecutaron por el límite de detención del runner. No se cuentan como aprobados ni como omisiones elegidas.

Después de consumir ese productor, se verificaron la identidad exacta, el parent y el estado de su única rama propia; su retirada posterior quedó confirmada. El tercer caso de elegibilidad aprobó en una cohorte independiente, con los otros dos fuera del filtro y **3.601 inputs estables**. Los dos primeros casos conservan sus recibos originales; el fallo de limpieza también permanece registrado.

La cohorte de los trece archivos restantes terminó con **doce archivos completos, veinticinco casos aprobados, cero fallidos y un caso omitido**, con **3.601 inputs estables**. El único archivo omitido fue `admission-batch-http.test.ts`: requiere además la bandera de navegador porque arranca el servidor real. Su omisión permanece registrada en `sql-remaining-results.json`; no se cuenta entre los doce archivos completos.

Ese caso HTTP se ejecutó después en la cohorte independiente `native-http-recovery`, con ambas banderas habilitadas y keyrings sintéticos generados en memoria para su propio servidor. Terminó con **un archivo completo y un caso aprobado, cero fallidos y cero omitidos o sin ejecutar**, con **3.601 inputs estables**. Comprueba POST y GET originales, recuperación sin otra decisión y revalidación de roles y sesiones a través del servidor real. No se reescribe la omisión anterior ni se suma como una repetición aprobada de aquella cohorte.

Los targets, outcomes, resultados y logs de `sql-remaining` y `native-http-recovery` se conservan separados bajo `.git/us8-fd20dd9d/`. El ensayo de caída tiene su Native independiente, descrito en el documento enlazado.

La revisión de los recibos históricos identificó cambios transitivos de actor, schema/journal y fixtures frente a las pruebas originales. Se añadió por ello una cohorte independiente `model-storage-current`, con los cinco archivos no incluidos en la anterior: recordatorios, calendario, correo confiable actual, almacenamiento privado del inbox y habilitación de correo. Terminó con **cinco archivos completos y diecisiete casos aprobados, cero fallidos y cero omitidos o sin ejecutar**, con **3.601 inputs estables**. No repite los trece archivos ni atribuye un resultado actual a los recibos históricos. Los recibos `model-storage-current-target.json`, `model-storage-current-outcome.json`, `model-storage-current-results.json` y su log están bajo `.git/us8-fd20dd9d/`.

### Navegador con build real

El build aislado de Next.js terminó con 56 páginas y **3.601 inputs estables**. La primera ejecución aprobó Chromium390 y falló en Chromium1280 al elegir un GET periódico posteriormente sustituido por la revisión de la acción propia; los otros dos casos no se ejecutaron. La corrección selecciona la última lectura de la misma ventana original de tres segundos y sigue exigiendo que finalice sin cancelación y con respuesta correcta.

La segunda ejecución se detuvo preparando el solicitante, antes de abrir la página; no entregó SQLSTATE o constraint utilizables. Se conservaron ese fallo y sus artefactos. Una consulta mínima posterior con `pg` ejecutó las mismas inserciones de usuario y sesión, revirtió la transacción y eliminó su rama propia. La preparación completa y la misma inserción también terminaron después en un diagnóstico separado, con retirada confirmada de su rama. Ambos diagnósticos pasaron y no identifican por sí solos la causa original ni acreditan un escenario de US8.

La tercera ejecución completa de Chromium/WebKit a 390/1280 terminó con **cuatro casos aprobados, cero fallidos y cero omitidos o sin ejecutar**, con **3.601 inputs estables** y sus cuatro ramas retiradas por la fixture. Usa el mismo build de producto: el único cambio respecto a sus inputs de build es el oráculo del ensayo. Cada recorrido verifica aparición interna, conservación de datos ante un fallo recuperable, foco nativo, pausa y reanudación, selección vigente, decisión propia y conciliación inmediata sin recarga completa. La solicitud propia termina su consulta periódica al llegar a un estado final. No se atribuye este resultado a las cohortes anteriores ni se suman sus repeticiones.

Los recibos actuales son `browser-target.json`, `browser-outcome.json`, `browser-results.json`, su log y los cuatro `*-result.json` de `browser-artifacts/`, bajo `.git/us8-fd20dd9d/`. Los artefactos describen foco real de navegador; no acreditan la visibilidad física de una pestaña ni un percentil operativo. La política de visibilidad conserva además sus casos locales actuales.

## Documentos y navegación

Las dos arquitecturas corrigen catorce descripciones que aún presentaban productores, preparación, recuperación o mantenimiento integrados como trabajo sin implementar. El manual interno corrige cinco frases del mismo alcance y aclara la cadencia especial de admisión. La activación por entorno, el monitoreo operativo y las mediciones permanecen pendientes.

La trazabilidad del manual y de sus dos índices apunta a `b49dcf1c`. Conserva los 278, 209 y 197 paths previos de cada documento, el contenido posterior a las correcciones y los saltos LF; el recorder sólo modifica sus metas y pies de fuente. La verificación final termina con **veinte vistas, cuatro recorridos y 220 destinos locales comprobados**, en Chromium/WebKit a 390/1280, sin errores JavaScript ni desbordes. Los cinco inputs permanecieron estables. El verificador usa los IDs reales del documento abierto para incluir las referencias que el glosario genera en runtime; no exige que esas referencias existan literalmente en el archivo HTML.

`check-manual.mjs` termina con cero errores en el manual interno y el índice detallado. Conserva dos advertencias conocidas: documento local sin URL de publicación y ausencia de catálogo central de traducciones para contrastar textos citados. Las frases modificadas son explicación del estado y de límites; no añaden textos citados de la UI. Los únicos hosts adicionales admitidos son las atribuciones existentes de las fuentes (`scripts.sil.org` y `www.github.com`). El diseño canónico está en CRLF y los manuales en LF: una copia con sólo esa normalización evita el aviso falso de navegación distinta; el código de navegación coincide completo después de normalizar y permanece sin cambios.

Recibos privados: `.git/codex-us8-doc-copy-updates-result.json`, `.git/codex-us8-manual-source-proof.json`, `.git/codex-us8-manual-final-static-result.json` y `.git/codex-us8-final-docs-qa-result.json`. Los ensayos anteriores de encabezado/glosario se conservan separados de esta QA aprobada; no se modificó producto para satisfacer esos supuestos del verificador temporal. Las capturas y esquemas existentes conservan su procedencia.

## Driver, latencias y gates

La [integración de disparadores](admission-maintenance-trigger.md) conserva su build OpenNext real, ejecuciones de Worker con configuración cerrada y los 48 casos distintos aprobados en Windows y Linux. La variante optativa permite el scheduled por minuto al activar ese target; la configuración base continúa apagada. El catch-up HTTP requiere configuración completa y distingue una ejecución ocupada o fallida de un recorrido confirmado.

No se ha activado ni medido aquí un driver frecuente saludable. **SC-015, RG-08 y OG-05 siguen pendientes** de infraestructura, capacidad y mediciones reales: disponibilidad hacia inbox/lista/avisos p95 menor a treinta segundos y cierre de ventana hacia aceptación del agrupado dentro de cinco minutos. Un cronfile, el workflow, un 200 aislado o el transporte controlado no acreditan esos objetivos.

OG-03 y OG-04 conservan los ensayos reales expresamente autorizados y los límites originales del piloto. No hubo nuevos mensajes reales, despliegue ni migración productiva en estas cohortes. Después de terminar todos los productores Native, incluido el HTTP independiente, Neon confirmó la conservación de las tres ramas originales o ajenas y la ausencia de ramas temporales propias. El recibo privado final es `.git/codex-us8-http-neon-final.json`; el snapshot anterior de las cohortes SQL se conserva separado.
