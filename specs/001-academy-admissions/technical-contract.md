# Technical Contract: Academy Admissions and Tenant Messaging

**Fecha**: 2026-10-05. **Estado**: restricciones y decisiones de diseño para planificación; sin implementación ni pruebas ejecutadas sobre la aplicación.

Este documento es entrada de `/speckit-plan` o de la skill equivalente instalada. Sus restricciones TC son obligatorias para esta feature; los nombres propuestos de módulos/puertos pueden adaptarse a equivalentes existentes que mantengan sus responsabilidades. El comportamiento normativo está en `spec.md`. No se modifica la constitución ni se prescribe reemplazar librerías existentes.

## 1. Arquitectura y propietarios

**TC-001 — Separación de responsabilidades.** La cuenta/sesión global pertenece a la autenticación existente. La política, pruebas adicionales de admisión y solicitudes pertenecen al dominio de admisión. La conexión por tribu, transporte y entrega pertenecen a mensajería. La membresía y los permisos comerciales siguen teniendo sus propietarios actuales. Ningún envío exitoso es una decisión de admisión.

**TC-002 — Hexagonal, SOLID y composición.** Usar módulos verticales `src/modules/<feature>/{domain,application,infrastructure}` y dependencias hacia adentro. Los casos de uso consumen puertos propios; SDKs, clientes HTTP, tipos externos y traducción de errores pertenecen a infraestructura. Composición explícita por constructor/factory, en `setup.ts` o equivalente aprobado. No se requiere un framework de DI, un contenedor global ni un sistema dinámico de plugins. Los módulos deben tener responsabilidades pequeñas; no interfaces gigantes con métodos ficticios para proveedores que no los soportan.

**TC-003 — Extensión concreta.** Primera implementación: adaptador Zavu. Un registro resuelve `providerId` y capacidades reales mediante una configuración permitida. Agregar un transporte futuro requiere adaptador, descriptor, validación de configuración, mappers y pruebas de contrato. No debe cambiar la lógica de lista, destinatario, revisión, solicitud o permisos. No implementar Twilio o Resend como parte de esta entrega ni exponer stubs en producción.

### Puertos y componentes propuestos

| Componente | Contrato propio y límite |
|---|---|
| `AuthenticatedAccountProvider` | Obtiene identidad global estable y evidencia base acreditada desde el sistema existente. No acepta claims del navegador como verdad. |
| `AdmissionPolicyRepository` | Política/versiones/época por tribu, con control de concurrencia. |
| `AdmissionRequestRepository` | Persistencia de solicitudes, vínculos y decisión consistente; no envía mensajes. |
| `ContactVerificationService` | Orquesta desafíos locales, límites, prueba y aplicación a una solicitud. No crea sesiones globales. |
| `ChallengeRepository` | Estado, intentos, vencimiento, unicidad y evidencia de aplicación; no expone códigos a lectores administrativos. |
| `VerificationMessageSender` | Entrega un mensaje de código para un propósito autorizado por un canal soportado; resultado de transporte propio. |
| `AdmissionNotificationSender` | Entrega avisos permitidos por preferencias y capacidad de correo; no valida códigos. |
| `MessagingConnectionRepository` | Metadatos de tribu, proveedor, versión, estado, capacidades y referencia de secreto. |
| `SecretStore` | Almacena/recupera/retira secretos con autorización y auditoría sanitizada; no contiene reglas de admisión. |
| `MessagingProviderRegistry` | Descriptor y factory de infraestructura para proveedores instalados; no un switch de Zavu dentro del dominio. |
| `MessagingConnectionInspector` | Comprueba credencial, recursos y capacidades de una candidata sin activar política ni enviar por defecto. |
| `ZavuMessagingAdapter` | Traduce transporte/recursos/errores Zavu a contratos propios. Se construye con contexto y credencial explícitos. |
| `DeliveryRepository` / `UsageLimiter` | Identidad de entrega, deduplicación, presupuestos de intentos y reserva concurrente. |
| `Clock` / `VerificationCodeGenerator` / protección criptográfica | Primitivas sustituibles en pruebas en bordes propios, sin criptografía ad hoc. |

Un puerto pequeño puede tener un DTO propio discriminado por canal (`email`, `sms`, `whatsapp`), siempre que no se exijan campos irrelevantes. El identificador de plantilla de Zavu se resuelve en infraestructura desde una configuración validada: no atraviesa la lógica de admisión como su criterio de autorización.

## 2. Contexto por tribu antes de acceder a secretos

