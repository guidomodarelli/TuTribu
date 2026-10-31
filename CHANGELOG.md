# Cambios

Todos los cambios relevantes de TuTribu se documentan en este archivo con el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cada cambio agrega sus entradas en `[Unreleased]`; `pnpm create-version` las pasa a la versión publicada con su fecha. Las versiones hasta la 0.93.0 no tienen entradas en este archivo.

## [Unreleased]

### Fixed

- En Reglas de admisión ya se puede elegir «Lista de habilitados» (u otra opción) al tocarla; antes el clic no la seleccionaba. Lo mismo pasaba con otras casillas, interruptores y listas desplegables.

## [1.10.4] - 2026-10-29

### Changed

- Las páginas cargan menos código de animaciones, por lo que abren un poco más rápido.
- En la barra de navegación, el nombre de la sección actual aparece y se va con una animación, igual que la sección de arriba.

### Fixed

- Las imágenes que publicás en el Fogón ya no quedan ocupando memoria del navegador cuando se reemplazan por la versión subida o cuando salís de la ronda.
- En el Fogón, cancelar la edición de un mensaje recién publicado con imagen (o quitarle la imagen y cancelar, o guardar la edición) ya no rompe la imagen que muestra el mensaje.
- Al crear una tribu, si el servidor falla pero responde como si la hubiera creado, el formulario muestra el error en lugar de darla por creada.
- Al reintentar la carga de los comentarios de una lección, una carga vieja que termina tarde ya no deja la lista vacía.

### Security

- Los videos de YouTube, Vimeo, Wistia y Loom que se muestran en cursos, eventos, el Fogón y la historia de la tribu se reproducen aislados del resto de TuTribu.

## [1.10.3] - 2026-10-28

### Fixed

- En el celular, al abrir el detalle de un mensaje, el botón de opciones (…) queda al lado izquierdo de la cruz para cerrar, a la misma altura, en vez de quedar encimado sobre ella.
- En los filtros de Solicitudes y del Historial de actividad de admisiones, los títulos de «Búsqueda», «Desde», «Hasta» y «Referencia del recurso» tienen el mismo tamaño que los demás campos.
- En iPhone, el interruptor activado muestra el círculo centrado y los campos de fecha y hora (como «Desde» y «Hasta» en Solicitudes) ya no se salen del formulario.

## [1.10.2] - 2026-10-28

### Fixed

- Todas las páginas de la tribu (Fogón, Academia, Gestionar academia, Canales, Suscripción, Cursos, Eventos, Admisiones y las demás) y sus pantallas de carga tienen el mismo margen interior: ya no quedan pegadas al borde ni con margen doble según la sección.
- Las pantallas «Esta página no existe» y de error vuelven a ocupar todo el ancho del área de contenido: su fondo llega hasta los bordes, sin la franja de margen que las rodeaba.
- La pantalla «Esta página no existe» ocupa toda la altura de la ventana en vez de cortarse a la mitad con un bloque blanco debajo, y la pantalla de error ya no genera una barra de desplazamiento dentro de la tribu.

## [1.10.1] - 2026-10-28

### Changed

- Los líderes de una academia ya pueden habilitar las ventas del acceso pago desde Gestionar academia, con Mercado Pago conectado y un precio configurado.
- En una tribu en modo academia, quien todavía no es integrante y abre un enlace a una sección (por ejemplo Cursos o Eventos) llega a la página de Academia para solicitar el ingreso, en lugar de ver «Esta página no existe o ya no está disponible».
- Cuando no podés dar «Me gusta» a un mensaje, el botón igual se enfoca con el teclado y los lectores de pantalla lo anuncian como un botón no disponible; al enfocarlo sigue mostrando quiénes dieron me gusta, sin abrir el mensaje.

## [1.10.0] - 2026-10-26

### Changed

- Las páginas descargan menos código en el navegador, por lo que cargan y responden más rápido, sobre todo en celulares y conexiones lentas.

## [1.9.0] - 2026-10-26

### Added

