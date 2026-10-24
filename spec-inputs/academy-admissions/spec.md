# Feature Specification: Academy Admissions and Tenant Messaging

**Feature Branch**: No creada; el agente utilizará la integración de Git del proyecto solo si corresponde.

**Feature Directory**: A resolver por Spec Kit. Nombre corto: `academy-admissions`.

**Created**: 2026-10-05

**Status**: Draft — contrato completo para primera implementación y validación.

**Input**: Controlar la admisión gratuita a las academias de TuTribu mediante enlace común, lista de habilitados o revisión manual y excepciones. Permitir invitaciones nominativas de un canje con vencimiento opcional y exigencia de lista configurable. Cada líder decide si requiere un código adicional para comprobar un correo o teléfono y conecta sus propias credenciales de mensajería. La primera integración es Zavu; la arquitectura debe permitir otros proveedores mediante contratos propios e inyección de dependencias. Las notificaciones y la verificación adicional se configuran por separado. El login y la seguridad global de TuTribu no dependen de credenciales de una tribu.

## Propósito y alcance

El enlace es una vía de llegada, no una autorización transferible. Gratuitidad, admisión, autenticación, prueba de control de un contacto y acceso a contenido comercial son decisiones diferentes.

El solicitante siempre inicia sesión en TuTribu. El líder elige `allowlist` o `manual_review` y puede activar **“Exigir verificación adicional de contacto”**. Desactivar ese paso elimina el código adicional; no convierte un dato declarado en verificado ni permite saltear la lista, una invitación nominativa o un bloqueo. Con verificación adicional desactivada, una revisión manual por enlace común puede admitir una cuenta autenticada sin comprobar su contacto. Todo ingreso automático y todo canje nominativo necesitan una coincidencia confiable del destinatario.

“Contacto comprobado” significa evidencia de control de un correo o teléfono, dentro del alcance y nivel de confianza de su fuente. No significa DNI, biometría, identidad civil, pertenencia técnica a un grupo de WhatsApp ni una garantía de independencia frente al dueño de la cuenta de mensajería. Una prueba enviada con credenciales del líder solo sirve en esa tribu para admisión; jamás se reutiliza como credencial global.

Esta feature gobierna la **admisión básica gratuita a una tribu en modo academia**. No otorga por sí sola cursos, bonificaciones, suscripciones, vinculaciones con proveedores ni roles privilegiados. La verificación de un proveedor comercial es otro proceso.

Todos los requisitos DEBE/NO DEBE, matrices, límites y resultados de este documento son normativos. Las prioridades indican orden de entrega, no una reducción de alcance. `technical-contract.md` contiene las restricciones técnicas solicitadas y las fronteras de seguridad para el plan; no reemplaza este contrato funcional. `handoff.md` explica cómo utilizar el paquete y documenta las fuentes externas. No se ha ejecutado ni certificado una implementación.

## Vocabulario y fronteras de confianza

| Concepto | Significado y autoridad |
|---|---|
| Cuenta autenticada | Identidad estable y sesión de TuTribu; mantiene el sistema de autenticación existente. |
| Evidencia base confiable | Contacto acreditado por el sistema global de identidad, con procedencia verificable del servidor. En esta primera entrega, se admite el correo cuya autoridad de Google pueda comprobarse; un booleano aislado o un dato de perfil no alcanza. |
| Contacto declarado | Dato no comprobado aportado para revisión; nunca produce coincidencia automática ni reserva una identidad ajena. |
| Verificación adicional | Código exigido por la política de una tribu a una cuenta autenticada; incluso si el correo ya tiene evidencia base. |
| Prueba de admisión | Resultado de verificar el código, vinculado a tribu, cuenta, contacto, propósito y vigencia de la política. No modifica atributos globales de identidad. |
| Lista de habilitados | Fuente administrativa de autorización por tribu; no lista automática de miembros de WhatsApp. |
| Solicitud | Pedido y su resolución, distinto de una membresía activa. |
| Conexión de mensajería | Credencial protegida, proveedor, remitentes y capacidades de una tribu. No es un sistema de login. |
| Estado de entrega | Aceptado, entregado, fallido o desconocido por el proveedor. No acredita haber introducido correctamente un código. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Solicitar admisión manual sin contratar mensajería (Priority: P1)

Como líder quiero admitir personas mediante revisión aun sin configurar una API key. Como solicitante quiero ver mi estado sin entrar prematuramente al contenido.

**Why this priority**: Entrega control de ingreso utilizable sin dependencias de envío externas.

**Independent Test**: Tribu en revisión manual, verificación adicional apagada y sin conexión: completar solicitud, notificación interna y resolución con cuentas reales de prueba.

**Acceptance Scenarios**:

1. **US-01-AC-01** — **Given** la configuración indicada y una cuenta autenticada, **When** confirma “Solicitar ingreso”, **Then** se crea una única solicitud pendiente, aparece en la bandeja interna y no se exige código ni API key.

2. **US-01-AC-02** — **Given** un contacto declarado que coincide con alguien de la lista, **When** se presenta una solicitud manual sin prueba, **Then** no se etiqueta el contacto como comprobado ni se reserva para esa cuenta.

3. **US-01-AC-03** — **Given** una solicitud pendiente elegible, **When** un líder o guardián activo aprueba, **Then** la cuenta obtiene solo membresía básica y una notificación interna de resultado.

4. **US-01-AC-04** — **Given** una cuenta pendiente sin otra membresía legítima, **When** intenta leer recursos privados o aparecer en el directorio, **Then** se deniega el acceso y solo puede consultar su cuenta, su solicitud e información pública.

5. **US-01-AC-05** — **Given** una respuesta perdida o un doble clic, **When** el solicitante reintenta, **Then** recupera la solicitud existente sin duplicar avisos ni crear otra membresía.

### User Story 2 — Elegir la política y la verificación adicional (Priority: P1)

Como líder quiero configurar admisión, comprobación adicional y notificaciones de forma independiente, con advertencias que impidan combinaciones inseguras.

**Why this priority**: Define el comportamiento de todas las vías de ingreso.

**Independent Test**: Ejercitar todas las filas de las matrices de configuración y evidencia, con conexión preparada, ausente y fallida.

**Acceptance Scenarios**:

1. **US-02-AC-01** — **Given** correo y modo lista con código adicional apagado, **When** una cuenta posee evidencia base confiable coincidente, **Then** puede completar la admisión automática sin usar Zavu.

2. **US-02-AC-02** — **Given** correo y modo lista sin prueba confiable, **When** el usuario solo escribe un correo habilitado, **Then** no ingresa automáticamente; puede solicitar excepción si está permitida, sin que se invente una prueba.

3. **US-02-AC-03** — **Given** teléfono y modo lista, **When** el líder intenta guardar código adicional apagado, **Then** se impide guardar y se ofrece activar la comprobación o cambiar a revisión manual.

4. **US-02-AC-04** — **Given** modo manual y comprobación adicional activada, **When** el solicitante tiene sesión Google, **Then** debe completar el código antes de presentar, sin dispensarlo por estar autenticado.

5. **US-02-AC-05** — **Given** sin conexión con el canal necesario probado, **When** el líder intenta activar la comprobación, **Then** puede guardar un borrador pero no una política activa dependiente.

6. **US-02-AC-06** — **Given** cambio de configuración desde una pantalla obsoleta, **When** el líder confirma, **Then** se detecta el conflicto y no se sobrescribe la versión vigente.

### User Story 3 — Automatizar habilitados y revisar excepciones (Priority: P1)

Como líder quiero cargar personas autorizadas, admitir automáticamente las coincidencias confiables y revisar solo las excepciones habilitadas.

**Why this priority**: Reduce trabajo humano manteniendo el control de autorización.

**Independent Test**: Lista con entradas válidas, deshabilitadas, duplicadas y ajenas; ingreso, excepción e importación completa.

**Acceptance Scenarios**:

1. **US-03-AC-01** — **Given** modo lista, evidencia exigida válida y entrada habilitada, **When** la cuenta confirma el ingreso común, **Then** se admite automáticamente y queda trazada la habilitación usada.

2. **US-03-AC-02** — **Given** un enlace reenviado y una identidad distinta, **When** se intenta ingresar, **Then** la posesión del enlace no concede permiso.

3. **US-03-AC-03** — **Given** sin coincidencia y excepciones activadas, **When** la cuenta cumple los requisitos de verificación vigentes y explica el pedido, **Then** queda pendiente sin crear una habilitación.

4. **US-03-AC-04** — **Given** excepciones apagadas, **When** no existe coincidencia confiable, **Then** no se crea una solicitud de excepción.

5. **US-03-AC-05** — **Given** una excepción ya pendiente, **When** el líder incorpora después el contacto a la lista, **Then** no se aprueba automáticamente lo que ya está en revisión.

6. **US-03-AC-06** — **Given** un CSV con errores, duplicados y entradas deshabilitadas, **When** se previsualiza y confirma la importación, **Then** la vista previa no muta datos; solo se agregan filas válidas nuevas y se informan conflictos sin reactivar o reasignar.

### User Story 4 — Canjear invitaciones personales no transferibles (Priority: P1)

Como líder quiero emitir un enlace para un destinatario, elegir si requiere lista y controlar vencimiento y revocación.

**Why this priority**: Permite excepciones nominativas sin convertir el enlace en un pase al portador.

**Independent Test**: Invitaciones con/sin lista y vencimiento; identidades correctas/incorrectas y ambos modos de admisión.

**Acceptance Scenarios**:

1. **US-04-AC-01** — **Given** invitación que dispensa lista, modo lista y prueba exigida válida del destinatario, **When** confirma el canje, **Then** se admite una sola vez aunque no esté en la lista.

2. **US-04-AC-02** — **Given** la misma invitación en modo manual, **When** confirma el destinatario correcto, **Then** queda pendiente; la dispensa de lista no dispensa revisión.

3. **US-04-AC-03** — **Given** una invitación que exige lista, **When** el destinatario no está habilitado, **Then** no se canjea ni crea una excepción usando ese enlace.

4. **US-04-AC-04** — **Given** un tercero o una vista previa de WhatsApp, **When** abre o intenta un canje con otra identidad, **Then** no obtiene permiso, no conoce el destinatario y no consume el enlace.

5. **US-04-AC-05** — **Given** verificación adicional apagada y falta de evidencia base del destinatario, **When** se intenta un canje nominativo, **Then** no se confía en el contacto declarado ni se inicia un OTP oculto; se explica la imposibilidad y una vía común solo se ofrece como acción separada.

6. **US-04-AC-06** — **Given** invitación ya canjeada y solicitud pendiente, **When** el líder revoca la autorización, **Then** se cancela la solicitud sin reciclar el enlace.

7. **US-04-AC-07** — **Given** invitación canjeada antes de su vencimiento, **When** el enlace vence mientras espera la solicitud, **Then** la solicitud conserva su propio plazo.

### User Story 5 — Comprobar un contacto dentro de la tribu (Priority: P1)

Como solicitante quiero verificar el contacto solicitado con un código y corregir errores sin cambiar mi login ni exponerme a otras tribus.

**Why this priority**: Sustenta las listas telefónicas y la comprobación adicional opcional.

**Independent Test**: Correo, SMS y WhatsApp con proveedores preparados; desafíos vencidos, reenviados, cruzados y repetidos.

**Acceptance Scenarios**:

1. **US-05-AC-01** — **Given** verificación adicional encendida, **When** la cuenta solicita el código expresamente, **Then** se envía por la conexión y el canal de esa tribu, con sus límites y destinatario validado.

2. **US-05-AC-02** — **Given** un código correcto vigente, **When** lo presenta la cuenta para el mismo contacto, tribu y propósito, **Then** se genera una prueba de admisión, sin crear sesión, restablecer contraseña ni marcar un contacto global como verificado.

3. **US-05-AC-03** — **Given** un código de otra cuenta, tribu, desafío o propósito, **When** se presenta, **Then** se rechaza sin consumir una invitación ni crear prueba.

4. **US-05-AC-04** — **Given** cinco intentos fallidos o un código vencido, **When** se intenta validar, **Then** el desafío no se acepta; pedir otro envío no elude los límites acumulados.

5. **US-05-AC-05** — **Given** un nuevo envío por el canal alternativo SMS expresamente permitido, **When** el usuario lo confirma, **Then** el código anterior queda inválido y el nuevo envío cuenta contra las mismas cuotas.