**TC-004 — Resolución autoritativa.** Un `tribeId`, `requestId` o `invitationId` suministrado por el cliente es una referencia a validar, no un contexto autorizado. Resolver sesión y tribu, comprobar relación del recurso, permisos y política, y solo después obtener la conexión. Los endpoints de preadmisión deben permitir exclusivamente al solicitante consultar/presentar lo propio, sin conceder un rol de miembro para superar RLS. Los avisos del solicitante se leen por su cuenta y recurso autorizado; no requieren abrirle la bandeja administrativa de la tribu.

**TC-005 — No estado mutable compartido.** Cada operación/trabajo transporta `tribeId`, propósito, recurso, `connectionId`, `connectionVersion` y correlación. No cambiar API keys o remitentes de un singleton. Un caché de clientes o configuración solo es aceptable con clave compuesta por tribu/conexión/versión/entorno, caducidad e invalidación; nunca por nombre del proveedor únicamente. Rutas, jobs y tareas de recuperación aplican el mismo aislamiento.

**TC-006 — Sin escape de permisos.** RLS y controles de aplicación se complementan. Revisar el rol real de base de datos y funciones privilegiadas; no asumir que RLS protege escrituras si el runtime la omite. Operaciones críticas deben comprobar actor, rol activo, propietario y tribu en el momento autoritativo. Los futuros adaptadores no pueden aceptar credenciales ni endpoints arbitrarios enviados por un solicitante.

## 3. Autenticación global y evidencia base

**TC-007 — No usar BYOK como autoridad global.** Better Auth conserva el login, sesión, recuperación y vinculación de identidades. No conectar indiscriminadamente una API key de tribu a callbacks globales `sendVerificationOTP`, `sendOTP`, magic links o recuperación. Reutilizar componentes de verificación existentes solo si se demuestra que todo su almacenamiento, endpoint y efecto quedan limitados al propósito y tribu de admisión. No actualizar `user.emailVerified`, `phoneNumberVerified` global ni enlazar cuentas con una prueba BYOK. El servicio local debe implementar un contrato de desafío seguro, no un login paralelo.

**TC-008 — Evidencia base verificable.** Reutilizar el flujo Google/Better Auth validado, comprobando audiencia, emisor, vigencia y procedencia cuando corresponda. La identidad estable es el usuario del sistema (vinculado al sujeto del proveedor), no la dirección de correo como sustituto de un identificador global. Para la coincidencia base de correo, documentar cómo se conserva/obtiene prueba de autoridad de Google: Gmail o Workspace con señales suficientes. `email_verified` aislado no basta para un correo externo; la ausencia de `hd` no se reemplaza con un dominio escrito en un formulario. No usar el endpoint de depuración del proveedor como validación productiva improvisada. [S4]

Si el modelo actual no conserva la evidencia necesaria, el plan debe añadirla mediante el flujo confiable o clasificarla como insuficiente. No cambiar el requisito a “todo login con Google verifica cualquier correo” para facilitar la implementación.

## 4. Desafíos y pruebas de admisión

**TC-009 — Contexto y aplicación única.** La comprobación autoritativa debe verificar cuenta, tribu, contacto normalizado, propósito (`admission` o `connection_diagnostic`), desafío actual, época, versión de conexión, tiempo, intentos y estado. El resultado visible de validar es un identificador opaco de prueba propio, nunca un booleano que el cliente pueda enviar para autoautorizarse. Aplicar esa prueba y reclamar el contacto ocurre de forma consistente con la solicitud. Los diagnósticos nunca generan una prueba de admisión.

**TC-010 — Código protegido.** Usar generación criptográfica uniforme y validación limitada. Para códigos de seis dígitos, un hash rápido sin clave protege insuficientemente frente a una copia de base por su bajo espacio de búsqueda. Preferir verificación mediante MAC/HMAC con clave protegida y contexto del desafío, o una primitiva segura equivalente documentada. Comparación adecuada, TTL, máximos de intento y contadores acumulados autoritativos son obligatorios. No confiar en temporizadores del navegador. No diseñar primitivas criptográficas propias. La elección de MAC/HMAC es una decisión técnica propuesta; la fuente aporta principios generales de tokens y límites, no un protocolo de admisión. [S5]

Si un envío durable requiere conservar temporalmente el código, mantener un sobre cifrado con TTL corto, acceso exclusivo del proceso emisor y purga después del despacho/expiración. Ese sobre no es un campo de auditoría o una respuesta administrativa. Mantener separado el verificador del código. No prometer “nunca se almacena material recuperable” si el outbox necesita ese material.

