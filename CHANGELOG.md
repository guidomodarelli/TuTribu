# Cambios

Todos los cambios relevantes de TuTribu se documentan en este archivo con el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cada cambio agrega sus entradas en `[Unreleased]`; `pnpm create-version` las pasa a la versión publicada con su fecha. Las versiones hasta la 0.93.0 no tienen entradas en este archivo.

## [Unreleased]

### Added

- La política de privacidad puede consultarse sin iniciar sesión desde la página principal e incluye el contacto del responsable del servicio.
- Las conexiones candidatas abandonadas pueden retirarse mediante el proceso interno después de siete días sin actividad, conservando la conexión seleccionada y el consumo original; la programación de esa limpieza sigue pendiente.
- Los datos temporales del CSV y su reporte pueden eliminarse por lotes al vencer las veinticuatro horas, conservando la lista y los resultados ya confirmados; la ejecución programada sigue pendiente.
- La revisión de requisitos de activación muestra los bloqueos actuales y las membresías con historial desconocido o roles de líder y guardián que requieren revisión autorizada; descarta el resultado anterior al editar o volver a consultar. Los manuales distinguen ese control del cambio a academia, los beneficios y las vías de ingreso y pago, y explican qué conserva el silenciamiento y cuándo un cierre impide volver a entrar.
- La salida autorizada de academia y la eliminación de una tribu cierran sus solicitudes e invitaciones de admisión y permiten consultar el resultado original, incluso después del borrado; los controles para iniciarlas desde la interfaz siguen pendientes.
- La gestión de salida, remoción y bloqueo conserva el resultado original y puede cerrar solicitudes pendientes junto con el cambio de pertenencia, sin levantar restricciones por conducta ni permitir reingreso con una aprobación antigua; los controles nuevos del directorio siguen pendientes.
- Los enlaces de invitación anteriores de una academia permiten solicitar ingreso con la revisión manual, la lista y la comprobación de contacto vigentes, conservando el origen del ingreso y el estado de quienes ya pertenecen.
- El líder puede revisar avisos y registrar una recuperación explícita con otra conexión, conservando la entrega original, su plazo y sus consumos; puede consultar el resultado si pierde la respuesta. El manual explica el reemplazo y retiro de conexiones, la reconexión después de cambiar de líder y los límites de las cuentas externas compartidas. El despacho del aviso recuperado sigue pendiente.
- Las solicitudes vencidas pueden cerrarse mediante el proceso interno sin esperar otra presentación, conservando el plazo original y las invitaciones ya canjeadas; su ejecución programada sigue pendiente.
- El líder puede gestionar invitaciones personales desde la configuración de admisión: emitir, renombrar, reemitir o revocar con confirmaciones separadas, vigencia explícita y recuperación de respuestas inciertas sin duplicar la acción.
- La consulta privada de invitaciones personales incorpora las fechas de creación, canje, revocación y retiro de autorización.
- La gestión de invitaciones personales exige confirmación reciente del líder al crear, renombrar o revocar y conserva el resultado original; el enlace completo solo se entrega una vez.
- La invitación personal dispone de una pantalla para iniciar o cambiar de cuenta, comprobar el contacto y confirmar el ingreso por separado; las respuestas inciertas se consultan conservando la operación original.
- El pedido y reenvío de código para una invitación personal conserva su origen y comprueba que siga autorizada; verificar el código no consume el enlace ni concede membresía.
- La consulta de una invitación personal protege el destinatario, indica si falta comprobar el contacto y conserva las solicitudes existentes sin consumir el enlace al leerlo.
- El canje de una invitación personal exige comprobar al destinatario y respeta la lista indicada: puede conceder ingreso básico o quedar pendiente de revisión; retirar la autorización cancela una pendiente sin expulsar a quien ya ingresó.
- En academias en modo lista con control de admisión ya activado, una presentación común con contacto comprobado y entrada habilitada concede ingreso básico; las excepciones permitidas requieren explicación y revisión explícita, conservando la lista.
- El líder dispone de una pantalla para cargar CSV, elegir filas válidas, descargar plantilla y reporte privado, y retomar pendientes conservando los resultados ya guardados.
- La importación CSV de habilitados incorpora vista previa, confirmación explícita, recuperación del progreso y reporte privado para el líder.
- El líder puede gestionar la lista de habilitados desde la configuración de admisión: buscar contactos, cambiar nombre o estado y recuperar una respuesta perdida conservando el borrador y los cambios más recientes.
- La solicitud de ingreso permite pedir y comprobar el código del contacto, consultar respuestas inciertas y aplicar la prueba a la misma solicitud pendiente sin renovar su plazo. Una prueba ya aplicada puede sostener su revisión sin repetir el código cada día, mientras la política y la evidencia sigan vigentes.
- La consulta de ingreso con código incluye el canal y los países configurados para la cuenta solicitante, sin mostrar credenciales ni cupos internos.
- El ingreso común con código puede presentar una solicitud pendiente y aplicar la prueba del contacto en la misma confirmación, sin conceder membresía.
- Las solicitudes pendientes comunes pueden pedir un código para comprobar el contacto sin renovar su plazo; pedirlo no fija el contacto ni concede membresía.
- Los códigos de ingreso conservan el resultado original ante una respuesta perdida; su prueba puede adjuntarse a la solicitud pendiente sin renovar el plazo ni conceder membresía.
- El asistente ofrece Seguridad y retiro para elegir una conexión, revisar el motivo y el impacto, renovar la confirmación y consultar un resultado perdido antes de continuar.
- Los líderes pueden suspender una conexión con una confirmación reciente específica o retirarla cuando se resuelven sus dependencias, y recuperar el resultado original sin consultar al proveedor.
- Los líderes pueden confirmar la activación de una candidata productiva comprobada desde el asistente, recuperar la selección si se pierde la respuesta y conservar los ajustes de admisión y avisos.
- Los líderes pueden probar el canal de la candidata desde el asistente, consultar su entrega y confirmar el código recibido; la vuelta desde Google y las respuestas perdidas conservan el diagnóstico original sin volver a enviarlo.
- Los líderes pueden elegir remitentes y configurar canales desde la conexión candidata; WhatsApp muestra sus campos de plantilla e idioma, y un guardado incierto se recupera sin repetirlo.
- Los líderes pueden comprobar la credencial candidata desde la pantalla de conexión, distinguir cuentas de prueba y recuperar la comprobación sin repetirla; ante cambios concurrentes consultan el estado actual y confirman nuevamente.
- Los líderes tienen un primer paso de conexión para guardar una candidata de Zavu, borrar la clave del formulario y recuperar una respuesta perdida sin repetir el guardado; los guardianes consultan sólo su alerta de disponibilidad.
- Los líderes pueden consultar el resultado original de un guardado de conexión sin reenviar la clave ni repetir el cambio.
- Los líderes pueden activar una conexión productiva comprobada y reemplazar la anterior, conservando cupos y pruebas de admisión ya aplicadas, sin encender verificaciones automáticamente.
- Los líderes pueden solicitar y confirmar una prueba de conexión por canal, con destino y consumo explícitos, y consultar su entrega sin convertirla en verificación de admisión ni activar la conexión.
- Los líderes pueden guardar remitentes y plantillas por canal en una nueva versión candidata, conservando la conexión seleccionada y requiriendo nuevas comprobaciones antes de activarla.
- Los líderes pueden consultar remitentes y plantillas disponibles con una confirmación reciente de cuenta, sin enviar códigos ni activar canales.
- Los líderes pueden comprobar la credencial de una conexión y consultar su estado sin preparar canales ni enviar códigos; los guardianes reciben sólo una alerta operativa mínima.
- Los líderes pueden guardar una conexión candidata de mensajería con nombre y credenciales protegidas, sin sustituir la conexión seleccionada, activar códigos ni reiniciar cupos.
- Los líderes tienen una pantalla para preparar países y cupos antes de conectar la mensajería, conservar el borrador ante conflictos y recuperar un guardado incierto sin reiniciar el consumo.
- Los líderes tienen una pantalla para preparar reglas de admisión, revisar requisitos, conservar el borrador ante cambios concurrentes y volver de la confirmación con Google sin repetir un guardado incierto.
- Los líderes pueden preparar y pausar borradores de admisión con confirmación reciente; guardarlos no activa la academia ni envía comprobaciones de contacto.
- Los líderes pueden consultar el estado actual de admisión de su academia y conservar los resultados originales de cambios de configuración si se pierde una respuesta.
- La oferta de una academia con control de admisión ofrece Solicitar ingreso y abre la solicitud sin intentar un ingreso gratuito directo.
- Líderes y guardianes activos pueden revisar solicitudes comunes de admisión manual, separar el motivo interno del mensaje al solicitante y conservar la decisión original si se pierde una respuesta.
- La admisión tiene una página de solicitud y un estado propio fuera del contenido privado de la academia, con confirmación, cancelación y conservación del envío cuando se pierde una respuesta.
- La bandeja incorpora avisos propios de admisión y avisos de revisión para responsables activos, con mensajes internos que conservan la privacidad del contacto y de la revisión.
- El inicio de sesión con Google guarda evidencia del correo autenticado para las comprobaciones de contacto de academias; si esa comprobación adicional no está disponible, se conserva el acceso a la cuenta.
- Las comprobaciones sensibles distinguen la cuenta Google usada en cada sesión y dejan de reconocer una verificación anterior cuando cambia el correo de la cuenta.
- La confirmación con Google tiene una pantalla propia que conserva la solicitud y muestra si falta iniciar sesión, confirmar o volver a solicitarla.
- Se incorpora la consulta privada de actividad y métricas de admisión para el líder, conservando el consumo diario y restringiendo datos sensibles; la pantalla de consulta sigue pendiente.
- El acceso autorizado a habilitados, reportes CSV, invitaciones y solicitudes de admisión queda registrado con quién lo consultó y su alcance, preservando los permisos y evitando copiar datos privados en la auditoría.
- Las consultas autorizadas de recursos de mensajería y el uso operativo de la credencial dejan un registro de alcance y configuración, sin guardar claves ni contenido del proveedor en la auditoría.
- El historial privado registra el origen y la creación efectiva de los avisos internos de admisión, sin copiar sus destinatarios ni contenidos.
- El mantenimiento privado puede minimizar mensajes y contactos innecesarios de solicitudes finalizadas tras ciento ochenta días y purgar auditoría tras trescientos sesenta y cinco, conservando los vínculos necesarios; su programación operativa sigue pendiente.
- La limpieza interna agrupa sus pasos para que un fallo tardío revierta el lote completo y conserva por separado los resultados confirmados de admisión y mensajería.
- El mantenimiento privado puede renovar el cifrado de conexiones vigentes sin cambiar la clave de Zavu, los códigos pendientes ni el consumo acumulado.
- El historial privado conserva la configuración anterior y nueva de cada cambio efectivo de admisión, junto con los hechos permitidos al eliminar una tribu, sin copiar claves ni contactos.
- El líder puede consultar el consumo diario UTC y el historial de admisión, con filtros, versiones originales y actualización, incluso antes de conectar mensajería.
- El consumo e historial de admisión reconoce los lotes de conservación y avisos internos completados; muestra sólo duraciones medidas y conserva su ausencia cuando no hay datos.
- El historial de admisión distingue los cambios de avisos por correo y muestra su habilitación y zona horaria, sin exponer contactos ni credenciales.
- Las preferencias de avisos por correo conservan la elección propia de cada responsable y se administran por separado de la habilitación del líder y de los códigos de contacto.
- El líder puede consultar el resultado original de un cambio de correo de admisión sin repetir la confirmación de Google; los nuevos cambios siguen requiriéndola.
- Los líderes y guardianes pueden preparar su preferencia de avisos de admisión desde una pantalla propia; el líder ajusta el correo y su zona por separado y puede recuperar respuestas inciertas conservando el cambio original.
- La consulta autorizada de solicitudes de admisión permite distinguir cuáles necesitan actualmente un motivo de excepción y combinarlo con otros filtros; el control de filtros en la bandeja sigue pendiente.
- La bandeja de admisión incorpora búsqueda y filtros de estado, origen, fecha y requisitos actuales, y conserva la selección al revisar un detalle o recargar la página.
- Los líderes y guardianes pueden abrir el historial de una solicitud desde su detalle, recorrer los eventos conservados y volver con los mismos filtros; el acceso se vuelve a comprobar al regresar a la pantalla.