6. **US-05-AC-06** — **Given** mensaje aceptado o entregado por Zavu, **When** se recibe el estado de entrega, **Then** no se marca el contacto como comprobado hasta introducir el código correcto.

7. **US-05-AC-07** — **Given** un contacto comprobado ya vinculado a otra cuenta de la misma tribu, **When** se intenta reclamarlo, **Then** se impide la reasignación y se ofrece recuperación segura sin identificar la otra cuenta.

### User Story 6 — Conectar Zavu con credenciales propias (Priority: P1)

Como líder quiero un asistente que me pida solo los datos necesarios y me diga qué falta antes de activar envíos facturables.

**Why this priority**: Hace operativa la cuenta de mensajería por tribu sin intervención ni despliegue por cliente.

**Independent Test**: Con dos cuentas/proyectos Zavu autorizados, preparar conexiones por canal y ejecutar pruebas reales solo con autorización expresa.

**Acceptance Scenarios**:

1. **US-06-AC-01** — **Given** un líder activo con autenticación reciente, **When** agrega su clave, **Then** se almacena protegida y después solo se muestra una máscara, nunca la clave completa.

2. **US-06-AC-02** — **Given** credencial con acceso a varios remitentes, **When** carga las opciones, **Then** solo ve recursos de esa conexión y debe seleccionar explícitamente el remitente que se usará.

3. **US-06-AC-03** — **Given** API key válida pero dominio, canal o plantilla no preparado, **When** revisa el asistente, **Then** se indican los requisitos faltantes y no se habilita el envío productivo dependiente.

4. **US-06-AC-04** — **Given** configuración preparada, **When** solicita y completa una prueba introduciendo el código recibido, **Then** el canal queda probado para esa versión, sin conceder ninguna admisión ni verificación global.

5. **US-06-AC-05** — **Given** clave de pruebas, **When** se intenta activar producción, **Then** se rechaza su uso productivo aunque haya servido para una prueba limitada.

6. **US-06-AC-06** — **Given** configuración ya guardada, **When** otro miembro o un guardián consulta/manipula credenciales, **Then** no puede leerlas, sustituirlas, probarlas ni gestionar la conexión.

7. **US-06-AC-07** — **Given** un canal de correo probado y comprobación adicional apagada, **When** el líder habilita avisos por correo, **Then** se usan para notificaciones sin habilitar códigos automáticamente.

### User Story 7 — Rotar y suspender conexiones sin cruzar cuentas (Priority: P1)

Como líder quiero cambiar credenciales, reemplazar el proveedor cuando exista un adaptador y detener envíos sin producir accesos inseguros.

**Why this priority**: Protege secretos, consumo y continuidad de servicio.

**Independent Test**: Conexión activa y candidata, trabajos pendientes, rotación, suspensión, compromiso y transferencia de liderazgo.

**Acceptance Scenarios**:

1. **US-07-AC-01** — **Given** una conexión activa y una candidata defectuosa, **When** se prueba la candidata, **Then** no reemplaza ni modifica la activa.

2. **US-07-AC-02** — **Given** una candidata completamente preparada, **When** el líder confirma el reemplazo, **Then** las nuevas operaciones usan la nueva versión; los trabajos antiguos no cambian de credenciales silenciosamente.

3. **US-07-AC-03** — **Given** una integración requerida, **When** el líder intenta desconectarla, **Then** debe resolver dependencias con reemplazo, política compatible o pausa de admisiones; siempre existe suspensión inmediata de seguridad.

4. **US-07-AC-04** — **Given** dos tribus enviando en paralelo, **When** se procesa cada trabajo, **Then** cada uno conserva su conexión, remitente y contexto sin recurrir a claves globales o de otra tribu.

5. **US-07-AC-05** — **Given** una clave invalidada o servicio sin disponibilidad, **When** se intenta una prueba requerida, **Then** se informa el error recuperable sin admitir al usuario ni cobrar a una cuenta de TuTribu de respaldo.

6. **US-07-AC-06** — **Given** transferencia de liderazgo, **When** cambia el líder canónico, **Then** se suspenden envíos con la conexión anterior hasta que el nuevo líder aporte y pruebe una conexión; las membresías e invitaciones no desaparecen.

### User Story 8 — Resolver y notificar sin duplicar trabajo (Priority: P2)

Como líder o guardián quiero una bandeja compartida, decisiones por lotes y avisos que respeten mis permisos.

**Why this priority**: Escala la operación manual y las excepciones.

**Independent Test**: Solicitudes de distintas fuentes, lote mixto y fallos de correo con y sin integración.

**Acceptance Scenarios**:

1. **US-08-AC-01** — **Given** sin correo externo habilitado, **When** llega una solicitud, **Then** la bandeja y avisos internos siguen disponibles.

2. **US-08-AC-02** — **Given** notificaciones por correo habilitadas, **When** se crean varias solicitudes, **Then** el líder recibe el resumen según su preferencia sin un correo por cada reintento.

3. **US-08-AC-03** — **Given** proveedor de correo caído, **When** se presenta o resuelve una solicitud, **Then** no se pierde ni se revierte la decisión; queda la obligación de entrega con reintentos acotados.

4. **US-08-AC-04** — **Given** un lote explícito de hasta cincuenta solicitudes, **When** se confirma una decisión, **Then** se revalida cada caso y se informa el resultado individual y los conflictos.

5. **US-08-AC-05** — **Given** un correo de revisión o un antiguo guardián, **When** abre el enlace o intenta decidir, **Then** abrir no ejecuta acciones y los permisos se vuelven a comprobar.

6. **US-08-AC-06** — **Given** una admisión automática, **When** se registra, **Then** figura en actividad y métricas sin generar por defecto una tarea manual de revisión.

### User Story 9 — Conservar decisiones consistentes ante cambios (Priority: P1)

Como responsable quiero estados confiables frente a simultaneidad, cambios de política y expiraciones.

**Why this priority**: Garantiza que un único uso o una aprobación sean efectivos también bajo concurrencia.

**Independent Test**: Canjes/decisiones simultáneos, cambios de verificación y solicitudes próximas al vencimiento.

**Acceptance Scenarios**:

1. **US-09-AC-01** — **Given** cien confirmaciones simultáneas de un enlace, **When** compiten por el canje, **Then** como máximo una operación crea admisión o solicitud; los reintentos recuperan su resultado.

2. **US-09-AC-02** — **Given** aprobación y rechazo concurrentes, **When** ambos llegan al servidor, **Then** una sola transición terminal gana sin estados parciales.

3. **US-09-AC-03** — **Given** una solicitud presentada sin código, **When** el líder enciende la verificación, **Then** no se aprueba hasta que el solicitante aporte la prueba exigida a esa misma solicitud; no se crea una duplicada.

4. **US-09-AC-04** — **Given** una solicitud pendiente, **When** se apaga la verificación o se flexibiliza la modalidad, **Then** no se aprueba sola ni desaparecen los requisitos propios de la invitación.

5. **US-09-AC-05** — **Given** solicitud respaldada por prueba válida al presentarse, **When** un responsable la revisa varios días después, **Then** no exige repetir el código por antigüedad mientras la política y la evidencia sigan siendo válidas.

6. **US-09-AC-06** — **Given** solicitud vencida o admisiones pausadas, **When** se intenta aprobar, **Then** se impide la aprobación aunque una tarea de mantenimiento aún no haya actualizado el estado visible.

### User Story 10 — Preservar membresías y reglas comerciales (Priority: P1)

Como integrante quiero conservar mis derechos y restricciones al incorporar la admisión controlada.

**Why this priority**: La feature se integra con TuTribu, sin sustituir sus reglas de membresía y productos.

**Independent Test**: Inventario de entradas gratuitas/pagas, invitados históricos y estados canónicos del repositorio.

**Acceptance Scenarios**:

1. **US-10-AC-01** — **Given** miembro activo o silenciado, **When** abre un enlace o se activa la política, **Then** conserva rol y estado; no se quita el silenciamiento ni se vuelve a admitir.

2. **US-10-AC-02** — **Given** bloqueo por conducta o remoción administrativa no recuperable, **When** se intenta cualquier vía o aprobación, **Then** la admisión no levanta esa restricción.

3. **US-10-AC-03** — **Given** restricción exclusivamente comercial recuperable por el dominio, **When** se cumplen los requisitos nuevos, **Then** solo se recupera acceso básico; no se restauran pagos ni cursos.

4. **US-10-AC-04** — **Given** invitación histórica impersonal, **When** se usa con la feature activada, **Then** no dispensa las nuevas reglas; pasa por la política del enlace común.

5. **US-10-AC-05** — **Given** solicitud pendiente y una membresía legítima obtenida por otra vía, **When** se reconcilia el estado, **Then** la solicitud se cancela con esa causa sin fingir una aprobación.

6. **US-10-AC-06** — **Given** rollback de una academia que ya activó el control, **When** no puede ejecutarse la política, **Then** se cierran nuevas admisiones; no se restaura acceso gratuito abierto.

### User Story 11 — Controlar abuso, privacidad y costos (Priority: P1)

Como líder quiero límites de consumo y seguridad; como solicitante quiero saber qué se comprueba y quién envía el código.

**Why this priority**: Las credenciales del líder no deben convertirse en un servicio público de envío ni en autoridad global de identidad.

**Independent Test**: Pruebas adversarias multi-tenant, límites concurrentes, fugas de secretos y datos expuestos por rol.

**Acceptance Scenarios**:

1. **US-11-AC-01** — **Given** límite de envíos o intentos alcanzado, **When** se alterna canal, clave, dispositivo o tribu, **Then** no se eluden los contadores relevantes ni se cambian cuentas pagadoras.

2. **US-11-AC-02** — **Given** líder reduce un cupo, **When** ya hay envíos en cola, **Then** se revalida al despachar y no se sobrepasa deliberadamente el nuevo límite.

3. **US-11-AC-03** — **Given** solicitante sin permiso, **When** intenta elegir un remitente, destino arbitrario, plantilla o texto, **Then** el servidor no ejecuta ese envío.

4. **US-11-AC-04** — **Given** una credencial o código en uso, **When** se inspeccionan logs, respuestas, analítica y trazas, **Then** no aparecen secretos ni cuerpos OTP en esas superficies.

5. **US-11-AC-05** — **Given** conexión por tribu, **When** su dueño puede consultar información en el proveedor, **Then** esa confianza no se usa para verificar identidades en otras tribus ni para recuperar cuentas globales.

### User Story 12 — Extender el proveedor sin cambiar admisiones (Priority: P2)

Como responsable de TuTribu quiero implementar Zavu ahora y poder incorporar otro proveedor sin reescribir lista, invitaciones o aprobaciones.

**Why this priority**: Evita acoplamiento al SDK y cambios dispersos en el producto.

**Independent Test**: Validar los contratos propios con Zavu y un doble en el borde de mensajería; el doble no se publica como proveedor real.

**Acceptance Scenarios**:

1. **US-12-AC-01** — **Given** registro de proveedores de primera entrega, **When** el líder abre configuración, **Then** solo Zavu es conectable y solo aparecen capacidades realmente implementadas.

2. **US-12-AC-02** — **Given** un adaptador sustituible en pruebas, **When** se ejecutan los casos de admisión, **Then** conservan su resultado sin depender de DTOs o estados específicos de Zavu.

3. **US-12-AC-03** — **Given** un futuro proveedor solo compatible con correo, **When** se evalúan sus capacidades, **Then** no se le exige implementar teléfono ficticiamente ni se habilita una política telefónica con él.

4. **US-12-AC-04** — **Given** un identificador de proveedor no implementado recibido por API, **When** se intenta configurar o enviar, **Then** se deniega con error de capacidad; no se selecciona otro proveedor silenciosamente.

### Edge Cases

