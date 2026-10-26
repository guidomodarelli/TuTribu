# Requirements Review Checklist: Academy Admissions and Tenant Messaging

**Fecha**: 2026-10-05. **Estado**: aprobada por el usuario como revisión temática; la evidencia de implementación se registra en la [revisión de cierre T212](#revisión-de-cierre-t212-2026-10-26).

**Aprobación registrada**: 2026-10-15, por instrucción expresa del usuario solicitante.

Marcar una casilla acredita revisión del requisito, no implementación ni ejecución de pruebas. Esta checklist complementa la que genere Spec Kit; no sustituye su `checklists/requirements.md`. Las fuentes normativas son `spec.md` y `technical-contract.md`.

## Alcance y decisiones

- [X] Se distinguen cuenta global, prueba local, solicitud, membresía básica y beneficios comerciales. [FR-002, FR-012, FR-026, FR-094]
- [X] Manual con check apagado funciona sin contratar ni configurar mensajería. [FR-016, FR-008, FR-004]
- [X] Conectar Zavu no activa códigos ni correos; esas opciones son independientes. [FR-004, FR-005, FR-013, FR-113]
- [X] Las matrices cubren todos los modos, ambos contactos y check ON/OFF sin coincidencias de datos declarados. [FR-007, FR-017, FR-018, FR-019]
- [X] La lista telefónica automática con OFF es inválida; manual telefónico con OFF conserva el enlace común y limita nuevas invitaciones. [FR-007, FR-006]
- [X] La primera entrega solo permite Zavu; no incluye stubs conectables de Twilio/Resend. [FR-030, FR-135]

## Identidad y límites de confianza

- [X] La evidencia base proviene de autoridad comprobable y trata explícitamente correos externos/claims ausentes. [FR-014, FR-015]
- [X] El check OFF no desactiva login ni ejecuta OTP oculto para resolver la falta de evidencia. [FR-002, FR-017, FR-016]
- [X] ON exige código local aun cuando Google ya acredita el correo. [FR-019]
- [X] Código y prueba se limitan a cuenta/tribu/contacto/propósito/época/conexión; no se usan en otra tribu. [FR-025, FR-027]
- [X] Ninguna API key del líder ni código local modifica seguridad o estado de verificación global. [FR-026, FR-029]
- [X] Se explica que el líder controla el canal externo y que la prueba no acredita pertenencia a WhatsApp ni identidad civil. [FR-029]
- [X] Datos declarados no reclaman contactos ni bloquean entradas de terceros; la aprobación manual se registra como decisión humana. [FR-022, FR-016, FR-018]
- [X] Cambios de contacto, conflicto de cuenta, cancelación y recuperación no reasignan habilitaciones silenciosamente. [FR-023, FR-024, FR-028]
- [X] La normalización de correo y teléfono no inventa equivalencias ni países. [FR-020, FR-021]

## Conexión y asistente de Zavu

- [X] Solo líder activo con sesión activa y confirmación explícita de la acción puede gestionar credenciales y pruebas. [FR-032] *(Reemplazado el 2026-10-19: antes exigía autenticación reciente.)*
- [X] La API key se valida realmente; formato correcto no equivale a credencial operativa. [FR-034]
- [X] El remitente es explícito por canal; las listas paginadas no omiten recursos y no devuelven DTOs con secretos. [FR-035, FR-036, FR-136]
- [X] Correo exige preparación de dominio/remitente; WhatsApp, plantilla de autenticación/idioma; SMS, capacidad/destinos permitidos. [FR-036, FR-070]
- [X] No se piden contraseñas DNS/Meta ni se crean recursos externos o compran números desde el asistente. [FR-037]
- [X] Guardar/editar no envía; cada prueba requiere acción explícita, destino visible y aviso de consumo. [FR-039, FR-040, FR-069]
- [X] La prueba comprueba el código recibido para diagnóstico, sin crear evidencia de admisión. [FR-040]
- [X] Capacidad preparada/probada pertenece a una versión concreta; un ensayo de WhatsApp no habilita correo/SMS. [FR-038, FR-041, FR-042]
- [X] Las restricciones de sandbox no se confunden con capacidad productiva. [FR-041, FR-071]
- [X] Solo hay una seleccionada y una candidata; guardar candidata no reemplaza la activa. [FR-031, FR-042]

## Secretos y ciclo de vida

- [X] Las claves se protegen como secretos recuperables por backend, no texto plano ni hash como único almacenamiento. [FR-044, FR-045]
- [X] La API key se ingresa una vez y no vuelve en consultas, máscaras reversibles, ciphertext, logs, analítica o errores. [FR-043, FR-045]
- [X] El contexto está autorizado antes de leer el secreto; no hay claves globales mutables ni respaldo con otra cuenta. [FR-046, FR-047]
- [X] La rotación usa candidata probada, versión nueva y preserva cuotas/historial. [FR-048, FR-042]
- [X] Los jobs quedan fijados a conexión/versión y no eligen silenciosamente otra al reintentar. [FR-049]
- [X] Desconexión ordinaria, suspensión urgente y sospecha de compromiso tienen resultados diferentes y explícitos. [FR-050, FR-051, FR-052]
- [X] La transferencia de liderazgo suspende credenciales anteriores sin borrar membresías ni invitaciones de la tribu. [FR-054, FR-134]
- [X] Purga operativa, borradores vencidos, backups y revocación externa separada tienen un procedimiento seguro. [FR-053, FR-056, FR-132]

## Códigos, canales y consumo

- [X] Los límites de tiempo, intentos, acumulados y uso único se comprueban en servidor. [FR-057, FR-065]
- [X] El proveedor entrega; aceptar/entregar/leer el mensaje nunca verifica al usuario. [FR-058, FR-062]
- [X] Reenvío nuevo invalida código anterior; retry técnico conserva desafío e identidad de entrega. [FR-059, FR-063]
- [X] WhatsApp a SMS solo ocurre por solicitud explícita, al mismo número y con cuotas compartidas; nunca se cambia a correo para verificar teléfono. [FR-060, FR-061]
- [X] Los endpoints no permiten enviar texto, secretos, remitentes o destinatarios arbitrarios fuera de un propósito autorizado. [FR-064]
- [X] Las cuotas resisten concurrencia, cambios de API key/dispositivo y desorden de cola. [FR-065, FR-066, FR-067]
- [X] Un timeout no provoca duplicaciones ciegas ni devuelve presupuesto sin evidencia. [FR-063, FR-067]
- [X] Cuota agotada o caída temporal no impide comprobar un código entregado vigente ni operar una revisión manual compatible. [FR-068, FR-055]
- [X] La interfaz separa cupos de envío de una garantía monetaria y conserva límites globales de plataforma. [FR-069, FR-066]
- [X] Los ensayos reales requieren autorización y evidencia por canal, no se reportan aprobados por dobles. [FR-071, FR-141]

## Lista, invitaciones y solicitudes

- [X] CSV tiene formato/límites/vista previa y repetición idempotente sin reactivar ni reasignar personas. [FR-077, FR-079, FR-078]
- [X] La lista gobierna nuevas admisiones, no expulsiones automáticas; excepción aprobada no modifica la lista. [FR-076, FR-075]
- [X] Toda invitación exige destinatario y único canje, con vencimiento opcional y advertencias. [FR-081, FR-085, FR-089]
- [X] La casilla de lista no omite aprobación manual, identidad exigible ni restricciones de conducta. [FR-084, FR-089, FR-122]
- [X] Lectura, preview, cuenta incorrecta y prueba de contacto no consumen invitaciones. [FR-090]
- [X] Rechazo/cancelación/vencimiento no reciclan el enlace; revocar una autorización pendiente cancela su solicitud. [FR-092, FR-093]
- [X] Una solicitud o membresía existente se devuelve sin consumir otro enlace. [FR-091, FR-095, FR-124]
- [X] Los estados de solicitud y membresía son independientes, con plazos y condiciones de reintento explícitos. [FR-094, FR-103, FR-104]
- [X] Aprobar y activar membresía/eventos es consistente ante concurrencia y respuesta perdida. [FR-100, FR-098, FR-095]
- [X] OFF → ON exige prueba de época vigente a pendientes; adjuntarla no reinicia treinta días ni aprueba. [FR-105, FR-106]
- [X] ON → OFF no aprueba solicitudes ni restaura pruebas revocadas; evidencia aplicada conserva su historia. [FR-107, FR-108]
- [X] El botón Aprobar no puede ignorar la lista obligatoria de una invitación, tampoco en lote. [FR-099, FR-098, FR-111]

## Bandeja, privacidad y compatibilidad

- [X] Guardianes revisan solicitudes sin acceso a claves, configuración o privilegios comerciales. [FR-032, FR-098, FR-012]
- [X] La bandeja y los avisos internos existen sin proveedor; correo externo exige capacidad independiente. [FR-112, FR-113]
- [X] Preferencias, agrupación, recordatorio y resolución tienen destinatarios confiables y no envían historial retroactivamente. [FR-114, FR-115, FR-119, FR-118]
- [X] Fallos de correo no pierden decisiones; los jobs revalidan roles/preferencias antes de enviar. [FR-116, FR-117]
- [X] Correo enlaza a pantalla autenticada; visitar un link no decide por el revisor. [FR-117]
- [X] Los pendientes solo ven lo propio y no aparecen como miembros ni pueden leer contenido privado. [FR-120, FR-121]
- [X] Activos/silenciados, conducta, recuperaciones comerciales y acceso a cursos conservan sus reglas. [FR-122, FR-123, FR-124]
- [X] Pausa, salida de modo, bloqueo y admisión legítima por otra vía no resucitan solicitudes/enlaces. [FR-125, FR-127, FR-128, FR-129]
- [X] Errores no enumeran contactos ni exponen notas internas; auditoría y métricas son sanitizadas. [FR-130, FR-131, FR-142]
- [X] Retenciones y eliminación se concilian con el producto sin afirmar cumplimiento legal certificado. [FR-132]
- [X] Móvil, escritorio, teclado y lectores de pantalla tienen estados y recuperación comprensibles. [FR-133]

## Preparación de implementación y evidencia

- [X] Se inventariaron todas las vías gratuitas antes de activación; el rollback no restaura acceso abierto. [FR-001, FR-138, FR-139, FR-140]
- [X] El contrato técnico define DI, puerto propio, adaptación y capacidades, no un framework genérico innecesario. [FR-135, FR-136, FR-137]
- [X] Los 142 FR, 71 escenarios, 45 EC, 21 SC y 27 TC se trasladan a tareas/pruebas/documentación sin omisiones. [FR-141]
- [X] Las restricciones de proveedor sin recursos para ensayar quedan pendientes, no se resuelven con bypass o éxito ficticio. [FR-041, FR-071, FR-141]
- [X] Se respeta la constitución, TDD y documentación de TuTribu; ninguna revisión documental se presenta como pruebas ejecutadas. [FR-141]

## Revisión de cierre T212 (2026-10-26)

Registro de [T212](../tasks.md#t212) sobre `21aec97a`. Las 71 casillas conservan su marca: acreditan la revisión temática aprobada por el usuario el 2026-10-15, no implementación, ejecución de pruebas ni gates. Esta revisión no agrega ni quita marcas; clasifica cada criterio según la evidencia que la [matriz de trazabilidad](../traceability.md#requisitos-individuales) registra para sus FR. Ningún criterio se certifica por esta revisión.

Resultado: 59 criterios tienen todos sus FR con evidencia por tarea y 12 conservan pendientes (17, 23, 24, 37, 43, 61, 62, 66, 67, 69, 70, 71). La [compuerta T211](../validation/quality-gate.md#compuerta-final-t211-2026-10-26) aprobó sobre `21aec97a` y aplica a los 71. La entrega no se declara completa mientras sigan abiertas las tareas con issue ([seguimiento #202](https://github.com/guidomodarelli/TuTribu/issues/202)) y los gates OG-03, OG-05 ([#209](https://github.com/guidomodarelli/TuTribu/issues/209)) y OG-06 ([#210](https://github.com/guidomodarelli/TuTribu/issues/210)) de [operational-gates.md](../validation/operational-gates.md).

El criterio 66 (lectores de pantalla) conserva su texto aprobado; la auditoría con lector de pantalla quedó fuera de T198/T208 por decisión del usuario del 2026-10-19 y los recorridos con teclado, foco y estados siguen pendientes en [#204](https://github.com/guidomodarelli/TuTribu/issues/204) y [#207](https://github.com/guidomodarelli/TuTribu/issues/207).

| # | Sección | Criterio | FR | Evidencia de implementación (T212) |
| ---: | --- | --- | --- | --- |
| 1 | Alcance y decisiones | Se distinguen cuenta global, prueba local, solicitud, … | FR-002, FR-012, FR-026, FR-094 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 2 | Alcance y decisiones | Manual con check apagado funciona sin contratar … | FR-016, FR-008, FR-004 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 3 | Alcance y decisiones | Conectar Zavu no activa códigos ni correos; … | FR-004, FR-005, FR-013, FR-113 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 4 | Alcance y decisiones | Las matrices cubren todos los modos, ambos … | FR-007, FR-017, FR-018, FR-019 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 5 | Alcance y decisiones | La lista telefónica automática con OFF es … | FR-007, FR-006 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 6 | Alcance y decisiones | La primera entrega solo permite Zavu; no … | FR-030, FR-135 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 7 | Identidad y límites de confianza | La evidencia base proviene de autoridad comprobable … | FR-014, FR-015 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 8 | Identidad y límites de confianza | El check OFF no desactiva login ni … | FR-002, FR-017, FR-016 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 9 | Identidad y límites de confianza | ON exige código local aun cuando Google … | FR-019 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 10 | Identidad y límites de confianza | Código y prueba se limitan a cuenta/tribu/contacto/propósito/época/conexión; … | FR-025, FR-027 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 11 | Identidad y límites de confianza | Ninguna API key del líder ni código … | FR-026, FR-029 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 12 | Identidad y límites de confianza | Se explica que el líder controla el … | FR-029 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 13 | Identidad y límites de confianza | Datos declarados no reclaman contactos ni bloquean … | FR-022, FR-016, FR-018 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 14 | Identidad y límites de confianza | Cambios de contacto, conflicto de cuenta, cancelación … | FR-023, FR-024, FR-028 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 15 | Identidad y límites de confianza | La normalización de correo y teléfono no … | FR-020, FR-021 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 16 | Conexión y asistente de Zavu | Solo líder activo con sesión activa y … | FR-032 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 17 | Conexión y asistente de Zavu | La API key se valida realmente; formato … | FR-034 | pendiente: FR-034 — T204 #206 |
| 18 | Conexión y asistente de Zavu | El remitente es explícito por canal; las … | FR-035, FR-036, FR-136 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 19 | Conexión y asistente de Zavu | Correo exige preparación de dominio/remitente; WhatsApp, plantilla … | FR-036, FR-070 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 20 | Conexión y asistente de Zavu | No se piden contraseñas DNS/Meta ni se … | FR-037 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 21 | Conexión y asistente de Zavu | Guardar/editar no envía; cada prueba requiere acción … | FR-039, FR-040, FR-069 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 22 | Conexión y asistente de Zavu | La prueba comprueba el código recibido para … | FR-040 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 23 | Conexión y asistente de Zavu | Capacidad preparada/probada pertenece a una versión concreta; … | FR-038, FR-041, FR-042 | pendiente: FR-041 — T204 #206 |
| 24 | Conexión y asistente de Zavu | Las restricciones de sandbox no se confunden … | FR-041, FR-071 | pendiente: FR-041, FR-071 — T204 #206 |
| 25 | Conexión y asistente de Zavu | Solo hay una seleccionada y una candidata; … | FR-031, FR-042 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 26 | Secretos y ciclo de vida | Las claves se protegen como secretos recuperables … | FR-044, FR-045 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 27 | Secretos y ciclo de vida | La API key se ingresa una vez … | FR-043, FR-045 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 28 | Secretos y ciclo de vida | El contexto está autorizado antes de leer … | FR-046, FR-047 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 29 | Secretos y ciclo de vida | La rotación usa candidata probada, versión nueva … | FR-048, FR-042 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 30 | Secretos y ciclo de vida | Los jobs quedan fijados a conexión/versión y … | FR-049 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 31 | Secretos y ciclo de vida | Desconexión ordinaria, suspensión urgente y sospecha de … | FR-050, FR-051, FR-052 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 32 | Secretos y ciclo de vida | La transferencia de liderazgo suspende credenciales anteriores … | FR-054, FR-134 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 33 | Secretos y ciclo de vida | Purga operativa, borradores vencidos, backups y revocación … | FR-053, FR-056, FR-132 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 34 | Códigos, canales y consumo | Los límites de tiempo, intentos, acumulados y … | FR-057, FR-065 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 35 | Códigos, canales y consumo | El proveedor entrega; aceptar/entregar/leer el mensaje nunca … | FR-058, FR-062 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 36 | Códigos, canales y consumo | Reenvío nuevo invalida código anterior; retry técnico … | FR-059, FR-063 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 37 | Códigos, canales y consumo | WhatsApp a SMS solo ocurre por solicitud … | FR-060, FR-061 | pendiente: FR-060, FR-061 — T204 #206 |
| 38 | Códigos, canales y consumo | Los endpoints no permiten enviar texto, secretos, … | FR-064 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 39 | Códigos, canales y consumo | Las cuotas resisten concurrencia, cambios de API … | FR-065, FR-066, FR-067 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 40 | Códigos, canales y consumo | Un timeout no provoca duplicaciones ciegas ni … | FR-063, FR-067 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 41 | Códigos, canales y consumo | Cuota agotada o caída temporal no impide … | FR-068, FR-055 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 42 | Códigos, canales y consumo | La interfaz separa cupos de envío de … | FR-069, FR-066 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 43 | Códigos, canales y consumo | Los ensayos reales requieren autorización y evidencia … | FR-071, FR-141 | pendiente: FR-071, FR-141 — T204 #206; T106 #203; T198 #204; T200 #205 |
| 44 | Lista, invitaciones y solicitudes | CSV tiene formato/límites/vista previa y repetición idempotente … | FR-077, FR-079, FR-078 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 45 | Lista, invitaciones y solicitudes | La lista gobierna nuevas admisiones, no expulsiones … | FR-076, FR-075 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 46 | Lista, invitaciones y solicitudes | Toda invitación exige destinatario y único canje, … | FR-081, FR-085, FR-089 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 47 | Lista, invitaciones y solicitudes | La casilla de lista no omite aprobación … | FR-084, FR-089, FR-122 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 48 | Lista, invitaciones y solicitudes | Lectura, preview, cuenta incorrecta y prueba de … | FR-090 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 49 | Lista, invitaciones y solicitudes | Rechazo/cancelación/vencimiento no reciclan el enlace; revocar una … | FR-092, FR-093 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 50 | Lista, invitaciones y solicitudes | Una solicitud o membresía existente se devuelve … | FR-091, FR-095, FR-124 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 51 | Lista, invitaciones y solicitudes | Los estados de solicitud y membresía son … | FR-094, FR-103, FR-104 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 52 | Lista, invitaciones y solicitudes | Aprobar y activar membresía/eventos es consistente ante … | FR-100, FR-098, FR-095 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 53 | Lista, invitaciones y solicitudes | OFF → ON exige prueba de época … | FR-105, FR-106 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 54 | Lista, invitaciones y solicitudes | ON → OFF no aprueba solicitudes ni … | FR-107, FR-108 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 55 | Lista, invitaciones y solicitudes | El botón Aprobar no puede ignorar la … | FR-099, FR-098, FR-111 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 56 | Bandeja, privacidad y compatibilidad | Guardianes revisan solicitudes sin acceso a claves, … | FR-032, FR-098, FR-012 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 57 | Bandeja, privacidad y compatibilidad | La bandeja y los avisos internos existen … | FR-112, FR-113 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 58 | Bandeja, privacidad y compatibilidad | Preferencias, agrupación, recordatorio y resolución tienen destinatarios … | FR-114, FR-115, FR-119, FR-118 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 59 | Bandeja, privacidad y compatibilidad | Fallos de correo no pierden decisiones; los … | FR-116, FR-117 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 60 | Bandeja, privacidad y compatibilidad | Correo enlaza a pantalla autenticada; visitar un … | FR-117 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 61 | Bandeja, privacidad y compatibilidad | Los pendientes solo ven lo propio y … | FR-120, FR-121 | pendiente: FR-121 — T198 #204 |
| 62 | Bandeja, privacidad y compatibilidad | Activos/silenciados, conducta, recuperaciones comerciales y acceso a … | FR-122, FR-123, FR-124 | pendiente: FR-123 — OG-06 #210 |
| 63 | Bandeja, privacidad y compatibilidad | Pausa, salida de modo, bloqueo y admisión … | FR-125, FR-127, FR-128, FR-129 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 64 | Bandeja, privacidad y compatibilidad | Errores no enumeran contactos ni exponen notas … | FR-130, FR-131, FR-142 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 65 | Bandeja, privacidad y compatibilidad | Retenciones y eliminación se concilian con el … | FR-132 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 66 | Bandeja, privacidad y compatibilidad | Móvil, escritorio, teclado y lectores de pantalla … | FR-133 | pendiente: FR-133 — T198 #204 |
| 67 | Preparación de implementación y evidencia | Se inventariaron todas las vías gratuitas antes … | FR-001, FR-138, FR-139, FR-140 | pendiente: FR-138, FR-139, FR-140 — OG-06 #210 |
| 68 | Preparación de implementación y evidencia | El contrato técnico define DI, puerto propio, … | FR-135, FR-136, FR-137 | con evidencia por tarea en sus FR; compuerta T211 aprobada |
| 69 | Preparación de implementación y evidencia | Los 142 FR, 71 escenarios, 45 EC, … | FR-141 | pendiente: FR-141 — T106 #203; T198 #204; T200 #205; T204 #206 |
| 70 | Preparación de implementación y evidencia | Las restricciones de proveedor sin recursos para … | FR-041, FR-071, FR-141 | pendiente: FR-041, FR-071, FR-141 — T204 #206; T106 #203; T198 #204; T200 #205 |
| 71 | Preparación de implementación y evidencia | Se respeta la constitución, TDD y documentación … | FR-141 | pendiente: FR-141 — T106 #203; T198 #204; T200 #205; T204 #206 |

## Cierre de revisión

La revisión temática de los 71 criterios queda aprobada por el usuario solicitante y registrada el 2026-10-15. Se conserva íntegro el alcance normativo y se continúa con la implementación autorizada.

El progreso de implementación se registra en [tasks.md](../tasks.md). Cada condición operativa conserva su estado y evidencia propios en [operational-gates.md](../validation/operational-gates.md). Los ensayos externos se rigen por las autorizaciones de envío ya otorgadas y sus límites.