### Changed

- Al retomar una presentación con el mismo contacto, la pantalla reconoce su código propio, muestra su canal actual y diferencia la validación de un código vigente del reenvío explícito que reemplaza uno ya utilizado.
- El paso de comprobación de contacto aclara que los códigos usan el servicio conectado por el líder y que comprobar el contacto no acredita identidad civil ni pertenencia a un grupo de WhatsApp.
- La auditoría de la lista de habilitados conserva los estados y versiones anteriores, la operación original y el momento del cambio, sin incluir contactos ni nombres.
- El acceso con Google muestra la marca TuTribu verificada y permite comprobar la fecha de autenticación; guardar una conexión de mensajería sigue exigiendo una autenticación de Google de los últimos diez minutos.
- La auditoría de la lista de habilitados, sus importaciones y las invitaciones personales conserva los estados y versiones anteriores, la operación original y el momento del cambio o retiro de autorización, sin incluir contactos, nombres ni tokens.
- La auditoría de solicitudes, lista de habilitados, importaciones e invitaciones personales conserva los estados y versiones anteriores, las decisiones, la operación original y el momento del cambio; los permisos para reintentar mantienen su motivo privado y sus fechas, sin incluir contactos, nombres ni tokens.
- La auditoría de solicitudes, lista, importaciones, invitaciones, cupos y conexiones conserva estados, versiones, decisiones, operación original y momento del cambio; los reintentos mantienen su motivo privado y fechas, y la comprobación de credenciales registra su resultado y tipo de cuenta, sin incluir contactos, nombres ni claves.
- La auditoría de solicitudes, lista, importaciones, invitaciones, cupos y conexiones conserva estados, versiones, decisiones, operación original y momento del cambio; los reintentos mantienen su motivo privado y fechas, y la comprobación de credenciales registra su resultado y tipo de cuenta. Las comprobaciones de contacto confirmadas registran la creación de su prueba local por separado de la entrega del mensaje, sin incluir contactos, códigos, nombres ni claves.
- La auditoría de solicitudes, lista, importaciones, invitaciones, cupos y conexiones conserva estados, versiones, decisiones, operación original y momento del cambio; los reintentos mantienen su motivo privado y fechas, y la comprobación de credenciales registra su resultado y tipo de cuenta. Las comprobaciones de contacto confirmadas registran la creación de su prueba local por separado de la entrega del mensaje. El reemplazo de conexión registra las referencias anteriores y nuevas y el retiro de pruebas todavía disponibles, conservando las ya aplicadas, sin incluir contactos, códigos, nombres ni claves.
- La auditoría de solicitudes, lista, importaciones, invitaciones, cupos y conexiones conserva estados, versiones, decisiones, operación original y momento del cambio; los reintentos mantienen su motivo privado y fechas, y la comprobación de credenciales registra su resultado y tipo de cuenta. Las comprobaciones de contacto confirmadas registran la creación de su prueba local por separado de la entrega del mensaje. El reemplazo de conexión registra las referencias anteriores y nuevas y el retiro de pruebas todavía disponibles, conservando las ya aplicadas. La recuperación explícita de un aviso registra la procedencia y los cambios efectivos de la entrega original y su nuevo aviso en cola, sin incluir destinatarios, contenido, códigos, nombres ni claves.
- La auditoría de solicitudes, lista, importaciones, invitaciones, cupos y conexiones conserva estados, versiones, decisiones, operación original y momento del cambio; los reintentos mantienen su motivo privado y fechas, y la comprobación de credenciales registra su resultado y tipo de cuenta. Las comprobaciones de contacto confirmadas registran la creación de su prueba local por separado de la entrega del mensaje. El reemplazo de conexión registra las referencias anteriores y nuevas y el retiro de pruebas todavía disponibles, conservando las ya aplicadas. La recuperación explícita de un aviso registra la procedencia y los cambios efectivos de la entrega original y su nuevo aviso en cola, sin incluir destinatarios, contenido, códigos, nombres ni claves. La invalidación de pruebas por compromiso, retiro, cambio de política y reenvío conserva su estado anterior y la operación que la produjo; las pruebas históricas de una aprobación conservan su procedencia.
- La auditoría de solicitudes, lista, importaciones, invitaciones, cupos y conexiones conserva estados, versiones, decisiones, operación original y momento del cambio; los reintentos mantienen su motivo privado y fechas, y la comprobación de credenciales registra su resultado y tipo de cuenta. Las comprobaciones de contacto confirmadas registran la creación de su prueba local por separado de la entrega del mensaje. El reemplazo de conexión registra las referencias anteriores y nuevas y el retiro de pruebas todavía disponibles, conservando las ya aplicadas. La recuperación explícita de un aviso registra la procedencia y los cambios efectivos de la entrega original y su nuevo aviso en cola, sin incluir destinatarios, contenido, códigos, nombres ni claves. La invalidación de pruebas por compromiso, retiro, cambio de política y reenvío conserva su estado anterior y la operación que la produjo; las pruebas históricas de una aprobación conservan su procedencia. La aplicación de una prueba y su invalidación al cerrar el ámbito conservan también los estados de la prueba y el momento del efecto.
- La auditoría de solicitudes, lista, importaciones, invitaciones, cupos y conexiones conserva estados, versiones, decisiones, operación original y momento del cambio; los reintentos mantienen su motivo privado y fechas, y la comprobación de credenciales registra su resultado y tipo de cuenta. Las comprobaciones de contacto confirmadas registran la creación de su prueba local por separado de la entrega del mensaje. El reemplazo de conexión registra las referencias anteriores y nuevas y el retiro de pruebas todavía disponibles, conservando las ya aplicadas. La recuperación explícita de un aviso registra la procedencia y los cambios efectivos de la entrega original y su nuevo aviso en cola, sin incluir destinatarios, contenido, códigos, nombres ni claves. La invalidación de pruebas por compromiso, retiro, cambio de política y reenvío conserva su estado anterior y la operación que la produjo; las pruebas históricas de una aprobación conservan su procedencia. La aplicación de una prueba y su invalidación al cerrar el ámbito conservan también los estados de la prueba y el momento del efecto. Los intentos, resultados, aplazamientos por cupo y reconciliaciones de entrega conservan los cambios efectivos y su operación original; repetir una confirmación idéntica no duplica esos registros.
- La emisión de un código registra el mensaje que quedó en cola; su reemplazo o retiro registra sólo cancelaciones confirmadas y conserva los envíos ya iniciados o inciertos, con la acción original y sin datos privados.
- Las métricas de admisiones registran la última ejecución completa de mensajería y los tiempos de sus pasos por tribu, conservando separados los resultados de entrega.
- Los países y cupos comparan el uso guardado con la propuesta y exigen confirmar nuevamente cada aumento, aclarando su impacto y que el consumo se conserva.
- La documentación de mensajería explica quién controla la cuenta de envío, los cupos y los plazos de conservación, y cómo se limita el acceso durante una recuperación.

