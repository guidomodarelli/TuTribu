# Cambios

Todos los cambios relevantes de TuTribu se documentan en este archivo con el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cada cambio agrega sus entradas en `[Unreleased]`; `pnpm create-version` las pasa a la versión publicada con su fecha. Las versiones hasta la 0.93.0 no tienen entradas en este archivo.

## [Unreleased]

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