- Reglas incorpora el paso «Revisá membresías bloqueadas por pago»: el líder ve cada integrante bloqueada o dada de baja por falta de pago cuyo estado anterior se desconoce y decide, con confirmación y un motivo opcional, si al regularizar el pago vuelve como integrante activa o silenciada. La decisión queda registrada con su autor y fecha, vale de acá en adelante y no reactiva a nadie en el momento. Cada fila muestra por separado si quedó bloqueada o dada de baja y si fue por pago bloqueado o por suscripción inactiva, y aparecen todas las que impiden activar, cualquiera sea esa combinación.
- En ese mismo paso, cada guardián bloqueado por pago puede volver como integrante activa o silenciada, siempre sin su rol de guardián, y cualquier integrante bloqueada por pago, guardianes incluidos, puede quedar retirada («No vuelve por pago: queda retirada»); un pago nunca devuelve un rol ni lo conserva.
- Cuando la activación encuentra membresías bloqueadas por pago sin decidir, el paso aparece antes de «Revisá y activá»; al terminar las decisiones vuelve al paso final con «Activar ahora», sin perder lo elegido.
- Reglas avisa «Tenés reglas guardadas sin publicar» con la acción «Revisar y activar», que abre directamente el paso final con lo guardado.
- Conexión de mensajería destaca una sola próxima acción según el estado real, con qué falta y por qué: por ejemplo «Falta probar SMS» con «Probá SMS», o «Todo listo para activar» cuando todos los canales configurados están comprobados.
- Los bloqueos que dependen del equipo de TuTribu se muestran aparte, en lenguaje simple, con un código de diagnóstico para copiar, «Volver a comprobar» y «Reportar el problema».
- La guía de configuración incorpora el paso «Revisá membresías bloqueadas por pago» cuando hay casos sin decidir, marca como «Borrador sin publicar» las reglas guardadas sin activar y la conexión candidata sin activar, y su botón lleva directo al punto de publicación.
- Países y cupos y Conexión ofrecen «Volver a Reglas para activar» cuando se llega desde un requisito de Reglas.
- Solicitudes muestra al líder una guía de configuración con los pasos en orden (reglas, conexión, países y cupos, abrir las admisiones y avisos), cuáles ya están listos y un único botón hacia el siguiente; desaparece cuando todo está completo.
- Reglas de admisión se configura en pasos chicos (cómo se admite, cómo se contactan, recibir solicitudes y revisión) y termina con una sola acción, «Guardar y activar admisiones», que guarda, revisa los requisitos y activa mostrando cada etapa; si falta algo, indica qué y dónde resolverlo sin perder lo elegido.
- Con las admisiones activas, Reglas muestra si están abiertas o pausadas y ofrece pausar con motivo, reanudar y editar las reglas sin reabrirlas por error.
- Avisos de admisión se configura en pasos: correo de la tribu, frecuencia (agrupada cada cinco minutos por defecto) y revisión con un solo «Guardar avisos»; al volver muestra un resumen de lo que vas a recibir y marca los cambios sin guardar.
- Países y cupos se configura en pasos (países, códigos por día, avisos por día y revisión) con un resumen del uso actual; advierte cuando un cupo en cero o muy bajo impide enviar avisos.
- Consumo e historial de admisión avisa que el mantenimiento está detenido cuando no completa una ejecución hace más de diez minutos o nunca completó una, aunque algunas tareas sueltas sigan avanzando, y muestra la última ejecución completa: los avisos, vencimientos y reintentos pueden atrasarse.
- Países y cupos muestra el consumo diario de códigos y avisos con un medidor de uso por cupo.
- Las bandejas y listas vacías de admisión explican qué falta y cómo se completan.
- La barra lateral de las academias incorpora el grupo Admisiones con sus subsecciones: el líder ve todas y los guardianes, Solicitudes y Avisos; el grupo se abre solo al entrar en una de sus páginas.
- Todas las páginas de admisión comparten un encabezado con acceso de vuelta, descripción y una fila de secciones que marca la página actual, también en celulares; el encabezado queda fijo al cambiar de sección y el resaltado se desliza hasta la nueva. Si deslizás la fila antes de que la página termine de cargar, queda donde la dejaste y el toque abre la sección elegida.
- Al volver al historial de una solicitud desde el navegador, sus esqueletos de carga se transforman en los eventos al confirmar el acceso.
- Gestionar academia ofrece al líder un acceso a Admisiones y mensajería: reglas de admisión, solicitudes, países y cupos, y conexión de mensajería.
- El piloto de admisión incorpora una plantilla de códigos de WhatsApp en español; todavía no está disponible para enviar porque Meta rechaza su creación.
- El piloto de WhatsApp cuenta con un negocio propio de TuTribu y su cuenta conectada y activa en Zavu, conservando la cuenta anterior; los códigos siguen pendientes porque Meta rechaza el permiso de creación de la plantilla.
- El piloto incorpora el correo de TuTribu desde su dominio verificado, activado con el costo mensual autorizado; falta completar la prueba de recepción en la aplicación.
- Las conexiones candidatas abandonadas pueden retirarse mediante el proceso interno después de siete días sin actividad, conservando la conexión seleccionada y el consumo original; la programación de esa limpieza sigue pendiente.
- Los datos temporales del CSV y su reporte pueden eliminarse por lotes al vencer las veinticuatro horas, conservando la lista y los resultados ya confirmados; la ejecución programada sigue pendiente.
- La revisión de requisitos de activación muestra los bloqueos actuales y las membresías con historial desconocido o roles de líder y guardián que requieren revisión autorizada; descarta el resultado anterior al editar o volver a consultar. Los manuales distinguen ese control del cambio a academia, los beneficios y las vías de ingreso y pago, y explican qué conserva el silenciamiento y cuándo un cierre impide volver a entrar.
- La salida autorizada de academia y la eliminación de una tribu cierran sus solicitudes e invitaciones de admisión y permiten consultar el resultado original, incluso después del borrado; los controles para iniciarlas desde la interfaz siguen pendientes.
- La gestión de salida, remoción y bloqueo conserva el resultado original y puede cerrar solicitudes pendientes junto con el cambio de pertenencia, sin levantar restricciones por conducta ni permitir reingreso con una aprobación antigua; los controles nuevos del directorio siguen pendientes.
- Los enlaces de invitación anteriores de una academia permiten solicitar ingreso con la revisión manual, la lista y la comprobación de contacto vigentes, conservando el origen del ingreso y el estado de quienes ya pertenecen.
- El líder puede revisar avisos y registrar una recuperación explícita con otra conexión, conservando la entrega original, su plazo y sus consumos; puede consultar el resultado si pierde la respuesta. El manual explica el reemplazo y retiro de conexiones, la reconexión después de cambiar de líder y los límites de las cuentas externas compartidas. El despacho del aviso recuperado sigue pendiente.
- Las solicitudes vencidas pueden cerrarse mediante el proceso interno sin esperar otra presentación, conservando el plazo original y las invitaciones ya canjeadas; su ejecución programada sigue pendiente.
- El líder puede gestionar invitaciones personales desde la configuración de admisión: emitir, renombrar, reemitir o revocar con confirmaciones separadas, vigencia explícita y recuperación de respuestas inciertas sin duplicar la acción; conserva el resultado original y el enlace completo solo se entrega una vez.
- La consulta privada de invitaciones personales incorpora las fechas de creación, canje, revocación y retiro de autorización.
- La invitación personal dispone de una pantalla para iniciar o cambiar de cuenta, comprobar el contacto y confirmar el ingreso por separado; las respuestas inciertas se consultan conservando la operación original.
- El pedido y reenvío de código para una invitación personal conserva su origen y comprueba que siga autorizada; verificar el código no consume el enlace ni concede membresía.
- La consulta de una invitación personal protege el destinatario, indica si falta comprobar el contacto y conserva las solicitudes existentes sin consumir el enlace al leerlo.
- El canje de una invitación personal exige comprobar al destinatario y respeta la lista indicada: puede conceder ingreso básico o quedar pendiente de revisión; retirar la autorización cancela una pendiente sin expulsar a quien ya ingresó.
- En academias en modo lista con control de admisión ya activado, una presentación común con contacto comprobado y entrada habilitada concede ingreso básico; las excepciones permitidas requieren explicación y revisión explícita, conservando la lista.
- El líder dispone de una pantalla para importar habilitados desde CSV: descargar la plantilla, crear una vista previa sin efectos, elegir filas válidas, confirmar explícitamente, retomar pendientes conservando los resultados ya guardados y descargar un reporte privado.
- El líder puede gestionar la lista de habilitados desde la configuración de admisión: buscar contactos, cambiar nombre o estado y recuperar una respuesta perdida conservando el borrador y los cambios más recientes.
- La solicitud de ingreso permite pedir y comprobar el código del contacto, consultar respuestas inciertas conservando el resultado original y aplicar la prueba a la misma solicitud pendiente, o presentarla con la prueba en la misma confirmación, sin renovar su plazo ni conceder membresía; pedir el código no fija el contacto. Una prueba ya aplicada puede sostener su revisión sin repetir el código cada día, mientras la política y la evidencia sigan vigentes.
- La consulta de ingreso con código incluye el canal y los países configurados para la cuenta solicitante, sin mostrar credenciales ni cupos internos.
- El asistente ofrece Seguridad y retiro para elegir una conexión, revisar el motivo y el impacto, renovar la confirmación y consultar un resultado perdido antes de continuar.
- Los líderes pueden suspender una conexión con una confirmación explícita o retirarla cuando se resuelven sus dependencias, y recuperar el resultado original sin consultar al proveedor.
- Los líderes pueden activar desde el asistente una candidata productiva comprobada y reemplazar la conexión anterior, conservando cupos, pruebas de admisión ya aplicadas y ajustes de admisión y avisos, sin encender verificaciones automáticamente; si se pierde la respuesta, recuperan la selección original.
- Los líderes pueden probar cada canal de la candidata desde el asistente, con destino y consumo explícitos, consultar su entrega y confirmar el código recibido; la prueba no se convierte en verificación de admisión ni activa la conexión, y una respuesta perdida conserva el diagnóstico original sin volver a enviarlo.
- Los líderes pueden consultar los remitentes y plantillas disponibles, elegirlos y configurar canales desde la conexión candidata, sin enviar códigos ni activar canales; WhatsApp muestra sus campos de plantilla e idioma. Guardar crea una nueva versión candidata que conserva la conexión seleccionada y exige nuevas comprobaciones antes de activarla, y un guardado incierto se recupera sin repetirlo.
- Los líderes pueden comprobar la credencial candidata desde la pantalla de conexión y consultar su estado sin preparar canales ni enviar códigos, distinguir cuentas de prueba y recuperar la comprobación sin repetirla; ante cambios concurrentes consultan el estado actual y confirman nuevamente. Los guardianes reciben sólo una alerta operativa mínima.
- Los líderes tienen un primer paso de conexión para guardar una candidata de Zavu con nombre y credenciales protegidas, sin sustituir la conexión seleccionada, activar códigos ni reiniciar cupos; la clave se borra del formulario y una respuesta perdida se consulta en su resultado original sin reenviar la clave ni repetir el guardado. Los guardianes consultan sólo su alerta de disponibilidad.
- Los líderes tienen una pantalla para preparar países y cupos antes de conectar la mensajería, conservar el borrador ante conflictos y recuperar un guardado incierto sin reiniciar el consumo.
- Los líderes tienen una pantalla para preparar las reglas de admisión, revisar requisitos, pausarlas con confirmación explícita y consultar su estado actual; conserva el borrador ante cambios concurrentes y recupera el resultado original de un guardado incierto sin repetirlo.
- La oferta de una academia con control de admisión ofrece Solicitar ingreso y abre la solicitud sin intentar un ingreso gratuito directo.
- Líderes y guardianes activos pueden revisar solicitudes comunes de admisión manual, separar el motivo interno del mensaje al solicitante y conservar la decisión original si se pierde una respuesta.
- La admisión tiene una página de solicitud y un estado propio fuera del contenido privado de la academia, con confirmación, cancelación y conservación del envío cuando se pierde una respuesta.
- La bandeja incorpora avisos propios de admisión y avisos de revisión para responsables activos, con mensajes internos que conservan la privacidad del contacto y de la revisión.
- El inicio de sesión con Google guarda evidencia del correo autenticado para las comprobaciones de contacto de academias; si esa comprobación adicional no está disponible, se conserva el acceso a la cuenta.
- Las comprobaciones sensibles distinguen la cuenta Google usada en cada sesión y dejan de reconocer una verificación anterior cuando cambia el correo de la cuenta.
- El acceso autorizado a habilitados, reportes CSV, invitaciones y solicitudes de admisión queda registrado con quién lo consultó y su alcance, preservando los permisos y evitando copiar datos privados en la auditoría.
- Las consultas autorizadas de recursos de mensajería y el uso operativo de la credencial dejan un registro de alcance y configuración, sin guardar claves ni contenido del proveedor en la auditoría.
- El historial privado registra el origen y la creación efectiva de los avisos internos de admisión, sin copiar sus destinatarios ni contenidos.
- El mantenimiento privado puede minimizar mensajes y contactos innecesarios de solicitudes finalizadas tras ciento ochenta días y purgar auditoría tras trescientos sesenta y cinco, conservando los vínculos necesarios; su programación operativa sigue pendiente.
- La limpieza interna agrupa sus pasos para que un fallo tardío revierta el lote completo y conserva por separado los resultados confirmados de admisión y mensajería.
- El mantenimiento privado puede renovar el cifrado de conexiones vigentes sin cambiar la clave de Zavu, los códigos pendientes ni el consumo acumulado.
- El historial privado conserva la configuración anterior y nueva de cada cambio efectivo de admisión, junto con los hechos permitidos al eliminar una tribu, sin copiar claves ni contactos.
- El líder puede consultar el consumo diario, las métricas agregadas y el historial de admisión, con filtros, versiones originales y actualización, incluso antes de conectar mensajería; los datos sensibles quedan restringidos.
- El consumo e historial de admisión reconoce los lotes de conservación y avisos internos completados; muestra sólo duraciones medidas y conserva su ausencia cuando no hay datos.
- El historial de admisión distingue los cambios de avisos por correo y muestra su habilitación y zona horaria, sin exponer contactos ni credenciales.
- Las preferencias de avisos por correo conservan la elección propia de cada responsable y se administran por separado de la habilitación del líder y de los códigos de contacto.
- El líder puede consultar el resultado original de un cambio de correo de admisión sin repetir el cambio.
- Los líderes y guardianes pueden preparar su preferencia de avisos de admisión desde una pantalla propia; el líder ajusta el correo y su zona por separado y puede recuperar respuestas inciertas conservando el cambio original.
- La bandeja de admisión incorpora búsqueda y filtros de estado, origen, fecha y requisitos actuales, incluido cuáles necesitan un motivo de excepción, y conserva la selección al revisar un detalle o recargar la página.
- Los líderes y guardianes pueden abrir el historial de una solicitud desde su detalle, recorrer los eventos conservados y volver con los mismos filtros; el acceso se vuelve a comprobar al regresar a la pantalla.
- La preparación interna de avisos de admisión recorre lotes y todas las páginas antes de cerrar un grupo, alterna las tribus y no se frena por un aviso omitido; guarda el avance confirmado con sus grupos y el contenido completo del correo, lo retoma sin duplicarlo y vuelve a comprobar preferencias y conexión antes de entregarlo al transporte. La ejecución automática y el envío de grupos siguen pendientes.
- El procesamiento interno distingue códigos y correos completos de admisión, y conserva un estado visible para avisos antiguos sin contenido utilizable; su ejecución automática sigue pendiente.
- Los avisos de admisión recuperados conservan el contenido completo del grupo y su vencimiento, y vuelven a comprobar el destinatario y la conexión actuales; el envío automático sigue pendiente.
- El mantenimiento interno de admisión reúne vencimientos, limpieza y avisos, conserva el avance de cada paso e informa la configuración pendiente; su ejecución automática sigue pendiente.
- La bandeja, la solicitud propia y los avisos abiertos de admisión se actualizan mientras mirás la página; conservan los datos y muestran un aviso si falla la actualización.
- Los líderes y guardianes pueden seleccionar hasta cincuenta solicitudes visibles, confirmar sus nombres y consultar el resultado de cada decisión; cada solicitud conserva su resultado y recuperar el lote original evita repetir decisiones.
- La bandeja y el detalle de admisión destacan las solicitudes que llevan tres días o más pendientes; la marca se actualiza al consultar y desaparece al resolverlas o vencer su plazo.
- El mantenimiento interno de admisión incorpora disparadores preparados con activación explícita y fallos visibles; su ejecución automática sigue pendiente.
- El líder puede pedir el «Teléfono» de quien solicita ingresar, obligatorio por defecto («Exigir el teléfono del solicitante» viene marcada en las reglas nuevas) u opcional; el equipo lo compara con el grupo de WhatsApp junto al nombre de Google, sin pedir nuevamente nombre y apellido. Cuando la academia usa el teléfono como contacto, el formulario de ingreso y la invitación personal piden un solo «Teléfono».
- Cada aspirante puede corregir su teléfono mientras la solicitud siga pendiente y vigente; el formulario conserva el cambio original si se pierde la respuesta y avisa cuando debe revisarse de nuevo.
- La importación de la lista de habilitados ofrece «Seleccionar todas las válidas» y «Quitar selección», y muestra cuántas filas válidas sin resultado hay, para elegir de una vez filas de archivos de hasta 10.000 filas.