| ID | Situación | Resultado obligatorio |
|---|---|---|
| EC-01 | Vista previa de WhatsApp, prefetch o visita | Ningún envío OTP, solicitud, canje ni membresía por leer. |
| EC-02 | Correo escrito igual al de una habilitación | Sin evidencia confiable no autoriza ni reclama esa identidad. |
| EC-03 | Google autentica una cuenta cuyo correo no puede acreditarse como confiable | La sesión es válida; el contacto no se usa automáticamente. No se inventan claims ni se fuerza un OTP con el check apagado. |
| EC-04 | Correo con puntos, etiquetas o alias | No se colapsan direcciones por heurísticas; usar normalización canónica documentada. |
| EC-05 | Teléfono sin país o ambiguo | Solicitar corrección; no adivinar otro número ni comparar por sufijos. |
| EC-06 | Teléfono y revisión manual sin códigos | Enlace común utilizable; contacto declarado opcional y sin valor probatorio. No hay canje nominativo telefónico nuevo. |
| EC-07 | Encender códigos para una solicitud ya pendiente | Requiere prueba de la época vigente; puede aportarse a esa solicitud sin duplicarla. |
| EC-08 | Cambiar un contacto ya presentado | Cancelar y presentar de nuevo; nunca reemplazar el destinatario de una invitación. Un contacto ausente puede adjuntarse por primera vez con prueba y auditoría. |
| EC-09 | Dos cuentas reclaman el mismo contacto comprobado en una tribu | Solo una vinculación válida; no revelar la otra cuenta. Un dato meramente declarado no bloquea el reclamo legítimo. |
| EC-10 | Se pierde la respuesta tras un commit | Devolver el resultado persistido al reintentar, sin duplicar efectos. |
| EC-11 | Dos revisores toman decisiones opuestas | Una sola transición gana; el segundo ve el resultado vigente. |
| EC-12 | Enlace vence mientras espera la solicitud | No vence la solicitud por ese motivo. |
| EC-13 | Solicitud vence durante la aprobación | Comprobar el plazo en la decisión autoritativa, no confiar en tareas de limpieza. |
| EC-14 | Invitación canjeada con solicitud rechazada/cancelada/vencida | No volver a habilitar el enlace. |
| EC-15 | Hay solicitud vigente y se abre otra invitación | Mostrar la solicitud, sin consumir ni adjuntar silenciosamente otra autorización. |
| EC-16 | Se deshabilita una entrada de lista de un miembro | No se expulsa; retirar membresía es otra acción. |
| EC-17 | Lista modificada tras previsualizar CSV o antes de aprobar | Revalidar y mostrar conflictos; no sobrescribir datos recientes. |
| EC-18 | Invitación exige lista y excepciones comunes están permitidas | Esa invitación sigue requiriendo lista. No convertirla en excepción implícita. |
| EC-19 | Un código se reenvía, cambia de canal o llega fuera de orden | Solo el desafío actual es verificable; los límites acumulados no se reinician. |
| EC-20 | Mensaje aceptado, entregado, leído o callback manipulado | Ninguno equivale a código validado. |
| EC-21 | Código de onboarding de conexión | Solo prueba esa conexión y canal; no verifica al solicitante ni autentica al líder. |
| EC-22 | API key con formato válido pero inválida o sin permisos | No activar; describir el requisito faltante sin mostrar el secreto. |
| EC-23 | Clave de prueba funciona para un número propio | No considerarla apta para destinatarios productivos. |
| EC-24 | Dominio o plantilla deja de estar operativo | Degradar la capacidad dependiente; no cambiar de canal/cuenta silenciosamente. |
| EC-25 | Proveedor caído y código ya entregado | Se puede validar localmente si sigue vigente y no fue invalidado; la caída no constituye una dispensa ni una prueba. |
| EC-26 | Cuota agotada después de enviar | Impedir nuevos envíos; permitir validar el código vigente y consultar solicitudes. |
| EC-27 | Timeout con resultado de envío incierto | Registrar estado desconocido; reintentar solo con deduplicación comprobada. No efectuar otro envío ciego. |
| EC-28 | Clave rotada con trabajos pendientes | Los trabajos conservan versión; no usan automáticamente una nueva conexión ni otra tribu. |
| EC-29 | Conexión suspendida por sospecha de compromiso | Detener despachos e invalidar desafíos/pruebas no aplicadas. Marcar pruebas afectadas de solicitudes pendientes para nueva comprobación. |
| EC-30 | Liderazgo transferido con cuenta Zavu personal del líder anterior | Suspender la conexión; el nuevo líder configura y prueba credenciales propias. Las invitaciones de la tribu conservan su ciclo. |
| EC-31 | Un líder usa la misma cuenta externa en varias tribus | TuTribu mantiene aislamiento interno, pero no promete aislamiento del dashboard externo; recomienda credenciales/proyectos dedicados. |
| EC-32 | Solicitante altera `tribeId`, `connectionId`, remitente o propósito | Resolver contexto autoritativo y denegar acceso cruzado antes de acceder a secretos o enviar. |
| EC-33 | Un guardián pierde permisos con correos en cola | No enviar nuevos datos de gestión a ese destinatario; panel y decisiones vuelven a validar permisos. |
| EC-34 | Webhook repetido, fuera de orden o falso, si se utiliza | Autenticar y correlacionar con un mensaje emitido; solo actualizar transporte, nunca identidad o membresía. |
| EC-35 | Dos despachos alcanzan el último cupo a la vez | Reservar capacidad consistentemente; no permitir que ambos superen el límite. |
| EC-36 | Cambiar API key, canal o proveedor para reiniciar consumo | Los contadores por tribu/cuenta/contacto conservan su vigencia. |
| EC-37 | Desactivar correos externos | La bandeja interna permanece; no enviar más avisos en cola que la preferencia vigente prohíba. |
| EC-38 | Desconectar sin revocar la clave en Zavu | TuTribu deja de usarla y elimina su copia según retención; informa que revocarla en el proveedor es una acción separada. |
| EC-39 | Pausa, salida de modo academia o eliminación | Aplicar los estados definidos; nunca resucitar solicitudes/invitaciones al volver. |
| EC-40 | Restricción comercial confundida con conducta | Usar clasificación canónica del dominio y recuperar solo lo permitido tras la admisión. |
| EC-41 | CSV con HTML o fórmula y reporte exportado | Tratar como datos; no ejecutar contenido ni fórmulas en el reporte. |
| EC-42 | Miembro abandona WhatsApp o presta su cuenta | No hay detección automática ni garantía de identidad civil; la gestión de pertenencia es explícita. |
| EC-43 | Borrador de configuración con prueba exitosa antigua | La prueba solo habilita su versión exacta; otra clave/remitente/canal requiere validación y prueba nuevas. |
| EC-44 | No hay integración para avisar que la integración falló | Mostrar alerta y estado dentro de TuTribu; no depender del canal averiado para recuperarse. |
| EC-45 | Un SDK intenta obtener una clave global por omisión | Fallar la operación; nunca usar credenciales del entorno como sustituto de las de la tribu. |

## Requirements *(mandatory)*

### Decisiones funcionales cerradas

| ID | Decisión |
|---|---|
| D-01 | Dos modalidades: `allowlist` y `manual_review`. No se agrega un modo abierto nuevo. |
| D-02 | El login existente es obligatorio en todos los recorridos. |
| D-03 | Verificación adicional apagada por defecto; modo inicial manual y tipo de contacto inicial correo. |
| D-04 | Una configuración válida sin proveedor permite revisión manual e interacción interna. |
| D-05 | Con código adicional encendido, toda nueva presentación exige prueba de esa tribu, aun con correo Google confiable. |
| D-06 | Con código adicional apagado, una coincidencia automática o nominativa solo puede utilizar evidencia base confiable. |
| D-07 | Teléfono con lista automática exige códigos encendidos. Teléfono manual sin códigos solo admite nuevas solicitudes por enlace común. |
| D-08 | El tipo de contacto (`email` o `phone`) se elige antes de activar la política y no cambia en esta primera entrega. Canal, conexión, modalidad y check sí pueden cambiar con validación. |
| D-09 | Las excepciones del enlace común en modo lista son opcionales y se inician apagadas. Una revisión sin coincidencia siempre es deliberada y auditable. |
| D-10 | Toda invitación es nominativa, de un canje y revocable, con vencimiento opcional. No existen invitaciones al portador ni preaprobadas. |
| D-11 | La casilla de lista no omite identidad exigible, aprobación manual, restricciones de conducta ni controles comerciales. |
| D-12 | Una presentación pendiente no crea membresía ni concede contenido privado. No se aprueba automáticamente al flexibilizar políticas. |
| D-13 | Zavu es el único proveedor implementado y seleccionable de primera entrega. Twilio y Resend no se implementan ni se muestran como conectables. |
| D-14 | Cada tribu dispone como máximo de una conexión de mensajería activa y una candidata de reemplazo. Una conexión puede tener remitentes distintos por canal. |
| D-15 | El líder aporta las credenciales; no se necesita un despliegue ni una variable de entorno por tribu. No hay respaldo automático con cuentas de TuTribu. |
| D-16 | Notificaciones internas siempre disponibles; correo externo opcional, inicialmente apagado y condicionado a su propia capacidad de envío. |
| D-17 | Primera entrega: códigos por correo, SMS o WhatsApp, habilitables según configuración real; notificaciones externas de admisión solamente por correo. |
| D-18 | Para teléfono se elige un canal principal. Alternativa WhatsApp → SMS al mismo número solo por elección explícita del solicitante, si el líder la habilitó. No hay cambio automático a correo. |
| D-19 | El propietario de la cuenta de mensajería es un participante del límite de confianza de esa tribu. Sus códigos no certifican identidad global ni independencia frente al líder. |
| D-20 | Toda API key se trata como secreto recuperable solo por el backend autorizado. Nunca se vuelve a mostrar después de guardarla. |
| D-21 | Conectar el proveedor no activa por sí solo códigos ni correos. Desactivar códigos no desconecta el proveedor ni habilita datos declarados. |
| D-22 | El cierre por errores es selectivo: impide nuevos envíos requeridos, no destruye solicitudes, no revierte miembros y no invalida una prueba ya válida por una caída transitoria. |
| D-23 | Se conserva acceso básico/comercial por separado y la distinción entre restricciones comerciales recuperables y bloqueos no recuperables. |
| D-24 | Las duraciones, cuotas y objetivos de rendimiento son decisiones propuestas verificables, no tarifas ni garantías del proveedor. |

### Matriz de configuración y evidencia

`OFF` significa código adicional apagado; `ON`, encendido. “Base” se obtiene del sistema global de identidad, no del proveedor de la tribu. “Prueba local” es un código comprobado para esa admisión. No se heredan pruebas locales de otra tribu.

| Modo | Contacto | Check | Configuración válida | Evidencia y vía utilizable |
|---|---|---|---|---|
| Manual | Correo | OFF | Sí, sin mensajería | Enlace común: sesión suficiente. Invitación: correo base confiable y coincidencia exacta. |
| Manual | Teléfono | OFF | Sí, con advertencia | Enlace común: sesión suficiente, número declarado opcional. No emitir ni canjear nuevas invitaciones telefónicas mientras siga OFF. |
| Lista | Correo | OFF | Sí, sin mensajería | Base confiable coincidente para automático. Sin base/coincidencia solo revisión de excepción, cuando esté habilitada. |
| Lista | Teléfono | OFF | No | Activar prueba telefónica o elegir revisión manual. No se compara un número declarado. |
| Manual | Correo | ON | Solo con canal correo preparado | Prueba local del correo antes de solicitar o canjear; después revisión manual. |
| Lista | Correo | ON | Solo con canal correo preparado | Prueba local antes de evaluar ingreso o excepción. |
| Manual | Teléfono | ON | Solo con canal telefónico preparado | Prueba local antes de solicitar o canjear; después revisión manual. |
| Lista | Teléfono | ON | Solo con canal telefónico preparado | Prueba local antes de evaluar lista o excepción. |

El correo de admisión es el correo actual de la cuenta autenticada obtenido del servidor, comprobado por la fuente aplicable; no un correo alternativo arbitrario escrito para coincidir con la lista. El teléfono se vincula a la cuenta existente sin cambiar el login. Un correo sin evidencia base no impide usar TuTribu con sesión válida, pero sí su uso como coincidencia confiable con OFF. Se ofrecerá cambio de cuenta o revisión permitida, nunca un OTP oculto con el check apagado.

Con ON, la prueba local es obligatoria aunque haya evidencia base. Con OFF, no se inician nuevos desafíos locales, ni se reutilizan pruebas locales antiguas para nuevos ingresos automáticos. Las pruebas válidas incorporadas a solicitudes pendientes conservan su valor histórico según las reglas de revisión, no se convierten en evidencia base.

### Matriz de admisión después de comprobar los requisitos de evidencia

También se exige: academia activa, admisiones abiertas, cuenta no bloqueada para ese ingreso, vínculo de contacto no apropiado por otra cuenta y enlace válido cuando corresponde. La ausencia de prueba no equivale a una coincidencia de lista.

