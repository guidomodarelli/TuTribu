# Verificación integral de avisos, lotes y mantenimiento

## Estado y procedencia

La auditoría conserva los seis escenarios de US8 y el alcance completo de T176–T191. El inventario actual es **196 tareas completas, 16 pendientes y 212 totales**, con **71 temáticas aprobadas**. Este documento registra los cierres de implementación y pruebas de T176–T191, incluida la [verificación funcional final](us8-functional-completion.md); las dieciséis tareas restantes y los gates operativos conservan sus requisitos.

El código de producto de esta cohorte corresponde a `ff227a521f3d9bcf16b24799459aa87f643bdae8`. El checkpoint `2d688865f8d6606bbd4642dadd900ee6f80a1b2d` agrega el ensayo de caída y su evidencia. La corrección del oráculo de refresco de navegador tiene su repetición funcional completa, detallada abajo.

El checkpoint `b49dcf1c43eb79084bbc80d5232b649161cc5992` guarda esa corrección y catorce ajustes de estado en las dos arquitecturas. Su revisión del checkpoint y de T185–T187 terminó con cero hallazgos accionables y 72 inputs estables; distingue integración alcanzable de los ensayos operativos pendientes. SHA256 del dictamen: `a18dd55b413f32cc11049d71a4a096872f16816171bf45165912fedd1fcc8d09`.

