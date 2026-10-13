# Requirements Review Checklist: Academy Admissions and Tenant Messaging

**Fecha**: 2026-10-05. **Estado**: pendiente de revisión.

Marcar una casilla acredita revisión del requisito, no implementación ni ejecución de pruebas. Esta checklist complementa la que genere Spec Kit; no sustituye su `checklists/requirements.md`. Las fuentes normativas son `spec.md` y `technical-contract.md`.

## Alcance y decisiones

- [ ] Se distinguen cuenta global, prueba local, solicitud, membresía básica y beneficios comerciales. [FR-002, FR-012, FR-026, FR-094]
- [ ] Manual con check apagado funciona sin contratar ni configurar mensajería. [FR-016, FR-008, FR-004]
- [ ] Conectar Zavu no activa códigos ni correos; esas opciones son independientes. [FR-004, FR-005, FR-013, FR-113]
- [ ] Las matrices cubren todos los modos, ambos contactos y check ON/OFF sin coincidencias de datos declarados. [FR-007, FR-017, FR-018, FR-019]
- [ ] La lista telefónica automática con OFF es inválida; manual telefónico con OFF conserva el enlace común y limita nuevas invitaciones. [FR-007, FR-006]
- [ ] La primera entrega solo permite Zavu; no incluye stubs conectables de Twilio/Resend. [FR-030, FR-135]

## Identidad y límites de confianza

- [ ] La evidencia base proviene de autoridad comprobable y trata explícitamente correos externos/claims ausentes. [FR-014, FR-015]
- [ ] El check OFF no desactiva login ni ejecuta OTP oculto para resolver la falta de evidencia. [FR-002, FR-017, FR-016]
- [ ] ON exige código local aun cuando Google ya acredita el correo. [FR-019]
- [ ] Código y prueba se limitan a cuenta/tribu/contacto/propósito/época/conexión; no se usan en otra tribu. [FR-025, FR-027]
- [ ] Ninguna API key del líder ni código local modifica seguridad o estado de verificación global. [FR-026, FR-029]
- [ ] Se explica que el líder controla el canal externo y que la prueba no acredita pertenencia a WhatsApp ni identidad civil. [FR-029]
- [ ] Datos declarados no reclaman contactos ni bloquean entradas de terceros; la aprobación manual se registra como decisión humana. [FR-022, FR-016, FR-018]
- [ ] Cambios de contacto, conflicto de cuenta, cancelación y recuperación no reasignan habilitaciones silenciosamente. [FR-023, FR-024, FR-028]
- [ ] La normalización de correo y teléfono no inventa equivalencias ni países. [FR-020, FR-021]

## Conexión y asistente de Zavu

- [ ] Solo líder activo con autenticación reciente puede gestionar credenciales y pruebas. [FR-032]
- [ ] La API key se valida realmente; formato correcto no equivale a credencial operativa. [FR-034]
- [ ] El remitente es explícito por canal; las listas paginadas no omiten recursos y no devuelven DTOs con secretos. [FR-035, FR-036, FR-136]
- [ ] Correo exige preparación de dominio/remitente; WhatsApp, plantilla de autenticación/idioma; SMS, capacidad/destinos permitidos. [FR-036, FR-070]
- [ ] No se piden contraseñas DNS/Meta ni se crean recursos externos o compran números desde el asistente. [FR-037]
- [ ] Guardar/editar no envía; cada prueba requiere acción explícita, destino visible y aviso de consumo. [FR-039, FR-040, FR-069]
- [ ] La prueba comprueba el código recibido para diagnóstico, sin crear evidencia de admisión. [FR-040]
- [ ] Capacidad preparada/probada pertenece a una versión concreta; un ensayo de WhatsApp no habilita correo/SMS. [FR-038, FR-041, FR-042]
- [ ] Las restricciones de sandbox no se confunden con capacidad productiva. [FR-041, FR-071]
- [ ] Solo hay una seleccionada y una candidata; guardar candidata no reemplaza la activa. [FR-031, FR-042]

## Secretos y ciclo de vida

- [ ] Las claves se protegen como secretos recuperables por backend, no texto plano ni hash como único almacenamiento. [FR-044, FR-045]
- [ ] La API key se ingresa una vez y no vuelve en consultas, máscaras reversibles, ciphertext, logs, analítica o errores. [FR-043, FR-045]
- [ ] El contexto está autorizado antes de leer el secreto; no hay claves globales mutables ni respaldo con otra cuenta. [FR-046, FR-047]
- [ ] La rotación usa candidata probada, versión nueva y preserva cuotas/historial. [FR-048, FR-042]
- [ ] Los jobs quedan fijados a conexión/versión y no eligen silenciosamente otra al reintentar. [FR-049]
- [ ] Desconexión ordinaria, suspensión urgente y sospecha de compromiso tienen resultados diferentes y explícitos. [FR-050, FR-051, FR-052]
- [ ] La transferencia de liderazgo suspende credenciales anteriores sin borrar membresías ni invitaciones de la tribu. [FR-054, FR-134]
- [ ] Purga operativa, borradores vencidos, backups y revocación externa separada tienen un procedimiento seguro. [FR-053, FR-056, FR-132]

## Códigos, canales y consumo

