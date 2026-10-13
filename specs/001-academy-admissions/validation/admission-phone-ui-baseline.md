# Interfaz telefónica nativa de admisión

Las ocho combinaciones SMS/WhatsApp, Chromium/WebKit y 1280/390 px pasan sobre el target final congelado. Incremento de cobertura de T098/T103/T104 sobre `67bedda62596916ff8e2e4e5908c6b9a69c83df6`; mantiene 97/212 tareas completas y 115 pendientes.

El arnés utiliza Next real, cookie Better Auth firmada, PostgreSQL, criptografía y SDK con transporte externo cerrado. Cada caso confirma teléfono/país y envío, comprueba el código local y presenta una única pending con prueba aplicada y cero miembros. Comprueba contacto bloqueado en ambas partes del formulario, un POST de emisión, una solicitud al proveedor, ausencia de overflow y errores JS. Los errores de entrada de teléfono/código se sanitizan; código, cookies y credenciales no se imprimen ni persisten en evidencias.

## Resultados del mismo target final

| Canal | Motor | 1280 px | 390 px |
| --- | --- | --- | --- |
| SMS | Chromium | 211,644 s | 216,430 s |
| SMS | WebKit | 211,171 s | 211,253 s |
| WhatsApp | Chromium | 214,442 s | 212,214 s |
| WhatsApp | WebKit | 207,595 s | 222,132 s |

La cobertura se obtuvo en tres ejecuciones, con `RUN_ADMISSION_BROWSER_TESTS=1` y `pnpm exec vitest run tests/unit/modules/academy-admissions/infrastructure/admission-phone-browser-ui.test.ts --reporter verbose`:

- Focal `-t 'sms code on webkit at 1280'`: 1/1 verde en 213,14 s; siete casos deliberadamente no seleccionados.
- Resto WebKit `-t 'sms code on webkit at 390|whatsapp code on webkit'`: 3/3 verdes en 642,81 s; cinco casos deliberadamente no seleccionados.
- Chromium `-t 'code on chromium'`: 4/4 verdes en 856,54 s; cuatro casos deliberadamente no seleccionados.

Los filtros no deshabilitan casos ni representan una sola corrida de ocho tests. En conjunto ejercen las ocho combinaciones del mismo archivo sin cambios entre ejecuciones. Cada workflow cerró después de confirmar la eliminación de su rama temporal propia. El build productivo permaneció sin cambios durante todos los ensayos.

## Respuesta incierta y recuperación real

La matriz inicial cerró con cuatro Chromium verdes y cuatro fallos WebKit en 1798,18 s: el test esperaba exclusivamente que apareciera el código tras el POST. El diagnóstico focal midió un único POST que WebKit terminó por timeout a los 66 369 ms; las tres consultas de sesión respondieron 200, los campos y consentimiento seguían correctos y no había errores JS. PostgreSQL ya tenía un desafío, una entrega, un evento de uso y una operación reales, sin prueba ni membresía. El aviso público era `contact_uncertain`.

El arnés omitía el recorrido implementado para esa respuesta incierta. Se corrigió para pulsar explícitamente «Consultar operación del código», recuperar la operación original por GET y esperar el código privado del dispatcher real antes de validarlo. Conserva un único POST y un único envío. No altera el fetch del navegador, no simula una respuesta de éxito ni amplía el deadline productivo. Los diagnósticos sólo contienen catálogo público, booleanos, conteos y status.

## Transporte y regresión de correo

El preload propio acepta WhatsApp sólo con canal, remitente, destinatario y plantilla explícitos, variable de código válida y fallback deshabilitado. Conserva los perfiles email/SMS y cierra toda red externa no registrada. No cambia código productivo ni una conexión real.

La regresión `RUN_ADMISSION_SQL_TESTS=1 pnpm exec vitest run tests/unit/modules/academy-admissions/infrastructure/admission-contact-verification-http-flow.test.ts --reporter verbose` pasó 1/1, sin skips, en 436,11 s (434,387 s el caso). Ejerció las rutas Next de correo con SDK real, envío/reenvío explícito, recuperación de fallo original, verificación local después de suspender conexión/cuota y prueba aplicada a la misma pending sin otro envío o membresía. Su rama propia también se eliminó.

## Revisión y alcance pendiente

Tipos-tests y lint focal del target final pasan. La revisión Codex aislada read-only cerró sin hallazgos accionables, con 2/2 hashes estables en el manifiesto `0CC19C97A25AEDA2C4227586061883B5163B4C548DD3E73A8145BCF8A495EEE5`. La revisión inicial conservó el manifiesto `8C329EB316743DCE21948821714F0EEAC4A2794AD5F58ACB57216AA18121F874` durante la matriz roja; se repitió tras corregir el arnés. No hubo fallback de proveedor ni diagnósticos materiales del reviewer.

Faltan los recorridos telefónicos de errores/límites y alternativa SMS en navegador, attachment de pending en navegador y todos los AC por fuente/canal. La prueba de adjunción SQL está documentada en `admission-phone-pending-baseline.md`; no sustituye su recorrido visual. Estos resultados no acreditan rendimiento productivo, ensayos ON externos ni gates operativos y no cierran tareas parcialmente construidas.
