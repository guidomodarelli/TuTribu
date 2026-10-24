# Disponibilidad de lotes en el manual interno

La sección `user-guides/internal-operations.html#admission-batch-api` documenta el código guardado y subido en `33bc645fee9dd6a8f432d669b23788f75e3ca4e8`. El menú temático y el índice detallado enlazan esa capacidad backend. Conserva **175 tareas completas y 37 pendientes de 212**; no cierra T176/T183, la selección múltiple T189, los seis AC de US8 ni los gates.

El texto explica quién puede resolver un lote, la selección explícita y versión de cada solicitud, resultados individuales, notas separadas, consulta del original y autoridad vigente antes de replay o recuperación. Distingue las integraciones disponibles de la selección múltiple todavía ausente en la bandeja y enlaza el recorrido individual existente. Conserva pendientes las variantes integrales y los avisos; no promete una entrega externa.

Los tres HTML compararon su procedencia y registraron mediante `source-trace.py` el commit real del código. Sus listas de fuentes documentadas tienen 224, 128 y 116 paths existentes, respectivamente. El esquema anterior y su clasificación se conservan; hay **un esquema existente, cero app-frames y ninguna captura nueva**. No se inventa una pantalla de lote para ilustrar una API.

## Fuentes y funcionamiento sin conexión

La primera validación renderizada confirmó tres vistas y un recorrido avanzado, pero falló por solicitudes a Google Fonts. Ese recibo no acredita el resultado final. El manual interno todavía usaba tres links de fuentes remotas, mientras el menú ya tenía las mismas familias incorporadas.

Se copiaron exactamente los cinco `@font-face` existentes de DM Sans —400, 500 y 600— y DM Mono —400 y 500— y sus licencias desde el menú. Se retiraron los tres links remotos. Se conservan familias y pesos, navegación y el esquema original; no se reemplaza la tipografía por un fallback ni se relaja la comprobación de red. La normalización del script de navegación mantiene el mismo runtime del boilerplate vigente.

## Verificación final

- Los chequeos estáticos de ambos manuales numerados terminaron sin errores. Las dos advertencias por archivo corresponden al documento local sin URL publicada y a la ausencia de un catálogo central de traducciones.
- Las tres páginas pasaron **doce vistas y cuatro recorridos avanzados**, con **189 enlaces válidos**, en Chromium/WebKit a 1280 y 390. Los hashes permanecieron estables; no hubo desbordes, errores de script ni requests externos.
- Se comprobaron enlace directo y recarga, índice inferior, ida y vuelta al menú, índice detallado, acordeón, Inicio, los dos sentidos del punto anterior y apertura directa de archivos sin conexión. Se preserva el esquema y no aparece un formulario o captura de selección múltiple.
- Se inspeccionaron cuatro imágenes de la sección nueva, una por motor y ancho. Son comprobaciones del documento real; no se agregan como mockups de producto al manual.

Recibos `.git/codex-t183-batch-manual-static-proof.json`, `-render-proof.json`, `-offline-font-proof.json` y `-detail-images.json`. El fallo previo de fuentes permanece en `-external-fonts-render-failure.json`, separado del aprobado final. No se suman esas vistas previas como validaciones nuevas.

El [CI exacto del código](https://github.com/guidomodarelli/TuTribu/actions/runs/38852713182) pasó 531 archivos y 5595 casos, con 287 archivos y 824 casos omitidos y build de 55 páginas. Esas omisiones no sustituyen los dos Native ejecutados y registrados en [la evidencia HTTP](batch-decisions-http.md). El checkpoint documental conserva su revisión y workflow propios; el CI del código no valida las ediciones posteriores de texto y fuentes locales.
