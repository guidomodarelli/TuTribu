# Validación de seguridad y privacidad de admisión

T165 completada sobre el checkpoint `a767de9c`, después de la auditoría íntegra y del terminal final de sus dos variantes Native. Se cambia sólo T165; el recuento queda en 164 completadas y 48 pendientes de 212. Su criterio original exige API y UI reales, referencias y roles cruzados, campos de envío y host arbitrarios prohibidos, autorización antes de leer SecretStore, scopes locales y ausencia de fugas en respuestas, props, logs, errores, trazas y exportaciones. Los apartados conservan la historia de los lotes parciales, sus límites, reportes fallidos y repeticiones; el contraste final y la auditoría de cierre registran el estado vigente.

## Autoridad y acceso privado actuales

Cuatro suites con PostgreSQL real terminaron con 22 casos aprobados, cero fallidos y cero excluidos. Sus fuentes conservaron los hashes registrados antes de la ejecución:

| Suite | Casos aprobados | Comportamiento observado |
|---|---:|---|
| `admission-authorization-reader` | 4 | Liderazgo canónico actual, recursos de revisión de la tribu exacta, solicitante sin membresía, sesión revocada y metadatos retirados separados del uso sensible. |
| `admission-verification-scope-isolation` | 3 | Códigos genuinos de correo/SMS/WhatsApp rechazados al cruzar cuenta, tribu o desafío; no se consume la prueba ni cambia la autenticación global. |
| `encrypted-secret-store` | 12 | Revalidación de liderazgo después de locks, contexto privado exacto antes de claves, recuperación/época/retiro, marker/reserva/lease actuales, denegación SQL ordinaria incluso con grant, autenticación del cipher y retirada/reencriptado. |
| `messaging-authorization-reader` | 3 | Líder vigente en lugar del creador histórico, versión seleccionada/candidata propia y cierre por sesión vencida o liderazgo perdido. |

Los casos observan los owners reales, PostgreSQL y crypto; no convierten una cookie o rol declarado por el navegador en autoridad. Esta evidencia tampoco acredita por sí sola todos los endpoints o pantallas de T165.

## Contratos locales y protección de artefactos

- Un lote de autoridad y handlers de diagnóstico, recursos y validación de credenciales terminó con 22 aprobados, cero fallidos y cero excluidos.
- Nueve suites de contratos públicos, configuración de hosting y handlers de política/revisión/conexión/importación terminaron con 49 aprobados, cero fallidos y cero excluidos. Comprueban entrada, origen, campos de autoridad y DTOs propios con schemas reales.
- El borde HTTP, la resolución autorizada de SecretStore y los scopes de recuperación personal/histórica terminaron con 62 aprobados, cero fallidos y cero excluidos.
- La protección de capturas en Chromium/WebKit y el reporte CSV inerte terminaron con 19 aprobados, cero fallidos y cero excluidos. La primera ejecución conserva un reporte fallido con 16 aprobados y tres fallidos por faltar la ruta del snippet real; se corrigió la configuración del ensayo y se repitió el lote completo sin cambiar código de producto o tests.

Los tres primeros lotes usan contratos/handlers/casos de uso reales con dobles sólo en puertos propios; no se presentan como recorridos Next/PostgreSQL. El cuarto ejerce controles reales de navegador, exportación de DOM, fallo de descarga de fuente con cookie y serialización de CSV; sus páginas locales de prueba no son una demostración de toda la UI del producto.

## Evidencia reutilizada por su alcance

La [matriz cerrada de T164](messaging-usage-and-abuse.md) aporta los cinco AC de US11 por su alcance: contadores actuales y cupos antes del marcador, campos de envío prohibidos, aislamiento local y observación de salidas finales. Conserva separados los 78 contratos HTTP, 16 casos del SDK real, un reporter asíncrono conectado desde Next y un caso negativo del observer que redacta canarios antes de conservar artefactos. No se vuelven a sumar como nuevos casos de T165.

