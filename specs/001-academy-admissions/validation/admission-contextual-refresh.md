# Refresco contextual de admisión

## Alcance

Continuación de T188 sobre `9833e4d5c6fac8111f37dbbd041d1cf7efd02e5c`. Se conservan los 212 IDs, criterios, dependencias y gates: 181 tareas completas y 31 pendientes, con 71 aprobaciones temáticas. El objetivo sigue incluyendo toda la implementación y sus verificaciones integrales.

La implementación incorpora refresco focal de quince segundos, foco y visibilidad, cancelación original y coalescing; interés compartido del navegador sin datos privados; lista abierta y contador; ventana de páginas cargadas del revisor; estado propio con identidad fija y parada terminal; igualdad de datos, conservación de drafts y feedback seguro. Los contenedores conservan sus comprobaciones nativas y los endpoints existentes siguen siendo la autoridad.

## Evidencia acumulada

El checkpoint anterior pasó su CI exacto: 5820 casos y 543 archivos aprobados, con 870 casos y 312 archivos omitidos; build real de 56 páginas. Ese resultado corresponde a la versión guardada anterior y no verifica este trabajo local.

Los escenarios de cancelación y refresco usan React, beez-ui y AbortController reales. Sólo se controlan los puertos propios y los hechos de foco/visibilidad que JSDOM no puede representar como navegador en primer plano. Los intervalos se prueban con reloj controlado: esa evidencia verifica comportamiento y no mide latencia operativa.

Se reprodujeron y corrigieron los siguientes casos: dos eventos de regreso al primer plano iniciaban dos lecturas; una marca pendiente podía perder una reconciliación solicitada mientras seguía activa una consulta anterior; y una resolución propia podía mostrarse junto a un resumen pendiente anterior. La suite completa actual pasó 120 casos en nueve archivos. Se mantienen las regresiones del centro de avisos y de los contenedores reales, con edición, confirmación y foco conservados; la lectura incompleta de varias páginas no reemplaza datos confirmados.

La revisión detectó y permitió reproducir tres fallos y dos recorridos adicionales: el interés compartido desaparecía durante una escritura; una lectura correcta no siempre limpiaba el fallo anterior al alternar consulta manual y automática; el segundo chequeo de sesión podía fallar conservando decisiones habilitadas; una decisión original recuperada mientras la revisión privada permanecía oculta refrescaba sólo el contador; y una lectura manual correcta conservaba la advertencia independiente del scheduler. Las regresiones del contenedor revisor y del centro reales reproducen la recuperación antes de terminar el GET de la bandeja, sin otro POST, y verifican ambas direcciones de recuperación del feedback. Los errores de acción siguen visibles después de una lectura correcta.

Otro caso reprodujo que una lectura manual de inbox anterior a una acción podía satisfacer su reconciliación posterior. La lectura ahora pertenece a la revisión propia con la que comenzó; sólo se une a una consulta de esa misma revisión, sustituye una anterior por un único sucesor y descarta su respuesta tardía. La regresión verifica el aborto original, la consulta posterior y la conservación de la lista y del contador actuales.

Los tipos del producto y de tests y el lint pasaron. El build posterior al último ajuste pasó con 56 páginas y su resultado fue consumido. Las revisiones del código y del escenario Native, realizadas con el mismo proveedor, terminaron sin hallazgos accionables. Los escenarios Native usan ese build real, sesiones sintéticas de Better Auth y ramas propias con todas las migraciones; crean y deciden solicitudes por HTTP real. El fallo recuperable de un inbox se introduce únicamente en su propio borde HTTP. No hay un driver externo ni envíos reales.

La primera corrida Native terminó con cero escenarios completos y cuatro fallidos, sin omisiones. Los cuatro llegaron a mostrar la solicitud y el aviso reales sin recarga, pero se detuvieron en una comprobación todavía demasiado amplia de pausa y reanudación. No acredita el recorrido completo ni el estado final propio. Corresponde al build anterior al último ajuste de coalescing; la fixture y ese build se conservaron durante la corrida. La siguiente reproducción separa los hechos nativos de foco y visibilidad, la ausencia de lecturas durante la pausa y la reanudación, antes de clasificar la causa. Las cuatro ramas propias se limpiaron: un inventario posterior confirmó los tres originales y ninguna temporal. No se cambia una condición de producto para obtener un resultado positivo.

