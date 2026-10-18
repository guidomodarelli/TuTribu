# Recorridos reales con el lector de Linux

T198/T208 permanecen abiertas. Esta suite traslada a CI las ocho superficies del ensayo supervisado: solicitud propia y revisión administrativa, Chromium/WebKit y 390/1280 px. No usa el canario de plataforma para certificar la aplicación.

`tests/manual/admission-linux-reader.native.test.ts` prepara ocho solicitantes sintéticos, sesiones Better Auth reales firmadas con la clave privada del servidor y una academia propia en una rama efímera. El servidor ejecuta el build de Next y los endpoints/casos de uso/repositorios reales. Las solicitudes iniciales se presentan por el API propio; no se sustituyen respuestas del producto ni librerías de UI/plataforma.

Cada pareja usa dos cuentas y contextos separados. El teclado nativo llega sólo a la ventana que coincide con el título real de su página. El solicitante confirma y cancela; el guardián escribe el motivo, confirma y aprueba. Se exigen el anuncio original enviado por Orca al backend y audio real posterior a cada acción. No se fuerza a leer el DOM ni se mueve el foco para fabricar el mensaje de éxito. SQL debe confirmar `cancelled`, `approved`, una membresía básica y cero entregas.

La sesión de lector y audio se comparte con el preflight mediante `run-admission-reader-session.sh`, que controla únicamente servicios de la VM desechable. No opera el escritorio del usuario. No se crean recursos productivos ni se envían mensajes.

El workflow `admission-reader-journeys.yml` exige un despacho manual, una API key temporal limitada al proyecto, un nonce de rama previsto externamente y el SHA exacto autorizado. Un push no consume esa capacidad. Sin ella no ejecuta checkout, SQL ni la suite nativa: un workflow verde con el paso omitido no acredita el ensayo. El owner debe conservar las tres ramas anteriores, confirmar la limpieza del recurso exacto y retirar su key/secreto/variables al terminar.

Los artefactos públicos se limitan a capturas sintéticas, observaciones de voz/audio y un resultado proyectado con conteos y códigos cerrados. Las URI, cookies, secretos, materiales de claves, logs brutos y el resultado crudo de Vitest no se suben. La ejecución real y sus resultados deben registrarse después de validar la capacidad; tipos o importación de la suite no cuentan como ocho recorridos aprobados.

El owner de capacidad deriva del ciclo ya ensayado de CI y prepara exactamente una rama, un secreto y dos variables. Sus diez contratos independientes aprobaron pérdida de respuesta, cleanup, preservación de cambios concurrentes y rechazo de un paso Native omitido/fallido. Usa el borde CLI propio, sin operaciones externas ni mocks de SDK. Sólo después de un checkpoint limpio puede emitir la capacidad limitada al proyecto. Registros privados `.git/codex-admission-reader-ci-owner*.mjs` y `.git/admission-reader-ci-owner-contracts.log`.

## Primera ejecución sobre la aplicación

El [run 39119835859](https://github.com/guidomodarelli/TuTribu/actions/runs/39119835859), sobre `9fdcf0bcc44d6d37488eb11272d8ff9e89899121`, instaló el lector y compiló la aplicación real. Vitest registró una prueba fallida con `native_reader_speech_missing`, cero aprobadas y cero omitidas. No registraba aún la etapa del fallo; ese resultado no permite atribuirlo al foco, al aviso de cancelación ni a la revisión administrativa.

La sesión siguió abierta después de escribir el reporte de Vitest. Se solicitó la cancelación y GitHub confirmó el estado terminal `cancelled`; la proyección y la subida del artefacto terminaron correctamente. El [resultado conservado](linux-reader-product-first-attempt.json) mantiene separados el fallo de la prueba y la cancelación del job. Ninguna de las ocho superficies queda acreditada.

El owner revocó la clave temporal, retiró el secreto y las dos variables, y confirmó la ausencia de la rama prevista. Una consulta independiente confirmó las tres ramas originales. No hubo mensajes reales.

Para localizar el siguiente resultado se guardan hitos fijos en `progress.json`, sin identificadores privados ni transcripciones. El wrapper propaga `DISPLAY` y las variables de accesibilidad a los servicios activados por D-Bus; también distingue el retorno del comando y el inicio/fin de su cleanup, que termina los procesos propios todavía activos después de concederles un segundo. Estos cambios de diagnóstico no acreditan por sí mismos un recorrido de producto.

## Repetición con diagnóstico de etapa

El [run 39120899104](https://github.com/guidomodarelli/TuTribu/actions/runs/39120899104), sobre `100f5d7ef0580a94263759109b12744c154533d7`, terminó por sí solo con `failure`. Preparó la base, el fixture y el servidor reales, y presentó las dos solicitudes iniciales de Chromium a 390 px. El último hito fue `public_confirmation_focus`: el control recibió foco, pero no se observó su nombre en la salida del backend de voz dentro del plazo. La prueba terminó con `native_reader_speech_missing`, cero aprobadas y cero omitidas. No llegó al anuncio de cancelación ni a las otras superficies; el fallo no permite atribuir un defecto al aviso de resultado de la aplicación.

La captura visible del job registró `reader_command_completed` con exit 1, `reader_session_cleanup_started`, `reader_session_cleanup_finished` y la finalización del paso con exit 1. Queda comprobado el cierre del wrapper; no fue necesario cancelar el workflow. D-Bus activó el portal GTK con acceso al display, corrigiendo el error de display observado en la primera ejecución. El [reporte saneado](linux-reader-product-focus.json) conserva el resultado, el hito y el cleanup.

El owner confirmó la revocación de la clave, el retiro del secreto y ambas variables y la ausencia de su rama, sin errores de cleanup. Una consulta independiente confirmó exactamente las tres ramas originales. El código del owner permaneció estable. Los dos workflows Quality gate del mismo commit, push y pull request, aprobaron; esto conserva separados los checks generales y el ensayo nativo fallido. T198/T208 permanecen abiertas.