El [CI exacto de `2d688865`](https://github.com/guidomodarelli/TuTribu/actions/runs/39018974323) terminó aprobado: 551 archivos y 5.934 casos aprobados, con 316 archivos y 880 casos omitidos, además de lint, tipos de producto y tests, y build de 56 páginas. El ensayo Native agregado conserva su ejecución independiente; las omisiones de CI no lo acreditan ni sustituyen las cohortes funcionales.

El [CI exacto de `b49dcf1c`](https://github.com/guidomodarelli/TuTribu/actions/runs/39021410830) también terminó aprobado, con los mismos 551 archivos y 5.934 casos aprobados, 316 archivos y 880 casos omitidos, lint, ambos controles de tipos y build de 56 páginas. Las dos ejecuciones se conservan como checkpoints independientes y no se suman como casos distintos.

## Matriz de los seis escenarios

| Criterio íntegro | Recorrido y owners | Pruebas y estado actual |
| --- | --- | --- |
| US-08-AC-01: bandeja y avisos internos disponibles con correo externo apagado | El writer de obligaciones se ejecuta en la transacción de admisión; el inbox y la consulta propia mantienen su autorización independiente del proveedor. | [Obligaciones internas](admission-notification-obligation-writer.md), [almacenamiento de grupos](admission-notification-group-storage.md) y [refresco contextual](admission-contextual-refresh.md). Las pruebas locales actuales, los cuatro recorridos Native de navegador y la repetición SQL de obligaciones y almacenamiento aprobaron. |
| US-08-AC-02: resumen según preferencia, sin correo adicional por reintentos | Preferencia propia y habilitación separadas; selección de fuentes, checkpoint, preparación del grupo completo y dispatcher con el original durable. | [Preparación de grupos](admission-notification-group-preparation.md) y [productor compuesto](admission-notification-producer.md). Las políticas y casos de uso actuales aprobaron, junto con los Native de preferencias, preparación, autoridad y productor. Las cohortes no sustituyen la matriz integral de variantes ni los gates operativos. |
| US-08-AC-03: una caída del proveedor conserva presentación o resolución y la obligación con reintentos acotados | El evento y la obligación se confirman antes del transporte; la persistencia de entrega conserva el original, marker, consumo e incertidumbre. | El [ensayo de solicitud pendiente y recomposición](admission-notification-outage-restart.md) y la [variante de rechazo confirmado](admission-outcomes-and-notifications.md) aprobaron por separado. Cada uno conserva su original incierto y un único POST controlado; las demás variantes y gates mantienen sus evidencias propias. |
| US-08-AC-04: lote explícito de hasta cincuenta con revalidación y resultados por fila | Caso de uso de lote, writer DB-only, ledger y ruta de decisiones; la UI conserva selección, confirmación y progreso. | [Contrato HTTP](batch-decisions-http.md), [elegibilidad](batch-decisions-eligibility.md) y [bandeja documentada](batch-decisions-manual.md). Los nueve casos actuales del caso de uso y dieciocho del componente aprobaron. Los cinco Native de atomicidad aprobaron en la cohorte SQL; el caso HTTP aprobó por separado con el servidor real. |
| US-08-AC-05: abrir un enlace no decide y el rol se comprueba nuevamente | El contenido externo proyecta un enlace autenticado de consulta; los guards de grupo y los writers consultan la autoridad vigente. | Los trece casos actuales de contenido externo y veintitrés de la política de autoridad aprobaron. Los cuatro Native de autoridad y disponibilidad del grupo actual también aprobaron en la cohorte SQL. |
| US-08-AC-06: ingreso automático visible en actividad y métricas, sin revisión manual por defecto | El writer automático registra aprobación; el audience de revisión corresponde a pendiente o recordatorio. La consulta de actividad conserva su recorrido autorizado. | [Actividad y uso](admission-activity-usage-baseline.md), seis casos actuales de audience y el [nuevo Native de admisión automática](admission-outcomes-and-notifications.md): submit, aprobación de sistema, actividad y métricas reales, sin revisión ni entrega, y replay sin duplicados. Esta prueba de owners no se presenta como un recorrido nuevo de interfaz. |

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
| Defaults y preferencias individual/agrupado/diario/omitido; cinco minutos, 09:00 y zona; cortes que excluyen el pasado | Entidad y política de preferencias, política de grupos y port de calendario nativo. La capacidad y habilitación permanecen independientes de la elección personal. | Diecinueve casos locales de preferencia, veintisiete de grupos, ocho de sus casos de uso, tres Native de habilitación y el Native de calendario con sus límites de zona. La persistencia está acreditada en el cierre de T181. |
| Correo actual confiable, capacidad probada, manifest e intent completos, revalidación y detención por rol/preferencia/recurso; plazo original de hasta 24 h | Políticas de candidato, manifest, contenido y autoridad; readers privados, preparación y guard del grupo completo en el marker y antes de abrir el recurso. | Cuarenta y un casos locales de confianza, veintitrés de autoridad, trece de contenido, tres Native del correo actual y el Native de caída que conserva identidad, grupo, plazo e incertidumbre sin rePOST. |
| Recordatorio lógico único a tres días; contenido sin notas internas; consulta autenticada pasiva; diseño visible de quince segundos e invalidación propia | Política de recordatorio y primitiva única; proyección del contenido; hooks de contexto/centro y contenedores autorizados. | Tres Native de recordatorios, los trece casos de contenido, veintitrés casos locales de los dos hooks y la matriz Native completa de ambos motores a 390/1280. |

Los casos locales de esta tabla pertenecen a la cohorte de 296 y los Native de almacenamiento/calendario/correo/recordatorios a la de diecisiete; no se suman de nuevo ni se presentan todos los 296 como exclusivos de T180. El modelo mantiene las restricciones de transacción, contenido mínimo, clocks y ausencia de autoridad durable de envío. La medición de p95 y el scheduler saludable se exigen antes de activar; su falta no se convierte en una supuesta carencia del modelo ni se certifica con estas pruebas.

Este apartado corresponde al cierre de T180. Los owners de persistencia, lote, preferencias, productor, mantenimiento y disparadores tienen sus cierres propios a continuación; la verificación funcional tiene su cierre propio más abajo y los gates conservan sus criterios completos. El driver operativo no se sustituye por el cierre del modelo.

### Cierre de persistencia, lote y preferencias

La [auditoría de T181/T183/T184](storage-batch-settings-completion.md) acredita sus siete, nueve y ocho cláusulas originales, sin brechas ni hallazgos accionables y con 126 inputs estables. Identifica las migraciones reales y el modelo Drizzle, los owners compartidos del lote y el original durable, y la separación entre ajustes de correo, preferencias y política de admisión. Conserva las excepciones históricas de elegibilidad y HTTP; no atribuye estas tres casillas a un cronfile, un import o una entrega externa simulada.

### Cierre del productor, mantenimiento y disparadores

La [auditoría de T185/T186/T187](producer-maintenance-trigger-completion.md) acredita sus ocho, siete y cuatro cláusulas originales, sin hallazgos accionables y con 131 inputs estables. Vincula obligación/grupo/outbox, sender por propósito, siete fases privadas y disparadores portables con sus pruebas actuales y equivalencias verificadas. El build y la ejecución real de Workers conservan su configuración cerrada; no se presentan como operación saludable, activación ni mediciones de OG-05. La nueva cohorte de interfaz estaba en ejecución al registrar esa auditoría y queda fuera de su cierre.

### Cierre de pruebas de lotes, avisos y refresco

La [auditoría de T176/T177/T188](batch-notification-refresh-completion.md) acredita sus nueve, trece y nueve cláusulas originales con 315 inputs estables. Esa primera revisión dejó T178 pendiente de una repetición focal de cuota, sin identificar un defecto de producto. Ambas cohortes posteriores y el cierre de las cinco tareas restantes se registran a continuación; el dictamen inicial conserva su estado histórico y los gates mantienen sus requisitos.

### Cierre funcional de interfaz y seis AC

La [auditoría final de T178/T179/T189/T190/T191](us8-functional-completion.md) acredita sus 48 cláusulas originales y los seis AC con 387 inputs estables y cero hallazgos accionables. ui-current terminó con dos archivos completos y ocho casos aprobados, cero fallidos u omitidos, en Chromium/WebKit a 390/1280. quota-current aprobó el único caso seleccionado y conservó seis fuera del filtro: política real reducida a cero, sin llamadas SDK, intentos ni reservas y con el código/original intactos. Ambas cohortes conservaron 3.603 inputs y equivalencia de 3.081 inputs de runtime.

El [CI de 144dd842](https://github.com/guidomodarelli/TuTribu/actions/runs/39026272441) terminó aprobado: 551 archivos y 5.934 casos, con 317 archivos y 882 casos omitidos, lint, ambos chequeos de tipos y build real. Los Native conservan su evidencia independiente. La corrección del contador privado distingue un archivo de cuota de sus dos suites; no motivó otra ejecución. Los tres cierres anteriores y los cinco manuales también quedaron revalidados. SC-015/RG-08/OG-05 siguen pendientes de operación saludable.

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

### Admisión automática y resolución ante caída

La [cohorte adicional de resultados y avisos](admission-outcomes-and-notifications.md) terminó con un archivo completo y **dos casos aprobados, cero fallidos y cero omitidos**, con **3.603 inputs estables**. Comprueba admisión automática con actividad/métricas y replay, y rechazo real con caída posterior del correo y recomposición del procesador sin otro POST. Sus dos fuentes nuevas coinciden con el checkout principal; 3.081 inputs seleccionados de runtime, migraciones y pruebas son equivalentes, incluidas 190 diferencias sólo de saltos de línea. Las dos ejecuciones previas y el diagnóstico de tipos corregido permanecen registrados por separado; las repeticiones no se suman de nuevo ni se usan como cierre automático de T176/T177/T191.

## Documentos y navegación

Las dos arquitecturas corrigen catorce descripciones que aún presentaban productores, preparación, recuperación o mantenimiento integrados como trabajo sin implementar. El manual interno corrige cinco frases del mismo alcance y aclara la cadencia especial de admisión. La activación por entorno, el monitoreo operativo y las mediciones permanecen pendientes.

En aquel checkpoint, la trazabilidad del manual interno y de sus dos índices apuntaba a `b49dcf1c`, conservando sus 278, 209 y 197 paths, contenido y LF. La QA de ese momento terminó con **veinte vistas, cuatro recorridos y 220 destinos locales comprobados**, en Chromium/WebKit a 390/1280, sin errores JavaScript ni desbordes. Los cinco inputs permanecieron estables. El verificador usa los IDs reales del documento abierto para incluir las referencias que el glosario genera en runtime; no exige que esas referencias existan literalmente en el archivo HTML.

`check-manual.mjs` termina con cero errores en el manual interno y el índice detallado. Conserva dos advertencias conocidas: documento local sin URL de publicación y ausencia de catálogo central de traducciones para contrastar textos citados. Las frases modificadas son explicación del estado y de límites; no añaden textos citados de la UI. Los únicos hosts adicionales admitidos son las atribuciones existentes de las fuentes (`scripts.sil.org` y `www.github.com`). El diseño canónico está en CRLF y los manuales en LF: una copia con sólo esa normalización evita el aviso falso de navegación distinta; el código de navegación coincide completo después de normalizar y permanece sin cambios.

Recibos privados: `.git/codex-us8-doc-copy-updates-result.json`, `.git/codex-us8-manual-source-proof.json`, `.git/codex-us8-manual-final-static-result.json` y `.git/codex-us8-final-docs-qa-result.json`. Los ensayos anteriores de encabezado/glosario se conservan separados de esta QA aprobada; no se modificó producto para satisfacer esos supuestos del verificador temporal. Las capturas y esquemas existentes conservan su procedencia.

El cierre posterior actualiza las fuentes de cuatro manuales/índices y corrige un párrafo del manual específico de avisos. Las capturas, fechas y navegación permanecen intactas. La nueva QA del manual específico y los índices terminó con doce vistas, cuatro recorridos y 127 destinos locales, sin errores en ambos motores y tamaños. Los otros dos manuales conservan ocho vistas reutilizables por sus bytes originales y equivalencia de metadatos; tres documentos propietarios mantienen sus inputs ya comprobados. La [verificación final](us8-functional-completion.md) distingue estos recibos del snapshot anterior, sin sumar repeticiones.

## Driver, latencias y gates

La [integración de disparadores](admission-maintenance-trigger.md) conserva su build OpenNext real, ejecuciones de Worker con configuración cerrada y los 48 casos distintos aprobados en Windows y Linux. La variante optativa permite el scheduled por minuto al activar ese target; la configuración base continúa apagada. El catch-up HTTP requiere configuración completa y distingue una ejecución ocupada o fallida de un recorrido confirmado.

No se ha activado ni medido aquí un driver frecuente saludable. **SC-015, RG-08 y OG-05 siguen pendientes** de infraestructura, capacidad y mediciones reales: disponibilidad hacia inbox/lista/avisos p95 menor a treinta segundos y cierre de ventana hacia aceptación del agrupado dentro de cinco minutos. Un cronfile, el workflow, un 200 aislado o el transporte controlado no acreditan esos objetivos.

OG-03 y OG-04 conservan los ensayos reales expresamente autorizados y los límites originales del piloto. No hubo nuevos mensajes reales, despliegue ni migración productiva en estas cohortes. Después de terminar la cohorte adicional de resultados y avisos y las anteriores, Neon confirmó a las 10:04 UTC la conservación de las tres ramas originales o ajenas, cero temporales propias y ninguna sin clasificar. El recibo `.git/codex-us8-notification-scenarios-neon-final.json` conserva ese momento histórico. Después de terminar ui-current y quota-current, una nueva consulta a las 11:10:32 UTC confirmó las mismas tres ramas originales o ajenas, cero temporales propias y cero desconocidas; el cierre es `.git/codex-us8-ui-and-quota-neon-final.json`. No se eliminaron ramas adicionales.

## Driver activo en el piloto local (T206)

El 2026-10-19, con autorización expresa del usuario para desplegar el scheduler, se instaló el driver en el piloto local aislado (`https://dev.tutribu.app`, rama privada propia): un proceso privado ejecuta `scripts/run-admission-maintenance.mjs` una vez por minuto contra `GET /api/maintenance/admission-messaging`, sin reintentos. `CRON_SECRET` se generó al azar y vive sólo en la configuración DPAPI del piloto; el registro privado guarda únicamente hora, código de salida y duración. No se modificó `vercel.json`, Actions ni producción.

La primera invocación devolvió 200 en 44.078 ms y el driver continuó con 200 en 42.659 ms. Una consulta manual simultánea recibió 202 «Ya existe una ejecución de mantenimiento en curso», sin iniciar otra corrida. Con carga vacía (cero recordatorios, grupos y entregas), cada fase tomó entre 3,6 y 5,4 s: la duración refleja la latencia entre este host local y la base remota, sumada sobre consultas secuenciales, y no una medición de host cercano.

Esto acredita un driver autorizado en funcionamiento sobre el piloto. No mide SC-015: falta generar solicitudes y avisos reales en el piloto y medir aparición en bandeja (p95 < 30 s) y presentación de correos agrupados (≤ 5 min), lo que requiere activar la candidata, subir el cupo de avisos y crear solicitantes sintéticos, todavía sin autorizar. T206, T200/T209 y OG-05 siguen pendientes.

### Caída silenciosa y recuperación

El proceso del driver dejó de existir después de la corrida de las 12:48:27 UTC (47 corridas, todas `status:200`, entre 42 y 44 s cada una) y no volvió a escribir hasta que se relanzó a las 18:13:00 UTC; la primera corrida tras el relanzamiento completó el catch-up con 200 en 42.315 ms. El proceso no dejó ningún error: la caída no fue visible desde el driver, sólo por la ausencia de líneas nuevas. Para OG-05 esto confirma que el piloto necesita una alerta de staleness del driver (por ejemplo, la última ejecución exitosa que ya publica la vista de actividad) antes de acreditar fallo visible; el hueco de unas cinco horas y media queda registrado como ventana sin ejecuciones.

## Medición de SC-015 en el piloto local (2026-10-20)

**Resultado: SC-015 no queda acreditado.** El driver de mantenimiento no estuvo sano durante la medición: terminó incompleto en casi todas las corridas desde las 13:30Z y seguía así al cierre. Por eso ninguna observación de esta sección cumple la condición «con infraestructura sana». Además, la lista de la bandeja no garantiza el objetivo en este entorno, y ningún correo agrupado tuvo aceptación confirmada del proveedor dentro de cinco minutos del cierre de su ventana. T206, la parte SC-015 de T209 y OG-05 siguen pendientes.

### Condiciones

- **Entorno.** Es el piloto local, no el target de producción. Corre un `next start` del build del piloto, con código de producto idéntico a `6cd0b6c0`, servido por portless en `https://dev.tutribu.app` y conectado a la rama Neon privada del piloto. Las 2.411 consultas del observador, de una sentencia cada una, midieron un RTT local→Neon de 158 ms mínimo, 167 ms p50 y 187 ms p95. El desfase entre el reloj de PostgreSQL y el local fue de 22 ms.
- **Configuración.** No se tocaron la política, la conexión de Zavu ni los cupos (20 avisos y 10 códigos por día, país AR). Tampoco cambiaron la preferencia agrupada del líder ni el correo de admisión de la tribu. No se aplicaron migraciones.
- **Solicitantes.** Se crearon dieciocho cuentas sintéticas del dominio reservado `.test`, igual que en T207: con el plugin de acceso de desarrollo y el adapter real de Better Auth y Drizzle, sin fabricar filas de sesión ni cookies. Cada cuenta presentó su solicitud desde la interfaz real, con un número de WhatsApp ficticio de AR que nunca se contactó. La interfaz la sirvió un `next dev` en loopback dentro del worktree propio `sc015-pilot-measurement` (`6cd0b6c0`), con el entorno del piloto inyectado sólo en memoria y sin `CRON_SECRET`.
- **Cohortes.** Se armaron tres cohortes de seis solicitudes, una por cada ventana UTC de cinco minutos (13:30, 13:35 y 13:40). En cada ventana hubo una presentación cada 20 s a partir del segundo 10. Las dieciocho respondieron 201 con la solicitud pendiente. Entre el clic y la respuesta pasaron 9,2–21,5 s (p50 de 10,8 s), con `next dev` contra la base remota; este tramo no forma parte de SC-015.
- **Observación.** Hubo tres fuentes de datos:
  - Un observador de sólo lectura consultó PostgreSQL cada segundo para registrar la primera vez que la solicitud y el aviso interno del líder eran visibles desde otra conexión, junto con el estado de grupos y entregas.
  - En la sesión real del líder en Chrome sobre el piloto, la página de solicitudes registró cuándo aparecía cada fila, la etiqueta de la campana y la duración de cada lectura periódica.
  - El driver existente ejecutó el mantenimiento una vez por minuto, sin llamadas manuales.
- **Instante de disponibilidad.** La medición conservadora parte de `submitted_at`, que precede a la respuesta en 2,5–2,9 s (p50 de 2,6 s). También se informa la medición desde la respuesta HTTP, que es posterior al commit.

### Aparición en bandeja y avisos internos (driver no sano)

| Medición | n | p50 | p95 | Máx. | Comentario |
| --- | --- | --- | --- | --- | --- |
| Fila de la solicitud y fila del aviso interno del líder visibles desde otra conexión, desde `submitted_at` | 18 | 3,1 s | 3,7 s | 3,7 s | Se escriben en la misma transacción y aparecieron en la misma observación. Desde la respuesta: p50 0,46 s y p95 0,98 s, con un observador que consulta cada 1 s y suma el RTT. |
| Campana del líder en la UI (contador de avisos), desde `submitted_at` | 9 | 9,1 s | 14,3 s | 14,3 s | Cubre S01–S09. Desde la respuesta: p50 6,6 s y p95 11,7 s. A partir de la décima solicitud la etiqueta muestra «9+» y ya no distingue avisos nuevos. |
| Fila en la lista de la bandeja (UI), desde `submitted_at` | 4 | — | — | 31,4 s | Cubre S01–S04: 29,0, 31,4, 19,5 y 12,6 s, y desde la respuesta 26,4, 28,8, 17,0 y 10,1 s. El líder abrió un detalle entre las 13:31:31 y las 13:32:12 y volvió a la lista a las 13:43:25, así que S05–S18 no tienen una medición válida en la lista. |

Las lecturas periódicas medidas en Chrome sobre el piloto entre las 13:30 y las 13:43 fueron:

- **Lista de la bandeja** (`/admissions/requests`, 46 lecturas): cada lectura tardó 11,0 s en p50, 17,2 s en p95 y 27,2 s como máximo. Entre refrescos completados pasaron 15,0 s en p50, 25,8 s en p95 y 35,2 s como máximo.
- **Contador de avisos** (50 lecturas): cada lectura tardó 2,7 s en p50 y 4,1 s en p95, con un intervalo de 16,3 s en p95.

Con el poll de 15 s de T188, la lista tarda como máximo el intervalo más la lectura: unos 32 s con la lectura p95 y 42 s con la máxima. Con esa cota, el p95 de la lista no baja de 30 s en este entorno, y la única observación de lista que superó 30 s (S02) es coherente con ella. La demora viene de la latencia del entorno: cada consulta secuencial suma unos 163 ms y una lectura hace varias transacciones de autorización, lectura y registro de exposición. En cambio, las filas confirmadas quedan disponibles en menos de 1 s, y la campana cumple con margen. Estos tramos no dependen del driver, porque la solicitud y el aviso se confirman en la misma transacción. Aun así se registraron con el driver no sano y no acreditan el objetivo.

### Correos agrupados

El mantenimiento materializa los grupos al recolectar las fuentes, así que cada hecho cae en la ventana vigente en el momento de la recolección. Las tres cohortes formaron tres grupos del líder (`reviewer`/`grouped`) con seis miembros cada uno.

| Grupo | Ventana UTC | Cierre→congelado | Cierre→envío autorizado | Cierre→resultado | Resultado |
| --- | --- | --- | --- | --- | --- |
| 1 | 13:30–13:35 | 2 min 42,7 s | 5 min 33,5 s | 5 min 52,5 s | `unknown` (`dispatch_result_unknown`), sin id del proveedor |
| 2 | 13:35–13:40 | 4 min 42,0 s | 9 min 42,3 s | 9 min 57,6 s | `unknown` (`dispatch_result_unknown`), sin id del proveedor |
| 3 | 13:40–13:45 | 1 min 32,6 s | — | — | Quedó `queued` con el turno diferido a las 13:59:07 y pasó a `suppressed` hacia las 14:06, después de cancelar las solicitudes |

**No se cumple el plazo de cinco minutos desde el cierre:** ningún correo agrupado tuvo aceptación confirmada. En total:

- dos llamadas reales al proveedor con resultado incierto, sin reenvío: cada entrega conserva una sola fila de intento, como exige OG-04;
- ninguna aceptación confirmada;
- una entrega suprimida sin envío.

El cupo diario consumió 2 de los 20 avisos; los códigos no se usaron.

### Salud del driver, cola y pool

Entre las 13:29 y las 14:11 hubo 42 corridas del driver:

- **Completas (200):** 3, a las 13:29, 13:36 y 13:41.
- **Incompletas (503):** 36. El mantenimiento agotó su presupuesto de 45 s y conservó el avance para la corrida siguiente.
- **Omitidas por ocupado (202):** 3, a las 13:58, 14:00 y 14:08, porque la corrida anterior seguía en curso.

La última corrida completa terminó a las 13:41:41. Antes de la medición había una sola falla aislada, a las 13:23. Los períodos afectados son de 13:30 a 13:35, de 13:37 a 13:40 y desde las 13:42 en adelante, sin recuperación al cierre de este registro.

Al terminar la medición no quedaba carga propia: a las 14:10 `pg_stat_activity` mostraba una sola conexión, la del mantenimiento, sin candados en espera. El servidor de desarrollo y el ensayo terminaron a las 14:05:31 y la pestaña del líder se cerró a las 14:07. Las causas observadas son estas:

1. **El presupuesto no deja margen.** Sin carga, cada una de las siete fases tarda 3,6–4,3 s por la latencia hacia Neon, y una corrida vacía ocupa unos 42 de los 45 s. Con trabajo real, la preparación de avisos tardó 15,9 s y 36,4 s, y el despacho 17,1 s. Las corridas quedan incompletas, y la rotación de fases demora la preparación y el envío durante minutos.
2. **La selección de tribu compite con la bandeja abierta.** El productor selecciona la tribu con `FOR UPDATE ... SKIP LOCKED`, mientras cada lectura de la bandeja mantiene `FOR SHARE` sobre esa misma fila durante 9–27 s, cada 15 s. La corrida completa de las 13:36 seleccionó cero tribus aunque la ventana 1 ya estaba cerrada y la bandeja del líder estaba abierta y enfocada. Esta causa se infiere del código y de esa corrida; el candado no se midió por separado.
3. **El despacho deja de observar el envío antes de que responda el proveedor.** Entre la autorización y el `unknown` pasaron 19,0 s y 15,2 s. El despacho usa un `requestTimeoutMs` de 15 s, acotado además por el presupuesto restante. El diagnóstico de correo del piloto del 19/10 tardó 16,9 s entre la autorización y la aceptación.
4. **La recolección no avanza desde las 14:05.** La limpieza (17 cancelaciones entre las 13:54 y las 14:03) y la aprobación del líder agregaron 18 obligaciones de solicitante, y la ventana de 24 h quedó con 36 fuentes. Desde las 14:06, cada corrida dedica 34–36 s a `prepare_notifications`, que termina `unresolved` porque alcanza el plazo. El checkpoint de recolección no cambia: sigue en la versión 18, con el último barrido completo a las 14:05:42. Las demás fases avanzan por rotación. Si la página de recolección no entra en el presupuesto, el atraso puede seguir hasta que esas obligaciones salgan de la ventana de 24 h; queda pendiente confirmarlo en las corridas siguientes.
5. **El pool y la cola no se saturaron.** Durante la medición hubo 17 conexiones en p50, 28 en p95 y 37 como máximo, frente a un `max_connections` de 901. La cola terminó sin pendientes.
6. **La vista de actividad no avisa este fallo.** «Última ejecución exitosa» se actualiza con cualquier fase completada (`academy_admission_worker_runs`, despachos y materializaciones). Por eso las corridas incompletas que completan alguna fase no disparan el aviso de diez minutos. El fallo de presupuesto sólo se ve en el registro del driver y en `admission_messaging_maintenance_progress`.

### Limpieza y estado final

- **Solicitudes.** Diecisiete quedaron `cancelled` mediante el flujo de cancelación de cada solicitante en la interfaz. PostgreSQL lo confirma, aunque la última aserción del script falló por un selector de texto ambiguo. S01 fue **aprobada por el líder** desde su sesión en Chrome durante la medición, sin intervención del script. Esa cuenta sintética es ahora integrante activa de `test`, y retirarla le corresponde al líder desde la aplicación.
- **Avisos al solicitante.** Las 17 obligaciones de cancelación y la de aprobación no generaron correo, porque las cuentas `.test` no tienen correo confiable.
- **Entregas.** Quedaron dos `unknown`, una `suppressed` y las dos de diagnóstico anteriores.
- **Cuentas.** Las dieciocho cuentas sintéticas y sus sesiones permanecen en la base del piloto.
- **Driver.** El driver sigue activo, pero incompleto.

### Conclusión

El producto confirma la solicitud y el aviso interno en la misma transacción, y ambos quedan disponibles en menos de un segundo después de la respuesta. Con la sesión real del líder, la campana aparece dentro de los 30 s.

En este piloto local, en cambio, no cumplen ni la lista de la bandeja ni el agrupado. La latencia local→Neon convierte la lectura de la bandeja y cada fase del mantenimiento en operaciones de varios segundos, y eso agota el presupuesto de 45 s. A eso se suman tres factores: el posible bloqueo de la selección por las lecturas de la bandeja, una observación del envío más corta que la respuesta del proveedor, y una página de recolección que no entra en el presupuesto.

Para cerrar SC-015 hace falta medir en un host cercano a la base y con el driver sano. Además hay que revisar, con autorización:

- el presupuesto o la rotación del mantenimiento y el tamaño de la página de recolección;
- la convivencia de `SKIP LOCKED` con el `FOR SHARE` de los lectores;
- el `requestTimeoutMs` del despacho de correo.

El resumen sanitizado del ensayo, con horarios y alias pero sin credenciales ni identificadores, quedó en el directorio temporal de la sesión. Ni ese resumen ni el script temporal se versionan.
