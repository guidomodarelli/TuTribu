# Auditoría de cobertura restante de mensajería

Fuente normativa: tareas T076–T094 de `001-academy-admissions`, rama `feature/academy-admissions-spec`, HEAD `9e5d47ed76782b8644a5e3d567bb4ae7931fcb9c`. Auditoría de código/tests y registros de ejecución; una declaración aislada no acredita un recorrido. Las ejecuciones anteriores se conservan como historia y los cierres actuales se documentan al final. No altera IDs ni criterios normativos.

| Criterio | Evidencia comprobada | Estado y trabajo restante |
| --- | --- | --- |
| T076: lifecycle, credencial, canal y configuración separados | `messaging-connections.test.ts:17` conserva draft/version/credential desconocida/sin capabilities; `messaging-credential-validation.test.ts:28` valida sólo facts; `messaging-connection.test.ts:19`–66 y writer activation SQL prueban gating | T076 completa: ready y recorrido telefónico acreditados; Native25414 y SQL47445/88221 conservan avisos/policy. Auditoría final sobre a204aaca sin brechas. |
| T076: slot único y guardián/líder anterior sin secretos | Creación concurrente `messaging-connections.test.ts:63`; configuración immutable seleccionada/candidata; `messaging-configuration-reader.test.ts:30`–59 vuelve a alerta mínima tras transferencia; creación cierra rol/recencia/sesión | T076 completa: autoridad y slots disponibles; guarda structural228534aa y owner2e33b440 suspenden la conexión anterior. SecretStore9846/53410 y pipeline99047 acreditan el stop. |
| T076: activación ≤24h sin habilitar admisión | Dominio comprueba borde inclusivo/futuro/25h; SQL writer confirma/replay y rechazo durante lock; Native48082 y68046 seleccionan sin otra RPC ni policy creada | Cubierto por pruebas registradas y la matriz Native13095 final, cuatro casos verdes Chromium/WebKit1280/390 del recorrido telefónico y activación explícita |
| T077: diagnóstico exacto, cinco fallos, propósito y aislamiento | `connection-diagnostic-verification.test.ts:114`–218, SQL14 verdes743,30s; issuer diagnostic propio; budgets UTC y cuenta/contacto/canal | Cubierto por evidencia disponible salvo una prueba explícita de vencimiento a través del owner de diagnóstico; caso agregado y comprobado por el owner real en63655; no modifica timestamps inmutables ni consume códigos vencidos |
| T077: países vacíos/prohibidos y validación después de reducción | `diagnostic-issue-workflow.test.ts:144` cierra [] antes de código/eventos/SDK; verifierSMS después de retirar países conserva código y capability unavailable; código-request budgets separado | Cubierto por SQL real registrado. El recorrido UI completo de guardar países→diagnóstico→activar teléfono no está acreditado por estos fixtures |
| T078: asistente, clave efímera, campos y recuperación | Native de creación, credencial, recursos y diagnóstico; beez-ui real/SCSS; no clave/contacto/código en storage y original→current; activación local79 tests/build/review y focal68046 | T078 completa después de la auditoría de todas sus cláusulas; matriz Native13095, flujos de clave/recursos y recuperación acreditados |
| T080/T088: países/cupos tempranos y evolución CAS | Native uso Chromium/WebKit y navegación desde policy ausente; defaults[]/version1, draft409/replay/no mensajes; owner único de usage | La cláusula de integración se acredita con Native13095: uso ausente, inicio explícito, guardar ARv2 por UI, SMS, confirmación y activación. La auditoría final de ambas tareas confirmó todas las cláusulas; T080/T088 completas |
| T081/T086: entidad y lifecycle operativo | Modelos, creación/configuración/diagnóstico/activación están conectados; pure suspend existe | T081 completa: writers/routes/recovery HTTP, UI Native27178 y transferencia canonical/structural implementados y acreditados. T086 conserva su auditoría propia pendiente. |
| T091/T092/T093/T094: endpoints/asistente/docs/gates | Rutas y roots implementados de create/validate/resources/config/diagnostics/verify/activate/delivery/operations/usage; docs y manual con capturas reales de avances | Conservar pendientes hasta cubrir todas las cláusulas. Ensayos sintéticos no acreditan Google/Zavu real, pagador, hosting, scheduler ni OG01–06 |

