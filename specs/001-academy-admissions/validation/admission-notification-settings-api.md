# API de preferencias y correo de admisión

Registro parcial de T184 posterior a `bd091b231a50af993c3b938fd062143d40df831e`. Se conserva el inventario de 212 tareas: 174 terminadas y 38 pendientes. Las dos rutas de API no agregan una pantalla ni componen grupos, outbox, dispatcher o driver.

## Composición y contrato

- `GET /api/tribes/<slug>/admissions/notification-preferences` devuelve sólo la frecuencia propia, su versión, su origen implícito o guardado y una indicación de UI del rol observado. Un líder tiene default agrupado; un guardián, omitido. La indicación no autoriza una modificación de correo.
- `PATCH` sobre la misma ruta consume modo y versión observada. Cuenta, sesión y destinatario provienen del servidor; se rechazan campos extra de autoridad. El conflicto conserva `status: rejected` y su motivo propio. HTTP 200 representa un resultado conocido; el consumidor debe interpretar el discriminante antes de anunciar guardado.
- `GET /api/tribes/<slug>/admissions/email-settings` exige liderazgo actual y proyecta habilitación, versión y zona. La ausencia conserva OFF y la zona predeterminada sin inicializar almacenamiento, pedir recencia o cargar claves.
- `POST` sobre la ruta de correo exige su confirmación reciente específica, UUID original, confirmación explícita, versión e intención exacta. Mantiene progreso HTTP 202 o el resultado histórico terminal de su ledger. Una respuesta incierta conserva la referencia original y un rechazo anterior permanece rechazado después de preparar el canal.

Los cuatro handlers validan cada entrada una vez antes de abrir módulos y comprueban su DTO propio antes de responder. Las escrituras exigen origen permitido. Los mappers excluyen identidades, contactos, fechas de corte y datos del proveedor; no se aplican schemas a filas PostgreSQL ni respuestas upstream. La zona se normaliza y limita a 128 caracteres antes de que el owner compruebe el nombre en PostgreSQL.

`buildAdmissionNotificationSettingsModule` recibe el resolver actual y la composición autenticada existente. Relee cuenta y sesión antes de cada transacción; los repositorios conservan sus controles finales. El root selecciona la conexión del owner para los recursos privados. No agrega pools, reintentos de adquisición, proveedores o SDK simulados. Las lecturas y preferencias no consultan keyrings; el cambio de correo mantiene el protocolo original, la capacidad probada y sus cortes nativos. Cambiar frecuencia o habilitar correo no activa OTP ni crea envíos.

La preferencia personal conserva CAS y no inventa un UUID durable: una respuesta perdida exige consultar el estado actual antes de confirmar otra escritura. Los ajustes sensibles usan su ledger original y devuelven el resultado histórico al repetir la misma intención. La consulta actual permanece separada y ninguna respuesta fuerza una recarga completa de ruta.

## Validación vigente

Pasaron **26 casos locales en dos archivos completos**: ocho de autoridad/aplicación y dieciocho del HTTP propio. Cubren roles reales del dominio, origen, campos de autoridad, contratos públicos mínimos, versión cero, progreso incierto, replay y consulta actual. Las librerías de plataforma, Zod y auth permanecen reales; los doubles locales están únicamente en puertos propios. La ejecución final registró previamente 2000 inputs y confirmó que conservaron sus hashes. Los títulos parametrizados distinguen cada escenario; las repeticiones no se suman como casos nuevos.

El rojo semántico del DTO ejecutó sus diecisiete casos: dieciséis pasaron y uno aceptó indebidamente habilitación con versión cero. El guard propio corregido cierra ese resultado. Los primeros rojos de módulos todavía ausentes tuvieron cero casos ejecutados y se conservan separados; no se presentan como SQL rojo.

El archivo Native de factory y handlers pasó **un caso completo, sin filtros ni omisiones y con 1997 inputs registrados estables**. Ejercita el journal original, cuenta y sesión SQL actuales, defaults sin claves ni escrituras, preferencia propia del guardián, CAS y aislamiento del líder, rechazo de autoridad enviada por body, capacidad inicialmente ausente y luego preparada, habilitación y replays originales, rol perdido, sesión vencida y ausencia de cambios de OTP o entregas.

El primer intento Native terminó con cero casos aprobados y uno fallido porque no confirmó la eliminación de su rama. No se suma como verde. La observación posterior con `pg`, sólo sobre esa rama propia, encontró la preferencia, la configuración y los estados sintéticos esperados; tampoco sustituye una ejecución completa aprobada. Una nueva limpieza verificó identidad y ausencia de operaciones pendientes, eliminó exactamente esa rama y confirmó que producción, el piloto y `dev-sandbox-guido` permanecían. La repetición completa posterior aprobó el mismo código y confirmó su limpieza, sin modificar el harness ni relajar assertions.

El build aislado real terminó con código cero, 53 páginas y **1748 archivos de producto equivalentes** al checkout. Pasó además **un archivo Native de HTTP real con un caso completo**, sin filtros ni omisiones y con 1998 inputs registrados estables. Usa cookies firmadas y Better Auth reales en el App Router construido: GET/PATCH de preferencia propia, lectura posterior, CAS, GET de correo, rechazo del POST sin recencia específica, rechazo de identidad enviada por body y de origen ajeno. Comprueba después los efectos nativos y la ausencia de entregas o inicialización de ajustes de correo. El POST real se comprueba cerrado ante falta de recencia; la habilitación y sus replays se ejercitan en el caso Native de factory, sin presentar ambas coberturas como idénticas.

El total actual es **28 casos distintos**: 26 locales, uno Native de factory y uno Native de HTTP. No se repiten las suites focales para sumar casos; sus repeticiones y el intento fallido de limpieza quedan separados. Pasaron lint focal y ambos tipos, incluido el archivo de HTTP real. La sección nueva de arquitectura se renderizó en cuatro vistas Chromium/WebKit, 390 y 1280 px, con sus enlaces disponibles y sin desbordes.

La conciliación oficial final confirmó **cero ramas temporales propias**. Conservó producción, el piloto original y la rama ajena `dev-sandbox-guido`; la pertenencia al trabajo se determinó mediante sus receipts exactos. No se enviaron mensajes externos. El worktree aislado se archiva después de preservar la evidencia. El [registro sanitizado de resultados](admission-notification-settings-api-results.json) mantiene fuentes y alcances separados.

## Alcance pendiente

Quedan la pantalla y recuperación de las acciones en el cliente, productor de grupos y resumen enviado, outbox, dispatcher, mantenimiento y driver operativo. Los ensayos de entrega, latencia y gates originales siguen pendientes. Este incremento no cierra T184, T185, US8 o T211, y el CI aprobado de `bd091b23` no valida estos cambios posteriores.