### Fixed

- El cierre de academia y la eliminación de una tribu conservan el registro privado de sus mensajes cancelados y de los resultados que llegan para envíos ya iniciados, sin duplicarlos ni devolver su consumo.
- El guardado de conexiones reconoce la dirección pública segura de TuTribu detrás del servidor local y evita rechazos falsos de permisos.
- Una confirmación de cuenta vencida indica cómo volver a la acción e iniciar otra, sin mantener indefinidamente el resultado de un intento anterior.
- La confirmación de cuenta distingue la sesión de TuTribu de la de Google y explica cómo continuar cuando Google conserva una autenticación anterior.
- Los eventos de teclado sin una tecla válida ya no interrumpen la navegación lateral; los atajos con Ctrl y Cmd siguen disponibles.
- Una academia que ya activó su control de admisión conserva la entrada mediante solicitud aunque se pierda su configuración, sin volver a ofrecer un ingreso directo.
- Se puede llegar con el teclado al enlace para volver a solicitar ingreso después de cancelar una solicitud.
- El estado de una solicitud pendiente explica restricciones actuales y limpia la explicación anterior al consultar; el reintento después de cancelar también se ofrece cuando requiere comprobar contacto.
- Una prueba aplicada conserva su confirmación si falla la consulta posterior; los responsables ven causas actuales y los avisos de una decisión se limpian al abrir otra solicitud.
- Las solicitudes con una prueba de contacto revocada siguen indicando que necesitan verificación para solicitantes y revisores, incluso cuando se desactiva la verificación adicional.
- La gestión de invitaciones personales completa la carga inicial en Safari sin perder las comprobaciones vigentes de sesión y permisos.
- Después de cancelar y quedar habilitada una nueva presentación, el paso de contacto permite elegir otro teléfono; conserva las operaciones anteriores y exige consultar cualquier resultado incierto antes de otro envío.
- La comprobación de contacto conserva el aviso de un código vencido, invalidado o con intentos agotados y bloquea nuevos intentos sobre ese código hasta recibir un reenvío confirmado.
- La comprobación de contacto muestra el motivo seguro cuando el cupo de envíos está agotado o la mensajería no está disponible; escribir el código mantiene esa información y consultar un envío nuevo reemplaza el motivo anterior.
- Los reenvíos de códigos que no corresponden a la cuenta o academia se rechazan sin dejar un envío registrado en progreso ni mostrar datos de otra persona.
- La eliminación autorizada de una cuenta vinculada conserva la protección de su contacto sin mantener los datos personales del vínculo ni permitir que otra cuenta se lo apropie.
- La eliminación física de una tribu conserva la procedencia protegida mínima y los límites de comprobación de contacto; retira sus credenciales y detiene nuevos envíos, manteniendo el resultado de los envíos ya iniciados.
- Las confirmaciones simultáneas de ingreso pueden avanzar sin quedar detenidas en el registro inicial de la operación.
- Los rechazos conocidos de solicitudes y decisiones de admisión conservan su resultado original; consultar una respuesta perdida muestra el motivo y mantiene el texto escrito sin repetir la acción ni anunciar un ingreso inexistente.
- Los rechazos al pedir o reenviar un código conservan su resultado confirmado y pueden consultarse después de una respuesta perdida, sin dejar un envío pendiente ni consumir su cupo.
- La confirmación del código de ingreso espera a que la cuenta y sus referencias estén listas, evitando perder una confirmación hecha durante la carga inicial.
- Activar una candidata exige también el canal de correo cuando los avisos externos están habilitados, conservando esos ajustes y los cupos de la academia.
- Las pruebas de conexión conservan el tiempo previsto para enviar el código cuando preparar la operación demora, sin reenviar automáticamente un envío incierto.
- La candidata de mensajería muestra Preparada al completar sus pruebas y vuelve a Borrador si la credencial deja de estar comprobada, conservando la conexión seleccionada y la activación explícita.
- Cambiar la configuración candidata permite solicitar otra prueba al mismo destino; conserva los diagnósticos anteriores y su consumo sin acreditar la nueva versión.
- Los intentos de conexión sin resultado permiten consultar el estado actual, reanudar los mismos datos con nueva confirmación o conservar su referencia en un historial local, sin cancelar el servidor ni repetir operaciones automáticamente.
- Una comprobación de credencial interrumpida conserva su consumo y puede cerrar como no disponible sin otra consulta al proveedor; un resultado tardío no reemplaza el original confirmado.
- Las solicitudes de conexión con un proveedor no disponible informan que falta esa capacidad, sin guardar la credencial ni elegir otro proveedor.
- Una conexión no se activa si su diagnóstico vence mientras espera la confirmación en la base de datos.
- Las consultas y los envíos de mensajería cierran al alcanzar el tiempo límite, sin repetir operaciones cuyo resultado sigue incierto.
- Las solicitudes pendientes se cierran ante la salida de academia, la eliminación de pertenencia o un bloqueo no recuperable, y no se reabren al volver al estado anterior.
- La recuperación paga de una membresía cierra su solicitud de admisión pendiente y avisa el resultado, sin agregar otra aprobación ni perder el silenciamiento.
- Volver a confirmar el ingreso con una membresía ya recuperada cierra la solicitud anterior sin fingir una aprobación; conserva su vencimiento y los resultados de envíos anteriores.
- El ingreso anterior a una academia con control no informa una membresía creada cuando el resultado real es una solicitud pendiente.
- Los resultados tardíos de envío conservan el intento pendiente para su reconciliación, sin repetir el mensaje ni alterar un resultado ya informado.
- Volver de Google con Atrás no permite repetir una confirmación si todavía no se pudo consultar el estado del intento anterior.
- La recuperación de operaciones de admisión conserva los resultados confirmados de un lote sin repetir cambios; una falla inesperada revierte el lote completo.
- Las academias con control protegido rechazan ingresos por enlaces antiguos y conservan las restricciones de recuperación; el modo clásico y los reintentos de membresías pagas mantienen sus recorridos.
- Una solicitud de pago malformada se rechaza sin iniciar un reintento de suscripción.
- La revisión de suscripciones de academia conserva la membresía básica; las revisiones de membresía respetan silenciamientos y bloqueos y muestran el estado confirmado en esa revisión.
- La recuperación paga de membresías protegidas conserva el silenciamiento y la fecha de ingreso, sin levantar bloqueos por conducta ni reutilizar una admisión anterior.
- La recuperación de acceso por pago evita bloquearse cuando se intenta eliminar al mismo tiempo la cuenta que creó la tribu.
- La eliminación de una tribu con avisos recuperados conserva su procedencia y su historial sin quedar bloqueada ni reiniciar consumos.
- El inicio de sesión, la confirmación de acciones sensibles y las consultas privadas protegen las credenciales en respuestas y registros, conservando la sesión y los errores recuperables.
- Al perder permisos con la misma cuenta, los países, cupos y datos administrativos anteriores se ocultan hasta comprobar el acceso vigente.
- Las pantallas de configuración de admisión conservan una sola región principal para la navegación con tecnologías de asistencia.
- Al revisar admisiones, una excepción permite preparar su motivo antes de aprobar; las decisiones confirmadas actualizan la selección visible y «Mostrar pendientes» limpia también las ediciones sin aplicar.
- Los filtros de admisión rechazan los rangos de fecha invertidos aunque la diferencia sea menor a un milisegundo.

