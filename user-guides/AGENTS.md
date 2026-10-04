# Instrucciones para mantener los manuales internos

Estas reglas se aplican a los archivos de `user-guides/` y complementan las instrucciones del repositorio. Este directorio reúne los manuales internos de TuTribu como archivos HTML independientes por tema.

## Organización por tema

- Mantener un manual por tema particular. No volver a reunir todos los flujos en un único archivo extenso.
- Usar `index.html` como menú principal de temas y punto de entrada a los manuales.
- Conservar `application-flows.html` como índice detallado, mapa de páginas y compatibilidad de los enlaces del manual original.
- Conservar esta distribución, salvo una reorganización solicitada por el usuario:

| Archivo | Tema |
| --- | --- |
| `academy-mode.html` | Modo academia: activación, verificación, acceso, bonificaciones y renovación |
| `classic-mode.html` | Modo clásico y suscripción de membresía |
| `joining-options.html` | Formas de ingreso: pago, enlace público, gratuito e invitaciones; atribución |
| `courses.html` | Cursos, módulos, lecciones, progreso y gestión del contenido |
| `members.html` | Miembros, directorio, filtros y exportación |
| `tribe-story.html` | Historia, presentación, galería y ajustes de identidad |
| `welcome.html` | Bienvenida, acuerdos, recursos y elecciones |
| `campfire.html` | Fogón, publicaciones, respuestas, reacciones, encuestas y canales |
| `media-and-files.html` | Medios, enlaces, archivos, subidas y descargas |
| `payment-methods.html` | Medios de pago, Mercado Pago, precios y diagnóstico de cobros |
| `events.html` | Eventos, asistencia, propuestas, calendarios y recursos posteriores |
| `account-and-navigation.html` | Cuenta, sesión, navegación y creación de tribus |
| `notifications-and-support.html` | Notificaciones, soporte y reportes |
| `internal-operations.html` | Procesos automáticos y funciones sin recorrido disponible |

- Agregar un tema nuevo cuando tenga una responsabilidad propia; usar un nombre de archivo descriptivo en inglés y `kebab-case`.
- Elegir un manual propietario para cada flujo. Desarrollar allí sus pasos y reglas; desde los otros temas enlazar el recorrido, evitando copiar su explicación completa.
- Cada manual debe poder entenderse por separado. Incluir sus propios permisos, prerrequisitos, entrada, recorrido y referencias relevantes, sin copiar todo el contenido transversal del índice original.
- Al separar o mover un flujo, conservar todos sus pasos, resultados, límites, reglas, errores y condiciones de visibilidad. Revisar que ningún flujo quede sin un manual propietario.

## Índice y enlaces

- Actualizar `index.html` y el índice detallado `application-flows.html` en el mismo cambio que agrega, renombra, divide o elimina un manual.
- El índice debe mostrar el tema y el alcance de cada archivo, y ofrecer recorridos de lectura cuando un proceso atraviese varios temas.
- Cada manual debe ofrecer un enlace de regreso a `index.html` y enlaces a los temas relacionados.
- Usar enlaces relativos entre archivos del directorio, por ejemplo `events.html#post-event` o `academy-mode.html#verification`.
- Usar identificadores de sección estables en inglés. Cambiar el título o la numeración no debe cambiar el identificador.
- Al mover una sección, actualizar sus referencias dentro y fuera del archivo. Preservar los enlaces anteriores del manual combinado mediante redirecciones a la sección propietaria cuando corresponda.
- No dejar anclas que apunten a una sección inexistente ni enlaces a archivos temporales.
- El usuario solicitó un menú local por temas en `index.html`: debe enlazar los archivos temáticos y funcionar al abrirlo directamente. No presentarlo como una réplica del menú de la aplicación ni reemplazarlo por una. Si se solicita específicamente un menú que replique la app, aplicar el flujo correspondiente de la skill `user-manual`.

## Audiencia, idioma y alcance

- Escribir toda la explicación visible en español. Mantener en inglés nombres técnicos, archivos, identificadores y rutas que deban conservarse exactamente.
- La configuración confirmada para estos manuales es español, escritorio y equipo interno que necesita comprender las acciones de líder, guardián e integrante. Mantenerla en reorganizaciones; no repetir preguntas ya resueltas. Cambiarla cuando el usuario lo solicite.
- Explicar qué inicia cada flujo, qué hace la persona, qué cambia en el sistema, qué resultado confirma su finalización y cómo continuar ante errores.
- Documentar explícitamente quién ve cada control, quién puede usarlo y qué condiciones lo deshabilitan u ocultan.
- Distinguir membresía, estado, rol, verificación y cobertura comercial. No tratarlos como permisos o estados equivalentes.
- Diferenciar funciones operables de reglas previstas, rutas no disponibles o pantallas de próxima disponibilidad. No inventar botones ni pasos a partir de una declaración de arquitectura o de la existencia de un endpoint.
- Conservar los términos de glosario ya confirmados que sean pertinentes para cada tema: membresía, academia, vinculación, bonificación, renovación y lista de espera. No agregar términos nuevos sin seguir la confirmación de la skill.

