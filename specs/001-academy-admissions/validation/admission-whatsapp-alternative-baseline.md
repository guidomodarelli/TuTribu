# Alternativa nativa de WhatsApp a SMS

Incremento de cobertura de T095/T096/T099 sobre `43e43a108350ee93912850ca1bdfe64d00c76fd5`. Mantiene 97/212 tareas completas y 115 pendientes.

El fixture telefónico ya contiene los campos inmutables del remitente y plantilla de WhatsApp, pero sólo prepara la capacidad SMS. La primera prueba fue roja con `missing_capability` y su rechazo quedó registrado como completed. Se agregó la capacidad WhatsApp coincidente en el fixture del caso, sin cambiar el recurso sellado ni el código productivo.

El caso nativo final exige política ON y alternativa explícita, utiliza PostgreSQL y crypto reales y espera el cooldown real. Comprueba mismo teléfono, invalidación del desafío anterior, replay del reenvío, rechazo del código viejo, prueba nueva única y dos eventos de pedido sobre el mismo subject. La corrida terminó verde en 218,26 s y confirmó cierre del servidor de prueba y eliminación de su rama propia. Tipos-tests y lint focal pasan; un caso ejecutado sin skips.

Esta ejecución es del owner SQL; no demuestra una entrega externa de WhatsApp/SMS, payload del SDK o interfaz telefónica completa. Los siete AC y los gates mantienen su alcance original.

La revisión read-only cerró sin hallazgos y con hash estable: manifiesto 39FA05A3FA7B45D3827F236DE2E5A5049439D5477880978BD731706893825350. Acredita el aspecto backend de US-05-AC-05; no lo confunde con entrega SDK, interfaz o gates externos.