### Changed

- En Academia, «Cancelar renovación» también aparece mientras Mercado Pago no confirmó el pago de la suscripción: el diálogo avisa que se cancela la suscripción que espera esa confirmación y que no se generan cobros nuevos, y el resultado se muestra recién cuando se confirma la cancelación.
- En Verificación, cambiar el email de una vinculación ya verificada pide confirmar antes con «Cambiar correo» o «Cancelar», porque vuelve a revisión y puede afectar el acceso a la academia; si la vinculación no está verificada, se envía sin preguntar.
- En Gestionar academia, revocar una verificación se confirma en el diálogo «Revocar verificación» con el motivo, que muestra el progreso, no se envía dos veces, conserva el error dentro del diálogo y se cierra al confirmarse.
- En Gestionar academia, revocar una bonificación se hace en un diálogo con el motivo, que muestra el progreso, no se envía dos veces y actualiza la lista al terminar.
- Gestionar academia muestra «Consultando…» al buscar o paginar, saca de la lista de pendientes la solicitud que acabás de decidir y ya no borra los cambios sin guardar de la oferta al cambiar la disponibilidad o ante un conflicto.
- Gestionar academia abre más rápido: la página pide de una sola vez los integrantes, las solicitudes, la oferta y los proveedores.
- Los filtros de fecha de Solicitudes se eligen en hora de Argentina («Desde (hora de Argentina)» y «Hasta (hora de Argentina)») en lugar de UTC.
- En Avisos de admisión, una zona horaria que no existe se marca junto al campo y no deja continuar, en lugar de fallar recién al guardar.
- Si al abrir Países y cupos o Conexión la sesión venció, la página ofrece «Iniciar sesión» y vuelve al mismo lugar; si falta el permiso, ya no ofrece un «Reintentar» que no puede funcionar.
- Habilitados, Importación e Invitaciones ofrecen «Reintentar» cuando cambia la cuenta o se pierde el acceso, en lugar de dejar solo un aviso.
- Cuando la bandeja de solicitudes no se puede cargar, el aviso aparece dentro de la página, con su título, sin repetir el encabezado.
- Cada resultado se anuncia una sola vez, junto a la acción: aceptar una invitación personal, pedir una verificación, guardar la oferta, guardar países y cupos de mensajería y los errores de la academia ya no repiten el mismo mensaje en una notificación emergente, y un resultado incierto de la solicitud de ingreso ya no aparece dos veces.
- «Suspender conexión» usa el tono de peligro cuando se suspende la conexión que usa la academia, porque detiene todos los avisos y códigos.
- Los enlaces de ingreso a una academia y de una solicitud propia ya no se indexan en buscadores ni informan la página de origen al abrir otro sitio, igual que las invitaciones personales.
- Mientras cargan, la academia, Gestionar academia, la verificación, la suscripción y Canales muestran un esqueleto con la forma de cada pantalla en lugar del de la ronda.
- Las páginas de admisión con pasos (Reglas, Países y cupos, Avisos, Habilitados, Invitaciones y Conexión) muestran mientras cargan un esqueleto con forma de formulario por pasos, y la bandeja, el historial y la actividad uno con forma de lista.
- Quien pide ingresar ve mientras carga un esqueleto con la forma del formulario, de su solicitud o de la invitación, con el título que va a tener la pantalla («Solicitar ingreso», «Tu solicitud de ingreso» o «Invitación personal»).
- Los códigos de verificación muestran cuánto falta en minutos («Vence en 9 min 20 s», «Podés reenviar en 1 minuto») en lugar de una cuenta en segundos.
- Invitaciones, importación de habilitados y consumo e historial muestran fechas legibles en hora de Argentina («25 oct 2026 · 14:30») en lugar de fechas técnicas en UTC; el vencimiento de una invitación personal se elige en hora de Argentina.
- Países y cupos y el consumo del día explican que el día se cuenta de 21:00 a 21:00, hora de Argentina.
- Conexión de mensajería permite reemplazar una clave de Zavu rechazada o sin comprobar con «Reemplazar la clave»: el paso Clave nombra la candidata, aclara que la conexión seleccionada no cambia y, tras confirmar, retira sólo esa candidata y vuelve al formulario con el mismo nombre.
- Seguridad y retiro muestra el rol y el estado de cada conexión, explica que suspender conserva su lugar y sólo retirarla lo libera, preselecciona la candidata al llegar desde su aviso y, antes de suspender la conexión activa, avisa que se detienen los avisos y los códigos de verificación de la academia.
- En las academias, los integrantes sin suscripción ya pueden leer el fogón y los canales, con sus respuestas, me gusta, encuestas y archivos adjuntos. Para publicar, responder, reaccionar o votar necesitan la suscripción mensual a la academia, y el fogón les ofrece suscribirse. Eventos, La tribu y Méritos siguen siendo solo para quienes tienen la academia; el líder y los guardianes siempre leen y escriben.
- Si una academia admite solo correos habilitados por su equipo, sin excepciones ni código adicional, y el correo de tu cuenta no está habilitado o no se puede confirmar, la página de ingreso te lo avisa antes de completar el formulario y ofrece «Cambiar de cuenta», en lugar de rechazar la solicitud recién al enviarla con un aviso genérico.
- Al aprobar una solicitud, el motivo interno es opcional. Sigue siendo obligatorio para rechazar y para aprobar a alguien fuera de la lista como excepción.
- Los avisos emergentes quedan 8 segundos en pantalla, el doble que antes, para que se puedan leer.
- Pedir el código de verificación de una solicitud de admisión y confirmarlo tardan alrededor de un 40 % menos.
- En Conexión de mensajería, guardar los canales, comprobar la conexión y enviar la prueba de un canal responden un poco más rápido.
- Conexión de mensajería se configura en pasos cortos, uno por decisión, con un indicador de pasos, «Atrás», «Siguiente» y «Activar conexión»: clave, credencial, canales, una prueba por cada canal y activación. Cada paso deja seguir recién cuando su operación terminó, los completados se pueden volver a abrir, al volver se abre directamente el primer paso pendiente y Seguridad y retiro queda como acción aparte. Cambiar de paso conserva lo escrito y no envía ni activa nada.
- En Conexión de mensajería, el resultado de guardar, comprobar, configurar un canal, enviar una prueba, confirmar un código, activar y las consultas aparece como notificación en lugar de texto al pie de la pantalla; lo que sigue pendiente queda en «Acciones pendientes».
- Una prueba cuyo canal ya quedó comprobado se muestra como confirmada en lugar de «Esperando el código», y las pruebas conservadas quedan plegadas debajo de los pasos como recuperación secundaria.
- Habilitados se completa en pasos chicos (contacto, nombre y estado, revisión) con «Atrás», «Continuar» y un solo «Agregar entrada» o «Guardar entrada»; editar abre directamente el paso de nombre y estado, y la búsqueda queda plegada debajo.
- Importar habilitados desde CSV se hace en tres pasos: subir el archivo y crear la vista previa, revisar filas y errores, y confirmar con «Importar filas elegidas»; la revisión se abre recién cuando la vista previa quedó guardada y, al volver, retoma donde quedó. La plantilla, el progreso y el reporte quedan plegados.
- Las invitaciones personales se emiten en pasos (destinatario, lista de habilitados, vencimiento y revisión con «Emitir invitación»); renombrar y revocar tienen su propio camino corto, y cada paso explica por qué todavía no se puede continuar.
- La solicitud de ingreso guía a la persona en pasos: sus datos, enviar el código, comprobarlo y enviar la solicitud. Cada paso avanza recién cuando su envío terminó, al volver retoma el primer paso pendiente y reenviar el código o consultar su envío quedan plegados en «¿No te llegó el código?». Con una solicitud pendiente que necesita el código, los pasos terminan en «Aplicar prueba a esta solicitud».
- En habilitados, importación, invitaciones personales y la solicitud de ingreso, el progreso y el resultado de cada guardado se avisan una sola vez en una notificación; en la pantalla quedan solo los errores del formulario, los bloqueos y lo que falta consultar, sin repetir la notificación.
- Las páginas de admisión y mensajería del líder (Solicitudes, Reglas, Avisos, Países y cupos y Conexión de mensajería) cargan más rápido, y guardar las reglas, activar las admisiones y la comprobación previa a la activación tardan menos y hacen menos consultas a la base; en Safari, Avisos cambia antes al tocarlo.
- «Lo que falta resolver» explica cada bloqueo de la activación en lenguaje claro e indica dónde se resuelve: Conexión, Países y cupos, el paso «Cómo se contactan», Gestionar academia (para activar primero el modo academia), la revisión de membresías bloqueadas por pago o «Volver a comprobar»; deja de pedir una «revisión autorizada» sin explicar qué hacer.
- Si la plataforma bloquea la activación, la guía de configuración lo indica en «Abrí las admisiones» («Depende del equipo de TuTribu») en lugar de mandar a Reglas a intentarlo de nuevo, y Reglas deja de ofrecer publicar hasta que se resuelva.
- Todos los botones que guardan en admisión y mensajería muestran un indicador de carga mientras se guarda, conservan su texto y el foco, y bloquean las demás acciones de la pantalla hasta terminar; las consultas ya no cambian el texto de los botones.
- Cada acción de Reglas confirma su propio resultado (activadas, pausadas, reanudadas o cambios guardados) en lugar de un mensaje genérico.
- Las pantallas de la plataforma usan todo el ancho disponible; los textos y formularios conservan un ancho cómodo de lectura.
- Las páginas de admisión se rediseñaron con jerarquía más clara: la bandeja muestra estado y origen como insignias, el detalle agrupa los datos de la solicitud, las reglas empiezan por un resumen del estado actual, el historial se lee como línea de tiempo y los formularios separan datos, confirmación y acciones.
- Los títulos y destacados de las pantallas de admisión y mensajería usan el peso de letra del sistema de diseño.
- El indicador de carga que se convierte en un check o una cruz y el balanceo de la campana cuando llegan notificaciones nuevas son un poco más rápidos.
- Las animaciones de la aplicación son más sobrias: las etiquetas, filas de tablas y avatares aparecen sin animación de entrada, los enlaces ya no se mueven al pasar el puntero, y los menús y desplegables se abren creciendo desde el botón que los abre.
- Se agiliza la preparación de las operaciones de ingreso y revisión.
- Se amplía la capacidad para procesar solicitudes de ingreso simultáneas y se reduce el trabajo repetido al confirmarlas, consultar su estado y preparar sus avisos internos, manteniendo la comprobación de sesión y permisos en cada escritura.
- Las solicitudes de acceso de distintas personas pueden avanzar en paralelo dentro de una academia, evitando membresías duplicadas al repetir la acción y conservando los permisos vigentes, el vencimiento de la sesión y el resultado original.
- Los formularios de admisión y mensajería adoptan los selectores y botones del diseño actual del sitio.
- Al retomar una presentación con el mismo contacto, la pantalla reconoce su código propio, muestra su canal actual y diferencia la validación de un código vigente del reenvío explícito que reemplaza uno ya utilizado.
- El paso de comprobación de contacto aclara que los códigos usan el servicio conectado por el líder y que comprobar el contacto no acredita identidad civil ni pertenencia a un grupo de WhatsApp.
- La auditoría de solicitudes, lista, importaciones, invitaciones, cupos y conexiones conserva estados, versiones, decisiones, operación original y momento del cambio; los reintentos mantienen su motivo privado y fechas, y la comprobación de credenciales registra su resultado y tipo de cuenta. Las comprobaciones de contacto confirmadas registran la creación de su prueba local por separado de la entrega del mensaje. El reemplazo de conexión registra las referencias anteriores y nuevas y el retiro de pruebas todavía disponibles, conservando las ya aplicadas. La recuperación explícita de un aviso registra la procedencia y los cambios efectivos de la entrega original y su nuevo aviso en cola, sin incluir destinatarios, contenido, códigos, nombres ni claves. La invalidación de pruebas por compromiso, retiro, cambio de política y reenvío conserva su estado anterior y la operación que la produjo; las pruebas históricas de una aprobación conservan su procedencia. La aplicación de una prueba y su invalidación al cerrar el ámbito conservan también los estados de la prueba y el momento del efecto. Los intentos, resultados, aplazamientos por cupo y reconciliaciones de entrega conservan los cambios efectivos y su operación original; repetir una confirmación idéntica no duplica esos registros.
- La emisión de un código registra el mensaje que quedó en cola; su reemplazo o retiro registra sólo cancelaciones confirmadas y conserva los envíos ya iniciados o inciertos, con la acción original y sin datos privados.
- Las métricas de admisiones registran la última ejecución completa de mensajería y los tiempos de sus pasos por tribu, conservando separados los resultados de entrega.
- Los países y cupos comparan el uso guardado con la propuesta y exigen confirmar nuevamente cada aumento, aclarando su impacto y que el consumo se conserva.
- La documentación de mensajería explica quién controla la cuenta de envío, los cupos y los plazos de conservación, y cómo se limita el acceso durante una recuperación.
- La preparación de canales muestra sólo las opciones disponibles para la conexión y bloquea consultas y guardados de un canal que ya no esté disponible, con un aviso para corregirlo.
- La preparación interna de avisos agrupados comparte las comprobaciones del destinatario y conserva los permisos y la confianza de cada aviso; el envío automático sigue pendiente.
- La recolección interna de avisos comparte comprobaciones por página, conserva un resultado por cada aviso y recupera los ya incorporados aunque la conexión actual no esté disponible; la ejecución automática sigue pendiente.