**TC-011 — Épocas, reenvíos y pruebas pendientes.** OFF → ON crea una nueva época; se revalida en la escritura de presentación/decisión. Un resend explícito crea otro desafío e invalida el anterior consistentemente. Los reintentos de transporte conservan desafío y entrega, sin otro código. Adjuntar una prueba a una pendiente no modifica su fecha de presentación. El plan debe cubrir invalidación concurrente con aprobación y los casos de prueba ya adjuntada, credenciales rotadas normalmente y sospecha de compromiso.

La edad máxima de quince minutos se comprueba al aplicar la prueba; no se vuelve a interpretar como un temporizador de quince minutos para que el líder apruebe. Una interrupción temporal de transporte no impide comprobar un código ya entregado, salvo invalidación o vencimiento.

## 5. Almacenamiento y manejo de credenciales

**TC-012 — Secretos recuperables con aislamiento.** Usar `SecretStore` con cifrado autenticado o gestor de secretos. El plan elige tecnología compatible con el despliegue real y documenta rotación/recuperación de claves. Asociar el cifrado/contexto autorizado con tribu, conexión, versión y entorno. No guardar texto plano; no usar únicamente un hash de API key, porque el transporte debe recuperarla. La clave de protección no se almacena junto al ciphertext como otro campo de la misma configuración. [S6]

**TC-013 — Entrada una vez, salida nunca.** La UI permite ingresar la clave y enviarla al backend por un canal seguro; esto no significa que deba quedar incrustada como configuración cliente. Vaciar el formulario tras éxito. No conservarla en almacenamiento del navegador, estado persistido, HTML/props de servidor, analytics/session replay, trazas HTTP o informes de error. El servidor devuelve máscara y metadatos, no ciphertext ni secreto. Deshabilitar logging de cuerpo en esas operaciones. Reautenticación global reciente y defensa CSRF/origen según la arquitectura existente para mutaciones sensibles.

**TC-014 — Retiro y recuperación.** Desconectar impide uso futuro antes de eliminar físicamente el secreto. Tareas pendientes, cachés y copias operativas deben respetar la retirada. Backups/restauraciones no pueden resucitar permisos de una versión retirada: conservar el estado de revocación fuera del simple snapshot del secreto, con procedimiento de restauración seguro. El plan documenta la eliminación operativa dentro de veinticuatro horas y el tratamiento de backups. No devolver la clave al nuevo líder ni revocar externamente una cuenta por el simple borrado local.

## 6. Integración Zavu: alcance preciso de primera entrega

### Evidencia documental comprobada

Los siguientes son hechos documentados por Zavu, no resultados de envíos realizados en esta tarea. [S1–S3, S8–S10]

| Fuente | Hecho relevante |
|---|---|
| Autenticación Zavu [S1] | Autentica con Bearer API key; permite indicar remitente con `Zavu-Sender` y documenta idempotencia. Las claves de prueba tienen alcance limitado a WhatsApp de teléfonos del equipo. |
| Correo Zavu [S2] | El remitente de correo usa un dominio propio verificado. La dirección viene del remitente configurado; pasar un `from` arbitrario no selecciona un remitente. |
| OTP WhatsApp [S3] | La aplicación entrega el código a una plantilla de autenticación; se requiere preparación de WhatsApp Business y plantilla/idioma válidos. |
| Recursos [S8] | Hay operaciones documentadas para listar/consultar remitentes. Consultar solo el proyecto accesible mediante la clave aportada. |
| Reintentos [S1] | Un envío repetido con la misma identidad idempotente puede devolver conflicto con el mensaje original; el adaptador debe interpretarlo, no reenviar con otra identidad ciegamente. |

No se incorporan afirmaciones de cuotas gratuitas, precios, velocidad garantizada, SLA, alcance de países o verificación Meta aplicable a toda cuenta sin comprobar el caso efectivo. Las condiciones externas se revalidan durante el plan y la preparación del canal.

**TC-015 — Adaptador de transporte, no motor global de verificación.** Usar el SDK oficial disponible y compatible con las versiones fijadas en TuTribu o un cliente HTTP de infraestructura propio si hay una incompatibilidad documentada. La API key se pasa explícitamente al construir el cliente; no permitir que la ausencia active la lectura de una clave global del entorno. Pasar el remitente explícito en cada envío. El host/API base lo controla la plataforma y se limita al proveedor permitido, nunca es una URL editable por el líder. No copiar endpoints de ejemplo sin autenticación o validación como un proxy abierto.