### Security

- Los campos de códigos de ingreso, pruebas de mensajería y claves de conexión quedan excluidos de las capturas al reportar un problema.
- Las referencias mínimas de tribus eliminadas quedan protegidas frente a su reactivación o reutilización.
- Cambiar o perder el liderazgo activo suspende las conexiones del líder anterior en el mismo cambio, conservando las membresías, las invitaciones y el consumo.
- El historial de decisiones de admisión conserva la evidencia mínima usada al decidir, sin guardar códigos ni datos privados del proveedor.
- La recuperación de una admisión permite consultar el resultado propio sin pertenecer todavía a la academia y conserva los permisos actuales de sus responsables.
- Adelantar un reintento requiere un líder activo y una confirmación reciente de cuenta; conserva la decisión original y rechaza la corrección si la sesión vence durante la operación.
- Las consultas de admisión permiten leer sólo la solicitud propia sin exigir pertenencia; conservan el estado existente cuando la configuración de una academia protegida deja de estar disponible.
- Los reintentos de presentación conservan el resultado originalmente confirmado, y las mutaciones rechazan peticiones desde un origen web ajeno antes de ejecutar cambios.
- Las operaciones sensibles de mensajería conservan la sesión y cuenta originales; si vencen durante la operación, informan que hace falta iniciar sesión sin confirmar cambios pendientes.
- La comprobación de países de mensajería distingue la conexión seleccionada de la candidata y deja de usar restricciones de una versión reemplazada.
- Las respuestas de admisión separan los datos del solicitante de la revisión y rechazan progreso no confirmado o pruebas de contacto de otro propósito.
- Los diagnósticos de errores de envío conservan sólo la referencia del intento y no incluyen su autorización privada completa.
- Las comprobaciones de credenciales de mensajería comparten un límite por academia aunque cambie la clave, y los reintentos conservan su consumo original.
- Los avisos de admisión quedan ligados a la solicitud y tribu de origen; su acceso distingue al solicitante de los responsables activos y evita duplicados.
- Un código de verificación que vence mientras espera una comprobación se rechaza sin confirmar el contacto ni consumirlo.
- Las solicitudes de confirmación de cuenta dejan de crearse, iniciarse o consultarse si la sesión vence, incluso cuando ocurre durante una espera.
- Las operaciones de purga de credenciales retiradas requieren autorización vigente y conservan sus referencias e historial al eliminar el material privado.
- Los controles de mensajería rechazan sesiones vencidas y recursos de otro entorno antes de consultar material privado.
- El historial de admisiones conserva la relación con su tribu y sus operaciones, evitando referencias cruzadas entre comunidades.
- Los resultados confirmados de las operaciones de admisión quedan protegidos contra sobrescrituras y cambios de identidad.
- Las credenciales de mensajería retiradas o vinculadas a una cuenta o recurso sin autorización quedan fuera de uso; su eliminación conserva el historial de la conexión.