## Formato y fuente de verdad

- Aplicar la skill `user-manual` para crear o actualizar estos manuales.
- Los manuales de este directorio usan `.html`, no `.htm`. `AGENTS.md` es un archivo de control y permanece en Markdown. Esta instrucción no modifica el formato exigido a la documentación bajo `docs/`.
- Usar Heritage Spec desde `~/system-config/configs/.agents/DESIGN.md`, con sus componentes, tokens, HTML semántico y script de navegación vigente.
- Mantener cada HTML autocontenido: estilos y scripts del documento embebidos y recursos visuales necesarios incorporados cuando corresponda.
- Seguir el orden estándar: Contenido; ¿Para qué sirve?; Audiencia; Permisos y prerrequisitos; ¿Cómo se accede?; Flujo general del proceso; particularidades; Flujos no felices; secciones de referencia pertinentes; Glosario al final cuando corresponda.
- Filtrar permisos, mensajes, límites y preguntas frecuentes por tema. No duplicar tablas globales completas en todos los archivos.
- Documentar desde la rama base actualizada. Antes de una actualización de contenido, comparar con el commit registrado mediante `source-trace.py diff`. No actualizar la trazabilidad a un código distinto sin comprobar los cambios relevantes.
- Mantener las metas `heritage:source-*` y el pie con el commit del código documentado en cada archivo. Una reorganización debe conservar la procedencia del contenido y registrar la nueva fuente cuando se haya verificado.
- Respetar la política de seguimiento actual del repositorio: el manual original ya está versionado. No introducir reglas de ignore que oculten los nuevos manuales o este archivo de control. No publicar, commitear ni subir cambios por iniciativa propia.

## Capturas y esquemas

- Preferir capturas reales con datos sintéticos y cubrir los estados pertinentes, siguiendo la skill.
- Nunca introducir datos reales de personas, credenciales, tokens o información de sesión en los archivos o capturas.
- Cuando un bloqueo concreto impida capturar la app, usar el fallback permitido por la skill e identificar cada ilustración como esquema, no como captura real. Explicar el bloqueo en el manual y en la entrega.
- Mantener esa distinción al reorganizar archivos; no convertir los esquemas existentes en supuestas capturas ni actualizar su fecha como si se hubieran recapturado.
- Mantener los pasos y referencias antes de su esquema o captura, con puntos numerados consistentes y dentro de la misma sección.

## Validación antes de entregar

- Ejecutar `check-manual.mjs` sobre los manuales HTML modificados y el índice detallado; corregir sus errores. Explicar las advertencias que dependan de una condición real, por ejemplo un documento local sin URL publicada o una app sin catálogo central de traducciones.
- El menú temático `index.html` no es un manual numerado ni una captura del menú de la app: validar sus enlaces, semántica, accesibilidad y comportamiento real en el navegador. No agregar secciones ficticias ni capturas simuladas para ajustarlo al modo de menú de la skill, que verifica réplicas de la aplicación.
- Comprobar que todos los enlaces relativos resuelvan un archivo y una sección existentes.
- Verificar que la división conserve los flujos del documento de origen y que las referencias transversales lleguen al manual propietario.
- Validar en el navegador el índice, el regreso al índice, los enlaces directos, la recarga con ancla, Inicio, la hoja del índice, los acordeones y los puntos de los esquemas o capturas.
- Validar el documento en Chromium y WebKit a 1280 px y 390 px; revisar que no haya desbordes, contenido cortado ni errores de JavaScript. Si no puede ejercitarse un motor, informar el bloqueo concreto.
- Una reorganización exclusivamente documental no exige cambiar código del producto ni agregar tests artificiales. Validar el funcionamiento real del documento y ejecutar los tests pertinentes cuando haya cambios funcionales adicionales.
- Limpiar servidores, worktrees, respaldos, fixtures y scripts temporales propios después de verificar la entrega. Conservar los manuales y los archivos de control solicitados.