### Removed

- Los líderes de tribu ya no necesitan confirmar su cuenta con Google para operaciones sensibles de admisiones, mensajería, salida del modo academia o borrado de la tribu; desaparecen el botón y la pantalla de confirmación.

### Fixed

- En la academia, el diálogo de cancelar la renovación ya no muestra un error de un intento anterior o de otra acción: cada error aparece junto a la acción que falló y se borra al reintentar o al volver a abrir el diálogo.
- Al volver de Mercado Pago, mientras se confirma el pago ya no se ofrece «Contratar academia» y «Abriendo el pago…» queda en curso hasta salir de la página; «Actualizar estado» avisa si el pago sigue sin confirmarse o, si no hay un pago en curso, vuelve a ofrecer contratar.
- «Actualizar estado» en la academia avisa cuando el estado se revisó hace instantes y hay que esperar un minuto, y cuando no se pudo leer el estado actualizado, en lugar de no mostrar nada.
- Si el ingreso gratis desde la historia de la tribu no se completa, la página explica qué pasó y qué hacer, junto al botón «Unirse gratis», en lugar de recargarse sin mensaje.
- «Reintentar» en las páginas de error de admisiones y en el error general vuelve a cargar la sección; antes no volvía a pedirla o no hacía nada.
- Si la academia, su gestión, la verificación, los canales o el fogón no pueden cargarse por un problema temporal, la tribu muestra un error con «Reintentar» sin perder el menú lateral, en lugar de «página no encontrada».
- Si una acción de admisiones, mensajería o de integrantes de la academia no recibe respuesta, después de dos minutos deja de esperar y avisa que la respuesta tardó demasiado: ya no queda el botón en curso sin salida. Si era un envío o un cambio, primero se consulta si se guardó antes de ofrecer repetirlo.
- Los enlaces de admisión e invitación personal y las páginas de mensajería abren normalmente aunque traigan parámetros de campañas o redes sociales (por ejemplo `utm_source` o `fbclid`), en lugar de mostrar «No podemos mostrar esta admisión».
- Cuando una publicación del fogón se queda sin respuesta, la página la reenvía sola una vez sin duplicarla: si ya se había publicado, avisa «El mensaje ya estaba publicado.» y la muestra, también cuando tenía imágenes o archivos.
- Repetir un Me gusta después de una falla de conexión ya no lo invierte: se guarda el estado que elegiste.
- Al volver a la ventana de invitaciones también se comprueba que sigas pudiendo gestionarlas; si perdiste ese permiso, el enlace recién emitido se oculta.
- El enlace de una invitación personal recién emitida ya no desaparece si el líder cambia de ventana antes de copiarlo, y «Copiar enlace» lo copia también en Safari.
- La conexión de mensajería ya no queda en «no disponible» al recargar cuando el navegador guardó un historial que no puede leer: lo descarta y la página sigue funcionando.
- Al pedir ingreso, un código vencido ya no se muestra como un error rojo del campo: aparece el aviso «El código venció. Reenviá uno nuevo para seguir.» con Reenviar código y su confirmación a la vista, sin abrir «¿No te llegó el código?»; lo mismo pasa cuando el código agotó sus intentos.
- Después de Reenviar código, el paso «Comprobar código» pasa solo al código nuevo, con el campo habilitado, su nuevo vencimiento y el aviso «Te enviamos un código nuevo»; si la respuesta del reenvío se pierde, la página consulta una vez el envío original y muestra el código nuevo sin recargar.
- En «Probar canal» de la conexión de mensajería, Reenviar código de prueba explica qué le falta (la espera, el destino o la confirmación), lleva al campo que hay que completar y pasa a ser la acción principal cuando el código de prueba vence.
- En escritorio, el panel de notificaciones de la campana vuelve a hacer scroll cuando hay más avisos de los que entran.
- Los avisos agrupados de admisión por correo quedan listos para enviarse a más tardar dos minutos después de que cierra su ventana de cinco minutos, aunque la academia tenga muchas solicitudes del último día o la bandeja del líder esté abierta; antes se atrasaban más cuantas más solicitudes había (más de cinco minutos con unas cincuenta).
- Al volver a Conexión con «Atrás» después de guardar Países y cupos, la pantalla relee el estado y deja de pedir que guardes Países y cupos otra vez.
- Una academia que guardó sus reglas antes de activar su conexión de mensajería ya puede activar las admisiones con «Comprobar el contacto con un código»: las reglas toman la conexión activa al activarla o al guardarlas, y las que habían quedado sin conexión se corrigen solas, sin pasos extra.
- Después de activar una conexión de mensajería, Conexión muestra «Conexión activa» y ya no vuelve a pedir «Guardá la clave de Zavu» como si faltara algo; guardar otra clave solo hace falta para reemplazarla.
- En Conexión de mensajería, si la academia todavía no guardó Países y cupos, cada paso de prueba lo explica antes de enviar («Antes de probar un canal, guardá Países y cupos: la prueba usa el cupo diario de códigos.») y ofrece «Ir a Países y cupos»; antes el envío se rechazaba con «La academia todavía no tiene preparada la conexión necesaria.», aunque la conexión estaba completa.
- Cuando una prueba de canal o una comprobación de credencial se rechaza de forma definitiva, el intento queda cerrado: ya no aparece como «Consultar guardado» ni repite el rechazo anterior, y la siguiente prueba, después de corregir la causa, se envía como un intento nuevo. Una comprobación rechazada muestra enseguida el estado actual de la credencial.
- En Reglas de una academia con admisiones activas, pasar de revisión manual a «Lista de habilitados» y tocar «Guardar cambios» ya guarda la regla; antes podía rechazarse con un aviso de requisito faltante aunque no faltara nada.
- Volver a probar un canal de la conexión de mensajería al mismo destino, después de que la prueba anterior quedó confirmada o vencida, ya envía el código nuevo; antes se rechazaba sin enviar nada y la pantalla pedía consultar el resultado.
- Sin reglas de admisión guardadas, Habilitados y la importación de CSV muestran «Primero guardá las reglas de admisión» con un botón «Ir a Reglas», en lugar de un campo bloqueado.
- En Reglas, «Cargar personas en Habilitados» y «Configurar países y cupos de mensajería» se ven como botones. El primero aparece recién cuando las reglas están guardadas; antes, una nota explica que vas a poder cargar personas después de guardar.
- Si guardás reglas que activan el código de comprobación sin tener el canal preparado, la pantalla explica que falta prepararlo en Conexión, con el enlace, y aclara que las reglas vigentes no cambiaron, en lugar de un aviso genérico.
- Si falla la carga de las reglas de admisión, la lista de habilitados, la importación de CSV o los avisos de admisiones, el aviso de error aparece con el título de esa página y no con el de la bandeja de revisión.
- Al descargar o quitar un archivo de una lección que no existe o que no podés ver, se informa que no se encontró el archivo, aunque el almacenamiento de archivos no esté disponible, en lugar de un error al preparar la descarga.
- Al descargar o quitar un adjunto de un mensaje que no existe o que no podés ver, se informa que no se encontró el archivo, aunque el almacenamiento de archivos no esté disponible, en lugar de un error al preparar la descarga.
- Los correos y SMS que el proveedor tarda en aceptar ya no quedan como «desconocidos»: se espera su respuesta y nunca se reenvían.
- Reglas explica por qué no se pueden activar las admisiones cuando los códigos están encendidos y el canal todavía no está preparado: muestra «El canal para comprobar el contacto todavía no está preparado.» con «Ir a Conexión», también al abrir reglas guardadas sin activar.
- Las membresías bloqueadas por pago pendientes de decisión ya no se presentan además como un bloqueo que depende del equipo de TuTribu.
- Avisos de admisión usa todo el ancho de la pantalla, como Reglas y Países y cupos.
- Los lectores de pantalla leen una sola vez y completa la ayuda de la zona horaria («09:00») y de los cupos diarios, sin partir los números en dígitos.
- La guía de configuración ya no muestra un «Listo» limpio en Países y cupos cuando el cupo de avisos por día es menor a 20 («Listo, pero con un cupo muy bajo») y avisa en Avisos que no vas a recibir correos si el correo de la tribu está habilitado y elegiste «Omitir correos de revisión».
- Países y cupos ya no anuncia como guardados los valores elegidos cuando solo se creó la configuración inicial: crea la configuración y guarda lo elegido en la misma acción.
- Reglas de admisión ya no muestra al líder el aviso de que la configuración es solo para el líder mientras guarda o después de un error.
- Pausar las admisiones ya no deja preparado un guardado que las reabre sin querer.
- Guardar una entrada de habilitados muestra que el cambio quedó guardado en lugar del mensaje de recuperación.
- Aprobar o rechazar una solicitud ya no cambia el texto de los dos botones a «Guardando decisión…» al consultar o navegar.
- El próximo paso de la conexión de mensajería ya no se frena por un canal no disponible cuando otro canal se puede usar.
- Las páginas de admisión ya no fallan al cambiar de sección mientras la página termina de cargar.
- Una prueba de canal con el código ya confirmado deja de mostrar el vencimiento, el campo de código y el reenvío; la confirmación sólo se aplica a la prueba que emitió ese código.
- La conexión de mensajería ya no muestra errores en los campos antes de que el líder los complete.
- En Safari y otros navegadores WebKit para móviles, la conexión de mensajería ya no se desborda horizontalmente.
- Consultar remitentes o plantillas sin resultados explica que Zavu no devolvió opciones, en lugar de dejar la lista vacía sin aviso.
- El nombre de la conexión y el código de prueba ya no aceptan más caracteres que los permitidos.
- Si se confirma de nuevo un envío ya aceptado por Zavu, TuTribu recupera el resultado original en lugar de dejarlo como incierto, sin enviar otro mensaje.
- Al cancelar una solicitud o resolver una revisión individual con teclado, el resultado recibe el foco si desaparece la acción; si lo moviste a otro control, se conserva allí.
- Los eventos de teclado sin una tecla válida ya no interrumpen la navegación lateral; su atajo de navegación y los atajos con Ctrl y Cmd siguen disponibles.
- El cierre de academia y la eliminación de una tribu conservan el registro privado de sus mensajes cancelados y de los resultados que llegan para envíos ya iniciados, sin duplicarlos ni devolver su consumo.
- El guardado de conexiones reconoce la dirección pública segura de TuTribu detrás del servidor local y evita rechazos falsos de permisos.
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
- Los envíos de mensajería rechazan canales vacíos o no admitidos antes de contactar al proveedor.
- Los avisos agrupados de admisión conservan un origen separado de los avisos individuales al retirar una tribu; el envío de esos grupos sigue en preparación.
- La revisión de admisiones mantiene preparado el aviso accesible del resultado para que los lectores de pantalla puedan anunciar una decisión guardada o recuperada.
- Una solicitud cuyo resultado sigue sin confirmar conserva su operación y permite consultarla, en lugar de mostrar un falso error de contrato o repetir la presentación.
- Las solicitudes de admisión pueden guardarse mientras se actualiza el indicador de personas en línea, sin quedar inciertas por un bloqueo mutuo entre esas operaciones.
- Los avisos de «no hay nada para mostrar», como los del calendario de eventos, vuelven a cambiar de alto con una transición suave cuando cambia su texto, también en dispositivos lentos.
- Si el pedido del código de ingreso nunca llegó a registrarse, la pantalla del solicitante ya no queda trabada consultando para siempre: pasados diez minutos y con la ausencia confirmada, ofrece «Descartar la referencia y pedir otro código» sin riesgo de un envío doble.
- «Guardar conexión» ya no queda deshabilitado sin explicación: al presionarlo, el líder ve debajo de cada campo qué falta completar y el cursor va al primero.
- Consultar remitentes o plantillas muestra que está trabajando, no se repite con un segundo click y, si Zavu no devuelve opciones o la consulta falla, lo explica junto al campo en lugar de pedir otra vez que se consulten.
- «Ver avisos anteriores» suma los avisos más antiguos debajo de los que ya se ven, sin perder el aviso elegido.
- Un aviso cuyo plazo venció se muestra como no recuperable, con el motivo, en lugar de ofrecer una recuperación que termina en un error que no corresponde.
- Si «Consultar conexión actual» falla o tarda demasiado, se muestra como un error de la consulta con su reintento y ya no indica que la conexión cambió.
- Cuando la solicitud de ingreso o su enlace no pueden mostrarse por un problema temporal, la página ofrece «Reintentar» además de «Ir al inicio»; si el motivo no cambia al reintentar (falta de permiso, enlace inválido o solicitud inexistente), solo ofrece la salida.
- Al pedir ingreso, un rechazo del envío aparece en el paso «Enviar solicitud», junto a la confirmación; el de la cancelación, junto a «Cancelar solicitud»; y el de corregir el teléfono, en su formulario. Cada uno se muestra una sola vez y desaparece al cambiar la confirmación o el dato.
- Un enlace de invitación anterior con un código mal copiado o incompleto explica que el enlace no es válido y sugiere pedirle uno nuevo a la academia, en lugar de ofrecer «Reintentar», que no podía funcionar.
- «Ver más» en la lista de habilitados, en el historial de invitaciones y en Consumo e historial de admisión suma la página siguiente debajo de lo ya mostrado, sin repetir elementos, en lugar de reemplazarlo; su carga y su error aparecen junto al botón.
- Consumo e historial de admisión ya no oculta su contenido al volver a la pestaña ni al aplicar filtros: los datos anteriores siguen a la vista con un aviso de actualización hasta que llega la respuesta, y un error de consulta se muestra sin borrarlos.
- Solicitudes y el historial de una solicitud ya no se vacían por un instante al terminar de cargar: los datos que llegan con la página siguen a la vista mientras se comprueba la cuenta, con sus acciones habilitadas al terminar.
- Conexión de mensajería ya no queda trabada cuando una prueba de canal o su confirmación de código nunca llegó a registrarse: pasados diez minutos con la ausencia confirmada, el líder puede conservarla en el historial y continuar sin reenviarla; una prueba que sigue en proceso todavía bloquea hasta leer su resultado.
- Con el historial de pruebas lleno, Conexión de mensajería ofrece «Vaciar pruebas anteriores», que pide confirmación y conserva solo la última, para poder pedir otra prueba sin cancelar ni reenviar las ya enviadas.