Los lotes de lifecycle/seguridad nominativa/scopes y recursos privados mediante HTTP Next terminaron con seis y cuatro casos aprobados respectivamente, sin fallos ni exclusiones. Sus fuentes conservaron los hashes de inicio. El segundo ejerce validación de credenciales y recursos, recuperación original sin claves/recencia nueva, CSV autorizado y cierre de reportes e invitaciones al perder permisos.

`admission-security-and-privacy.test.ts` terminó con un caso Native aprobado, cero fallidos y cero excluidos. Comprueba solicitudes propias en dos tribus con el mismo líder, referencias cruzadas de lectura/decisión, params inválidos, doce campos de envío/host prohibidos, origen ajeno y pérdida de membresía del antiguo líder; exige respuestas seguras y ningún efecto durable. Su alcance no sustituye la matriz de contenido privado o del antiguo guardián.

## Corrección de privacidad de capturas

La auditoría encontró una fuga potencial de códigos visibles: el widget de reportes podía capturar esos controles aunque el backend redactara su texto. Las raíces de los componentes de contacto, diagnóstico y credenciales ahora se excluyen mediante el atributo público del capturador. La corrección no modifica la autorización, los envíos, las cuotas ni el ingreso.

La prueba usa los tres componentes reales, el widget publicado y su UI pública para enviar JPEG al transporte HTTP propio. El lote final de Chromium y WebKit a 1280/390 terminó con cuatro casos aprobados, cero fallidos y cero excluidos: cambiar el código conserva exactamente la captura protegida; retirar la exclusión vuelve a incluir píxeles visibles. Las imágenes permanecen únicamente en memoria y se descartan al terminar. El lote previo de escritorio, con dos casos aprobados, se conserva separado y no se vuelve a sumar. Los primeros reportes fallidos del arnés se conservan: faltaba su configuración obligatoria, se esperaba visibilidad en lugar de montaje del host con Shadow DOM cerrado y faltaba elegir el tipo del comentario. Se corrigió el ensayo sin cambiar el widget ni sus validaciones. La compilación real con las exclusiones terminó aprobada y los 40 casos existentes de sus presenters pasaron completos, sin fallos ni exclusiones.

## Brechas de la auditoría inicial y resultados posteriores

La auditoría íntegra dejó dos brechas de evidencia: solicitantes rejected/cancelled/expired sin otra membresía frente a contenido/agenda/feed privados, y página/props/decisión del antiguo guardián. La nueva matriz preserva un primer reporte Native fallido de setup, las observaciones de oráculo débil del directorio y cronología incoherente del histórico. Su repetición prepara los padres históricos desde sus inserciones iniciales, conserva al guardián previo al cutover y distingue DTOs vacíos de denegación contractual con controles positivos. En ese checkpoint todavía estaba en ejecución; los resultados completos posteriores se registran a continuación.

La primera repetición con padres coherentes terminó con cero casos aprobados y dos fallidos: esperaba un DTO vacío 200 de mensajes, pero la ruta real devuelve 404 a quien no puede ver la tribu. Se corrigió únicamente el oráculo para exigir ese 404; el resultado de la repetición se registra a continuación. Canales y agenda conservan sus DTOs vacíos explícitos, mientras directorio, archivo y feed deben denegar según sus contratos. No se sustituye esa prueba por ausencia genérica de un canario.

La repetición con los oráculos correctos terminó completa con dos casos aprobados, cero fallidos y cero excluidos: Chromium y WebKit, cada uno a 390/1280, para pending/rejected/cancelled/expired y antiguo guardián. Los padres de cuenta, tribu y política son anteriores al histórico desde su inserción inicial; rechazo/cancelación/expiración usan sus owners reales. Los controles positivos comprueban contenido, agenda, feed y directorio del líder; el solicitante conserva su estado propio, sin otra membresía ni efectos de admisión al consultar. El guardián vigente ve la revisión; perder su rol cierra la página/props y deniega la decisión dejando la solicitud intacta.