| Modalidad | Vía | Exige lista | Resultado |
|---|---|---|---|
| Lista | Común | Sí | Coincidencia confiable habilitada → ingreso automático. Si falta, revisión solo cuando se admiten excepciones. |
| Lista | Personalizada | Sí | Destinatario comprobado y habilitado → ingreso automático; sin lista no canjea. |
| Lista | Personalizada | No | Destinatario comprobado → ingreso automático; la invitación autoriza la excepción a la lista. |
| Manual | Común | No | Solicitud pendiente. Con OFF no se exige prueba de contacto; con ON sí. |
| Manual | Personalizada | Sí | Destinatario comprobado y habilitado → solicitud pendiente. |
| Manual | Personalizada | No | Destinatario comprobado → solicitud pendiente. |

La ruta personalizada nunca se convierte silenciosamente en común. Para pedir revisión por otra vía, el usuario debe abandonar expresamente el intento de canje. Un contacto declarado o una entrada deshabilitada no constituye un bloqueo global, pero tampoco una habilitación. El bloqueo no recuperable se gestiona con el mecanismo de membresía correspondiente.

### Revisión de solicitudes y cambios de política

Se conserva la política de presentación para auditoría y se comprueban los requisitos actuales al decidir. Nunca se recalifica automáticamente como aprobada una solicitud pendiente.

| Cambio o fuente | Regla de resolución |
|---|---|
| Solicitud por enlace común, modo actual manual | Sesión/cuenta vigente y decisión explícita. Si ON está vigente, debe existir prueba local aplicable. |
| Solicitud común, modo actual lista | Coincidencia confiable habilitada actual o excepción actualmente permitida con motivo interno. Si ON, prueba local obligatoria en ambos casos. |
| Solicitud con invitación que exige lista | Mantener autorización nominativa, evidencia del destinatario y coincidencia habilitada actual. No dispensar desde “Aprobar”. |
| Solicitud con invitación que dispensa lista | Mantener autorización nominativa y prueba del destinatario; conservar revisión por estar pendiente. |
| OFF → ON, incluso tras un período previo ON | Iniciar una nueva época de exigencia. Toda solicitud pendiente necesita una prueba de esa época; se puede adjuntar a la solicitud existente sin crear otra. |
| ON → OFF | Invalidar desafíos y pruebas aún no aplicadas. No aprobar pendientes ni eliminar requisitos nominativos. Conservar evidencia histórica válida de las solicitudes ya presentadas. |
| Cambio de canal/remitente o rotación normal | No modifica por sí solo la época de exigencia. Invalida desafíos y pruebas no aplicadas de la conexión sustituida; las pruebas ya adjuntadas conservan valor. |
| Suspensión por compromiso | Invalidar desafíos/pruebas no aplicadas y poner las pruebas afectadas de solicitudes pendientes en necesidad de recomprobación; nunca sustituirlas por “verificado” manual. |
| Cambio de contacto ya fijado en una solicitud | Cancelar y presentar de nuevo. Solo si faltaba el contacto, se permite adjuntarlo por primera vez con prueba, sin cambiar una identidad existente. |
| Falta un requisito actual | Mantener `pending` con motivo de inelegibilidad visible; permitir aportar prueba cuando corresponda, rechazo/cancelación o vencimiento. |
| Pausa de admisiones | No nuevas presentaciones ni aprobaciones. Los plazos continúan; consultar/rechazar/cancelar sigue disponible. |

La ventana de frescura de quince minutos se exige al presentar o adjuntar una prueba, no cada día que el revisor abre la solicitud. Una prueba ya adjuntada permite resolver hasta el vencimiento de la solicitud, salvo invalidación, conflicto de identidad o nueva época de exigencia. Una prueba formalmente invalidada no acredita al destinatario aunque se apague después el check; se necesita recomprobación o una nueva solicitud por una vía actualmente válida.

### Matriz de permisos por tribu

Todas las facultades administrativas requieren rol y estado actuales. Una sesión con un rol antiguo no conserva permisos. Un solicitante no puede aprobarse a sí mismo.

| Capacidad | Líder activo | Guardián activo | Solicitante |
|---|---|---|---|
| Configurar modalidad, check, canal, excepciones y apertura | Sí | No | No |
| Gestionar lista completa e importaciones | Sí | No | No |
| Emitir/revocar invitaciones | Sí | No | No |
| Crear, probar, rotar, suspender o borrar credenciales | Sí, con autenticación reciente | No | No |
| Consultar metadatos de conexión y consumo | Sí, sin secreto | Solo alerta operativa mínima necesaria | No |
| Consultar secreto completo después de guardarlo | No | No | No |
| Ver bandeja y resolver solicitudes elegibles | Sí | Sí | Solo estado propio, no decisiones |
| Aprobar excepciones permitidas con motivo | Sí | Sí | No |
| Cancelar por gestión / adelantar nuevo intento | Sí | No; puede rechazar | Puede cancelar su propio pedido |
| Ver auditoría completa | Sí | Historial necesario para revisar | Solo estado y mensajes externos propios |
| Modificar preferencias personales de avisos | Sí | Sí | Preferencias existentes del producto |
| Conceder cursos, pagos o roles desde este flujo | No | No | No |

La gestión de una conexión no da permiso para enviar texto arbitrario a cualquier contacto. Las credenciales de una tribu no pueden utilizarse en otra, aun si la misma persona es líder en ambas.

### Functional Requirements

#### A. Alcance y configuración

- **FR-001**: El sistema DEBE aplicar la política a todas las vías de nueva creación o recuperación gratuita de membresía básica en modo academia, incluidas rutas antiguas y operaciones administrativas; el inventario se valida antes de activar.

- **FR-002**: Toda presentación, validación de código y canje DEBE pertenecer a una cuenta autenticada estable. Desactivar códigos NO DEBE desactivar el login ni crear un sistema de cuentas paralelo.

- **FR-003**: Solo el líder activo DEBE poder configurar `allowlist` o `manual_review`, apertura de admisiones y excepciones comunes en modo lista. Una configuración inválida o ausente con la feature activa NO DEBE interpretarse como ingreso abierto.

- **FR-004**: Admisión, verificación adicional, conexión de mensajería y avisos externos DEBEN ser configuraciones independientes, sujetas a la matriz de compatibilidad. Conectar un proveedor NO DEBE activar ninguna de las otras capacidades automáticamente.

- **FR-005**: El líder DEBE disponer del check “Exigir verificación adicional de contacto para ingresar”, apagado por defecto. Encenderlo exige el canal requerido preparado y probado; apagarlo no da por comprobado ningún dato.

- **FR-006**: Cada tribu DEBE elegir un tipo de contacto, `email` o `phone`, antes de la activación. Ese tipo se conserva para lista e invitaciones y NO DEBE cambiarse en esta primera entrega.

- **FR-007**: El sistema DEBE rechazar configuraciones incompatibles, en particular lista telefónica automática sin verificación adicional. Manual telefónico con OFF DEBE advertir que las nuevas invitaciones telefónicas no están disponibles.

- **FR-008**: Al configurar por primera vez se DEBE proponer manual, correo, check OFF, excepciones OFF, notificaciones externas OFF y admisiones cerradas hasta confirmación explícita del líder.

- **FR-009**: Los cambios DEBEN mostrar su impacto y usar una versión de configuración. Una edición obsoleta NO DEBE sobrescribir silenciosamente cambios de otro responsable o sesión.

- **FR-010**: Una nueva admisión o solicitud DEBE exigir confirmación explícita del usuario. Leer, abrir un enlace, iniciar sesión o recibir una vista previa NO DEBE iniciar envíos ni escrituras de admisión.

- **FR-011**: El sistema NO DEBE usar origen aparente de WhatsApp, parámetros de campaña, contraseñas compartidas, IP o posesión del enlace como autorización de ingreso.

- **FR-012**: La admisión DEBE conservar independencia de suscripciones, beneficios y verificación de proveedores. Un indicador de pago enviado por el cliente NO DEBE eludir la política gratuita.

- **FR-013**: Desactivar el check NO DEBE apagar notificaciones o desconectar la cuenta de mensajería. Desactivar la conexión NO DEBE transformar una política exigente en admisión sin control.

#### B. Evidencia de contacto y alcance de confianza

- **FR-014**: La evidencia base DEBE proceder del servidor y del sistema global de identidad confiable, con fuente acreditable. Un booleano de perfil o un correo enviado por el cliente NO DEBE bastar para acreditar control.

- **FR-015**: Para correo Google, el sistema DEBE distinguir los casos en que Google es autoridad del correo de las cuentas con correo externo sin autoridad suficiente. Si faltan las señales necesarias NO DEBE asumir confianza ni obtenerla del frontend.

- **FR-016**: Con OFF, el enlace común en modo manual DEBE aceptar una cuenta autenticada sin prueba de contacto adicional. Cualquier contacto no acreditado se muestra como declarado, nunca como verificado.

- **FR-017**: Con OFF, los nuevos ingresos automáticos y canjes nominativos DEBEN usar coincidencia de evidencia base confiable. No se inician códigos adicionales ni se reutilizan pruebas locales históricas para esos nuevos ingresos.

- **FR-018**: En modo lista de correo con OFF, falta de evidencia base o de coincidencia solo DEBE permitir una revisión cuando las excepciones estén habilitadas; su aprobación es de la cuenta autenticada y requiere motivo.

- **FR-019**: Con ON, el solicitante DEBE completar prueba local del contacto elegido antes de presentar por cualquier vía, incluida una excepción, aun si ya dispone de correo acreditado por Google.

- **FR-020**: El correo usado para admisión DEBE ser el actual de la cuenta obtenido por el backend. Normalización y comparación DEBEN ser canónicas; NO DEBEN eliminarse puntos, etiquetas o alias por heurística.

- **FR-021**: El teléfono DEBE normalizarse con país y validación inequívoca. Verificarlo DEBE asociarlo a la cuenta existente únicamente para el propósito/tribu correspondiente, sin crear o enlazar cuentas globales por ese dato.

- **FR-022**: Un contacto declarado NO DEBE reclamar, consumir, bloquear o vincular una habilitación para esa cuenta. No disponer de teléfono es válido en una solicitud manual común con OFF.

- **FR-023**: Dentro de una tribu, un contacto comprobado utilizado en una presentación NO DEBE quedar vinculado a dos cuentas distintas. La vinculación válida se fija al presentar, no por escribir el dato ni solo por solicitar un código.

- **FR-024**: Cambiar perfil, deshabilitar una fila o cancelar una solicitud NO DEBE transferir silenciosamente un vínculo comprobado a otra cuenta. Los conflictos se resuelven por recuperación autorizada, sin revelar la cuenta afectada.

- **FR-025**: Cada desafío y prueba DEBE estar vinculado a cuenta, tribu, contacto normalizado, propósito, época de verificación y versión de conexión. Una prueba de una tribu NO DEBE aceptarse en otra.

- **FR-026**: Las credenciales o pruebas del líder NO DEBEN crear sesiones globales, validar recuperación de contraseña, modificar correo/teléfono global, vincular cuentas OAuth ni elevar atributos globales de verificación.

- **FR-027**: Una prueba local DEBE aplicarse a una sola solicitud/presentación con frescura máxima de quince minutos. Una vez adjuntada, puede sostener la revisión de esa solicitud hasta su vencimiento, sin reutilizarse para otra.

- **FR-028**: Cambiar un contacto ya fijado en una solicitud DEBE requerir cancelar y presentar de nuevo. Un contacto ausente puede adjuntarse por primera vez con prueba y auditoría; no puede sustituir un destinatario nominativo.

- **FR-029**: La UI DEBE explicar el alcance de la comprobación y que la academia usa un servicio conectado por su líder. No DEBE afirmar pertenencia automática a WhatsApp, identidad civil ni independencia respecto del titular de la cuenta de mensajería.

#### C. Conexión del proveedor y configuración guiada

- **FR-030**: Zavu DEBE ser el único proveedor implementado y conectable en la primera entrega. Proveedores no implementados NO DEBEN aceptarse desde la API ni presentarse como opciones funcionales.

- **FR-031**: Cada tribu DEBE disponer de como máximo una conexión activa y una candidata. La conexión DEBE identificar proveedor, versión, estado, configuración no secreta y referencia protegida a su credencial.

- **FR-032**: Solo el líder activo con autenticación reciente DEBE poder agregar, probar, reemplazar o retirar una credencial. El guardián revisor NO DEBE heredar esos permisos.

