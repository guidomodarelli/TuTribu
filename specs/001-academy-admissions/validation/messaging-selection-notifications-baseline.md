# Avisos independientes y selección de mensajería

Alcance: dependencia vigente de admission_email_settings al seleccionar una candidata, sin habilitar correo ni completar US8/US6. El objetivo conserva82/212 tareas completas y130 pendientes.

55310 rojo51,31s, PostgreSQL y autoridad nativa de activación reales: requiredChannels devolvía[] con avisos habilitados y AdmissionPolicy ausente. No falló por el fixture ni por autorización; el adapter sólo leía admisión. Se compone explícitamente el reader del owner notifications en el adapter y root de selección. La ausencia de ajuste es OFF sin INSERT; la indisponibilidad de almacenamiento se propaga, sin fallback. Se conserva el único owner de países/cupos.

10488 verde45,04s con el caso original.47445 verde51,24s amplía el mismo caso SQL: ausencia sin persistir, ON exigeemail preservando flag/version/enabledAt, unión WhatsApp/SMS/email, OFF elimina sólo el requisito de avisos, email repetido queda único y almacenamiento ausente físicamente falla42P01. La eliminación de tabla pertenece únicamente al fixture de su rama efímera propia y terminó con cleanup.

Tipos/lint pasan y build35021 verde14,7s/TS4,4s/46pages. Se actualizan las migraciones de los fixtures Native de activación y teléfono para aplicar la tabla independiente.63961 focal del recorrido telefónico está en curso: debe rechazar activación SMS cuando email está habilitado sin canal de correo preparado y conservar candidata/flags/cuota, luego seleccionar tras OFF explícito sin otro SDK.88221 suiteSQL de activación está en curso, incluye preparación real de email con avisos ON sin modificar flag/cupos. Ninguna se acredita antes de su exit.

Native25414 final verde242,08s acredita por HTTP real que creación, suspensión y retiro de candidata conservan ajustes independientes de academia/correo y no crean AdmissionPolicy; SDK0. Su delta de test está pendiente del checkpoint de evidencia. No representa una pantalla para habilitar/deshabilitar avisos: US8 y sus gates mantienen la implementación prevista.

88221 terminó verde2152,66s: cinco SQL de activación con los constructors/reader reales y la migración de avisos aplicada al fixture. Incluye el caso nuevo de email preparado con avisos ON, que conserva enabled/version/enabledAt y países/cupos sin otro SDK. Se conservan además ready/invalidación de credencial, rollback bajo espera, reemplazo y replay. Estos cinco casos se ejecutaron antes de añadir las dos pruebas adicionales de candidata defectuosa de T133, que corren por separado en13685.

63961 focal Chromium1280 terminó verde958,05s: SMS preparado se rechaza mientras email está habilitado, conserva candidata version4/flags y SDK3, y selecciona después de OFF explícito sin otro envío. La matriz53055 posterior agrega lectura actual antes de renovar consentimiento y capturas limpias separadas del estado de canal requerido; todavía está en curso. No se acredita como verde por la salida de un caso intermedio ni por la captura parcial.

13685 terminó con un caso pasado y uno fallido por cleanup: candidata invalid_credentials preserva la conexión previamente seleccionada; el caso dependency_unavailable no confirma ausencia de su rama propia tras DELETE terminado por SIGTERM. No se acredita como verde. Después de verificar id/nombre/parent/default y la terminación del proceso, se eliminó exclusivamente br-withered-band-anfb62i8 y se confirmó su ausencia.4693 repite sólo ese caso, sin cambiar assertions ni el producto, y sigue en curso.

92807 QA documental final pasó32 renders Chromium/WebKit1280/390 con0 errores/overflow/pins. El checkpoint de dependencias conserva los resultados SQL47445/88221 y Native25414; la matriz telefónica y los dos nuevos casos AC01 se guardan en otro incremento cuando terminen.
