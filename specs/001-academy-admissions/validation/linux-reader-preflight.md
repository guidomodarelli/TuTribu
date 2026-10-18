# Lector nativo de Linux para WebKit

**T198/T208 siguen pendientes.** Este preflight comprueba una infraestructura de lectura compatible antes de repetir los ocho recorridos de la aplicación. La limitación de NVDA/WebKit en Windows y sus resultados anteriores permanecen en [la evidencia de interfaz](ui-and-accessibility.md). Un fixture de plataforma aprobado no acredita los recorridos de TuTribu ni reemplaza esa matriz.

GNOME documenta Orca sobre AT-SPI, incluyendo WebKitGTK y Chromium en [su introducción](https://teams.pages.gitlab.gnome.org/Websites/help.gnome.org/orca/introduction.html.gl). El [launcher oficial de Playwright](https://github.com/microsoft/playwright/blob/main/browser_patches/webkit/pw_run.sh) selecciona GTK en Linux con ventana, y WPE al usar `--headless`. Por eso el preflight usa navegadores reales con ventana en un display desechable de Ubuntu 24.04, Orca, Speech Dispatcher y audio nativo.

La prueba crea cuatro ventanas de control, Chromium/WebKit a 390/1280 px. Un servidor de loopback sirve únicamente canarios sintéticos. Cada entrada de teclado pasa por X11, después de comprobar que la ventana activa tenga el título único propio. Se comprueban foco real, activación y anuncio de una región viva inicialmente montada. El observador sólo acepta las líneas del backend Speech Dispatcher de Orca; descarta texto de DOM y la salida de fallback que puede existir sin un servidor de voz.

Además del texto que Orca envía al backend, se exige audio PCM no silencioso capturado del monitor PulseAudio en cada fase. Se espera silencio antes de enviar la siguiente acción. No se modifica Orca, no se inyectan anuncios y el código no sustituye al lector con un árbol accesible. Los procesos y el display pertenecen al runner desechable; el script rechaza el equipo local y no controla el escritorio del usuario.

El job recibe sólo el entorno sintético del setup de CI, sin claves de aplicación, acceso a Neon ni mensajería. Conserva el JSON numérico/booleano y capturas del canario; no publica logs de voz ni audio sin procesar. El reporte marca expresamente `productJourneysValidated: false`. La prueba de los recorridos reales y sus efectos SQL es el siguiente paso si esta infraestructura queda acreditada.

## Verificación

Los contratos locales verifican la distinción entre el backend nativo y sus fallbacks y entre PCM real y silencio, incluidos samples negativos y un último byte incompleto. La ejecución Linux y cualquier reparación se registran por separado; no se cambian las casillas de T198/T208 por este preflight.

El [primer run 39116424482](https://github.com/guidomodarelli/TuTribu/actions/runs/39116424482) instaló las dependencias y falló antes de abrir navegadores: cambiar `XDG_CACHE_HOME` durante la captura hizo que Playwright buscara sus binarios en una caché diferente de la usada al instalar. Las cuatro observaciones quedaron fallidas por ejecutable ausente; no acreditan un problema de la aplicación ni una limitación de Orca/WebKit. Se conserva el artefacto privado `.git/admission-reader-probe-first/report.json`.

La reparación fija `PLAYWRIGHT_BROWSERS_PATH` en el entorno del job, compartido por instalación y ejecución. No cambia los binarios, el lector, el teclado ni los criterios de voz/audio. La repetición debe acreditar todavía la infraestructura y después los recorridos reales.

El run `39116701532` falló al validar el workflow, antes de iniciar jobs: el contexto de runner no puede utilizarse en el bloque global de entorno. La ruta se calcula ahora en un paso del runner y se propaga por `GITHUB_ENV` antes de instalar y ejecutar Playwright. Este fallo de configuración también se conserva y no cuenta como prueba de lectores.

El [run 39116765248](https://github.com/guidomodarelli/TuTribu/actions/runs/39116765248) abrió Chromium 148.0.7778.96 y WebKit 26.4, con Orca 46.1 y Speech Dispatcher 0.12.0-rc2 reales. Las cuatro variantes fallaron esperando el anuncio requerido. WebKit a 1280 px sí emitió el foco y audio PCM con peak 13.143; no emitió el aviso dinámico esperado. Ese resultado acredita una señal nativa parcial del puente, no una variante aprobada ni el recorrido de la aplicación. Artefacto privado `.git/admission-reader-probe-second/report.json`.

La siguiente observación conserva los mismos criterios y agrega, sólo para este canario sin datos personales, una cola acotada de los mensajes enviados al backend y los identificadores de script de Orca. Se distinguen mensajes durante la carga de página de los exigidos después de la acción; no se toman eventos de DOM ni logs de fallback como voz.

La revisión del proveedor identificó que Orca 46.1 conserva el script WebKitGTK antiguo. GNOME lo convirtió al script web en [39ef597e](https://github.com/GNOME/orca/commit/39ef597e0ff6912ff500f248e602f47e8369435b), después de esa publicación. El runner prepara ahora la publicación oficial 47.2, fijada a `7da13d868338c4c75751155258b51a82ab273583`, sin parches al lector. Sus mínimos declarados de Python 3.10 y AT-SPI/atk-bridge 2.50 son compatibles con Ubuntu 24.04. Se conserva el resultado de la versión anterior y se registra la versión/commit realmente ejecutados en el recibo; los criterios de voz y audio siguen siendo los mismos.