**TC-016 — Descriptor de configuración.** El registro devuelve un view model propio con campos/capacidades y requisitos por canal, no funciones ejecutables recibidas del proveedor ni sus DTOs crudos. Zavu requiere credencial y remitente; WhatsApp añade plantilla e idioma. Correo verifica remitente/dominio; SMS confirma canal y restricciones de destino. No inventar scopes como `senders:read` sin comprobar que existan; registrar los permisos mínimos efectivamente requeridos por las operaciones usadas. Dar alternativa manual validada para recursos si la enumeración no está disponible, sin relajar el requisito de comprobar aptitud. Paginar las consultas cuando el proveedor devuelva continuación. Construir las respuestas al cliente mediante selección explícita de campos: el ejemplo de remitentes contiene `webhook.secret`, que jamás debe llegar al selector de UI ni a logs. [S8]

**TC-017 — Sin efectos de aprovisionamiento implícitos.** El asistente consulta recursos existentes, presenta pasos faltantes y realiza solo pruebas autorizadas. No crea proyectos, cuentas, números, dominios, suscripciones, plantillas o remitentes en el proveedor, ni modifica su canal por defecto. Seleccionar una conexión en TuTribu no equivale a modificar el sender global de Zavu. Esto evita afectar otras aplicaciones del líder que compartan esos recursos.

**TC-018 — Enrutamiento y errores.** Usar un canal explícito y verificar que la configuración de Zavu no añada un fallback incompatible. Si no puede garantizarse el transporte solicitado, no habilitar esa capacidad. La alternativa SMS es una nueva solicitud explícita del usuario con código nuevo, no un fallback opaco del proveedor. Mapear errores a categorías propias, por ejemplo `invalid_credentials`, `missing_capability`, `recipient_not_allowed`, `quota_exceeded`, `temporary_failure` y `delivery_unknown`, con detalles sanitizados. Un estado inesperado no se interpreta como contacto comprobado.

## 7. Concurrencia, outbox y costos

**TC-019 — Operaciones consistentes.** Implementar transacciones/unicidad/condiciones de versión apropiadas para membresía, pendiente por cuenta/tribu, contacto comprobado, invitación utilizable y canje, prueba aplicada y decisión terminal. Un chequeo de lectura seguido de escrituras separadas no garantiza uso único. Revalidar el rol, apertura, política e invitación dentro del límite autoritativo con orden consistente de bloqueos. No realizar llamadas al proveedor mientras se retienen locks de una transacción de admisión.

**TC-020 — Entrega durable.** Persistir evento lógico y outbox junto con el cambio de negocio o mecanismo equivalente. Los consumidores son idempotentes y revalidan permisos/preferencias al despachar. Las referencias de trabajo incluyen conexión/versión; las notificaciones pueden reintentarse de forma controlada con otra conexión de la misma tribu solo mediante una acción autorizada y auditada. Los códigos no se redirigen: debe pedirse otro desafío. Una desactivación de correo detiene trabajos externos pero conserva actividad interna. Al habilitar correo no se envía retrospectivamente todo el historial. [S7]

**TC-021 — Idempotencia del proveedor.** Usar una identidad estable por entrega y guardar correlación/identificador externo. Confirmar en la versión de API/SDK el campo/header y la ventana de deduplicación. Un `409` solo es resultado ya existente si corresponde al mismo intento lógico y payload; no tomar cualquier conflicto como aceptación. Limitar reintentos a la vigencia del desafío o evento. Tras timeout incierto, reconciliar con el proveedor cuando sea posible; si no, mostrar desconocido sin generar otra entrega ciega. El objetivo es efecto lógico único, no prometer exactamente una vez extremo a extremo.

**TC-022 — Cupos resistentes a concurrencia.** Contadores por desafío, cuenta y contacto entre tribus más cupos por tribu y límites de plataforma. Para índices agregados de contactos usar una representación protegida que no permita enumeración. Los contadores globales no se divulgan por tribu ni se reinician con versión de credencial. Reservar capacidad antes del intento externo y revalidar la política de uso; tratar lo incierto de forma conservadora. Separar transporte (aceptado/fallido) de presupuesto de intentos potencialmente facturables. No deducir costo monetario exacto del número de llamadas.