- **FR-033**: El asistente DEBE mostrar únicamente los campos necesarios para las capacidades elegidas y los requisitos pendientes. Datos opcionales de marca NO DEBEN convertirse en requisitos para conectar.

- **FR-034**: El primer paso de Zavu DEBE aceptar una API key aportada por el líder y validarla sin revelar su contenido. El formato de la clave NO DEBE tomarse como evidencia de que autentica o tiene permisos suficientes.

- **FR-035**: El líder DEBE seleccionar explícitamente el remitente de cada canal habilitado. Se DEBEN listar/consultar recursos accesibles mediante la API cuando sea posible, o aceptar un identificador validado cuando la consulta no esté autorizada; nunca confiar solo en el identificador escrito.

- **FR-036**: El mínimo DEBE ser credencial, selección de remitente y canal, más identificador/idioma de plantilla de autenticación para WhatsApp. Dominio/remitente de correo y preparación SMS se validan como recursos existentes, no solicitando contraseñas de otros servicios.

- **FR-037**: La primera entrega DEBE guiar al líder para preparar dominios, remitentes y plantillas en Zavu. NO DEBE comprar números, crear campañas, cambiar DNS, conectar Meta, modificar remitentes ni crear plantillas externas automáticamente.

- **FR-038**: La UI DEBE distinguir proveedor soportado, credenciales válidas, capacidad configurada y capacidad probada para una versión. Preparar WhatsApp NO DEBE marcar correo o SMS como listos.

- **FR-039**: Todo envío de prueba DEBE iniciarse por acción explícita del líder, con destino mostrado y advertencia de consumo. Guardar, validar una clave o cambiar de campo NO DEBE enviar mensajes facturables.

- **FR-040**: Una prueba DEBE pedir al líder introducir el código recibido. Se vincula a su cuenta, tribu, versión, canal y propósito de diagnóstico; no genera una prueba de admisión ni una verificación global.

- **FR-041**: Una conexión productiva DEBE usar credenciales y recursos de producción preparados. Una prueba limitada con claves de sandbox NO DEBE habilitar canales/destinatarios productivos ni considerarse validación de correo o SMS.

- **FR-042**: Solo una candidata con sus capacidades dependientes probadas DEBE poder activarse por confirmación. Probar o guardar una candidata NO DEBE reemplazar la conexión activa.

- **FR-043**: Después de guardar, las consultas y pantallas DEBEN devolver exclusivamente máscara, estado y metadatos autorizados; NO DEBEN permitir recuperar la API key completa.

#### D. Secretos, rotación y ciclo de vida de conexiones

- **FR-044**: Las credenciales DEBEN protegerse en almacenamiento recuperable solo por el backend autorizado, con cifrado y control de acceso; no en texto plano ni únicamente como hash irreversible. La configuración normal conserva una referencia.

- **FR-045**: La protección de los secretos DEBE depender de claves administradas separadamente del dato protegido. Logs, errores, trazas, analítica, cachés públicas, respuestas serializadas y exportaciones NO DEBEN incluir secretos.

- **FR-046**: Cada operación DEBE resolver tribu, recurso y permisos desde contexto validado antes de cargar credenciales. La API key nunca DEBE seleccionarse por un parámetro de cliente sin autorización ni por una variable global mutable.

- **FR-047**: El sistema NO DEBE usar claves globales de TuTribu o de otra tribu como respaldo. Credencial ausente, inválida o sin capacidad DEBE producir un error controlado, no otro pagador.

- **FR-048**: La rotación DEBE mantener activa la conexión anterior hasta confirmar una sustituta válida. Las nuevas operaciones usarán la nueva versión y no se reiniciarán cuotas, permisos o historial por rotar.

- **FR-049**: Los envíos en cola DEBEN conservar tribu, conexión y versión originales. Una versión retirada NO DEBE ser sustituida silenciosamente por otra al reintentar; la recuperación controlada de notificaciones requiere autorización y auditoría.

- **FR-050**: Para desconectar ordinariamente una conexión requerida, el líder DEBE reemplazarla, adoptar una política compatible o pausar las admisiones y desactivar avisos externos dependientes. El cambio DEBE ser coherente, no dejar una capacidad falsamente operativa.

- **FR-051**: El líder DEBE poder suspender inmediatamente los nuevos despachos por seguridad sin depender del proveedor. La suspensión NO DEBE dispensar una verificación requerida; no puede retirar mensajes ya entregados ni garantizar cancelar uno ya aceptado externamente.

- **FR-052**: Ante suspensión por compromiso se DEBEN invalidar desafíos/pruebas no aplicadas de esa conexión y exigir recomprobación de las pruebas afectadas en solicitudes pendientes. No se expulsan automáticamente miembros ya admitidos.

- **FR-053**: Al desconectar se DEBE bloquear de inmediato todo uso futuro y eliminar la copia operativa del secreto dentro del plazo definido. Se DEBE explicar que revocar la API key en Zavu es una acción separada; no se revoca externamente sin una función y autorización específicas.

- **FR-054**: Al transferir liderazgo, la conexión aportada por el líder anterior DEBE quedar suspendida hasta que el nuevo líder aporte y pruebe su conexión. No se muestra ni transfiere la clave anterior; las invitaciones pertenecientes a la tribu conservan su ciclo.

- **FR-055**: Una caída transitoria DEBE bloquear solo las capacidades dependientes. La bandeja, los estados y la validación local de códigos ya entregados y vigentes DEBEN continuar sin interpretar el fallo como verificación.

- **FR-056**: Los borradores y candidatas abandonados DEBEN expirar con eliminación de secretos temporales. No se requiere reiniciar o desplegar la aplicación por conectar una tribu.

#### E. Códigos, entrega y control de consumo

- **FR-057**: Los códigos DEBEN respetar el tamaño, vencimiento, intentos y frescura definidos en Límites. El vencimiento y uso único se comprueban al validar, aun si la limpieza aún no se ejecutó.

- **FR-058**: TuTribu DEBE controlar generación, validación y propósito del desafío; el proveedor de la primera entrega transporta el mensaje. Aceptación, entrega, lectura o confirmación administrativa NO DEBEN sustituir una validación de código.

- **FR-059**: Un nuevo envío solicitado DEBE invalidar el desafío anterior y consumir cupo sin reiniciar contadores acumulados. Un reintento técnico idempotente de la misma entrega no crea otro desafío.

- **FR-060**: El canal y remitente DEBEN obtenerse de configuración autorizada. La primera entrega NO DEBE usar enrutamiento automático que cambie el tipo de prueba o el canal fuera de los expresamente permitidos.

- **FR-061**: Solo cuando el líder habilite y pruebe SMS alternativo para WhatsApp, el solicitante DEBE poder elegir “Enviar por SMS” al mismo número respetando la espera y cuotas. Esta acción crea un nuevo código e invalida el anterior.

- **FR-062**: Los errores de autenticación, capacidad, configuración, límite, fallo temporal y resultado incierto DEBEN distinguirse internamente y producir mensajes seguros de recuperación. No se afirma entrega si solo consta aceptación.

- **FR-063**: Un timeout con entrega incierta NO DEBE provocar envíos ciegos duplicados. Los reintentos deben usar una identidad de entrega estable y deduplicación comprobada o quedar como resultado desconocido hasta recuperación controlada.

- **FR-064**: Los endpoints de esta feature NO DEBEN admitir texto, destinatarios, plantillas, API keys o remitentes arbitrarios para realizar envíos. Los valores provienen de un desafío, notificación o diagnóstico autorizado.

- **FR-065**: Los límites por desafío, cuenta, contacto, tribu, propósito y plataforma DEBEN aplicarse de manera consistente bajo concurrencia. Cambiar canal, API key o dispositivo NO DEBE reiniciarlos.

- **FR-066**: El líder DEBE poder establecer cupos de envío dentro del máximo que autorice la plataforma y ver consumo agregado. Los cupos DEBEN reservarse y revalidarse antes de despachar, incluidas pruebas y canales alternativos.

- **FR-067**: Se DEBEN separar solicitudes de envío, intentos externos, aceptaciones, fallos y resultados desconocidos. Cada intento potencialmente facturable consume cupo; un reintento deduplicado no se presenta como otro mensaje aceptado.

- **FR-068**: Al agotarse cupos DEBEN detenerse nuevos envíos sin impedir validar un código vigente, consultar solicitudes o trabajar manualmente con una política compatible.

- **FR-069**: La interfaz DEBE aclarar que el proveedor factura la cuenta del líder y que los cupos de TuTribu no son una garantía monetaria exacta. No se DEBEN publicar precios fijos ni saldos inferidos sin una fuente vigente comprobada.

- **FR-070**: Antes de habilitar teléfono, el líder DEBE elegir países de destino permitidos; el envío debe respetar esa restricción y límites de la plataforma. No hay apertura mundial implícita.

- **FR-071**: Las pruebas reales de entrega DEBEN usar destinatarios de prueba autorizados y nunca secretos o códigos de producción en fixtures, logs o informes. Los dobles de prueba NO DEBEN activarse como proveedores productivos.

#### F. Lista e importación

- **FR-072**: El líder DEBE poder crear, buscar, filtrar, habilitar y deshabilitar entradas por tribu con contacto del tipo elegido, nombre orientativo opcional, origen y fechas.

- **FR-073**: La coincidencia DEBE ser exacta tras normalización y usar evidencia confiable aplicable. Una entrada inválida, deshabilitada o vinculada a otra cuenta NO DEBE autorizar automáticamente.

- **FR-074**: Al usar una habilitación válida se DEBE vincular a la cuenta estable junto con la presentación. La misma cuenta puede reutilizar una entrada vigente para un futuro reingreso permitido, no transferirla.

- **FR-075**: Aprobar una excepción NO DEBE crear, reactivar o editar automáticamente una entrada. Agregarla es una acción separada del líder y se audita.

- **FR-076**: Deshabilitar una entrada DEBE afectar nuevos ingresos que dependan de ella, sin expulsar miembros ni retirar beneficios. La UI explica la operación de membresía separada.

- **FR-077**: La importación DEBE ofrecer plantilla CSV, límites, validación por fila y vista previa sin efectos. Un formato global inválido impide importar.

- **FR-078**: La confirmación DEBE indicar las filas válidas seleccionadas y revalidar los datos actuales. Debe producir resultados por fila: agregada, sin cambios, omitida o conflicto.

- **FR-079**: Reimportar NO DEBE duplicar, reemplazar toda la lista, borrar, reasignar o reactivar entradas silenciosamente. Los duplicados existentes se muestran como sin cambios o conflicto según corresponda.

- **FR-080**: El contenido importado y los informes DEBEN tratarse como datos no confiables, sin ejecutar HTML ni fórmulas. Los archivos transitorios se eliminan según retención.

#### G. Invitaciones nominativas

- **FR-081**: Solo el líder DEBE poder crear invitaciones con nombre interno, destinatario obligatorio del tipo elegido, requisito de lista y vencimiento opcional. Un nombre descriptivo NO DEBE sustituir al destinatario.

- **FR-082**: Con teléfono y OFF NO DEBEN emitirse ni canjearse nuevas invitaciones telefónicas. La UI explica que el enlace común manual sigue disponible y no transforma la invitación en un pase impersonal.

- **FR-083**: La casilla de lista DEBE iniciar marcada cuando exista una lista utilizable. Si no existe, emitir una invitación sin lista exige reconocer explícitamente la dispensa; no mostrar una restricción ficticia.

- **FR-084**: Al dispensar lista se DEBE mostrar que esto NO omite prueba del destinatario, códigos exigibles, revisión manual ni bloqueos. Una invitación que exige lista NO DEBE crear una excepción que la ignore.

- **FR-085**: Se DEBEN proponer siete días de vigencia y permitir otra fecha futura o “Sin vencimiento” con advertencia y zona horaria inequívoca.

- **FR-086**: Después de emitir solo se DEBE poder editar el nombre interno. Cambiar destinatario, lista o vencimiento requiere revocar y emitir otra invitación.

- **FR-087**: Se DEBE permitir como máximo una invitación utilizable no canjeada por destinatario y tribu. Reemplazarla requiere confirmación y revocación de la anterior.

- **FR-088**: El enlace completo DEBE mostrarse una sola vez al líder al crearlo. El historial conserva metadatos, no una copia recuperable del token; si se pierde se revoca y emite otro.