## [1.8.1] - 2026-10-16

### Fixed

- Las fotos de perfil de Google de los integrantes vuelven a mostrarse en la ronda, los comentarios, los eventos y la lista de integrantes, en lugar de quedar reemplazadas por un ícono vacío.

## [1.8.0] - 2026-10-16

### Changed

- El botón de cerrar de las ventanas emergentes se anuncia como «Cerrar diálogo».
- La confirmación para eliminar un evento ya no se cierra al hacer click afuera y abre con el foco en «Cancelar».
- En el visor de imágenes y videos de un mensaje y en la galería de la historia de la tribu, las flechas y los indicadores de posición quedan debajo del contenido; los indicadores se pueden recorrer con el teclado y cada cambio se anuncia, por ejemplo «Medio 2 de 5».
- La paginación de la ronda tiene el diseño nuevo de flechas «Anterior» y «Siguiente», que en el teléfono muestran solo el ícono.
- En el detalle de un evento, las etiquetas del tipo de encuentro y de su estado (cancelado, movido o finalizado) se muestran juntas debajo del título, antes de la fecha.
- Los desplegables de los formularios muestran su título con el mismo estilo que el resto de los campos y abren la lista debajo, con el mismo ancho.
- Al pasar el puntero sobre los avatares de quienes comentaron un mensaje o van a un evento se ve el nombre de cada persona, y los avatares sin foto muestran dos iniciales.

## [1.7.6] - 2026-10-16

### Security

- Las conexiones con la base de datos mantienen la verificación del certificado y de la identidad del servidor ante futuras actualizaciones, evitando que se reduzca la protección de los datos.

## [1.7.5] - 2026-10-16

### Fixed

- Al escribir un mensaje de la ronda, la barra con los botones de imagen, adjunto, encuesta, video y «Elegir canal» tiene el mismo espacio arriba y abajo, en lugar de quedar pegada al pie de la ventana.

## [1.7.4] - 2026-10-16

### Changed

- Las ventanas emergentes aparecen y se cierran con una transición más corta y sobria: suben apenas mientras aparecen y se desvanecen rápido al cerrarse.
- Los campos con error ya no tiemblan: el error se indica con el color del borde y el mensaje debajo.
- Las opciones de las listas desplegables, los avisos y el ícono del cambio de tema aparecen con un fundido breve, sin desenfoque.

### Fixed