La ejecución interrumpida Native11676 no pasó la matriz. Observó un intento marcado `unknown` y una reserva conservada sin SDK en Chromium390; la reanudación actual investiga etapa/código safe y duración HTTP sin reenviar ni liberar cuota. Runtime Windows terminó de forma anómala; la rama propia restante se eliminó sólo después de verificar ausencia de procesos e identidad exacta, y su ausencia quedó confirmada.

Esta auditoría identifica los próximos gaps; no reduce el alcance original ni usa el estado de una prueba parcial para cerrar una tarea.

Se añadió prueba SQL explícita de diagnóstico vencido: fecha histórica sólo en INSERT, MAC/OTP reales y autoridad actual del owner; no actualización de created_at/expires_at.99157rojo23514 por fixture que editaba versión inmutable; el helper ahora recibe configuración opcional de recurso en creación (mantiene defaults de los consumers existentes), y diagnosticId usa el origen ya fijado en delivery.63655reintentoencurso;4331dftipos/lintverdes. No se acredita el caso antes de su exit.

63655finalverde52,34s,unSQL/6filtered:expiredownerledgerchallenge_expired yreplayexacto, capabilityunprepared/testedAtnull,diagnosticpending/validatedAtnull,0failures y0proofadmisión. Revisiónfixturedeltaencurso yregresióndefaultconsumersdelhelperenSQLrealencurso. No marca todavía T077completa sin terminar auditoría de sus otras cláusulas/evidencia.

32805regresióndefaultconsumersdelhelperfinalverde45,36s,dosSQLconpropósitosadmission/diagnostic,sinmockslib. ReviewCodexEFAD02142F7BB5AFA91E6B4EC7C2A6F8543B6C994B87436C25AE3C21F6496BEBestable2archivos,0hallazgos. La configuración opcional sólo se escribe alcrear recurso nuevo; nosettingsdefaults/guardas/tiemposmutados. Conjuntoactualdecontratos/usecase/hints/presenterdiagnóstico76726encurso.

## Auditoría atómica de T077

- Actor/tribu/conexión/configuración/acción actuales: `connection-diagnostic-verification.test.ts:161` cruza IDs y sesión/subject/rol; owner construye purpose diagnóstico y rechaza otra finalidad antes de consumir. Verificador compartido compara propósito/época y devuelve `proofId:null`; los tests de propósito y SQL propio comprueban ausencia de proof e identidad global.
- Canal/template exactos: confirmación email no prepara SMS; carrera SMS/WhatsApp y reemplazo explícito conservan la capability correcta y el historial. Un diagnóstico de otra versión no prepara la actual.
- Forma/TTL/intentos: schema público seis dígitos y domain179casos acreditados; cinco fallos con dedupe en owner SQL, más nuevo vencimiento `63655` con ledger/replay y cero consumo/capability/proof.
- Cuotas y espera: `code-request-budget.test.ts` prueba límites por cuenta/contacto/canal, día UTC, cooldown compartido entre propósitos/canales y ausencia de otro evento al denegar; continuidad de fingerprint se ensaya en SQL real. Cambiar canal/clave no reinicia contadores.
- Efectos explícitos: creación tiene cero capabilities/deliveries/events/policy; validación de credencial sólo reserva su categoría y hace GET SDK; configuración crea versión sin envío. El use case confirma commit antes de dispatch y un replay no vuelve a despachar. Los presenters/container no emiten al renderizar o modificar campos; Native real de diagnóstico acredita el camino explícito.
- Países: [] ya deniega antes de código/contadores/SDK; se añadió caso específico de destino prohibido con otro país guardado, comprobado en80382verde194,26s. Retirar países y provider unavailable después de emisión conserva la validación local, sin nuevo envío.