### Security

- La recuperación interna de una copia puede cerrar admisiones y retirar conexiones, códigos y pruebas anteriores por lotes, conservando los intentos inciertos y su consumo; reabrir requiere una conexión y una confirmación de política vigentes. El ensayo operativo sigue pendiente.
- El procesamiento interno de avisos por correo bloquea todo el grupo si cambian sus permisos o preferencias y conserva el aviso ante problemas reparables de protección; el envío automático sigue pendiente.
- Los campos de códigos de ingreso, pruebas de mensajería y claves de conexión quedan excluidos de las capturas al reportar un problema.
- Las referencias mínimas de tribus eliminadas quedan protegidas frente a su reactivación o reutilización.
- Cambiar o perder el liderazgo activo suspende las conexiones del líder anterior en el mismo cambio, conservando las membresías, las invitaciones y el consumo.
- El historial de decisiones de admisión conserva la evidencia mínima usada al decidir, sin guardar códigos ni datos privados del proveedor.
- La recuperación de una admisión permite consultar el resultado propio sin pertenecer todavía a la academia y conserva los permisos actuales de sus responsables.
- Adelantar un reintento requiere un líder activo con su sesión vigente; conserva la decisión original y rechaza la corrección si la sesión vence durante la operación.
- Las consultas de admisión permiten leer sólo la solicitud propia sin exigir pertenencia; conservan el estado existente cuando la configuración de una academia protegida deja de estar disponible.
- Los reintentos de presentación conservan el resultado originalmente confirmado, y las mutaciones rechazan peticiones desde un origen web ajeno antes de ejecutar cambios.
- Las operaciones sensibles de mensajería conservan la sesión y cuenta originales; si vencen durante la operación, informan que hace falta iniciar sesión sin confirmar cambios pendientes.
- La comprobación de países de mensajería distingue la conexión seleccionada de la candidata y deja de usar restricciones de una versión reemplazada.
- Las respuestas de admisión separan los datos del solicitante de la revisión y rechazan progreso no confirmado o pruebas de contacto de otro propósito.
- Los diagnósticos de errores de envío conservan sólo la referencia del intento y no incluyen su autorización privada completa.
- Las comprobaciones de credenciales de mensajería comparten un límite por academia aunque cambie la clave, y los reintentos conservan su consumo original.
- Los avisos de admisión quedan ligados a la solicitud y tribu de origen; su acceso distingue al solicitante de los responsables activos y evita duplicados.
- Un código de verificación que vence mientras espera una comprobación se rechaza sin confirmar el contacto ni consumirlo.
- Las operaciones de purga de credenciales retiradas requieren autorización vigente y conservan sus referencias e historial al eliminar el material privado.
- Los controles de mensajería rechazan sesiones vencidas y recursos de otro entorno antes de consultar material privado.
- El historial de admisiones conserva la relación con su tribu y sus operaciones, evitando referencias cruzadas entre comunidades.
- Los resultados confirmados de las operaciones de admisión quedan protegidos contra sobrescrituras y cambios de identidad.
- Las credenciales de mensajería retiradas o vinculadas a una cuenta o recurso sin autorización quedan fuera de uso; su eliminación conserva el historial de la conexión.
- Las operaciones sensibles de admisiones, mensajería y ciclo de vida de la tribu exigen la sesión activa del líder y la confirmación explícita de cada acción.

## [1.8.1] - 2026-10-16

### Fixed

- Cuando las admisiones de la academia están cerradas (como queda toda academia recién activada), Reglas y la guía de configuración ya no dicen que depende del equipo de TuTribu: explican que hay que encender «Admisiones abiertas» y llevan a Gestionar academia.
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
