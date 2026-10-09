# Despacho telefónico con SDK real y transporte cerrado

Incremento de cobertura de T100/T106 sobre `2e9ce13ddefecd718c954b346bcfb526b5cb3618`. Mantiene 97/212 tareas completas y 115 pendientes.

La prueba ya existente del sender cubre payload por canal, pero usa una preparación de puerto. Los nuevos casos SMS/WhatsApp unen factory de admisión, cuenta nativa, owner SQL, resolver de la entrega concreta, claim/marker, preparación privada y SDK real. El transporte propio permite sólo el POST del proveedor registrado; no se utilizan credenciales ni contactos reales.

Los casos comprueban cero transacciones durante HTTP, credencial y remitente de la conexión original, mismo teléfono, fallback deshabilitado y payload explícito. WhatsApp usa la plantilla y sus variables, mientras SMS usa texto. El código se conserva sólo en memoria y las aserciones sobre cuerpo/headers usan booleanos para no imprimirlo ante fallos.

La aceptación del proveedor confirma intento y reserva consumida, pero mantiene cero pruebas y miembros hasta que se valida localmente el código. El replay no agrega otro POST. Después de verificar se exige una sola prueba y sigue sin membresía.

La corrida SQL/crypto/SDK final pasó dos casos en 292,22 s, sin skips: SMS 145,11 s y WhatsApp 141,16 s. Ambas ramas propias se eliminaron y se comprobó su ausencia. La regresión de sender/dispatcher pasó 30 casos locales en tres suites. Tipos-tests y lint focal pasan. El alcance es transporte real del SDK con HTTP cerrado, no entrega productiva paga ni interfaz telefónica completa; los restantes AC y gates permanecen pendientes.

La revisión read-only cerró sin hallazgos accionables y conservó el hash inicial/final: manifiesto A578C8C2118BA5458EDE59E0377EC59705AED3513A27F3BEC7593AE2D746F7A6. No se cierran tareas ni gates por estos dos casos.