Los receipts anteriores son `connection-diagnostic-baseline.md` (catorce SQL743,30s/60DTOHTTP/review0), `domain-baseline.md` (179casos), `messaging-diagnostic-wizard-baseline.md` (Chromium/WebKit1280/390 y aislamiento), y los dos casos actuales de defaults del helper32805. El conjunto76726 aporta33casos actuales y un skipSQL que no se contabiliza como prueba ejecutada. 80382 ya pasó; la casilla T077 sólo se actualizará después de revisión del alcance completo del delta. T089/US6/OG no se cierran por completar esta cobertura.

80382finalverde194,26s1SQL/5filtered: [] ypaísUSguardadodenieganARantesdecode/challenge/delivery/event/SDK; guardarARv3medianteusecaseactualpermiteunaemisiónSMS/SDK. ReviewdeT077completaencurso, sinalterarotrascasillasniOG.

Cierre final de alcanceT077: Codex4A72EDB8F00A5CAACBA95F4DC1D0265A1F6100F0FA44DE32EE1E20EF6028CA0Aestable4archivos,0hallazgos, confirmó todascláusulas por caminos equivalentes. Tasks marcaúnicamenteT077 y recalcula78/212completas,134pendientes; otroscriterios yOGmantienensusestados. No se usa Native1678pendiente como evidencia.

## Gap lifecycle ready observado y posteriormente resuelto

La búsqueda actual de escrituras `MESSAGING_CONNECTION_STATE.ready` y `state='ready'` en `src/modules/messaging` no encuentra un writer/transición; sólo tipos/schema/allowlist. El owner de diagnóstico actual actualiza capability/testedAt, pero no cambia lifecycle de la candidata. El spec distingue `ready`: capacidades seleccionadas preparadas/probadas para esa configuración, sin admisiones productivas. Por tanto la transición ready es inalcanzable aunque la activación valide requisitos; T076/T081/T086 siguen parciales. Implementar/probar la transición exacta después de pruebas y su invalidación por cambios, conservando selected/candidate, owner/dependencias/ventana y CAS. No derivar `active` de un éxito aislado del SDK ni alterar la seleccionada por guardar/probar.

Para ese gap se agregó política de dominio nueva no importada por el buildNativeactivo: assessMessagingCandidatePreparation exigecredencialvalidada ytodoscanalesconfiguradosconestado prepared/fecha válida; WhatsApp coincideconremitente/template/idioma. TDD3a27dbrojoimport→1d08f8verde19casosconlifecycleexistente1,04s/tipos+lints. No selecciona ni infiere producción. La transición/writer ysu integración siguen pendientes,porloque ready aúnnoestáconectado.

91769SQLrealred304,96s reprodujoelgapexactodespuésdeconfigurar,validarcredencial,emitiryconfirmarcódigo: candidate_version2/is_candidate true/is_selected false/0policy,pero state draft envezready. No falla antesdeesasaccionesni porfixture; el writer depreparaciónfalta. La nueva prueba queda fuera delcheckpointactual deactivación hastaimplementar esa transición.


## Estado actual después de los checkpoints de preparación y lifecycle

El gap ready histórico de esta auditoría quedó resuelto en 1d021360: el owner de diagnóstico deriva la preparación exacta de la candidata y la credencial inválida la devuelve a Borrador, conservando selected, consumo y diagnósticos. La evidencia específica está en messaging-candidate-preparation-baseline.md; el rojo91769 conserva su valor histórico y no describe el estado actual.

Native13095 pasó los cuatro recorridos reales en 3601,56 s sobre el despacho con preparación y RPC separados. Parte de usage ausente, inicia explícitamente, guarda ARv2 por la UI y efectúa SMS/confirmación/ready/activación con recuperación original; SDK3 y cero cambios de AdmissionPolicy. Se exportaron cinco capturas reales sanitizadas. Esto cierra los gaps de journey telefónico y matriz antes indicados; no acredita proveedores reales ni gates operativos.

