# Manual de avisos de admisión

El [manual temático](../../../user-guides/academy-admission-notifications.html) documenta el código guardado en `eccd547fb00b9423b13cf5a6c8dd27445ce8ffc8`. Tiene **24 marcos y 22 capturas reales distintas**, con cuentas y datos sintéticos. Se abre directamente como archivo y se enlaza desde el menú de **17 temas**, el índice detallado, admisión y notificaciones. Este trabajo no publica un sitio.

## Alcance y fuente

El recorrido cubre las entradas desde solicitudes y configuración, frecuencia personal de líder y guardián, habilitación y zona del correo, validación, confirmación reciente, resultado original, respuesta perdida, started, ausencia, conflicto, rechazo de capacidad, fallo de lectura, preparación de Google y cambio o pérdida de autoridad. Distingue el guardado implementado de la agrupación y entrega automática todavía pendientes.

Los cinco HTML modificados registran el código fuente guardado mediante `source-trace.py`. Se compararon previamente con su fuente anterior. Los manuales con capturas registran también `package.json` y `pnpm-lock.yaml` para seguir los cambios de estilos publicados. Las 52 capturas anteriores de admisión se conservan sin alterar sus datos ni atribuirles una recaptura. El registro temático añade sus tres responsables de contenido faltantes y mantiene las políticas existentes.

## Casos Native adicionales

| Archivo completo | Casos actuales | Resultado |
| --- | --- | --- |
| `admission-notification-settings-browser-variants.test.ts` | Validación y recuperación, con ramas, procesos y recencia independientes | Dos aprobados; 2020 inputs registrados y estables, sin exclusiones. |
| `admission-notification-settings-entry-browser.test.ts` | Entrada desde solicitudes y desde configuración mediante los enlaces reales | Uno aprobado; 2020 inputs estables, ajustes de correo sin escribir y cero entregas. |

Los casos usan Better Auth, cookies, PostgreSQL, Drizzle, controles de beez-ui y Next reales. Las simulaciones están sólo en respuestas o esperas del HTTP propio. No reemplazan SDKs ni componentes de plataforma. La recuperación conserva el body original, distingue lease vigente y vencido, continúa una sola vez y exige consentimiento nuevo. El fallo de lectura se recupera sin repetir un guardado; una preparación fallida de Google y un cambio nativo de cuenta conservan el original.

El primer ensayo de trece estados dentro de un único caso agotó 600000 ms y terminó 0/1. Se preservaron su resultado y las cinco capturas parciales. La consulta directa de pg no encontró locks o transacciones bloqueados. Se verificó la ausencia del proceso Next propio y se retiró sólo su rama mediante receipt exacto. La repetición separó dos recorridos completos con el mismo límite de 600000 ms por caso; ambos pasaron. El intento fallido no se suma como aprobado.

Estos tres casos se añaden a los 102 del código guardado: **105 casos distintos en once archivos completos**. Los 95 locales se superponen con el CI ordinario y no se suman otra vez a sus 5476 casos. No se enviaron mensajes reales ni se añadieron políticas OTP.

## Comprobación del documento

Los cuatro manuales numerados pasaron `check-manual.mjs` sin errores. El menú temático se comprobó como menú local, según `user-guides/AGENTS.md`; no se convirtió en una réplica del menú de la aplicación.

La validación real de navegador aprobó **veinte vistas**: cinco documentos en Chromium y WebKit a 1280 y 390 píxeles. Los **227 enlaces** locales y sus anclas resuelven destinos existentes. Los cuatro recorridos avanzados comprobaron enlace directo y recarga con ancla, hoja del índice, puntos en ambos sentidos, acordeones, Inicio, regreso al menú, entrada desde ambos índices y apertura por archivo. No hubo desbordes, errores de JavaScript ni solicitudes externas. Los veinte resultados conservan sus hashes de entrada estables.

Las referencias de los puntos usan el texto completo que existe en cada captura. El estado con Google preparado señala su aviso y el enlace visible; el botón de preparación se documenta en el estado que lo contiene. Los controles no se reconstruyen ni se editan para aparentar otro estado.

La revisión visual identificó dos problemas del entorno de reproducción: el ajuste tomaba el ancho de la ventana en vez del marco lector y faltaban los registros CSS `@property` que recibe la aplicación real. Los dos manuales con capturas ahora usan el ancho disponible y copian las 92 declaraciones originales del CSS publicado de `@guidomodarelli/beez-ui` 0.13.0, conservando el ajuste diferido de `ResizeObserver`. Los datos y reglas de las capturas permanecen iguales. Los cuatro controles de lectura del manual nuevo verificaron **escala 1, campos de 16 px y bordes de 1 px** en ambos motores y tamaños. Se revisaron además imágenes actuales de entrada, correo y pérdida de permisos.

Las fuentes DM Sans y DM Mono y sus licencias están incorporadas a los cinco documentos. Los enlaces externos de fuentes anteriores se retiraron. Las referencias de licencia a `www.github.com`, `scripts.sil.org` y `tailwindcss.com` son texto inerte y se permiten explícitamente en el comprobador; la comprobación de navegador exige cero solicitudes externas.

Quedan dos advertencias esperadas del comprobador: no hay URL de publicación porque el documento es local, y la app no tiene un catálogo de traducciones para contrastar automáticamente el copy. Las etiquetas y mensajes se contrastaron con el código y las capturas reales en español. Las doce vistas actuales de arquitectura también aprobaron el enlace al manual.

## Recursos y límites

La conciliación oficial posterior confirma **cero ramas Neon temporales propias** y conserva producción, el piloto original y `dev-sandbox-guido`. Los cinco exports actuales se preservaron antes de cualquier archivo del checkout de validación. El worktree instalado sigue identificado y disponible para la continuación; no se borraron recursos ajenos.

El [CI del código `eccd547f`](https://github.com/guidomodarelli/TuTribu/actions/runs/38818701359) aprobó 525 archivos y 5476 casos, con 279 archivos y 809 casos omitidos, además de lint, tipos y build de 54 páginas. Su watcher terminó con código cero. No certifica este manual ni sus pruebas posteriores; éstos conservan las comprobaciones independientes anteriores y requieren su propio checkpoint.

El inventario sigue en **212 tareas, 174 completas y 38 pendientes**. T184, T185, US8, T208 y T211 conservan su alcance completo pendiente; documentar ajustes no certifica agrupación, entrega, un scheduler o los gates operativos.