- Al moverse con el teclado por una lista desplegable o un menú mientras todavía se está abriendo, el resaltado acompaña a la opción sin saltar al terminar.
- En el menú «Elegir canal» al escribir un mensaje de la ronda, el emoji de cada canal queda en una columna del mismo ancho y centrado con su nombre, así todas las opciones se ven alineadas.
- Al escribir un mensaje de la ronda, el título y el texto del mensaje usan el mismo fondo que la ventana, en lugar de verse como bloques de otro color en el modo oscuro.

## [1.7.3] - 2026-10-16

### Changed

- El indicador de carga de la ronda, al cargar mensajes y respuestas, tiene un diseño nuevo: más pequeño y con una animación de puntos que se transforma con suavidad.

## [1.7.2] - 2026-10-16

### Changed

- Las notificaciones adoptan el estilo del sistema de diseño de TuTribu, con sus íconos y colores en modo claro y oscuro.

### Fixed

- Los botones de una notificación, como el de cerrarla, funcionan mientras hay una ventana emergente abierta y ya no la cierran. También se alcanzan con el teclado (Alt+T) y, al cerrar la notificación, el foco vuelve a la ventana.
- El selector de emoji de los canales se desplaza por dentro cuando no entra en la pantalla, en lugar de quedar cortado.
- En el modo oscuro, el encabezado con el autor y la fecha en el detalle de un mensaje de la ronda, y la barra de acciones al escribir un mensaje, ya no muestran una franja de otro color: usan el mismo fondo que la ventana.
- Al abrir el detalle de un mensaje de la ronda ya no aparece sola la lista «Le gustó a»: se muestra al pasar el puntero sobre Me gusta o al llegar al botón con el teclado.

## [1.7.1] - 2026-10-16

### Fixed

- Con la barra lateral abierta en una pantalla angosta, el menú para cambiar de tribu y los demás menús que se abren desde ella vuelven a verse encima del panel, en lugar de quedar ocultos detrás.

## [1.7.0] - 2026-10-16

### Changed

- Las ventanas emergentes tienen un diseño nuevo: un fondo más oscuro y desenfocado, igual en todas las pantallas, paneles más amplios y una franja inferior para los botones, como en el detalle de un evento o al escribir un mensaje en la ronda.
- Los interruptores, las casillas, las opciones, los desplegables y las pestañas tienen un diseño nuevo, más fácil de tocar, y se mueven con animaciones suaves al cambiar de estado; las pestañas que no entran en pantalla se desplazan de costado.
- Las etiquetas como «Tribu privada», «En vivo» u «Hoy» usan colores según su significado, y el aviso «En vivo» se destaca en rojo.
- Los menús, las notificaciones, las vistas previas de reacciones y los avisos al pasar el puntero tienen un diseño nuevo y aparecen desde el botón que los abre. Los avisos al pasar el puntero esperan un instante antes de mostrarse, y la lista de quienes reaccionaron a un mensaje aparece y se oculta más rápido.
- El carrusel de imágenes y la paginación de la ronda tienen un diseño nuevo, con controles redondos y más claros.
- Con movimiento reducido, todas estas animaciones se reemplazan por transiciones simples o desaparecen.

## [1.6.0] - 2026-10-15

### Changed

- Actualización de mantenimiento sin cambios visibles en el diseño ni en los recorridos de la aplicación.

## [1.5.0] - 2026-10-15

### Changed

- Los campos de texto de los formularios tienen un diseño nuevo: son más altos, el borde se marca al enfocarlos y se pone rojo cuando hay un error, y los textos largos se escriben en un área más alta que se puede agrandar.
- La ayuda y los errores de cada campo aparecen justo debajo con una animación suave y, cuando cambian, solo se mueven las palabras o los números que cambiaron; los lectores de pantalla los anuncian junto con el campo. Con movimiento reducido aparecen sin animación.
- En los formularios de eventos, propuestas, precios, invitaciones, canales, cursos y bienvenida, cada error de validación aparece debajo del campo que hay que corregir, en lugar de un único aviso al pie del formulario.

## [1.4.0] - 2026-10-15

### Added

