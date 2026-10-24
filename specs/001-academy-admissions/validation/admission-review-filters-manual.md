# Manual de filtros de admisión

El manual propietario sigue siendo `user-guides/academy-admissions.html`. Este incremento documenta la selección de la bandeja sobre el código guardado y subido en `50ea53ffa6ea5d26838efb8a4ee465f30217be7c`; no cierra T182, T189, T190 ni el objetivo completo. El inventario conserva **174 completas y 38 pendientes de 212**.

## Contenido y procedencia

La sección `#review-filters` explica búsqueda de hasta cien caracteres, estados, origen, motivo de excepción y comprobación como requisitos actuales independientes, fechas UTC y su formato alternativo, aplicación explícita, selección persistida en la dirección, detalle, recarga, paginación de tramos vacíos y reset de las ediciones sin aplicar. Distingue los requisitos de la autorización de una decisión y conserva la justificación y la confirmación de la excepción.

El menú por temas y `application-flows.html` enlazan ese recorrido. Las tres páginas registran el commit real del código, los paths documentados y su comparación con la procedencia anterior. Mantienen español, escritorio y equipo interno como audiencia ya acordada; no se publican fuera del repositorio por este trabajo.

Se actualiza la captura de la bandeja inicial y se incorporan selección aplicada, tramo vacío y detalle. Los otros 51 snapshots conservan exactamente su HTML y el orden de sus reglas. Los nuevos puntos usan **32–43**, sin colisiones con los treinta puntos anteriores del mismo bloque y con dos cifras legibles en móvil. El renderer real conserva su ajuste al ancho disponible y el ResizeObserver diferido; las 92 declaraciones de propiedades y catorce fuentes incorporadas mantienen los estilos publicados sin conexión.

## Verificaciones y correcciones

La primera comprobación estática detectó colisiones con puntos ya usados por la configuración. Se reservaron inicialmente números mayores y después se ajustaron a un rango libre de dos cifras. El chequeo canónico pasa sin errores; sus dos advertencias corresponden al documento local sin URL de publicación y a una aplicación sin catálogo central de traducciones.

La primera comprobación de interacción exigía cancelar un evento de formulario disparado artificialmente. El marco ya tiene `inert`: la verificación pertinente comprueba esa propiedad nativa y que el campo no puede recibir foco. Se corrigió el chequeo, conservando el comportamiento del renderer y la captura. El fallo y sus recibos se preservan por separado.

El borrador pasó **doce vistas y cuatro recorridos avanzados**, con **182 enlaces válidos**, en Chromium/WebKit a 1280 y 390. Ese recibo precede a la trazabilidad final y al último ajuste de puntos. La inspección visual detectó además un texto de botón saliente de Motion dentro de la captura aplicada: se conserva la captura inicial y se repite el recorrido real esperando que ese texto abandone el DOM. La comprobación final exige una etiqueta de consulta ya estable, además del modo inerte, tamaño de texto y bordes visibles.

## Validación final del contenido

El recorrido definitivo de captura terminó con **un aprobado, cero fallos y tres fuera del filtro**: sólo Chromium1280 seleccionado, 2031 inputs estables y el mismo build/producto de 1775 archivos. Sus cuatro capturas definitivas conservan el guard de privacidad y el texto de consulta estable. Los dos móviles del reset terminaron dos/cero, con dos de escritorio fuera del filtro; la matriz anterior de cuatro casos y esas repeticiones conservan cohortes separadas y no se suman como casos distintos. No hubo operaciones, entregas ni cambios en las tres solicitudes del fixture.

La validación final de las tres páginas pasó **doce vistas y cuatro recorridos avanzados**, con **182 enlaces válidos** y hashes estables, en Chromium/WebKit a 1280 y 390. Comprueba los 55 marcos, puntos y orden, ausencia de recortes o desbordes, navegación de ida y vuelta, ancla y recarga, índice inferior, acordeón e Inicio, apertura directa de archivos sin conexión, modo inerte y foco bloqueado, consulta estable, texto de campos de 16 px, escala uno y bordes visibles. No hubo errores de script ni requests externos. La inspección visual final conserva sus capturas por motor y ancho. Recibo `.git/codex-t182-review-filters-manual-render-proof.json`.

El primer intento de esta validación final se conserva como **incompleto**, con doce vistas y tres recorridos avanzados confirmados por su progreso, sin dictamen final. Se detuvo sólo el proceso propio verificado por su comando y se repitió con registro por etapa, límites de acción y cierre de conexiones del servidor local; no se modificó el producto ni el renderer para obtener el resultado. No se suma ese intento al aprobado final.

La conciliación oficial posterior confirmó cero ramas temporales propias y conservó producción, el piloto y la rama ajena. El [CI completo del código guardado](https://github.com/guidomodarelli/TuTribu/actions/runs/38832871181) pasó 526 archivos y 5503 casos, con 282 archivos y 816 casos omitidos y build de 54 páginas. El checkpoint documental conserva su propia revisión y workflow; el resultado del núcleo no se atribuye a sus ediciones posteriores. Ningún checkbox ni gate operativo se da por cerrado.