- [ ] Los límites de tiempo, intentos, acumulados y uso único se comprueban en servidor. [FR-057, FR-065]
- [ ] El proveedor entrega; aceptar/entregar/leer el mensaje nunca verifica al usuario. [FR-058, FR-062]
- [ ] Reenvío nuevo invalida código anterior; retry técnico conserva desafío e identidad de entrega. [FR-059, FR-063]
- [ ] WhatsApp a SMS solo ocurre por solicitud explícita, al mismo número y con cuotas compartidas; nunca se cambia a correo para verificar teléfono. [FR-060, FR-061]
- [ ] Los endpoints no permiten enviar texto, secretos, remitentes o destinatarios arbitrarios fuera de un propósito autorizado. [FR-064]
- [ ] Las cuotas resisten concurrencia, cambios de API key/dispositivo y desorden de cola. [FR-065, FR-066, FR-067]
- [ ] Un timeout no provoca duplicaciones ciegas ni devuelve presupuesto sin evidencia. [FR-063, FR-067]
- [ ] Cuota agotada o caída temporal no impide comprobar un código entregado vigente ni operar una revisión manual compatible. [FR-068, FR-055]
- [ ] La interfaz separa cupos de envío de una garantía monetaria y conserva límites globales de plataforma. [FR-069, FR-066]
- [ ] Los ensayos reales requieren autorización y evidencia por canal, no se reportan aprobados por dobles. [FR-071, FR-141]

## Lista, invitaciones y solicitudes

- [ ] CSV tiene formato/límites/vista previa y repetición idempotente sin reactivar ni reasignar personas. [FR-077, FR-079, FR-078]
- [ ] La lista gobierna nuevas admisiones, no expulsiones automáticas; excepción aprobada no modifica la lista. [FR-076, FR-075]
- [ ] Toda invitación exige destinatario y único canje, con vencimiento opcional y advertencias. [FR-081, FR-085, FR-089]
- [ ] La casilla de lista no omite aprobación manual, identidad exigible ni restricciones de conducta. [FR-084, FR-089, FR-122]
- [ ] Lectura, preview, cuenta incorrecta y prueba de contacto no consumen invitaciones. [FR-090]
- [ ] Rechazo/cancelación/vencimiento no reciclan el enlace; revocar una autorización pendiente cancela su solicitud. [FR-092, FR-093]
- [ ] Una solicitud o membresía existente se devuelve sin consumir otro enlace. [FR-091, FR-095, FR-124]
- [ ] Los estados de solicitud y membresía son independientes, con plazos y condiciones de reintento explícitos. [FR-094, FR-103, FR-104]
- [ ] Aprobar y activar membresía/eventos es consistente ante concurrencia y respuesta perdida. [FR-100, FR-098, FR-095]
- [ ] OFF → ON exige prueba de época vigente a pendientes; adjuntarla no reinicia treinta días ni aprueba. [FR-105, FR-106]
- [ ] ON → OFF no aprueba solicitudes ni restaura pruebas revocadas; evidencia aplicada conserva su historia. [FR-107, FR-108]
- [ ] El botón Aprobar no puede ignorar la lista obligatoria de una invitación, tampoco en lote. [FR-099, FR-098, FR-111]

## Bandeja, privacidad y compatibilidad

- [ ] Guardianes revisan solicitudes sin acceso a claves, configuración o privilegios comerciales. [FR-032, FR-098, FR-012]
- [ ] La bandeja y los avisos internos existen sin proveedor; correo externo exige capacidad independiente. [FR-112, FR-113]
- [ ] Preferencias, agrupación, recordatorio y resolución tienen destinatarios confiables y no envían historial retroactivamente. [FR-114, FR-115, FR-119, FR-118]
- [ ] Fallos de correo no pierden decisiones; los jobs revalidan roles/preferencias antes de enviar. [FR-116, FR-117]
- [ ] Correo enlaza a pantalla autenticada; visitar un link no decide por el revisor. [FR-117]
- [ ] Los pendientes solo ven lo propio y no aparecen como miembros ni pueden leer contenido privado. [FR-120, FR-121]
- [ ] Activos/silenciados, conducta, recuperaciones comerciales y acceso a cursos conservan sus reglas. [FR-122, FR-123, FR-124]
- [ ] Pausa, salida de modo, bloqueo y admisión legítima por otra vía no resucitan solicitudes/enlaces. [FR-125, FR-127, FR-128, FR-129]
- [ ] Errores no enumeran contactos ni exponen notas internas; auditoría y métricas son sanitizadas. [FR-130, FR-131, FR-142]
- [ ] Retenciones y eliminación se concilian con el producto sin afirmar cumplimiento legal certificado. [FR-132]
- [ ] Móvil, escritorio, teclado y lectores de pantalla tienen estados y recuperación comprensibles. [FR-133]

## Preparación de implementación y evidencia

- [ ] Se inventariaron todas las vías gratuitas antes de activación; el rollback no restaura acceso abierto. [FR-001, FR-138, FR-139, FR-140]
- [ ] El contrato técnico define DI, puerto propio, adaptación y capacidades, no un framework genérico innecesario. [FR-135, FR-136, FR-137]
- [ ] Los 142 FR, 71 escenarios, 45 EC, 21 SC y 27 TC se trasladan a tareas/pruebas/documentación sin omisiones. [FR-141]
- [ ] Las restricciones de proveedor sin recursos para ensayar quedan pendientes, no se resuelven con bypass o éxito ficticio. [FR-041, FR-071, FR-141]
- [ ] Se respeta la constitución, TDD y documentación de TuTribu; ninguna revisión documental se presenta como pruebas ejecutadas. [FR-141]

## Cierre de revisión

Registrar responsable, fecha, preguntas resueltas y contradicciones concretas. Si quedan condiciones operativas pendientes, indicar cuáles y a qué capacidades afectan; no eliminar requisitos para obtener una checklist verde. La autorización para implementar o enviar mensajes debe ser explícita y separada de la revisión de este documento.