Backend de lifecycle guardado/subido en 2b21e42955e6f5b790b3a3e323fc00c3276efe6e, HEAD/remoto idénticos. Review final31 archivos A92C68E63924686D5FE0F2C09D2E9A59533DE7995E8CAD6407B032973F580193 sin hallazgos; QA24 renders Chromium/WebKit1280/390, 64 casos locales y tipos/lint. Los originales HTTP se recuperan sin recencia de mutación ni SDK. La UI nueva tiene64 casos locales/build23,3s/TS6,7s y su matriz Native18547 sigue en curso. No se acredita antes de su salida terminal.


Cierre atómico de T080/T088: revisión Codex read-only de su alcance exacto, sin hallazgos ni brechas propias. Se marcan únicamente estas dos tareas: 80/212 completas y132 pendientes. La configuración temprana, sus regresiones/recuperación y el recorrido telefónico se verificaron con los archivos y receipts arriba. La matriz actual de lifecycle y el futuro writer de aprobación local no se usaron como evidencia. US6 y OG-03 siguen pendientes.


Cierre atómico de T078: la auditoría Codex confirmó toda la cobertura propia del asistente con beez-ui real y los recorridos/evidencias citados. Se marca sólo T078 y queda81/212 completas131 pendientes. El alcance técnico de T082/T083/T084/T085 también está cubierto, pero sus casillas conservan las dependencias de T081/T082/T083 abiertas; no se usan para dar por completada la transferencia, US6 ni OG-03. Native27178 permanece en curso y no se usa como evidencia de este cierre.

## Avisos independientes al conectar y requisitos de selección

Native25414 final verde242,08s confirma por HTTP real que la creación de candidata, suspensión local y retiro de esa candidata conservan admission_email_settings enabled/version/enabledAt, el modo/flag de academia y la ausencia de AdmissionPolicy. Transporte cerrado: SDK0. El ajuste de fixture está pendiente de su checkpoint; no se usa todavía para cerrar toda T076.

La nueva base independiente de avisos descubre un gap diferente en requiredChannels de PostgresMessagingSelectionDependencies: sólo consulta AdmissionPolicy y no incorpora admission_email_settings.55310 rojo51,31s con autoridad nativa de activación y PostgreSQL reales muestra [] en lugar de email cuando los avisos están habilitados y no hay AdmissionPolicy. No es una mutación de flags ni un fallo de auth/setup. Hay que componer explícitamente el reader del owner notifications, conservar ausencia OFF sin INSERT y agregar email a la unión de requisitos actuales, sin inferir preparación o activar avisos.

Native27178 ya terminó cuatro casos verdes1164,49s y su protección posterior de interceptación pasó en60579; los resultados se registran en messaging-lifecycle-baseline.md. La guarda y el caso de transferencia conservan su baseline propio. Los rojos y estados pendientes anteriores de esta auditoría describen su checkpoint histórico y no el estado actual de esos incrementos.

## Cierre del alcance de T076 y T081

La auditoría Codex read-only sobre a204aaca confirma todas las cláusulas de ambas tareas. Configuración/versiones/slots SQL19633; validación SDKme y almacenamiento72627/27640; ready/activate39234/88221; frescura después de locks91790; diagnóstico exacto/códigos/purpose63655/56245 y baseline de catorce SQL. Native25414 y SQL47445/88221 conservan ajustes independientes de academia/correo; Native13095 acredita el recorrido de países guardados antes de SMS. La guarda structural228534aa, owner2e33b440 y casos9846/53410/99047 detienen credenciales después de transferencia sin reiniciar cuotas/historial.

Se marcan T076 y después T081, con T077 ya completa:84/212 completas y128 pendientes. Los nuevos casos AC01, fixture/aislamiento WIP y matriz53055 no se usaron para este dictamen. Este cierre no acredita US6/US7 ni gates operativos; T082–T085 conservan una auditoría técnica previa y requieren validar el encadenamiento de dependencias ahora satisfecho.

## Cierre de los adapters T082 a T085

