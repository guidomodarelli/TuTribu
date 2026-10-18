# Interfaz y accesibilidad de admisiones

T198 y T208 siguen pendientes. Las comprobaciones de DOM, teclado y efectos SQL no sustituyen la observación de un lector de pantalla del sistema operativo.

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