- **FR-089**: El canje DEBE ser único, atómico y únicamente del destinatario con la evidencia exigida. Se consume al confirmar una presentación válida que se persiste, no al abrir ni al terminar una revisión.

- **FR-090**: Intentos incorrectos, login, verificación de contacto, diagnóstico del enlace o llegada de otra cuenta NO DEBEN consumirlo. La prueba de contacto por sí sola NO inicia canje.

- **FR-091**: Si ya existe una membresía válida o solicitud pendiente de esa cuenta, se DEBE devolver ese estado sin consumir ni adjuntar otra invitación.

- **FR-092**: El líder DEBE poder revocar una invitación sin canjear y retirar la autorización de una canjeada que sostenga una solicitud pendiente. En este último caso cancela la solicitud y notifica al solicitante.

- **FR-093**: Una invitación canjeada NO DEBE volver a estar disponible tras rechazo, cancelación o vencimiento de solicitud. Su revocación posterior a la admisión NO DEBE expulsar al integrante.

#### H. Solicitudes, decisiones y cambios de política

- **FR-094**: La solicitud DEBE ser distinta de cuenta y membresía, con estados `pending`, `approved`, `rejected`, `cancelled` y `expired`. No se introduce un estado de miembro pendiente para otorgarle acceso parcial implícito.

- **FR-095**: Se DEBE mantener como máximo una solicitud pendiente por cuenta y tribu y un resultado idempotente de sus reintentos, aun cambiando de contacto o enlace.

- **FR-096**: Toda admisión automática DEBE registrarse como aprobada con fundamento y actor de sistema; no debe generar una falsa espera ni un aviso de revisión pendiente.

- **FR-097**: Una excepción DEBE exigir motivo del solicitante. En revisión manual ordinaria el mensaje es opcional. No se solicitan adjuntos, DNI ni capturas de WhatsApp.

- **FR-098**: Antes de aprobar se DEBEN revalidar permisos actuales, vigencia, cuenta, evidencia aplicable, política actual, restricciones nominativas y elegibilidad de membresía. Se aplica la matriz de revisión.

- **FR-099**: Toda aprobación sin coincidencia de lista que dependa de una excepción DEBE registrar motivo interno. Un lote NO DEBE omitir ese requisito ni dispensar una lista exigida por invitación.

- **FR-100**: Aprobar DEBE persistir decisión, creación/recuperación permitida de membresía y obligación de notificar de forma indivisible. No puede quedar aprobada sin efecto de admisión por un fallo parcial.

- **FR-101**: Rechazar DEBE exigir motivo interno, permitir mensaje externo separado y mostrar cuándo puede reintentarse. Rechazo NO equivale a bloqueo permanente.

- **FR-102**: El solicitante DEBE poder cancelar su pendiente y el líder cancelarla por gestión con motivo. Las terminales no se reescriben; una evaluación posterior requiere otra solicitud.

- **FR-103**: Una pendiente DEBE vencer a los treinta días desde presentación, sin pausarse. La antigua fecha límite de una invitación ya canjeada NO DEBE modificar ese plazo.

- **FR-104**: Los nuevos intentos DEBEN respetar los plazos y cuotas definidos. El líder puede adelantar un intento con motivo, sin aprobarlo, levantar bloqueos ni liberar una invitación consumida.

- **FR-105**: Cada activación OFF → ON DEBE iniciar una nueva época de exigencia e impedir aprobar pendientes sin prueba de esa época. Cambios a una política más permisiva NO DEBEN aprobar automáticamente pendientes.

- **FR-106**: El solicitante DEBE poder aportar una prueba requerida a su solicitud pendiente usando su cuenta y contacto fijado, o el primer contacto cuando estaba ausente, sin duplicar solicitudes ni reiniciar su plazo.

- **FR-107**: Apagar códigos DEBE invalidar desafíos/pruebas no aplicadas y conservar pruebas históricas adjuntadas válidas. No restaura una evidencia formalmente revocada ni dispensa el destinatario de una invitación.

- **FR-108**: Si un cambio deja temporalmente inelegible una pendiente, DEBE mantenerse con causa autorizada visible hasta subsanar, rechazar, cancelar o vencer. La comprobación no se reduce a datos del día de presentación.

#### I. Bandeja y notificaciones

- **FR-109**: Líder y guardianes activos DEBEN tener bandeja por tribu, pendientes más antiguas primero, búsqueda y filtros por estado, fecha, fuente, excepción y requisitos pendientes.

- **FR-110**: El detalle DEBE distinguir cuenta autenticada, dato declarado, evidencia base y prueba adicional, con fecha, alcance, fuente y razones actuales de elegibilidad. Nunca se muestran códigos ni secretos.

- **FR-111**: Se DEBEN permitir lotes de hasta cincuenta solicitudes seleccionadas explícitamente con confirmación, revalidación individual y resultado por solicitud. No incluir filas ocultas sin indicarlo.

- **FR-112**: Cada nueva pendiente DEBE producir aviso interno para responsables activos. Solicitantes DEBEN ver confirmación persistente y resolución/cancelación administrativa en TuTribu, aun sin proveedor.

- **FR-113**: El líder DEBE habilitar correo externo como capacidad independiente con canal probado. Sin ella no se envía correo ni se utiliza una cuenta global de respaldo; el aviso interno permanece.

- **FR-114**: Cuando el correo externo esté habilitado, cada responsable DEBE poder elegir individual, agrupado cinco minutos, resumen diario u omitido. Valor inicial: líder agrupado, guardianes omitido.

- **FR-115**: El correo de resolución DEBE dirigirse a un correo confiable de la cuenta en el contexto permitido. Si falta evidencia suficiente, solo notificar internamente; un teléfono verificado NO DEBE acreditar por inferencia otro correo.

- **FR-116**: La obligación de notificar DEBE persistir junto al evento, con entregas lógicamente idempotentes, reintentos acotados y estado visible. Un fallo de correo NO DEBE revertir la decisión ni perder el pedido.

- **FR-117**: Antes de enviar datos a responsables se DEBEN revalidar rol y estado actuales. Los enlaces DEBEN abrir una pantalla autenticada sin aprobar ni rechazar por su mera visita.

- **FR-118**: Desactivar un canal o preferencia DEBE impedir nuevos despachos que dependan de él; los eventos siguen visibles internamente. Reenviar tras recuperar conexión requiere controles, sin crear otra solicitud.

- **FR-119**: Se DEBEN destacar pendientes de tres días y generar un único recordatorio lógico, sujeto a preferencias. Ingresos automáticos se registran en actividad sin correo de revisión por defecto.

#### J. Seguridad, compatibilidad y privacidad

- **FR-120**: Toda lectura, mutación, diagnóstico, consulta de entrega y tarea en cola DEBE preservar autorización actual y aislamiento por tribu/cuenta. La UI y cookies NO DEBEN sustituir esa autorización.

- **FR-121**: Un pendiente, rechazado, cancelado o vencido sin otra membresía legítima NO DEBE acceder a datos privados, contenido, directorios, mensajes, agenda ni archivos de la tribu.

- **FR-122**: Ninguna lista, invitación o aprobación DEBE levantar bloqueos por conducta o remociones administrativas no recuperables. Se requiere el flujo de membresía separado.

- **FR-123**: Una restricción exclusivamente comercial recuperable DEBE poder seguir el flujo básico solo después de cumplir la política. No restaura grants, pagos, bonificaciones ni roles revocados.

- **FR-124**: Miembros activos o silenciados DEBEN conservar rol, estado, fecha y permisos al volver a un enlace o activar la política. No se elimina silenciamiento ni se conceden beneficios duplicados.

- **FR-125**: Si otra vía legítima crea membresía con una solicitud pendiente, se DEBE cancelar esta por resolución externa, sin fingir aprobación manual ni liberar el canje.

- **FR-126**: Abandonar y reingresar DEBE evaluar la política actual. Una aprobación antigua no DEBE funcionar como autorización perpetua.

- **FR-127**: Pausar admisiones DEBE impedir presentaciones y aprobaciones, no consultas, rechazos o cancelaciones. Los plazos siguen corriendo y los miembros existentes no se expulsan.

- **FR-128**: Salir de academia o eliminar la tribu DEBE cancelar pendientes, invalidar invitaciones no canjeadas y detener envíos específicos de admisión. Volver al modo NO DEBE resucitar esas autorizaciones.

- **FR-129**: Un bloqueo no recuperable de un solicitante DEBE impedir aprobación y cancelar su pendiente con causa segura. No se divulgan notas internas al usuario.

- **FR-130**: Mensajes y endpoints NO DEBEN permitir enumerar contactos habilitados, destinatarios de invitaciones o cuentas ajenas. Las consultas usan la identidad propia acreditada cuando corresponde.

- **FR-131**: Se DEBEN auditar cambios de políticas, conexiones, versiones, permisos, cuotas, listas, canjes, pruebas aplicadas, decisiones y entregas, con actor, fecha, tribu y causa. No conservar secretos ni cuerpos OTP en auditoría.

- **FR-132**: La conservación, eliminación y minimización DEBEN aplicar la política de este documento y conciliarse con las políticas existentes. No presentar los plazos propuestos como certificación legal.

- **FR-133**: Los recorridos DEBEN funcionar en móvil y escritorio, con teclado, foco, etiquetas y estados persistentes accesibles en español. No depender solo del color ni de un toast.

- **FR-134**: Las invitaciones legítimas pertenecen a la tribu y DEBEN conservar su ciclo al transferir liderazgo; el creador anterior pierde gestión. Esto no dispensa reconectar la mensajería con el nuevo líder.

#### K. Extensibilidad, activación y entrega

- **FR-135**: Los casos de admisión y verificación DEBEN depender de contratos propios, no del SDK/DTOs de Zavu. La sustitución del transporte NO DEBE cambiar las decisiones de lista, canje o aprobación.

- **FR-136**: Se DEBE resolver el proveedor mediante un registro explícito de adaptadores y capacidades. Configuración, diagnóstico y errores se traducen a contratos propios; capacidades inexistentes no se simulan.

- **FR-137**: La composición DEBE permitir inyectar adaptadores y dependencias por solicitud/trabajo con contexto validado. No se requiere un contenedor DI ni un framework de plugins; sí las fronteras de `technical-contract.md`.

- **FR-138**: En academias existentes, activar DEBE exigir elección explícita y resumen del impacto. Antes de activación la UI NO DEBE afirmar que los enlaces históricos ya están protegidos.

- **FR-139**: Todas las entradas gratuitas DEBEN estar cubiertas antes de activar por tribu. Las invitaciones históricas impersonales se tratan como enlace común para admisión; sus efectos comerciales legítimos se evalúan por separado después.

- **FR-140**: Un rollback o flag técnico después de activar NO DEBE restablecer ingreso gratuito abierto. Si no puede evaluar la política, se cierran nuevas admisiones sin borrar miembros.

- **FR-141**: La entrega DEBE incluir pruebas reales de reglas, persistencia, concurrencia, aislamiento, interfaz e integración preparada, además de manuales y documentación. Una pantalla o un adaptador simulado NO DEBE reportarse como capacidad externa validada.

- **FR-142**: El sistema DEBE registrar métricas agregadas de admisiones, revisiones, pruebas, intentos/entregas, antigüedad de pendientes, errores y consumo por tribu sin divulgar datos de otras tribus.

### Estados y transiciones

#### Solicitud y prueba

| Objeto/estado | Significado | Salidas válidas |
|---|---|---|
| Solicitud `pending` | Presentada, sin membresía otorgada por ella. | `approved`, `rejected`, `cancelled`, `expired`. |
| Solicitud `approved` | Decisión automática o manual persistida con efecto de membresía. | Terminal; la membresía tiene su ciclo independiente. |
| Solicitud `rejected` | Decisión de no admitir con motivo. | Terminal; un nuevo intento genera otro pedido. |
| Solicitud `cancelled` | Retiro del solicitante, gestión, revocación, seguridad, salida de modo o ingreso legítimo por otra vía. | Terminal; no libera invitaciones. |
| Solicitud `expired` | Treinta días transcurridos sin decisión. | Terminal; no depende de cuándo se ejecutó la limpieza. |
| Desafío vigente | Código emitido no consumido, no invalidado y dentro del plazo/intentos. | Comprobado, agotado, vencido o invalidado. |
| Desafío comprobado | Código validado una vez. | No reutilizable. Produce una prueba con alcance y plazo propios. |
| Prueba disponible | Control del contacto comprobado para esta cuenta/tribu/época. | Aplicada a una solicitud o invalidada/vencida. |
| Prueba aplicada | Evidencia fijada a una solicitud determinada. | Permanece histórica; puede invalidarse explícitamente por seguridad, no reutilizarse. |

