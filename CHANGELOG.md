# Cambios

Todos los cambios relevantes de TuTribu se documentan en este archivo con el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cada cambio agrega sus entradas en `[Unreleased]`; `pnpm create-version` las pasa a la versión publicada con su fecha. Las versiones hasta la 0.93.0 no tienen entradas en este archivo.

## [Unreleased]

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