La revisión identificó que un error de transporte de Playwright podía incorporar cookie o URL privada al reporte del test. `runPrivateBrowserRequest` descarta deliberadamente ese call log en HTTP y navegación sin alterar respuestas, fixtures u oráculos. Su prueba usa Chromium y un servidor propio que resetea una solicitud con cookie/URL efímeras; terminó con un caso aprobado, cero fallidos y cero excluidos. El oráculo negativo compara sólo booleanos para impedir que una regresión exporte esos valores. Los cuatro archivos finales pasaron tipos/lint y revisión sin hallazgos. La matriz completa de esa fuente final terminó con dos casos aprobados, cero fallidos y cero excluidos en 1239,97 segundos: Chromium y WebKit, cada uno con los cuatro estados a 390/1280 y el antiguo guardián, con los errores de transporte protegidos. Sus cuatro fuentes conservaron los hashes de inicio; el resultado previo sin wrapper se conserva separado y no se vuelve a sumar.

## Manuales y documentación de la corrección

La arquitectura de reportes y el CHANGELOG acompañan el checkpoint de código `31a68d7d`. Los manuales de admisión y mensajería explican la exclusión de los campos privados al reportar, y el menú temático enlaza ambos temas. Los tres conservan todos sus paths de trazabilidad, incorporan los owners del capturador y registran ese checkpoint; los scripts, capturas y esquemas anteriores no se modifican.

Los dos manuales pasaron el validador estático sin errores. El validador genérico trata el menú temático del repositorio como un manual extenso o una réplica visual del menú de la aplicación y reporta requisitos que no corresponden a su formato vigente; no se cambia el catálogo para satisfacer ese supuesto. Su navegación se valida sobre el menú real. La QA conjunta de los tres documentos y la arquitectura terminó con 16 renders, 16 recorridos de menú/regreso y 192 enlaces internos, Chromium/WebKit a 1280/390, cero errores.

## Contraste del criterio original

| Criterio de T165 | Evidencia terminal actual | Alcance conservado |
|---|---|---|
| Params, objetos y roles cruzados por API/UI reales | Un Next Native de dos tribus/recursos y campos prohibidos; matriz final de dos motores y 390/1280 con guardián vigente/retirado. | Los handlers locales complementan los owners reales; no se presentan como otra ejecución Native. |
| Sender/text/template/destination/verified/host arbitrarios prohibidos | Schemas/handlers actuales y doce campos rechazados por Next antes de efectos; origen ajeno denegado. | Ingresar una credencial de candidata requiere liderazgo y recencia propios; no autoriza un envío arbitrario. |
| SecretStore después de autoridad actual | Doce SQL de SecretStore y readers actuales: sesión, liderazgo canónico, recurso, locks, marker/reserva/lease y keys revalidados. | Metadatos autorizados y uso sensible permanecen separados; un grant de tabla no abre lectura ordinaria. |
| Scopes locales y autenticación global | Códigos genuinos correo/SMS/WhatsApp cruzados, scopes personales y snapshots globales sin cambios. | BYOK no se transforma en login, recuperación o autoridad en otra tribu. |
| Respuestas, props, errores, logs, trazas y exportaciones sin secretos | DTOs propios, HTTP/SDK/reporter final reutilizados de T164, CSV Next y artefactos privados, widget real cuatro variantes y wrapper negativo con transporte real. | Imágenes sólo en memoria, canarios nunca impresos por el oráculo, reportes fallidos conservados y sin duplicar casos. |
| Solicitantes sin membresía fuera de contenido privado | Cuatro estados por cada motor/ancho, controles positivos de líder y contratos vacíos/denegaciones de mensajes, directorio, agenda, archivos y feed. | Solicitudes y consumo conservados; un estado pendiente o terminal no concede otra membresía. |
| Enlace de revisión y antiguo guardián | URL canónica real, GET/props sin efectos, pérdida de rol y POST denegado con solicitud intacta. | No requiere un correo externo para probar el enlace y la autorización vigente. |

Los 40 archivos de evidencia de cierre conservaron sus hashes, además de las fuentes reutilizadas de T164. El manifiesto actual tiene SHA256 `0B1E77C0255CA78236C4AC247B8F83B72397AB9C75834E6DB515CDD7784C835E`. La auditoría independiente confirmó suficiencia para el criterio original íntegro de T165, con cero brechas funcionales pendientes. Las tareas de audit/métricas, retención y gates externos conservan su alcance original; ninguna se cierra mediante el cierre individual de T165.