`needs_verification`, conflicto de identidad, lista faltante y pausa son razones de inelegibilidad de una solicitud `pending`, no nuevos estados de membresía. Adjuntar una prueba no aprueba ni reinicia treinta días. No se repite la prueba en cada visita de un integrante ya admitido.

#### Invitación y habilitación

Una invitación no canjeada puede estar `active`, `revoked` o `expired`. El canje válido la deja `redeemed` y conserva la cuenta/solicitud asociadas. Revocar la autorización de una invitación canjeada con solicitud pendiente registra una revocación separada y cancela el pedido; no borra el canje. Una canjeada no pasa a vencida al alcanzar la fecha que limitaba el canje.

La habilitación puede estar `enabled` o `disabled`. La vinculación a una cuenta es independiente de ese estado; no existe “disponible otra vez” por deshabilitarla. Una entrada no se vincula porque alguien declare su contacto sin prueba.

#### Conexión y entrega

| Estado de conexión | Significado y efecto |
|---|---|
| `draft` | Incompleta, en validación o pendiente de pruebas. Solo el líder puede ejecutar diagnósticos autorizados. |
| `ready` | Las capacidades seleccionadas fueron preparadas y probadas para esa versión; todavía no envía admisiones productivas. |
| `active` | Elegida explícitamente para envíos nuevos de las capacidades preparadas. |
| `degraded` | Es la conexión seleccionada pero una capacidad tiene errores. Las capacidades sanas pueden funcionar; no hay dispensa de requisitos. |
| `suspended` | No se autorizan nuevos despachos; requiere recuperación explícita. Puede originarse en seguridad, gestión o transferencia de liderazgo. |
| `disconnected` | Sin uso futuro autorizado; eliminación del secreto operativo y conservación de metadatos mínimos. |

Solo una conexión puede ser la seleccionada, aunque esté `degraded` o `suspended`; una candidata no la reemplaza por estar `ready`. La validación de credenciales, el estado de cada canal y el momento de su prueba son metadatos propios, no inferencias de un estado único.

Entrega y desafío tienen ciclos distintos. La entrega distingue `queued`, `accepted`, `delivered` cuando hay evidencia externa, `failed`, `unknown`, `suppressed` por preferencia/cuota/cambio y `cancelled`. Que un mensaje esté entregado no significa que un código esté validado. Una respuesta perdida no equivale a fallo definitivo. La primera entrega no exige al líder configurar un webhook para habilitar verificación; no se afirmará entrega final sin evidencia.

### Orden funcional de los recorridos

**Configuración del líder.** Autenticación y rol → elección de política/check → validar compatibilidad → conectar Zavu si se necesitan envíos → seleccionar recursos y canales → pruebas expresamente solicitadas → confirmar conexión y capacidades → habilitar independientemente el check y/o notificaciones → confirmar apertura de admisiones. Se permite modo manual sin conexión.

**Presentación.** Resolver cuenta y tribu → devolver membresía o solicitud vigente antes de nuevos efectos → comprobar modo, apertura, bloqueos y plazos → resolver evidencia exigible → validar requisitos propios del enlace y lista sin divulgación → mostrar resultado esperado → confirmación explícita → persistir de forma consistente canje, vínculo, solicitud, decisión automática cuando proceda y eventos.

**Código adicional.** Autenticar cuenta y contexto de admisión → comprobar que el check y la capacidad están habilitados → confirmar destino/canal y solicitar envío → aplicar cuotas → entregar mediante conexión autorizada → introducir código → validar en el servidor → obtener prueba local → confirmar presentación o adjuntarla a una solicitud que la necesita. Solicitar/enviar un código no consume una invitación.

**Revisión.** Autenticar revisor y rol actual → cargar solicitud de su tribu → mostrar evidencia y elegibilidad → confirmar decisión/motivos → revalidar condiciones vigentes → persistir decisión y membresía coherentemente → registrar notificaciones. Toda prueba vinculada a una invitación debe corresponder a su destinatario exacto.

El orden interno puede optimizarse, pero no alterar estas garantías. En particular, no se mantiene una transacción de admisión esperando una respuesta externa ni se confía en verificaciones de la UI como autorización final; el plan debe resolver la consistencia sin estados parciales.

### Valores predeterminados y límites

Los límites siguientes son decisiones funcionales iniciales; no describen tarifas ni restricciones oficiales de Zavu. El plan debe materializarlos sin valores mágicos dispersos. Las cuotas máximas configurables por líder están subordinadas a límites globales más restrictivos de seguridad/operación y al proveedor.

| Concepto | Valor y comportamiento |
|---|---|
| Nueva configuración | Manual, correo, códigos OFF, excepciones OFF, correo externo OFF; apertura solo tras confirmación. |
| Invitación propuesta | Siete días; otra fecha futura o sin vencimiento por elección explícita. |
| Solicitud pendiente | Treinta días de tiempo transcurrido desde presentación. |
| Reintento tras rechazo | Siete días, salvo habilitación anticipada del líder con motivo. |
| Otras presentaciones nuevas | Una por cuenta/tribu cada veinticuatro horas; los reintentos idempotentes no cuentan. El líder puede habilitar un intento correctivo, sin levantar controles de abuso. |
| Recordatorio de pendiente | Uno lógico al cumplir tres días. |
| Invitaciones utilizables por destinatario y tribu | Una sin canjear. |
| Decisiones por lote | Cincuenta solicitudes máximo. |
| Importación CSV | UTF-8, coma, encabezados `identity,display_name`; nombre opcional. Máximo diez mil filas de datos y cinco MiB, ambas restricciones. |
| Nombre interno/orientativo | Cien caracteres. |
| Mensaje del solicitante y motivo interno | Quinientos caracteres; motivo no vacío cuando es obligatorio. |
| Mensaje externo | Doscientos caracteres; genérico si no se aporta. |
| Código | Seis dígitos impredecibles, un uso, diez minutos; igual límite para diagnósticos y ambos tipos de contacto. |
| Fallos por desafío | Cinco; después queda invalidado. |
| Fallos acumulados | Diez por hora por cuenta y veinte por día por cuenta, agregados entre tribus. Reenviar o cambiar canal no reinicia estos contadores. |
| Espera de reenvío | Sesenta segundos entre envíos para cuenta/contacto/tribu, también entre WhatsApp y SMS. |
| Solicitudes de envío de códigos | Cinco por hora por cuenta y por contacto; veinte por día por cuenta y por contacto, agregadas entre tribus sin revelar dónde se consumieron. |
| Frescura de prueba al presentar/adjuntar | Quince minutos desde la validación exitosa. Debe ser de la época vigente y no estar aplicada a otro pedido. |
| Cuota diaria inicial de verificación por tribu | Cien intentos externos, incluyendo diagnósticos y SMS alternativos; el líder puede reducir a cero o elevar hasta mil, sujeto a límites de plataforma/proveedor. |
| Cuota diaria inicial de avisos de correo por tribu | Doscientos intentos externos; máximo configurable cinco mil. No incluye códigos, que tienen cuota propia. |
| Diagnósticos | Tres envíos por hora por tribu/canal y diez por día por tribu, también sujetos a cuotas generales. |
| Validaciones de credenciales | Diez por hora por tribu; no deben generar mensajes facturables. |
| Países de teléfono | Deben elegirse expresamente antes de activar teléfono. Lista inicial vacía; no envíos mundiales implícitos. |
| Períodos de cuota diaria | Día UTC, explicado en pantalla; ventanas horarias móviles. No se reinician al editar configuración. |
| Autenticación reciente para secretos/configuración sensible | Reautenticación global en los últimos diez minutos. No se sustituye por un código enviado con las credenciales del líder. |
| Prueba de conexión para activarla | Exitosa dentro de las últimas veinticuatro horas y ligada a la versión exacta de clave, remitente, canal y plantilla. |
| Borrador/candidata sin activar | Expira después de siete días sin actividad; eliminar secreto temporal dentro de las veinticuatro horas siguientes. |
| Correo de solicitudes, al habilitarlo | Líder agrupado cada cinco minutos; guardianes omitido. Preferencias individual/agrupado/diario/omitido. |
| Resumen diario | 09:00 de la zona de la tribu; valor inicial `America/Argentina/Buenos_Aires` si no existe otra zona del producto. |
| Reintentos de notificaciones | Máximo veinticuatro horas desde el evento; después fallo visible y recuperación controlada. No prometer entrega externa exactamente una vez. |

Una reducción de cuota no cancela un mensaje ya aceptado por el proveedor. El cupo de un intento con resultado incierto se conserva consumido por seguridad; solo se libera con evidencia de que no fue despachado. Una repetición técnica deduplicada conserva la misma identidad de entrega. Los límites por contacto se aplican sin exponer si está vinculado o en qué tribus fue utilizado.

Una cuota cero detiene envíos, no borra la obligación de prueba de una política ON. Al activar por primera vez ON se requiere capacidad operativa y cuota positiva; una reducción posterior muestra su impacto. Una subida de cuota exige confirmación y no se interpreta como autorización para un envío masivo.

### Pantallas, formularios y mensajes

**Admisión gratuita.** Selector de modalidad, tipo de contacto fijado, excepciones cuando aplican, check adicional, apertura y resumen de quién puede entrar. No convertir una lista vacía en ingreso para todos. Mostrar claramente diferencias entre datos declarados, evidencia base y código de esta academia.

**Mensajería.** Proveedor Zavu, formulario protegido de credencial, selección de remitentes y canales, requisitos faltantes, prueba explícita, capacidades preparadas, fecha/versión de validación, cupos, estado, rotación y suspensión. Los formularios dependen de capacidades reales. No se piden credenciales DNS ni contraseñas de Meta. El secreto se vacía del formulario tras guardarlo; la pantalla de consulta nunca lo recupera.

**Invitaciones.** Nombre interno, destinatario exacto, casilla de lista, vencimiento y advertencias. Mostrar el enlace completo una vez al crearlo. El nombre interno y el destinatario no se divulgan a visitantes ni a cuentas incorrectas.

**Solicitante.** Mantener continuidad después del login y cambiar de cuenta sin consumir enlace. Ofrecer “Solicitar ingreso” cuando quedará pendiente y “Ingresar gratis” solo cuando la política permita una admisión inmediata. En solicitudes que requieren nueva prueba, ofrecerla dentro del estado existente, no comenzar otro pedido.

| Situación | Contenido esperado |
|---|---|
| Check adicional | “Exigir verificación adicional de contacto para ingresar”. Ayuda: “Se enviará un código con la cuenta de mensajería de esta academia. Iniciar sesión seguirá siendo obligatorio”. |
| OFF y coincidencia no demostrada | “No pudimos comprobar el contacto necesario para este ingreso”. Ofrecer cambio de cuenta o revisión solo cuando esté permitida. |
| Dato para revisión sin evidencia | “Contacto declarado, no comprobado”. No presentar badge de verificado. |
| Lista telefónica sin prueba | “Para admitir automáticamente por teléfono tenés que habilitar su verificación, o elegir aprobación manual”. |
| Conexión incompleta | Mostrar al líder requisitos concretos faltantes; al solicitante, “La academia todavía no puede enviar el código. No se completó la verificación”. |
| Prueba de conexión | Mostrar destinatario, canal y advertencia “Este envío puede generar consumo en tu cuenta de Zavu”. |
| Suspensión | “Los envíos de esta conexión están suspendidos. Los requisitos de admisión no se omiten”. |
| Nueva prueba en pendiente | “La academia requiere comprobar tu contacto antes de resolver la solicitud. Tu pedido sigue pendiente”. |
| Pendiente | “Tu solicitud fue enviada. El líder o un guardián debe aprobar tu ingreso”. Indicar avisos disponibles sin prometer correo si no está habilitado. |
| Rechazo | Mensaje externo o genérico y próxima fecha permitida; jamás la nota interna por defecto. |
| Invitación inválida | “No podés usar esta invitación con la cuenta actual, o ya no está disponible”. No identificar al destinatario. |
| Falta de prueba/cupo | Mensaje recuperable y espera cuando corresponda; no mencionar identidades o tribus ajenas. |
| Proveedor no soportado | Indicar capacidad no disponible sin sustituirlo automáticamente por Zavu u otro. |