La reproducción diagnóstica posterior confirmó que la página seguía con foco y visible después de abrir otra pestaña: el ensayo no había producido el estado que pretendía comprobar. Este comportamiento coincide con la [documentación de múltiples páginas de Playwright](https://playwright.dev/docs/pages#multiple-pages) y con la emulación de foco de la versión instalada. No demuestra un fallo del scheduler de la aplicación.

Un diagnóstico de capacidad independiente comprobó en Chromium y WebKit que los clicks dentro y fuera de un frame cambian su `document.hasFocus()` real y producen eventos nativos `focus`/`blur` con `isTrusted=true`. El nuevo escenario carga la ruta Next real, con sus sesiones, cookies, SQL, UI y peticiones originales, dentro de un frame del mismo origen. Sólo el control externo pertenece a la fixture; no se sustituyen propiedades DOM ni se disparan eventos sintéticos. La pausa se observa en las peticiones de ese documento, conservando los mismos dieciséis segundos de observación. Esta comprobación de foco no certifica percentiles, visibilidad de una pestaña física, entrega externa ni un driver saludable.

Una corrida posterior completó tres variantes y falló en Chromium móvil al comprobar la reconciliación de la acción propia. El diagnóstico aislado encontró que el GET correcto sí comenzaba después de la respuesta de la decisión y antes de tres segundos; la prueba también exigía recibir su respuesta dentro de ese mismo plazo. El oráculo actual conserva los tres segundos para el inicio, espera el final de esa misma petición con el timeout HTTP ordinario y rechaza cancelación, fallo o respuesta no exitosa. No cambia el scheduler ni sus tiempos de producto.

## Resultado del recorrido real

La matriz completa final de [refresco contextual](../../../tests/unit/modules/academy-admissions/infrastructure/admission-contextual-refresh-browser.test.ts) terminó con cuatro escenarios aprobados, ninguno fallido y ninguno omitido. Su resultado terminal y los cuatro artefactos fueron consumidos; las 3087 fuentes congeladas y el build usado permanecieron sin cambios. Cada variante creó y resolvió solicitudes por HTTP real, observó lista y aviso sin recarga, conservó datos ante un fallo recuperable, pausó las lecturas durante dieciséis segundos sin foco y las reanudó al volver. También comprobó la reconciliación de una decisión propia y el estado final de una solicitud resuelta por otra sesión, sin otro POST y con parada del polling terminal.

| Motor y ancho | Aviso visible (ms) | Fila visible (ms) | Inicio de GET propio tras la decisión (ms) | Estado propio final visible (ms) |
| --- | ---: | ---: | ---: | ---: |
| Chromium, 390 px | 11623 | 11626 | 1511 | 14718 |
| Chromium, 1280 px | 11629 | 11632 | 1739 | 14187 |
| WebKit, 390 px | 12129 | 12135 | 1759 | 12181 |
| WebKit, 1280 px | 12226 | 12232 | 1555 | 9601 |

Son observaciones individuales de estos cuatro recorridos, no percentiles ni mediciones de un driver externo saludable. La pérdida de foco pertenece al documento real dentro del frame; no acredita la visibilidad física de una pestaña en segundo plano. La cobertura integral ON/OFF, de lotes y de carga conserva sus verificaciones originales separadas. No se enviaron mensajes reales. Cada fixture eliminó su rama propia y el inventario posterior confirmó las tres ramas originales, sin ninguna adicional.

Los cuatro manuales e índices registran como fuente el código `2145e4c3a5259b5d2f7fa04ae0605a24abe78468`. Se conservaron las 59 capturas anteriores y se añadieron tres capturas reales con datos sintéticos. La comprobación documental final aprobó 24 vistas y ocho recorridos de navegación en ambos motores a 390 y 1280 px: 279 enlaces locales válidos, sin desbordes ni errores de JavaScript. Los tres documentos numerados pasaron la validación estática; las advertencias restantes corresponden a documentos locales sin URL publicada y a la ausencia de un catálogo central de traducciones. El menú se validó como menú local.

## Verificación automática del checkpoint

El [CI de `5c662591`](https://github.com/guidomodarelli/TuTribu/actions/runs/38997926852) aprobó lint y ambos chequeos de tipos. La suite completa terminó con 5862 casos aprobados, uno fallido y 874 omitidos; 548 archivos aprobados, uno fallido y 313 omitidos. El build de ese CI no llegó a ejecutarse. La falla pertenecía al ensayo de inicio tardío del mantenimiento: esperaba un presupuesto de observación exactamente igual a cero mientras combinaba `Date.now()` con un temporizador relativo nativo; el entorno observó un milisegundo restante.

Se corrigió el reloj propio de ese ensayo, sin modificar el coordinador ni sus límites: el temporizador sigue siendo real y la fuente de tiempo del puerto cruza explícitamente el plazo original antes de resolver el inicio tardío. Los casos en el instante del vencimiento y un milisegundo después exigen que no comience trabajo de negocio, que no se anuncie un nuevo run registrado y que la observación final conserve cero presupuesto. La suite focal aprobó sus 13 casos. Las pruebas funcionales de refresco y sus capturas corresponden al código de producto anterior, que esta corrección de testing no modifica.

## Trabajo requerido antes del cierre

Guardar y subir normalmente este checkpoint y consumir su CI propio. Ninguna prueba de reloj controlado, declaración de timer o componente aislado certifica SC-015 ni los gates de hosting, recuperación o piloto real. T188 y sus dependencias conservan el alcance y estado originales hasta completar su verificación integral: no se modificó ninguno de los 212 IDs, descripciones, dependencias o checkboxes ni las 71 aprobaciones temáticas.
