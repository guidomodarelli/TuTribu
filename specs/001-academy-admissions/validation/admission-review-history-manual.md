# Manual del historial por solicitud

El manual propietario `user-guides/academy-admissions.html` documenta el código guardado y subido en `f850a82619a29c93eb266c777ed7b1bc3630f491`. El menú temático, el índice detallado y la guía bajo `docs/user-manual/` enlazan `#review-request-history`. Mantiene español, escritorio y equipo interno como audiencia ya acordada. No publica el manual fuera del repositorio ni acredita US8 o un gate operativo.

## Recorrido y procedencia

La sección explica el acceso de líder y guardián activos desde el detalle permitido, los hechos mínimos y su atribución, orden y fechas, la consulta actualizada, continuación, regreso a la misma selección, tramo vacío y retirada del acceso al restaurar la página. Distingue expresamente este permiso por solicitud de la auditoría general exclusiva del líder. Los puntos **44–50** son nuevos y no alteran los anteriores.

Las cuatro capturas reales finales proceden del recorrido completo Chromium1280 de la [cohorte de UI](admission-review-history-ui.md): historial actual, tramo anterior, tramo vacío y acceso retirado. Utilizan datos sintéticos y el guard de privacidad original. No se usan las tres exportaciones incompletas de la primera matriz ni se altera el producto para obtener una imagen.

Los tres HTML registran el commit real del código mediante `source-trace.py diff` y `record`. La procedencia incluye la ruta, presentación, composición, contratos, reglas de fecha y pruebas versionadas. El manual final tiene **59 marcos**: incorpora cuatro y conserva exactamente el HTML y el orden de reglas de los **55 anteriores**. Conserva también las 92 declaraciones de propiedades, catorce fuentes locales incorporadas y el renderer reparado con SHA256 `cafedd788458056ff3887bf519f0f6ccdaec2d0d0072379e135cd1949477ef46`.

## Correcciones y comprobaciones finales

La primera comprobación renderizada detectó dos grupos de puntos que no seguían el orden visual. Se reasignaron sólo los siete puntos nuevos: actualizar, evento y atribución; regreso al detalle y vuelta a los recientes; vacío y rechazo. El primer recibo conserva una vista y el fallo. La siguiente matriz pasó doce vistas y cuatro recorridos, pero precede a dos subtítulos añadidos para separar la lectura de cada captura; no se cuenta como la validación final.

El checker estático detectó además dos listas contiguas a la figura anterior. Cada lista ya precedía a su propia captura; se añadieron los subtítulos para que los grupos fueran inequívocos. La navegación coincidía funcionalmente con el boilerplate vigente y difería sólo en finales de línea: se copió su forma canónica, sin cambiar el runtime. Las únicas autorizaciones de host del checker corresponden a atribuciones conservadas de licencias de fuentes y CSS (`scripts.sil.org`, `www.github.com`, `tailwindcss.com`); no son recursos de red requeridos por el manual.

La comprobación estática final de ambos manuales numerados termina sin errores. Las dos advertencias por archivo corresponden al documento local sin URL de publicación y a la aplicación sin catálogo central de traducciones. El menú temático se comprueba como menú local, sin inventar un flujo numerado ni una captura de la aplicación.

La validación final de los tres HTML pasó **doce vistas y cuatro recorridos avanzados**, con **184 enlaces válidos**, en Chromium/WebKit a 1280 y 390. Comprueba los 59 marcos, anclas y orden de puntos, ajuste y ausencia de desbordes, enlace directo y recarga, índice inferior, acordeón, Inicio, navegación de ida y vuelta y apertura directa de archivos sin conexión. La protección conservada de las capturas comprueba `inert`, foco bloqueado, etiqueta de consulta ya estable, escala uno, texto de campos de 16 px y bordes visibles. No hubo errores de script ni requests externos; los hashes permanecieron estables.

Recibos finales: `.git/codex-t182-review-history-manual-static-proof.json`, `-render-proof.json` y `-final-integrity-proof.json`. El HTML propietario final tiene SHA256 `135c72cf16fc6c8717ca2336047d58a96b39747656af0af082cba4603f0d2e1b`. Las imágenes finales por motor y ancho se inspeccionaron; los recibos previos se conservan por separado y no se suman como casos nuevos.

El checkpoint documental mantiene su revisión y workflow propios. El resultado del CI del código no se atribuye a las ediciones posteriores del manual ni sustituye estas comprobaciones de navegación y capturas.