Los textos pueden ajustarse al tono del producto sin alterar contenido, seguridad ni distinción de estados. Los recorridos respetan el sistema visual existente; no se solicita un rediseño general.

### Privacidad, conservación y eliminación

No se solicitan DNI, biometría, capturas de grupos, agendas completas ni permisos de lectura de conversaciones. El líder es responsable del proceso que produce su lista autorizada. Dejar WhatsApp no revoca automáticamente una membresía; debe usar la gestión existente.

La cuenta del líder financia los envíos; Zavu y quien controle esa cuenta pueden tener acceso al contenido según su servicio. TuTribu no expondrá códigos en sus pantallas de gestión ni auditoría, pero no prometerá ocultarlos al propietario del proveedor. Por eso ninguna de esas pruebas se transforma en un factor global de seguridad ni en verificación de otra tribu.

Se conservan habilitaciones y vínculos mínimos mientras sostengan una autorización o membresía. Las solicitudes terminales conservan resolución y mensajes durante ciento ochenta días; después se minimizan mensajes/contactos innecesarios. La auditoría de seguridad se conserva trescientos sesenta y cinco días sin secretos ni cuerpos completos de mensajes. Un vínculo todavía necesario para impedir reasignaciones no se borra simplemente porque venza una nota.

Archivos CSV y reportes transitorios se eliminan dentro de veinticuatro horas. Los códigos quedan inutilizables al usarse, agotarse, vencer o invalidarse; el material secreto transitorio que permita enviarlos se elimina al no necesitarse y como máximo dentro de veinticuatro horas. Se conservan por separado evidencia mínima y contadores de abuso conforme a su finalidad.

Las credenciales desconectadas dejan de poder utilizarse inmediatamente y su copia operativa se elimina dentro de veinticuatro horas. Backups, restauración y destrucción de claves deben impedir reactivar secretos retirados; no se promete borrar retroactivamente todas las copias externas ni mensajes ya entregados. Proyectos de Zavu, facturación e historial externo no se borran desde esta feature. El líder debe gestionar allí sus revocaciones y retención.

La implementación debe conciliar estos valores con las políticas existentes de privacidad/eliminación antes del despliegue. Son decisiones de producto, no una declaración de cumplimiento legal. Cualquier dato conservado debe tener una finalidad y minimización documentadas.

### Key Entities *(include if feature involves data)*

Son conceptos de negocio, no un esquema de tablas prescrito.

| Entidad | Propósito y atributos mínimos |
|---|---|
| `AdmissionPolicy` | Tribu, modalidad, tipo de contacto, apertura, excepciones, check adicional, época de exigencia y versión. |
| `AllowlistEntry` | Tribu, contacto normalizado, nombre opcional, estado, origen y cuenta vinculada cuando corresponde. |
| `AdmissionContactBinding` | Vínculo comprobado cuenta-contacto-tribu y procedencia. Un dato declarado no crea este vínculo. |
| `ContactVerificationChallenge` | Cuenta, tribu, contacto, propósito, época, versión de conexión, vigencia, intentos y estado. Material secreto separado de información consultable. |
| `AdmissionVerificationProof` | Resultado local con fuente, alcance, fecha, validez y solicitud a la que se aplicó; no atributo global de cuenta. |
| `PersonalInvitation` | Destinatario, tribu, creador, nombre interno, lista exigida, plazo, canje y revocación; token protegido. |
| `AdmissionRequest` | Cuenta, contacto/evidencia o dato declarado, política original, fuente, requisitos nominativos, estado, fechas, mensajes y elegibilidad actual. |
| `AdmissionDecision` | Resultado, regla/actor, motivo, evidencia y membresía afectada. |
| `TenantMessagingConnection` | Tribu, proveedor, versión, estado, referencia secreta, recursos y capacidades por canal. |
| `ConnectionDiagnostic` | Versión/canal probados, actor, destinatario de prueba protegido, resultado y fecha; no es prueba de admisión. |
| `MessagingUsagePolicy` | Cupos por tribu/capacidad, países permitidos y máximos impuestos por plataforma. |
| `MessageDelivery` | Evento/desafío, destinatario, conexión/versión, canal, identificador lógico/externo, estado y reintentos. |
| `AdmissionNotification` | Obligación lógica de aviso, destinatarios, preferencias, estado interno y entregas opcionales. |
| `AdmissionAuditEvent` | Actor, tribu, recurso, operación, fecha, versión y causa, con metadatos mínimos. |
| `AllowlistImport` | Vista previa temporal, validaciones y resultados por fila. |
| `TribeMembership` / `AcademyEntitlement` | Conceptos existentes que conservan por separado membresía y permisos comerciales. |

## Success Criteria *(mandatory)*

### Measurable Outcomes

Son objetivos de aceptación; no resultados medidos. Las pruebas con servicios reales requieren credenciales y consentimiento de quienes pagan los envíos. Los fallos de una infraestructura externa no se ocultan detrás de adaptadores simulados.

- **SC-001**: El cien por ciento de las filas de las matrices de configuración, evidencia, ingreso y revisión obtiene el resultado definido, incluyendo ambos tipos de contacto y ambos estados del check.
- **SC-002**: Una tribu manual con OFF y sin proveedor completa solicitud, avisos internos y decisión sin llamar a servicios de mensajería ni exigir una API key.
- **SC-003**: Cero cuentas obtienen ingreso automático o canje nominativo por la sola posesión del enlace o por declarar un contacto habilitado; cero intentos de otra cuenta consumen la invitación correcta.
- **SC-004**: Los recursos privados del inventario de impacto deniegan acceso al cien por ciento de las cuentas sin membresía legítima, incluidas todas las solicitudes no aprobadas.
- **SC-005**: Cien confirmaciones simultáneas sobre una invitación producen como máximo un canje exitoso. Cien decisiones concurrentes sobre una pendiente elegible producen una sola transición terminal sin estados parciales.
- **SC-006**: Ninguna prueba local se acepta en otra cuenta, tribu, propósito, época o solicitud. Cero operaciones OTP modifican estado global de verificación, login, recuperación o vinculación OAuth.
- **SC-007**: Dos tribus con conexiones distintas envían cien operaciones intercaladas usando únicamente su credencial/remitente/versionado; no hay un envío por cuenta global ni cruce en cachés, logs o tareas.
- **SC-008**: Guardián, antiguo líder y usuarios ajenos no pueden leer o cambiar secretos. Las inspecciones de respuestas, registros y exportaciones muestran cero API keys completas y cero cuerpos OTP.
- **SC-009**: Cada canal soportado completa onboarding y una prueba real autorizada antes de considerarse validado. Clave inválida, sandbox, capacidad faltante o prueba obsoleta impiden activación productiva dependiente.
- **SC-010**: Rotación, suspensión, pérdida de saldo/disponibilidad, cambio de liderazgo y trabajo en cola tienen el resultado definido en todos los casos; ninguno dispensa el check requerido ni cambia de pagador automáticamente.
- **SC-011**: Con cien intentos concurrentes cuando queda un único cupo, como máximo se autoriza un despacho adicional. Alternar canal/conexión no reinicia cuotas o intentos; el agotamiento no bloquea comprobar un código vigente.
- **SC-012**: Fallo de correo y reinicio de procesamiento no pierden solicitudes, decisiones ni obligaciones internas. Cada entrega incierta queda distinguida y recuperable sin prometer recepción externa exactamente una vez.
- **SC-013**: Con diez mil entradas y cien solicitantes concurrentes, el percentil 95 de confirmación de ingreso/solicitud es inferior a tres segundos, excluyendo interacción humana, entrega externa y arranques de infraestructura medidos por separado.
- **SC-014**: En una prueba de tareas con diez personas, al menos nueve presentan su solicitud o completan el ingreso en menos de dos minutos desde el enlace, con cuentas/canales preparados y sin demoras externas de entrega.
- **SC-015**: Con infraestructura sana, el percentil 95 de aparición en bandeja y avisos internos es inferior a treinta segundos; correos agrupados se presentan al proveedor dentro de cinco minutos del cierre de su ventana.
- **SC-016**: Importar diez mil filas y repetir el archivo produce exactamente las incorporaciones esperadas, sin duplicados, reactivaciones, reasignaciones ni eliminación de entradas existentes.
- **SC-017**: El cien por ciento de admisiones y cambios de conexión/política puede reconstruirse con actor/regla, tribu, versión, fundamento y evidencia de alcance correcto sin leer secretos.
- **SC-018**: Los recorridos público y administrativo se completan con teclado y lector de pantalla en móvil y escritorio, conforme a los navegadores requeridos por el repositorio, sin bloqueos ni estados solo visuales.
- **SC-019**: Las regresiones de miembros activos/silenciados, restricciones comerciales recuperables, conducta, invitaciones antiguas y derechos de cursos cumplen todas sus expectativas, incluida activación y rollback seguros.
- **SC-020**: Un adaptador alternativo de prueba en el borde propio ejecuta los mismos casos de admisión sin cambios en sus reglas. Solo Zavu aparece en producción; un proveedor desconocido o sin capacidad es rechazado, no simulado.
- **SC-021**: Una muestra sintética de mil contactos, ochocientos habilitados y doscientos no habilitados, todos con evidencia exigible válida y sin otros bloqueos, produce ochocientas admisiones automáticas y doscientas revisiones al habilitar excepciones. Es una prueba determinista, no una proyección comercial.

## Assumptions

La cuenta y sesión globales, roles por tribu, membresías, pagos y sistema visual existentes se conservan. Las pruebas BYOK de esta feature se implementan dentro del alcance de admisión, no como reemplazo del proveedor global de identidad. La constitución y las reglas del repositorio se aplican al plan técnico.

El líder tiene o prepara su cuenta de Zavu, con recursos/canales permitidos y derecho a usar el remitente. TuTribu no contrata automáticamente servicios ni supone que toda API key habilita todos los canales. Los costos y permisos efectivos se validan contra la cuenta y documentación vigentes; no se incluyen precios en este contrato.

El proceso humano de lista o revisión es quien relaciona una cuenta/contacto con la persona habilitada para el grupo. No se asegura que un integrante nunca comparta su propia cuenta o códigos. La selección manual sin prueba adicional tiene deliberadamente menos garantía de control del contacto que un canje nominativo: la UI no debe ocultarlo.

La feature es una primera implementación sobre la aplicación existente. El plan incluirá cambios de esquema necesarios y activación de la nueva capacidad, sin asumir datos de una implementación previa de esta misma feature. La actualización de políticas/conexiones descrita aquí es comportamiento del producto una vez desplegado, no una instrucción de migrar especificaciones históricas.

### Fuera de alcance

No se incluyen implementaciones de Twilio/Resend, un marketplace de plugins, credenciales por integrante, múltiples proveedores activos por tribu, un motor de enrutamiento de costos, recuperación global por credenciales del líder, invitaciones impersonales que dispensen requisitos, preaprobación de revisión manual, cambio del tipo de contacto después de activar, verificación civil/biométrica, sincronización o extracción de grupos WhatsApp, promoción masiva, llamadas de voz, bots/agentes Zavu, compra de números o administración de DNS/Meta.

No se agregan roles globales nuevos ni permisos económicos a guardianes. No se fusiona verificación de contacto con verificación de proveedores comerciales. No se sustituye el login, framework, base de datos o sistema visual. La retención externa de Zavu y la facturación de la cuenta del líder no se administran desde esta feature.

### Condiciones de entrega y trazabilidad

La entrega completa cubre todos los FR, escenarios y casos límite, ambas modalidades, listas, excepciones, invitaciones, verificación adicional opcional, Zavu por tribu, canales previstos preparados, bandeja, notificaciones, importación, secretos, cuotas, auditoría y compatibilidad. Un canal puede mantenerse desactivado hasta preparar sus recursos, pero no reportarse como integrado/validado si no hay recorrido funcional y evidencia de prueba real autorizada.

`traceability.md` relaciona cada requisito con historias, criterios y focos de validación. El agente debe extenderlo con tareas y pruebas concretas, sin tratar una casilla de revisión de texto como una prueba de producción. Las restricciones técnicas del paquete deben incorporarse al plan antes de generar tareas. Una incompatibilidad comprobada con el producto o proveedor se documenta y resuelve explícitamente; no autoriza omitir silenciosamente requisitos.