- La barra lateral se contrae y se expande también con la tecla [, y el botón del panel muestra hacia dónde se va a mover y qué tecla usar.
- El encabezado muestra la ruta de la página: la tribu, Gestión cuando corresponde, y la sección abierta.

### Changed

- La barra lateral tiene un diseño nuevo: la marca de la tribu muestra tu rol, tu foto y tu nombre quedan al pie, y al contraerla cada grupo de secciones se separa con una línea y el nombre de cada sección aparece al pasar el mouse por su ícono.
- En pantallas medianas, la barra abierta flota sobre la página en lugar de achicarla; en el teléfono el menú se abre como una hoja que se puede cerrar deslizándola hacia la izquierda.

## [1.3.1] - 2026-10-15

### Changed

- En la gestión de invitaciones, "Copiar link" y el menú de más acciones quedan unidos en un solo botón dividido: copiar sigue siendo la acción principal, y la flecha de al lado abre "Cambiar plan", "Editar canal" y "Revocar". Al copiar, el texto cambia a "Copiado" letra por letra.

## [1.3.0] - 2026-10-14

### Changed

- Las ventanas y los avisos de confirmación se abren desplegándose desde su centro y se cierran plegándose hacia él, en lugar de aparecer subiendo con un fundido. Con movimiento reducido siguen apareciendo sin animación.

## [1.2.4] - 2026-10-14

### Fixed

- Los contadores de "me gusta" y de comentarios de cada mensaje de la ronda vuelven a quedar alineados a la misma altura y con el mismo tamaño al pasar el mouse.
- Al abrir el detalle de un mensaje de la ronda en computadora, el contenido ya no se corre un píxel cuando termina la animación de apertura.
- El botón para cerrar el detalle de un mensaje de la ronda aparece directamente en la esquina de la pantalla, sin mostrarse antes un instante dentro del detalle.

## [1.2.3] - 2026-10-14

### Changed

- Actualización de mantenimiento sin cambios visibles en el diseño ni en los recorridos de la aplicación.

## [1.2.2] - 2026-10-13

### Changed

- La aplicación adopta un diseño renovado: colores, superficies y bordes más sobrios, esquinas más redondeadas, botones más altos y cómodos de tocar, el azul como color de acento, la tipografía Inter para el texto y fondos lisos.
- El acceso con Google muestra la marca TuTribu verificada y permite comprobar la fecha de autenticación; guardar una conexión de mensajería sigue exigiendo una autenticación de Google de los últimos diez minutos.

## [1.2.1] - 2026-10-12

### Fixed

- La política de privacidad se publica correctamente y queda disponible desde la página principal.

## [1.2.0] - 2026-10-12

### Added

- La política de privacidad puede consultarse sin iniciar sesión desde la página principal e incluye el contacto del responsable del servicio.

### Fixed

- Las actualizaciones del servicio comprueban sus dependencias y el esquema existente antes de publicarse.

## [1.1.4] - 2026-10-12

### Changed

- Los botones de la aplicación adoptan un estilo renovado: el botón principal usa el color de texto del tema, responde al presionarlo y anima su ancho cuando cambia su texto.

## [1.1.3] - 2026-10-04

### Fixed

- La academia permite reintentar la confirmación cuando Mercado Pago todavía no identifica una cuota, en lugar de omitirla y dar la revisión por terminada.

## [1.1.2] - 2026-10-04

### Fixed

- Las devoluciones completas de cuotas de academia actualizan el acceso al recibir la notificación del pago, aunque el detalle de la cuota tarde en actualizarse, conservando la membresía básica y las otras fuentes de acceso.
- La academia consulta el historial completo de cuotas de una suscripción sin omitir pagos y evita confirmar una revisión cuando el historial está incompleto.
- Las notificaciones de Mercado Pago llegan al receptor de TuTribu en lugar de redirigirse a la portada.
- La academia abre el pago en Mercado Pago sin exigir una tarjeta antes de entrar al checkout y evita crear suscripciones duplicadas por solicitudes simultáneas o fallos de conexión.
- Las cuotas de academia se procesan también cuando la notificación de Mercado Pago no informa la cuenta vendedora.
- Cancelar una suscripción detiene su renovación y confirma correctamente una cancelación ya realizada en Mercado Pago.

## [1.1.1] - 2026-10-03

- 8b94b15 actualiza la dependencia «beez-ui» a la versión 0.10.0
- c4b4165 agrega actualización de la dependencia «beez-rp» a la versión 0.6.1

## [1.1.0] - 2026-10-02

### Changed

- Las herramientas para reportar problemas usan Beezping y aprovechan sus mejoras de interacción en modales, formularios y reintentos de envío. Las acciones no disponibles en TuTribu dejan de mostrarse y los errores al cargar las herramientas permiten reintentar.

## [1.0.4] - 2026-09-29

### Fixed

- Cambiar de canal o de página en la ronda de la tribu vuelve a mostrar los mensajes en lugar de «No pudimos cargar los mensajes».

## [1.0.3] - 2026-09-29

### Changed

- Gestionar academia se reorganizó: cada sección explica para qué sirve, las admisiones y la venta se activan con interruptores que describen su efecto, y los estados de verificaciones, proveedores e integrantes se muestran como etiquetas. Los filtros quedan en una sola línea y la página se lee mejor en el teléfono.

## [1.0.2] - 2026-09-29

### Changed

- La página Academia muestra tu estado con una etiqueta clara (Academia activa, Acceso básico, Acceso finalizado o Vista de líder) y, si tu acceso es básico, los pasos para sumar la academia marcando cuáles ya completaste. Si la oferta todavía no está cargada, el líder ve un aviso para configurarla.

## [1.0.1] - 2026-09-28

### Added

- El líder puede activar la academia de su tribu desde Ajustes. Al activarla, los integrantes actuales conservan todo su acceso y solo quienes entren después empiezan con acceso básico; las admisiones y la venta empiezan cerradas.

### Changed

- La barra lateral muestra Academia solo en las tribus que usan el modo academia, y a quien tiene acceso básico le muestra solo las secciones que puede abrir.

## [1.0.0] - 2026-09-28

### Added

- Las tribus pueden funcionar en modo academia: se ingresa gratis, la conversación sigue en WhatsApp y los cursos de academia y el contenido interno de la tribu se habilitan con una suscripción o una bonificación del líder. Las tribus que no pasan a este modo siguen funcionando como siempre.
- Nueva página Academia con tu estado de acceso (bonificado, pago o ambos, con su fecha de fin), la oferta de la tribu y el siguiente paso; si tu acceso vence, conservás tu cuenta y tu progreso.
- Podés solicitar la verificación de tu vinculación con los proveedores que configura el líder, ver si está en revisión, verificada, rechazada o revocada (con su motivo) y volver a solicitarla. Nunca se piden DNI, claves ni datos de tus inversiones.
- Los líderes y guardianes revisan las solicitudes de verificación desde Gestionar academia; si otra persona decidió antes, ven el estado actual en lugar de pisarlo.
- Los líderes configuran la oferta de la academia, los proveedores de verificación, las admisiones y la venta, y pueden bonificar o revocar el acceso de una persona con fecha de fin y motivo, con aviso cuando esa persona tiene una renovación activa.
- Los cursos pueden marcarse como de academia: quien no tiene acceso ve su título, descripción y portada, y el desbloqueo gradual empieza con la primera activación de la academia.
- Al crear un precio se puede elegir el producto Academia (mensual, sin prueba gratuita), sin que marcarlo como actual cierre el ingreso gratuito.

### Changed

- En las tribus en modo academia, una invitación histórica solo permite el ingreso gratuito y nunca da acceso a la academia ni inicia un pago de membresía.

### Security

- Las descargas de archivos de mensajes y de lecciones, el listado de canales y el árbol de cursos vuelven a comprobar en el servidor que puedas ver ese contenido antes de responder.

## [0.94.8] - 2026-09-28

### Changed

- Cambiar de mes en Eventos (flechas, «Hoy» o deslizando en el teléfono) ahora es instantáneo: solo se cargan los eventos de ese mes, sin recargar la página ni perder el filtro de tipos, y los botones Atrás y Adelante del navegador te llevan por los meses que recorriste.
- Cambiar de canal o de página en la ronda de la tribu ahora es instantáneo: se mantiene el borrador del mensaje que estabas escribiendo y los botones Atrás y Adelante del navegador siguen funcionando.
- Abrir un curso desde el catálogo y volver a «Todos los cursos» ahora es instantáneo, y el progreso que marcaste dentro de un curso se ve al volver al catálogo sin recargar.
- Al volver de Mercado Pago, la pantalla que confirma tu suscripción consulta el estado sin recargar la página, espera cada vez más entre consultas y, si la confirmación tarda, te ofrece el botón «Actualizar estado» en lugar de seguir intentando indefinidamente.
- Al crear una tribu, los errores de nombre o de enlace (incluido un enlace ya en uso con su sugerencia) se muestran en el mismo formulario, sin recargar la página y con el foco en el campo a corregir.

## [0.94.7] - 2026-09-28

### Fixed

- Al reproducir un video en el visor de medios de un mensaje ya no aparecen líneas sobre el fondo; ahora el visor se muestra sobre un fondo oscuro uniforme.

## [0.94.6] - 2026-09-27

### Changed

- Al cerrar sesión volvés al inicio de TuTribu en lugar de ir directo a la pantalla de Google, y el botón Atrás ya no muestra tu cuenta.

### Fixed

- La sesión ya no se cierra sola cada pocos días: mientras entres a TuTribu al menos una vez cada 180 días, seguís con la sesión iniciada.
- Si tu sesión vence mientras tenés TuTribu abierto, la página se actualiza y te ofrece iniciar sesión de nuevo en lugar de mostrarte como conectado. También se actualiza si en otra pestaña iniciaste sesión con otra cuenta.
- Si tu sesión se pierde justo antes de suscribirte desde una invitación, al volver a iniciar sesión regresás a esa invitación en lugar de ir al inicio.
- Si tu sesión vence mientras estás en una sección de tu tribu (eventos, cursos, canales, ajustes y las demás), te pedimos iniciar sesión y volvés a la misma sección, en lugar de ver "Esta página no existe".
- Si no se puede cerrar la sesión, seguís en la página donde estabas y podés reintentar desde ahí.
- Si volvés con Atrás desde la pantalla de Google, TuTribu ya no te manda de nuevo a Google automáticamente: te muestra el botón para iniciar sesión cuando quieras.

### Security

- El inicio de sesión ya no acepta enlaces de retorno disfrazados que podían llevarte a un sitio fuera de TuTribu.

## [0.94.5] - 2026-09-27

### Changed

- El menú de cuenta muestra tu avatar junto al nombre y el correo al abrirse.

## [0.94.4] - 2026-09-26

### Fixed

- Los fondos, bordes y textos teñidos con el color principal (el día de hoy en el calendario, los chips y bordes activos, los links y etiquetas destacadas) conservan el azul del tema en lugar de virar a rosa o violeta.

## [0.94.3] - 2026-09-26

### Fixed

- En Eventos, el resaltado de la respuesta de asistencia ("Voy", "Tal vez", "No voy") y el del selector entre lista y calendario se deslizan sin esconderse detrás de los otros botones ni taparlos, y el borde de la respuesta elegida acompaña al resaltado.

## [0.94.2] - 2026-09-26

### Fixed

- En el filtro de canales de la ronda, el resaltado del canal elegido se desliza sin esconderse detrás de los otros canales ni tapar sus nombres, y el borde lo acompaña.

## [0.94.1] - 2026-09-26

### Added

- Las fotos de perfil aparecen suavemente al cargar y, en la ronda, el indicador de página acompaña el cambio de página.

### Changed

- Los indicadores de carga muestran un brillo suave; el menú lateral, el panel de notificaciones y los controles de los formularios tienen transiciones más fluidas.

### Fixed

- Los menús y selectores muestran sus bordes y sombras desde que se abren, y las tarjetas interactivas conservan su contorno al pasar el puntero.

## [0.94.0] - 2026-09-26

### Added

- Animaciones sutiles en toda la plataforma: los mensajes, respuestas, comentarios, eventos, invitaciones, miembros y notificaciones entran y salen con suavidad, y los contadores (me gusta, asistentes, no leídas, links activos) se animan al cambiar.
- Al cambiar de mes en Eventos, el mes entra deslizándose en la dirección elegida, y la respuesta de asistencia ("Voy", "Tal vez", "No voy") se marca con un resaltado que se desliza.
- El filtro de canales de la ronda resalta el canal elegido al instante y, en el celular, muestra el canal activo aunque esté al final.
- La galería de la historia de la tribu muestra indicadores de posición.
- La campana de notificaciones avisa con un leve movimiento cuando llega una notificación nueva, y el selector de tema muestra el modo actual.
- Los editores de historia y bienvenida permiten reordenar arrastrando desde un asa y avisan cuando el texto se acerca al límite de caracteres.
- Los comentarios de lecciones se publican con Ctrl/Cmd+Enter y su carga se puede reintentar si falla.

### Changed

- El día de hoy se marca con un círculo en el calendario mensual, y los próximos eventos usan el color de su tipo.
- Los botones de envío muestran qué está pasando ("Creando…", "Guardando…", "Publicando…", "Redirigiendo a Google…") y evitan envíos duplicados en invitaciones, cursos, historia, bienvenida, pagos, alta de tribu, inicio de sesión y unirse gratis.
- Los errores de validación aparecen junto a cada campo, lo marcan y le dan foco, siempre en español.
- El foco del teclado ya no se pierde al borrar, cancelar o cerrar en comentarios, propuestas, canales, cursos, invitaciones y editores.
- La búsqueda de miembros ignora acentos y avisa cuando nada coincide.
- Los skeletons de carga ya no parpadean en navegaciones rápidas.
- Se corrigieron tildes y voseo en textos de sesión, errores y la página 404.

### Fixed

- Los diálogos de eventos ya no se vacían ni muestran "Cargando…" mientras se cierran.
- La exportación de miembros funciona en Safari/iOS, y el botón de soporte de WhatsApp aparece también en Safari anterior a 17.4.
- En el celular, el día tocado en un mes ya no queda seleccionado al pasar a otro mes, y elegir una lección de un curso lleva la vista hasta ella.
- Un mensaje o una respuesta ya no parpadea al confirmarse, se puede seguir escribiendo una respuesta mientras se envía la anterior y, si falla, no se pierde lo nuevo.
- Se corrigió un aviso de error que aparecía al pinear o despinear un mensaje con éxito, y los avisos de éxito al crear, editar o eliminar canales e invitaciones.
- Un video de la galería de la historia ya no sigue sonando al pasar a otra imagen.
- Después de cancelar una suscripción el estado muestra "cancelada", y "Volver a pagar" no se vuelve a habilitar tras redirigir al pago.
- El diagnóstico de precios ya no muestra un check mientras se actualiza o si falla, y dice "1 miembro asociado" en singular.
- Los errores de invitaciones, ajustes y soporte se muestran en español y corresponden a la acción que falló.
- Los ajustes avisan cuando la imagen de una URL no carga y cuando falta guardar tras subirla.
