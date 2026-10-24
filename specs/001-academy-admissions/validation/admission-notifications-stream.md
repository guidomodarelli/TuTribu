# Stream RSC de Avisos de admisión

## Síntoma

La respuesta de `/[slug]/academia/admissions/notifications` mandaba las cabeceras a los ~40 ms y el stream quedaba abierto unos 9 s. Chromium confirma la navegación con el primer chunk y muestra el esqueleto de `loading.tsx`. WebKit a veces la confirma recién al cerrar el stream, así que el toque en «Avisos» tardaba ~9,5 s en cambiar la pantalla.

## Protocolo

Una sonda temporal (no versionada) usó el mismo arnés que `tests/unit/modules/notifications/infrastructure/admission-notification-settings-entry-browser.test.ts`: rama Neon efímera propia, `prepareAdmissionEmailSettings` con un líder, `next build` + `next start` con auth y keyrings sintéticos, y el preload `tests/support/admission-query-counter.mjs` con `ADMISSION_QUERY_COUNTER_TRACE`. La traza guarda la forma de cada sentencia (placeholders, sin valores) y ahora también su inicio y fin en ms desde que llegó el request, para ver qué sentencia retiene cada chunk.

Por cada revisión, con su propio build: una carga de calentamiento, tres `GET` del documento HTML y tres `GET` con cabecera `rsc: 1`, leyendo el body chunk a chunk. Después, dos navegaciones cliente desde Solicitudes tocando «Avisos» en Chromium y WebKit a 1280 y 390 px. Cada viaje a Neon desde esta máquina ronda los 160 ms, así que los milisegundos dependen de la red. La métrica principal es la cantidad de viajes secuenciales. Datos: [admission-notifications-stream.json](admission-notifications-stream.json).

## Causa

El stream no espera ningún timer ni trabajo de `after()`: se cierra en el mismo milisegundo en que termina la última sentencia del request. Lo retiene el único boundary de la página, `NotificationSettingsContent` dentro del `<Suspense>` de `page.tsx`, mientras `GetAdmissionNotificationSettingsPageUseCase` encadena sus lecturas. El layout de plataforma corre en paralelo y termina antes (chunk de ~3,4 s).

La cadena de la página tenía unos 40 viajes, todos uno detrás de otro:

1. cuenta autenticada (1);
2. tribu por slug (transacción de 4);
3. preferencia propia: autoridad `readInbox` (6) y `getOwn` con su doble autorización dentro de la transacción (11);
4. ajustes de correo de la tribu: autoridad `readPolicy` (8) y `get` con su doble autorización (9);
5. recomprobación final de la cuenta (1).

El paso 4 esperaba al 3 solo para saber si el rol era líder (`canConfigureEmail`), aunque la lectura de correo vuelve a autorizar todo por su cuenta.

## Cambio

`GetAdmissionNotificationSettingsPageUseCase` lanza la lectura de preferencia y la de correo a la vez. Las dos solo leen y autorizan por separado, sin efectos. El correo se muestra únicamente si la preferencia confirma un líder. Un rechazo de la lectura de correo se ignora para quien no es líder y corta la página para un líder, como antes. La recomprobación final de cuenta y sesión no cambia. Para un guardián, la lectura de correo se rechaza en la autoridad antes de tocar la tabla, igual que antes.

No se movió contenido detrás de otro boundary: el encabezado ya se pinta con el esqueleto de `loading.tsx`, y el formulario necesita la preferencia, el correo y la cuenta recomprobada para pintarse.

## Antes y después (mediana de 3)

| Medida | Antes | Después | Delta |
|---|---|---|---|
| Cierre del stream HTML | 8.632 ms | 4.464 ms | −48 % |
| Cierre del stream RSC | 8.806 ms | 4.434 ms | −50 % |
| Viajes secuenciales por request de página completa | 45 | 27 | −40 % |
| Sentencias por request de página completa | 55 | 52 | −5 % |
| Chromium 1280: toque → formulario | 7.226 / 7.701 ms | 6.147 / 5.586 ms | −15 a −27 % |
| Chromium 390: toque → formulario | 7.714 / 7.682 ms | 4.583 / 5.022 ms | −35 a −41 % |
| WebKit 1280: toque → formulario | 9.256 / 10.664 ms | 7.601 / 7.571 ms | −18 a −29 % |
| WebKit 1280: fin de la respuesta RSC de la navegación | 8.788 / 10.302 ms | 7.213 / 7.069 ms | −18 a −31 % |

La navegación cliente solo pide el segmento de la página (5 transacciones). Ahí los viajes secuenciales bajan de 44 a 27–35, porque compite con las lecturas del navegador y a veces abre conexiones nuevas del pool. En la base, WebKit a 390 px no llegaba a navegar porque perdía el toque en la fila de secciones. Ese error lo corrige aparte la rama `fix/admission-notifications-entry-webkit`.

## Pendiente

Quedan unos 27 viajes. Los mayores son la doble autorización dentro de cada transacción y la resolución de autoridad repetida en preferencia y correo. Son decisiones de seguridad deliberadas: `ResolveAdmissionContextUseCase` aplica el permiso dos veces y los repositorios vuelven a autorizar después de leer. Reducirlas requiere revisar ese diseño, no solo esta página.