**TC-023 — Estado de entrega y callbacks.** Para primera entrega, guardar la respuesta de envío y consultar estado de mensajes propios cuando la API y permisos lo permitan; no exigir un webhook al líder como requisito mínimo. No listar historiales completos ni conversaciones. Si se utiliza un webhook para esta integración, exigir la firma v2 documentada sobre el timestamp y el cuerpo original, verificarla antes de procesar y rechazar degradaciones silenciosas a otra versión. Acotar replay, tamaño y frecuencia, correlacionar con mensaje/conexión/tribu registrados y tolerar duplicación/desorden. No modificar un webhook compartido que use otra aplicación como efecto secundario; se puede operar sin este mecanismo si no está disponible de forma compatible. Nunca elegir una tribu por un campo no autenticado del callback ni cambiar membresía/verificación desde un callback de entrega. [S9]

## 8. Gestión de cambios y pruebas

**TC-024 — Reemplazo seguro y liderazgo.** Mantener candidata y activa separadas. Al confirmar reemplazo, actualizar referencia activa consistentemente, invalidar trabajo OTP no aplicado antiguo y retirar la clave anterior sin dejar cachés autorizadas. La transferencia de liderazgo detiene nuevos envíos con credenciales del anterior; el nuevo líder vuelve a configurar sin visualizar secretos previos. Las pruebas ya adjuntadas no pierden validez por rotación ordinaria, pero sí deben poder marcarse para recomprobación por compromiso. No se restauran derechos por la existencia de una clave.

**TC-025 — Integración con el producto existente.** Inventariar casos de uso, funciones SQL, invitaciones históricas, rutas directas y flujos legítimos pagos. Mantener clasificación de conducta y razones comerciales recuperables. Al revisar pendientes de una cuenta sin membresía, habilitar solo consultas/mutaciones específicas de su solicitud. La feature se activa por tribu de forma explícita; un rollback cierra nuevas admisiones protegidas en vez de restaurar el flujo abierto.

**TC-026 — Pruebas por comportamiento.** Aplicar TDD, reglas puras, casos de uso con dobles en bordes propios, persistencia/SQL real, concurrencia, UI y E2E. No sustituir librerías internas por mocks indiscriminados ni probar solo texto de archivos. Un adaptador alternativo de prueba demuestra sustitución de transporte sin convertirse en proveedor productivo. Las pruebas reales con Zavu deben registrar versión, canal, resultado, IDs sanitizados y consentimiento de envío sin revelar claves/destinatarios/códigos innecesarios.

### Validaciones de integración que no se pueden omitir

- Envíos simultáneos A/B con credenciales, recursos y versión correctos, incluso después de reusar procesos o cachés.
- Diferencia entre verificación global y prueba local; ataques a endpoints de recuperación/linking con código local rechazados.
- Código correcto de otra tribu/purpose/época rechazado; diagnóstico del líder no usable como admisión.
- Reenvío, código agotado, reinicios, respuestas tardías, presupuesto final concurrente y reducción de cuota con trabajo en cola.
- Rotación normal, clave revocada, suspensión de seguridad, dominio/plantilla inválidos y transferencia de liderazgo.
- Códigos por correo/SMS/WhatsApp y alternativa SMS con recursos realmente preparados. Probar un canal no valida los demás.
- Permisos de guardián limitado a revisión; secretos y notificaciones de otro tenant inaccesibles.
- Decisión y membresía sin parciales; expiración comprobada autoritativamente; datos/correos privados no expuestos antes de admisión.

**TC-027 — Operación, documentación y observabilidad.** Emitir correlación y métricas sanitizadas con tenant/contexto, sin cuerpos de OTP o secretos. Documentar recuperación de secretos, errores de proveedor, cuotas y reconexión dentro de los manuales existentes y sus formatos. La UI de configuración, canal no operativo y estado de envío debe funcionar sin depender de un correo de alarma enviado por el mismo canal averiado. Actualizar documentación y CHANGELOG de producto en las rutas/formato del repositorio, sin publicar ni ejecutar migraciones sin autorización.

## 9. Entregables requeridos de la planificación

El `plan.md` generado debe concretar: fronteras y reutilización de módulos; contratos públicos y errores; esquema/versiones/RLS; mecanismo de prueba local y evidencia base; cifrado y ciclo de secretos; outbox y tratamiento de material OTP; política de concurrencia; integración Zavu con campos/métodos confirmados; restricciones de destinos/consumo; UI/pasos mínimos; pruebas y criterios medibles; activación/rollback y manuales.

La elección de gestor de secretos, primitivas de base de datos, cola, librerías y ubicación exacta de módulos se hace contra el repositorio y entorno reales. No elegir nuevos servicios por memoria ni declararlos contratados/configurados. Las fuentes [S1–S10] y las referencias del repositorio están en `handoff.md`. Una imposibilidad del proveedor se documenta como discrepancia concreta a resolver, nunca como un fallback que verifique sin prueba.
