# Cobertura nativa de contacto telefónico

Incremento de cobertura de T095/T096, sobre `3a4439581c127596770c4b44f0a491eef6dd3110`. Conserva 97/212 tareas completas y 115 pendientes.

El caso de uso normaliza teléfono y conserva SMS explícito. La primitive de emisión ya tenía un caso SQL de países, pero el fixture del owner nativo sólo preparaba correo; faltaba ejecutar ese mismo contrato con cuenta, sesión y política actuales del solicitante. Esta brecha era de cobertura y fixture, sin acreditar ausencia de soporte productivo.

Se agregó una opción de teléfono al fixture, con SMS y contacto elegidos antes de insertar la versión inmutable y activar la política. Los callers existentes conservan el perfil de correo por defecto. No se modifica código productivo, schema, login, configuración externa o CHANGELOG.

La primera ejecución fue roja con `invalid_input`, porque la política del fixture todavía era de correo. Después de prepararlo para SMS, se ejecutó la emisión; el test esperaba una máscara de tres puntos y el contrato vigente usa cuatro desde `2748f7ad06bc8bb8061c76ffee233f8649f7075f`. Se corrigió sólo ese oráculo, manteniendo el chequeo preciso de destino enmascarado. El caso sin países pasó y confirmó cero desafíos, entregas, eventos, pruebas o miembros.

La corrida final pasó tres casos seleccionados en 156,47 s: dos telefónicos y una regresión de correo con commit perdido, replay y validación local sin cuota/proveedor. Los otros tres casos del archivo de correo quedaron fuera de esta selección; no se infiere su reejecución. Los casos telefónicos comprueban emisión/replay, retiro posterior del país sin invalidar el código local, prueba única y ausencia de cambios a `emailVerified` o sesiones globales. Tipos-tests y lint focal pasan. Las tres ramas propias se eliminaron y su ausencia se comprobó; todos los recursos de esa corrida cerraron correctamente.

Este incremento no comprueba SMS/WhatsApp enviados por un proveedor real, todos los AC, la UI telefónica nativa ni el flujo de recuperación de contacto vinculado. Esos criterios siguen pendientes.


La revisión read-only cerró sin hallazgos accionables: manifiesto 27C48878FFA89EE9F0524591FD86213D8A4F5EAD416128B74C519CECC803DCF4, dos archivos con hashes inicial/final iguales. La cobertura mantiene su alcance SQL/crypto; no acredita SDK, interfaz telefónica o gates.
