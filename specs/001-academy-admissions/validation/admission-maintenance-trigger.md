# Disparadores portables de mantenimiento de admisión

## Alcance y estado

Incremento de T187 sobre `02e48e76676eb4b98b48471e1dd47da16d1665cf`: conectar el evento programado de Cloudflare y preparar un catch-up HTTP autorizado para el dispatcher ya existente. Las fuentes y recibos privados del ensayo conservan sus hashes. No se cierra T187 ni su dependencia T186: el inventario permanece en **181 completas, 31 pendientes, 212 totales**, con las 71 temáticas aprobadas intactas.

No hubo despliegue, migración productiva, configuración remota de Actions, alta de servicio, mensaje externo ni nueva rama Neon. Los gates y sus límites mantienen sus criterios originales. La [composición de mantenimiento](admission-messaging-maintenance.md), la [decisión por target](../../../docs/architecture/deployment-targets.htm#admission-maintenance-entrypoint) y el [manual operativo](../../../user-guides/internal-operations.html#admission-maintenance-triggers) son evidencias complementarias.

## Recorrido alcanzable

1. `wrangler.jsonc` conserva en su base los tres schedules anteriores y la nueva activación en `false`. El entorno optativo `admission-maintenance` apunta al mismo Worker `tutribu`, conserva los assets, repite su autorreferencia y agrega el cron de un minuto con activación exacta `true`.
2. `cloudflare/worker.ts` recibe el evento y delega al helper real. Éste selecciona `/api/maintenance/admission-messaging`, comprueba activación y secreto antes del primer fetch y ejecuta una petición al handler OpenNext con el mismo entorno y contexto. El wrapper no agrega reintentos; 202 y los fallos no confirman un recorrido completo.
3. `.github/workflows/admission-messaging-cron.yml` prepara un catch-up cada cinco minutos y una entrada manual, con concurrencia sin cancelación de la ejecución activa. El schedule se omite con la activación ausente; una ejecución manual sin preparación falla antes de acceder a HTTP.
4. `scripts/run-admission-maintenance.mjs` usa Node 24 y fetch nativo. Exige origen HTTPS o HTTP loopback, sin credenciales, path adicional, query ni fragmentos. Envía un GET con bearer, no sigue redirects, aplica sesenta segundos y nunca repite la petición. Descarta el cuerpo y sólo imprime campos cerrados de diagnóstico. Únicamente 200 produce exit code 0; un original ocupado o una respuesta perdida conserva incertidumbre y exit code 1.
5. La ruta protegida existente conserva su validación propia y el mapping de estados. El contrato mínimo de 200/202 y las opciones del trigger se comparten en MJS puro entre el productor HTTP, el adaptador Workers y el ejecutable Node; no se importa TypeScript desde el CLI ni se cambia el tipo global del paquete.

La configuración de un minuto y la de catch-up son opciones de preparación. No prueban puntualidad del scheduler ni obligan a activar ambos. Vercel Hobby mantiene pendiente un driver frecuente aprobado y medido; `vercel.json` no cambia.

## Pruebas locales de comportamiento

Comando ejecutado en Windows y nuevamente con Node Linux y dependencias Linux genuinas:

```text
pnpm exec vitest run tests/unit/config/cloudflare-scheduled-maintenance.test.ts tests/unit/config/admission-maintenance-catch-up.test.ts tests/unit/modules/messaging/infrastructure/admission-messaging-maintenance-handler.test.ts
```

Resultado: **48 casos distintos, tres archivos**, aprobados en cada entorno. Son los mismos 48 casos; no se suman entre plataformas.

| Contrato | Evidencia observable |
| --- | --- |
| Selección de ruta, activación exacta y secreto | 21 casos del adaptador programado, incluidos los recorridos anteriores. Activación ausente, `false`, `0`, `1` y `TRUE` detienen el nuevo recorrido antes del fetch. La llamada autorizada conserva método, path, bearer, entorno y contexto originales. |
| Catch-up y ejecutable Node reales | 17 casos con servidor HTTP loopback y proceso Node reales, sin mock de plataforma. 200, 202, 401 y 503; configuración incompleta sin petición; redirect sin reenvío; cancelación con una petición y resultado incierto. Salida y errores no contienen secreto, cuerpo ni causa privada. |
| Ruta protegida | Diez casos conservan autorización, entrada vacía y proyección del contrato público. La selección de 200/202 usa el contrato compartido sin modificar la conducta. |

Tipos de producto, tipos de tests y lint terminaron con exit code 0. El workflow pasó `actionlint` oficial 1.7.12; se comprobó el SHA256 de su distribución Windows contra el release oficial antes de usarla. No se alteraron hooks ni checks para ejecutar estos comandos.

La primera cohorte de pruebas conservó cuatro fallos por el warning de Node al importar un contrato TypeScript; la primera comprobación de tipos detectó dos fixtures sin `NODE_ENV`. Se corrigieron el borde ejecutable y los fixtures, sin silenciar warnings, antes de obtener el resultado anterior.

## Build y ejecución del Worker real

El primer `pnpm run build:cloudflare` de Windows completó Next y sus 56 páginas, pero OpenNext terminó con `EPERM` al crear un symlink de la dependencia de imágenes. Ese resultado **no** se considera build de Workers aprobado.

Se utilizó Ubuntu-22.04 ya instalado mediante WSL, en una carpeta temporal propia. Node Linux 24.21.0 se descargó de la distribución oficial y se verificó con `SHASUMS256.txt`. pnpm 12.6.0 instaló el lockfile congelado con dependencias de Linux. El permiso de lectura de paquetes ya autorizado se usó sólo en el entorno del proceso de instalación y se retiró antes del build; no se copió una credencial a archivos del ensayo.

El snapshot contenía **3.600 archivos de fuente**, sin `.env` privado, `.dev.vars`, `node_modules` ni outputs. `wrangler types --env admission-maintenance` y `pnpm exec opennextjs-cloudflare build --env admission-maintenance` terminaron con exit code 0 y generaron `.open-next/worker.js`. Los 3.600 hashes seguían idénticos después del build y las ejecuciones. Las variables del ensayo fueron sintéticas, con base apuntando exclusivamente a un puerto loopback cerrado, sin transporte de mensajes habilitado.

Wrangler real ejecutó `cloudflare/worker.ts` y el output OpenNext en su runtime local. Se ejercitaron la configuración base y el entorno optativo, cada uno en un proceso independiente:

| Configuración local | HTTP sin bearer | HTTP autorizado, configuración cerrada | Evento real `* * * * *` con configuración cerrada |
| --- | --- | --- | --- |
| Base, activación `false` | 401 | 503 | 500: invocación fallida visible |
| Entorno optativo, activación `true` | 401 | 503 | 500: invocación fallida visible |

El control de eventos de Wrangler fue `/cdn-cgi/local/scheduled`; no se simuló el handler mediante un import aislado. Estas ejecuciones prueban rechazo y fallo seguro, **no** un mantenimiento productivo exitoso, una cola saludable o su latencia. Los casos del helper y del CLI verifican por separado las ramas de éxito y el número de invocaciones.

El primer probe que abrió las dos variantes dentro del mismo proceso alcanzó el límite de heap durante la segunda; no se atribuyó éxito a esa cohorte. Se cerraron sus hijos propios y se ejecutó cada variante en un proceso separado. Ambos procesos terminaron con exit code 0 y los estados de la tabla. Finalmente se retiraron el runtime, clone, store y procesos propios de WSL; no se modificó la instalación compartida del sistema.

## Revisión y límites conservados

La documentación de arquitectura y los manuales de operaciones e índices describen la activación explícita y separan el resultado local del operativo. `check-manual.mjs` aprobó ambos manuales numerados sin errores; sus dos advertencias por archivo corresponden a documentos locales sin URL publicada y a la ausencia de un catálogo central de traducciones. El menú temático se validó como menú local, sin inventar secciones de aplicación ni capturas nuevas.

Chromium y WebKit a 1280 y 390 px aprobaron veinte vistas de los cinco documentos, ocho recorridos entre índices y la nueva ancla con recarga y regreso, y 177 destinos locales únicos. No hubo desbordes ni errores JavaScript. Otros cuatro recorridos comprobaron apertura directa mediante `file:`, hoja del índice, acordeón, Inicio y regreso al menú. Se inspeccionaron las vistas del contenido añadido; el esquema anterior se conserva y no se presenta como captura nueva de la app. El primer checker de enlaces omitía las anclas de glosario creadas en runtime y el primer control de acordeón asumía un estado cerrado después de `beforeprint`; se corrigieron esos oráculos antes de los resultados anteriores, sin modificar la navegación del manual.

La primera revisión aislada de Codex sobre los trece archivos de producto y tests terminó sin hallazgos accionables. Se comprobaron trece hashes modificados, seis de contexto y cinco de evidencia al inicio y al final; el dictamen privado tiene SHA256 `4dcd4c70118607f3fde250ab07f559fa7c3fdc907930b933301a8f917c100424`. Ese dictamen antecede a la evidencia Linux y a esta documentación, y no se usa para certificar esos resultados posteriores.

T187 continúa abierta por su auditoría íntegra y dependencia T186. SC-015, RG-08 y OG-05 siguen pendientes de infraestructura autorizada y saludable, ejecución frecuente real y mediciones exigidas. Un cronfile, un workflow, un 200 sintético o los fallos locales anteriores no los aprueban. Tampoco se cierran T178, T190, T191, T206 ni otras tareas por este incremento.
