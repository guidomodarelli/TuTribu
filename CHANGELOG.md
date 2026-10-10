# Cambios

Todos los cambios relevantes de TuTribu se documentan en este archivo con el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cada cambio agrega sus entradas en `[Unreleased]`; `pnpm create-version` las pasa a la versión publicada con su fecha. Las versiones hasta la 0.93.0 no tienen entradas en este archivo.

## [Unreleased]

### Added

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

- La solicitud de ingreso permite pedir y comprobar el código del contacto, consultar respuestas inciertas y aplicar la prueba a la misma solicitud pendiente sin renovar su plazo.

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

### Changed

- Al retomar una presentación con el mismo contacto, la pantalla reconoce su código propio, muestra su canal actual y diferencia la validación de un código vigente del reenvío explícito que reemplaza uno ya utilizado.

- El paso de comprobación de contacto aclara que los códigos usan el servicio conectado por el líder y que comprobar el contacto no acredita identidad civil ni pertenencia a un grupo de WhatsApp.

### Fixed

- Después de cancelar y quedar habilitada una nueva presentación, el paso de contacto permite elegir otro teléfono; conserva las operaciones anteriores y exige consultar cualquier resultado incierto antes de otro envío.

- La comprobación de contacto conserva el aviso de un código vencido, invalidado o con intentos agotados y bloquea nuevos intentos sobre ese código hasta recibir un reenvío confirmado.

- La comprobación de contacto muestra el motivo seguro cuando el cupo de envíos está agotado o la mensajería no está disponible; escribir el código mantiene esa información y consultar un envío nuevo reemplaza el motivo anterior.

- Los reenvíos de códigos que no corresponden a la cuenta o academia se rechazan sin dejar un envío registrado en progreso ni mostrar datos de otra persona.

- La eliminación autorizada de una cuenta vinculada conserva la protección de su contacto sin mantener los datos personales del vínculo ni permitir que otra cuenta se lo apropie.

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

### Security

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