La auditoría Codex read-only sobre9e5d47ed vuelve a comprobar cada cláusula y acredita T082→T083→T084/T085 después de T074/T075/T081. Inspector y sender fijan SDK0.57/host15s/retries0/logsOFF/key explícita/headers aislados; roots y SecretStore reales completan el contexto. Me/list/retrieve incluyen continuaciones vacías, límites, ciclos, fallos tardíos y detalle manual sin aprovisionar. Email/SMS/WhatsApp usan campos exactos, país y Template.language; transporte accepted/delivered no crea prueba de contacto. El mapper prioriza HTTPstatus sobre texto, no infiere aceptación de409 ni saldo de402 y conserva unknown seguro sin raw/cause públicos.

Las evidencias de SDK/SQL/HTTP y composición están en los baselines de inspección, listado, configuración, credencial, dispatch y boundaries; la suite SDK actual pasó13 casos en1,06s sobre los mismos adapters. Se acredita correlación propia por requestId/trace/intento; no se afirma captura de correlación upstream. Se marcan sólo esas cuatro tareas:88/212 completas124 pendientes. WIP telefónico/late swap y gates externos quedan fuera de esta auditoría.

## Cierre de gestión y diagnóstico T086 y T089

La auditoría Codex read-only sobre cdefbb80 confirma los owners y recorridos alcanzables de draft, candidata, validación, configuración inmutable y activación explícita. Los casos SQL19633/27640/39234/88221 y frescura91790, más Native33531 y las matrices anteriores, acreditan versiones/pruebas renovadas sin seleccionar por guardar. Defaults y flags independientes conservan su evidencia25414/47445/88221.

El diagnóstico une contexto/destino mostrado/consentimiento con issuer/ledger/budgets propios y outbox confirmado antes del dispatcher; SQL73324/16982 y Native7210 acreditan el flujo. Los catorce SQL y63655/56245 verifican que sólo el código recibido correcto prepara su capacidad/version, sin proof de admisión ni evidencia global. SQL90991/80382 y Native13095 acreditan países guardados antes del teléfono, email permitido con[] y versión vigente de uso registrada en el marker.

Se cierran T086 y después T089 con sus dependencias completas:90/212 completas122 pendientes. Los focals86683/41957/72923 y WIP de extracción/rotación quedan excluidos;53055 conserva su resultado rojo. US6 y OG03 mantienen su evaluación independiente.

## Cierre de registry, endpoints, asistentes y documentación

La auditoría Codex sobre4c3ec071 acredita T090/T091/T092: registry sóloZavu, factories por contexto/canal sin fallback, todos los endpoints de configuración/recursos/diagnóstico/activación/entrega/operación/uso, DTOs propios por audiencia y guardián limitado a alerta. SQL29014/26232 y Native77367/23360/33531/7210/24748 acreditan esos caminos. SSR/loading, una sola entrada de datos, container/presenter, beez-ui/BEM, clave efímera y recuperación original/current tienen sus matrices57545/42901/13095/27178 y capturas ya guardadas.

T093 detectó texto obsoleto de asistentes, países y suspensión en tenant-messaging.htm, recencia en member-sessions.htm y una nota que confundía entrada de gestión con ensayo Google en account-and-navigation.html; academy-admissions.htm mezclaba endpoints diagnósticos conectados con admisión pública pendiente. Se actualizan sólo esas declaraciones, conservando los gates externos y la distinción de esquemas. El manual de cuenta registra source-trace4c3ec071 con11paths verificados, sin recapturar sus esquemas. Check-manual pasó0errores con las dos advertencias locales conocidas. QA67962 final pasó44renders de11documentos en Chromium/WebKit1280/390, sin overflow, pins inválidos ni pageerrors; índices y navegación siguen funcionando.

Se marcan T090→T091→T092→T093:94/212 completas118 pendientes. Los criterios/IDs se conservan. T094 y los gates tienen evaluación propia; no se usan las nuevas ejecuciones73163/54921/25919 ni WIP de capturas/rotación para acreditar este cierre.
