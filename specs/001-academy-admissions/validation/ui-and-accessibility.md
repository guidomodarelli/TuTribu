# Interfaz y accesibilidad de admisiones

> Alcance actualizado el 2026-10-19: por decisión del usuario, la auditoría con lector de pantalla salió de T198/T208. Los ensayos con Orca de abajo quedan como evidencia histórica; los recorridos pendientes cubren teclado, foco, nombres accesibles, SSR, hidratación, estados y permisos.

T198 y T208 conservan pendiente su auditoría integral. El último ensayo con Orca aprobó las ocho superficies de cancelación propia y aprobación individual descritas al final. Las comprobaciones de DOM, teclado y efectos SQL se mantienen separadas de la observación del lector de pantalla del sistema operativo.

## Ensayo con NVDA y defecto observado

La ejecución `.git/admission-screen-reader-native-c958f3c9/` abrió Chromium 155 de escritorio a 1280 px, con NVDA 2026.2 y su Visualizador de voz reales, una rama efímera y datos sintéticos. En la solicitud propia se observaron el nombre, rol y estado de la casilla, el botón de cancelación, la espera y el resultado «La solicitud fue cancelada» mediante teclado.

En la revisión administrativa se observaron los campos, sus ayudas, la confirmación y el botón de aprobación. El resultado quedó guardado y la pantalla mostró `Aprobada`, pero NVDA sólo anunció que el control no estaba disponible; el Visualizador de voz no mostró el mensaje de confirmación después de volver a observarlo. Se interrumpió el ensayo deliberadamente sin certificar el recorrido. Su proceso terminó con exit 1, los 3.639 inputs y los dos helpers estables. La ausencia de su rama propia se comprobó antes del siguiente ensayo. `nvda-observations.json` conserva las observaciones y capturas seleccionadas del recorrido sintético.

## Corrección y alcance de las comprobaciones

La revisión conserva ahora el mismo aviso `status` desde la presentación inicial, con prioridad `polite` y contenido completo `atomic`. Mientras está vacío queda recortado visualmente, disponible para accesibilidad y fuera del espacio de la grilla; no usa `display:none` ni se crea junto con el resultado. La solución sigue el patrón de [regiones vivas de ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions).

Dos casos reprodujeron primero la ausencia de la región inicial. Después del cambio, los 45 casos del contenedor pasaron con React, beez-ui y el contexto de Next reales; sólo el puerto HTTP propio usa resultados controlados. Los casos nuevos de aprobación y rechazo conservan la identidad del nodo hasta comunicar el resultado y comprueban que la acción no refresca la ruta. Pasaron lint, tipos de producto y tests; la compilación aislada `.git/t198-keyboard-build-8d10af92/` terminó con exit 0 y 3.639 inputs estables.

El código quedó guardado en `0a1e71172b1098b4ab867703afbfdf35df50f5ab`. Se compararon 2.064 archivos de ejecución entre ese commit y la copia del ensayo, normalizando sólo finales de línea, sin diferencias. Registro privado `.git/codex-reader-live-region-runtime-cohort.json`; esto no equipara sus distintos documentos o helpers de prueba.

Los manuales se vincularon a ese código. Pasaron dieciséis vistas y cuatro recorridos de navegación en Chromium/WebKit a 390/1280 px, 132 destinos locales y conservación de hashes. Registro `.git/codex-reader-live-region-final-docs-qa-result.json`. Los checks estáticos del manual temático y el índice detallado tienen cero errores; los hosts adicionales permitidos corresponden a las atribuciones SIL/DM Mono/Tailwind ya presentes en sus capturas, conservadas. Las dos advertencias por archivo corresponden a manuales locales sin URL publicada y a la ausencia de un catálogo de traducciones central. El menú temático se validó mediante su navegación real según su contrato propio.

## Repetición observada en Chromium

En `.git/admission-screen-reader-native-ebba706d/`, Chromium 155 a 1280 px completó por teclado la cancelación propia y la aprobación administrativa. El Visualizador real de NVDA anunció «La solicitud fue cancelada» y, con la corrección, «La decisión quedó guardada». La captura `chromium-1280-admin-completed.jpg` tiene SHA256 `04def886ae729580bb8ae3739752c80ec3ef29aa79c1d266719140e56f15c499`; el registro `nvda-observations.json` conserva su superficie y nonce propios.

La misma ejecución completó también ambos recorridos a 390 px, con los resultados anunciados por NVDA. Es una ventana de Windows con viewport reducido; no acredita un dispositivo móvil físico. Después de cada pareja, el harness emitió `owned_reader_effects_confirmed` tras comprobar SQL: solicitud pública `cancelled`, revisión `approved`, una membresía básica y cero entregas.

