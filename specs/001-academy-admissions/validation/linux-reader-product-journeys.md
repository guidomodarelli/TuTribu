# Recorridos reales con el lector de Linux

T198/T208 permanecen abiertas. Esta suite traslada a CI las ocho superficies del ensayo supervisado: solicitud propia y revisión administrativa, Chromium/WebKit y 390/1280 px. No usa el canario de plataforma para certificar la aplicación.

`tests/manual/admission-linux-reader.native.test.ts` prepara ocho solicitantes sintéticos, sesiones Better Auth reales firmadas con la clave privada del servidor y una academia propia en una rama efímera. El servidor ejecuta el build de Next y los endpoints/casos de uso/repositorios reales. Las solicitudes iniciales se presentan por el API propio; no se sustituyen respuestas del producto ni librerías de UI/plataforma.

Cada pareja usa dos cuentas y contextos separados. El teclado nativo llega sólo a la ventana que coincide con el título real de su página. El solicitante confirma y cancela; el guardián escribe el motivo, confirma y aprueba. Se exigen el anuncio original enviado por Orca al backend y audio real posterior a cada acción. No se fuerza a leer el DOM ni se mueve el foco para fabricar el mensaje de éxito. SQL debe confirmar `cancelled`, `approved`, una membresía básica y cero entregas.

La sesión de lector y audio se comparte con el preflight mediante `run-admission-reader-session.sh`, que controla únicamente servicios de la VM desechable. No opera el escritorio del usuario. No se crean recursos productivos ni se envían mensajes.

El workflow `admission-reader-journeys.yml` exige una API key temporal limitada al proyecto, un nonce de rama previsto externamente y el SHA exacto autorizado. Sin esa capacidad no ejecuta checkout, SQL ni la suite nativa: un workflow verde con el paso omitido no acredita el ensayo. El owner debe conservar las tres ramas anteriores, confirmar la limpieza del recurso exacto y retirar su key/secreto/variables al terminar.

Los artefactos públicos se limitan a capturas sintéticas, observaciones de voz/audio y un resultado proyectado con conteos y códigos cerrados. Las URI, cookies, secretos, materiales de claves, logs brutos y el resultado crudo de Vitest no se suben. La ejecución real y sus resultados deben registrarse después de validar la capacidad; tipos o importación de la suite no cuentan como ocho recorridos aprobados.

El owner de capacidad deriva del ciclo ya ensayado de CI y prepara exactamente una rama, un secreto y dos variables. Sus diez contratos independientes aprobaron pérdida de respuesta, cleanup, preservación de cambios concurrentes y rechazo de un paso Native omitido/fallido. Usa el borde CLI propio, sin operaciones externas ni mocks de SDK. Sólo después de un checkpoint limpio puede emitir la capacidad limitada al proyecto. Registros privados `.git/codex-admission-reader-ci-owner*.mjs` y `.git/admission-reader-ci-owner-contracts.log`.