WebKit 26.4 en Windows presentó la página, pero NVDA anunció `unknown` y la integración del sistema expuso sólo la barra y el panel del navegador, sin los controles HTML. Se interrumpió de forma controlada antes de modificar la solicitud de WebKit; `webkit-1280-reader-limitation.json` conserva esa limitación. El caso agregado terminó con exit 1, los 3.639 inputs y las herramientas estables, sin diferencias. La consulta final confirmó que la rama propia ya no existe y que se conservaron las tres originales (`.git/codex-reader-final-cleanup.json`). NVDA se cerró al finalizar.

T198/T208 permanecen abiertas: cuatro superficies de Chromium observadas no completan las ocho requeridas, y el árbol accesible no sustituye un lector compatible. Ninguno de estos ensayos envió mensajes reales.

## Contraste posterior en Linux

El [ensayo real con Orca 51.1](linux-reader-product-journeys.md#resultado-del-contraste-de-transición), sobre `cfc3a631`, completó también las superficies pública y administrativa de Chromium a 390/1280, con voz/PCM y los dos hitos de efectos SQL confirmados. La espera acotada conservó los criterios de foco y permitió completar la revisión administrativa. WebKit siguió sin el anuncio dinámico en ambos tamaños; el caso agregado terminó fallido, sin omisiones y con retiro de sus recursos confirmado. Las cuatro superficies de Chromium y las ocho variantes del canario tienen recibos separados; ninguna se presenta como la matriz completa de producto. T198/T208 siguen abiertas.

## Matriz completa del lector después de corregir el foco

La [repetición sobre `1e32976d`](linux-reader-product-journeys.md#ocho-superficies-aprobadas-después-de-corregir-el-foco) aprobó su caso completo, sin fallos ni omisiones: ocho superficies de cancelación propia y aprobación individual en Chromium/WebKit, a 390/1280 px, con voz de Orca y PCM reales. Los cuatro pares confirmaron sus efectos SQL y cero entregas. El perfil GSettings se acredita mediante el log del job; el campo histórico de proyección falso se conserva y se explica por separado. Clave, secreto, variables y rama temporal retirados, cuatro ramas persistentes preservadas.

Esta evidencia resuelve la falta de anuncios de esos recorridos en WebKit. No convierte los ensayos anteriores fallidos en aprobados ni acredita dispositivos móviles físicos. El código de producto, esquema y dependencias del ensayo coincide con el árbol integrado `e381b383`; la auditoría de los demás estados, permisos y recorridos exigidos por T198/T208 sigue pendiente.

## Conexión de mensajería por pestañas

El rediseño de `/[slug]/academia/admissions/messaging/connections` organiza el asistente en Conexión, Canales, Pruebas, Activación y Seguridad, con resumen de estado y próximo paso. Los commits `432c5986` a `64318da8` de la rama del PR conservan autoridad, consentimientos, versiones y recuperación en el container; cambiar de pestaña no envía, guarda ni activa nada.

Los ocho recorridos nativos de mensajería (`tests/unit/modules/messaging/infrastructure/*-browser-ui.test.ts`) aprobaron los 32 casos en Chromium y WebKit a 390 y 1280 px, con Next, PostgreSQL de una rama propia y transporte de proveedor cerrado. Antes del rediseño fallaban también sobre `2846801a`: no registraban las claves MAC privadas que exige el ledger y el servidor de prueba usaba claves distintas a las del seed; la corrección de `40a8122c` comparte la configuración sintética y la registra. Las ramas propias de cada corrida quedaron retiradas.

Las capturas sintéticas de los ocho estados principales no muestran desbordes ni errores de página en ambos motores y anchos; la de WebKit a 390 px detectó un desborde del panel corregido en `9923c810`. El manual de mensajería se recapturó con el diseño nuevo y su verificación renderizada aprobó 33 marcos sin puntos desubicados, recortes ni desbordes en Chromium/WebKit 390/1280.

Esta evidencia no reemplaza la auditoría integral con lector de pantalla de T198/T208 ni la matriz canónica de admisión, que se registra por separado.

## Suite enfocada después de los pasos guiados

Sobre `0f5551d7` (pasos guiados de Habilitados, importación, invitaciones personales y solicitud del aspirante, integrados después en `7272c0da`), `pnpm exec playwright test -c playwright.admissions.config.ts` aprobó 28 de 28 casos en `chromium-mobile`, `chromium-desktop`, `webkit-mobile` y `webkit-desktop` (390 y 1280 px), en 2,1 h, con `next build` propio, una rama Neon por spec y transporte de proveedor cerrado. Cubre la decisión administrativa mixta e incierta con teclado, la revisión manual sin membresía hasta decidir, el reintento con otro contacto tras cancelar, el código nuevo para el mismo contacto y la falla terminal confirmada de correo, SMS y WhatsApp.

La corrida terminó con exit 1 por un error ajeno a los casos: Playwright forzó el cierre de su worker tras la última spec (`worker-3 process did not exit within 300000ms after stop`). La rama Neon de esa spec ya estaba borrada. Ningún caso envió mensajes reales.

T198/T208 siguen abiertas: esta suite no recorre todos los estados ON/OFF/cuenta equivocada/parcial/desconocido ni la matriz de permisos completa que piden esas tareas.

## Reglas: código ON/OFF, conflicto y canal sin preparar

`tests/unit/modules/academy-admissions/infrastructure/admission-policy-verification-browser-ui.test.ts`, sobre `b678e83b` con `next build` propio y una rama Neon por corrida, aprobó en Chromium/WebKit a 390/1280 px (405 s). En una política activa sin código, el líder activa «Comprobar el contacto con un código» y llega al resumen. Un cambio concurrente real (el teléfono exigido) sube la versión: el guardado muestra «La configuración cambió», «Reintentar» exige volver a confirmar y la base no cambia. Con la versión nueva, el servidor rechaza el código porque no hay canal preparado. La pantalla muestra «Todavía falta un requisito para guardar estos cambios» con «Ir a Conexión», y la base sigue sin código. Apagar el código en el mismo editor guarda el borrador como cambio real (versión +1). Hubo una sola navegación, sin errores de página ni desbordes. Antes de `b678e83b`, el mismo rechazo mostraba el aviso genérico de solicitudes.

`admission-batch-review-browser` aprobó 4/4 con el motivo opcional. `admission-review-browser-flow` y `admission-review-filters-browser` aprobaron en Chromium. En WebKit, el flujo de revisión cerró los contextos de ambos anchos y agotó el tiempo al cerrar el navegador, el cuelgue de stdio de WebKit en Windows ya observado. Los filtros en WebKit agotaron el tiempo en 390 y 1280, igual que la intermitencia previa en 1280. Ambos quedan como pendientes de motor para T198/T208.

## WebKit sin cuelgues de cierre en las suites nativas

Con `installExitedBrowserStdioRelease` en `vitest.setup.ts` (`6bdb40ac`), `admission-review-filters-browser` aprobó 4/4 y `admission-review-browser-flow` 2/2 (315 s) en Chromium y WebKit a 390/1280. WebKit llegó a `browser_closed`. Antes, ambas completaban el cuerpo en WebKit (`webkit-390-proof.json` sin errores, escrituras ni efectos) y agotaban el tiempo en `browser.close()`: en Windows, `WebKitNetworkProcess` heredaba los pipes de `Playwright.exe` y los mantenía abiertos. `playwright.admissions.config.ts` instala la misma liberación, que explica el `worker-3 process did not exit` de la corrida e2e de 28 casos.

La aprobación sin motivo quedó cubierta en Postgres real: el repositorio guarda `internal_reason` nulo y deniega un rechazo sin motivo (`admission-decision-atomicity`), y la ruta HTTP de Next aprueba con motivo vacío (`admission-mutation-http-flow`).

## Recaptura del manual con «Teléfono», motivo opcional y retiro

Con `ADMISSION_CAPTURE_SNIPPET`, sobre `17181e4e` y su `next build` propio, aprobaron `admission-review-browser-flow` (2/2), `admission-review-filters-browser` (4/4), `admission-pending-age-browser` (1/1), `admission-terminal-denial-browser` (1/1), `admission-policy-persistence` (7/7), `admission-manual-browser-flow` (2/2) y `admission-whatsapp-browser-ui` (2/2). Esa corrida regeneró los 32 marcos del manual con textos anteriores (`39ff8bd9`). `admission-batch-review-browser` falló una vez en WebKit 390, en `batch_review_stop_native_original_recovery_after_terminal_result`, y al repetirse aprobó 4/4 en Chromium/WebKit 390/1280 (837 s): se registra como intermitente. Los estados «Primero guardá las reglas de admisión» y el retiro de una integrante común no tienen todavía una suite que los capture.

## Entrega de aviso sin confirmar, vista por el líder

`notification-recovery-browser-ui` agregó el caso `unknown`: un aviso cuya entrega original quedó «Entrega sin confirmar». Aprobó en Chromium/WebKit a 390/1280 (413 s). El líder ve el estado, la alerta «El envío anterior puede haber sido aceptado…» y «Registrar recuperación» deshabilitado aun con el consentimiento marcado. No hubo POST de recuperación, errores de página ni desbordes, y la entrega quedó `unknown` en la versión 1. Cubre el hueco de T198 sobre una entrega `unknown` visible para el líder. T198 sigue abierta por la cuenta equivocada con contacto ajeno en el enlace común y por el teclado en las pantallas restantes.

## Reglas por teclado

En `admission-policy-verification-browser-ui`, el tramo que apaga el código se recorre solo con teclado: el foco llega a cada control, Enter navega «Atrás» y «Continuar», Espacio alterna «Comprobar el contacto con un código» y la confirmación, y Enter acciona «Guardar cambios». Se comprueba que el control tenga el foco antes de cada tecla. Aprobó en Chromium/WebKit 390/1280 (387 s), con una sola navegación y el guardado reflejado en la base (versión +1, código apagado). Junto con la bandeja administrativa y la pendiente propia ya cubiertas, el teclado queda probado también en Reglas. Faltan Habilitados/CSV, Invitaciones, Conexión y Avisos.
