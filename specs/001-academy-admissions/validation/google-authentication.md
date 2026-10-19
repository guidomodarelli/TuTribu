# Confirmación de cuenta con Google sin cerrar su sesión

T202 y OG-01 permanecen pendientes. El usuario eligió el 2026-10-18 confirmar nuevamente la cuenta mediante OAuth, conservando su sesión de Google. El incremento sustituye el requisito de un ingreso reciente a Google; no promete que Google solicite contraseña o huella. La matriz Gmail/Workspace/external y el target Workers conservan su evidencia pendiente.

## Causa del recorrido anterior

El árbol integrado `e381b383` pide `auth_time` firmado y un nonce propio para cada intención. La política sensible exige que esa autenticación tenga menos de diez minutos y esté ligada a la cuenta, sesión, tribu, operación y recurso actuales. El valor procede de `claims.auth_time`, nunca de la emisión del token o del callback. El proveedor nativo usa `prompt:consent`; volver a consentir no exige una nueva contraseña o llave de acceso.

La [documentación oficial de Security Bundle](https://developers.google.com/identity/siwg/security-bundle#authentication_time) establece que Google no admite que la aplicación solicite reautenticar la cuenta de Google. También distingue esa sesión de la que se establece al entrar a TuTribu. La [referencia OIDC](https://developers.google.com/identity/openid-connect/reference#authorization_endpoint) documenta `none`, `consent` y `select_account` para `prompt`; no documenta `login` ni `max_age` como una solución a este bloqueo.

Por eso un callback válido, con token nuevo, podía conservar la fecha anterior de ingreso a Google y no cumplir aquella política. No hay evidencia de que una caché de TuTribu explique ese comportamiento. Pedir salir de Google fue un workaround invasivo; no constituía una confirmación forzable dentro del producto. El incremento retira esa indicación de la interfaz y del manual.

## Decisión de producto e implementación

Se presentaron dos alternativas concretas para evitar exigir la desconexión de Google:

- Confirmar de nuevo la cuenta mediante OAuth, conservando la sesión de Google. Debe validarse un callback nuevo ligado al intento y no se prometerá una nueva contraseña o huella. **Cambia la regla actual de recencia**; no puede presentarse como cumplimiento del `auth_time` de diez minutos.
- Exigir una prueba reciente mediante un autenticador propio de TuTribu. Requiere definir alta segura, recuperación y compatibilidad; no se incorpora un factor por inferencia ni se reutilizan los códigos BYOK de una tribu como seguridad global.

El usuario eligió la primera. FR-032, TC-013, plan, modelo y contrato registran esa decisión. El decorador añade sólo el nonce del intento autorizado a la URL OAuth original; conserva state, PKCE y el login nativo. No solicita `auth_time`, `max_age` o un parámetro de reautenticación no soportado.

El writer conserva firma, cuenta/sujeto/correo, ambas sesiones, líder canónico, tribu, operación, recurso, retorno y nonce de un uso. Tras consumir el intento obtiene otra vez el reloj SQL y revalida su plazo y sesiones. La política pura exige un token emitido durante el intento actual —con precisión de segundos—, no futuro, con menos de diez minutos y todavía no vencido. Sólo después fija el momento de confirmación del servidor y una ventana inmutable de diez minutos. Un `iat` aislado o una cookie nueva no completan el protocolo.

Se conserva el campo físico `authenticated_at` y el interno `authenticatedAt`; las nuevas filas representan la confirmación de cuenta en TuTribu, no el ingreso original a Google. El esquema, las relaciones y las guardas SQL no cambian. Las evidencias previas conservan su vencimiento original, y leer o renovar una sesión no las extiende. No se incorpora un factor BYOK ni un autenticador nuevo.

## Validación del incremento

La prueba SQL dirigida reprodujo el rechazo anterior: respuesta firmada nueva con nonce correcto y `auth_time` ausente devolvió `consumed` sin evidencia. El resultado rojo conserva un caso fallido y ocho fuera del filtro, sin presentarlos como ejecutados. El caso se actualiza para exigir confirmación con `auth_time` ausente o antiguo, igualdad de fecha de confirmación y verificación, ventana de diez minutos y rechazo del replay. Otro caso rechaza una respuesta firmada emitida antes del intento aunque su ingreso a Google sea reciente.

El [recibo sanitizado](google-account-confirmation.json) conserva los resultados actuales y sus alcances:

- Regresión local de auth y pantalla: **197 casos aprobados, cero fallidos y 30 omitidos**. Los once casos puros nuevos cubren fechas elegibles, precisión temporal y cierres por emisión anterior/futura/antigua, expiración o fechas inválidas.
- Suite SQL completa: **diez casos aprobados, cero fallidos y cero omitidos**, en 267.274 ms. Incluye emisión con `auth_time` antiguo/ausente, consumo único concurrente, recencia inmutable, sesión vencida, alcance de recursos y rechazo de una respuesta anterior al intento. La primera ejecución completa conserva nueve aprobados y un fallo de expectativa: el test antiguo no incluía la ruta de conexiones ya autorizada por el producto. Se corrigió el contrato esperado explícito, sin ampliar rutas, y se repitió el archivo completo.
- Pantalla real de Next: **cuatro casos aprobados, cero fallidos y cero omitidos**, en 285.732 ms. Chromium/WebKit a 390/1280 por 900 px, con viewport efectivo comprobado: inicio explícito, nonce/state/PKCE, cuenta confirmada con ingreso Google antiguo, continuación y cookie vigente, respuesta anterior rechazada, intento vencido y ausencia de desborde. El transporte Google está controlado; UI, SDK, criptografía y PostgreSQL son reales. Se generaron dieciséis capturas de los cuatro estados.
- Build real de Next aprobado con **56 páginas**, configuración del piloto aislado y 2.138 inputs de ejecución sin cambios después del build ni durante ambos ensayos. Fixtures y archivos Native tampoco cambiaron durante esas ejecuciones. Tipos de producto/pruebas y lint focal aprobados; las omisiones locales no se cuentan como aprobaciones Native.

Ambos productores terminaron. La consulta independiente de Neon confirmó exactamente las cuatro ramas persistentes anteriores, sin temporales adicionales. No hubo mensajes reales. La integración del manual reemplaza seis capturas propias, agrega la confirmación y conserva los hashes de las otras veintisiete; sus controles documentales tienen una validación separada.

## Piloto real después del cambio

El servidor privado se volvió a iniciar desde el checkout principal con ese build y la misma configuración cifrada y rama aislada. En el navegador autenticado se eligió la cuenta del líder y se continuó en Google; no se cerró la sesión ni apareció otro desafío de contraseña, llave o biometría. TuTribu mostró «Cuenta confirmada». No se atribuye al proveedor una garantía de omitir esos desafíos en otro ingreso.

Después se recuperó el guardado original de países y cupos. La aplicación comprobó que no estaba registrado, pidió la confirmación explícita de reintento con sus mismos datos y guardó **versión 2: Argentina, diez códigos diarios y cero avisos diarios**, con cero consumos. Los timeouts de observación se resolvieron consultando el mismo intento; no originaron otro OAuth ni un segundo envío del guardado. La evidencia visual queda en el área privada de trabajo; no se publican cuenta, claves, tokens, nonce o destinatarios en este recibo.

Esta observación acredita el recorrido de la cuenta real de ese piloto. No completa la matriz Gmail/Workspace/external, Workers, preparación de canales, recepción de códigos ni otros gates; T202 y OG-01 siguen pendientes.

## Alcance final

El 2026-10-19 el usuario retiró de esta validación las cuentas Workspace y externa, y el target Workers. Con ese alcance, la cuenta Gmail del piloto real sobre Node y las suites que cubren `auth_time` antiguo o ausente, nonce de un uso, sesión, ámbito, fechas e intención acreditan T202 y OG-01. Workspace, cuentas externas y Workers no quedan validados por esta decisión.

## Cierre del incremento y documentación

El código está guardado en `6d3b04de40044eb11164cc6634afbe2457735270`; el [Quality gate del mismo commit](https://github.com/guidomodarelli/TuTribu/actions/runs/39180912178) terminó aprobado. La fuente de ejecución del recibo coincide con ese código y el piloto usa su compilación desde el checkout principal. El worktree previo de foco quedó archivado de forma recuperable después de verificar que estaba limpio, integrado y sin consumidores de runtime; el piloto y el proxy compartido se conservaron.

El manual de mensajería y ambos índices registran ese commit, con 129, 240 y 228 paths de código existentes, respectivamente. Se reemplazaron seis capturas de Google, se añadió la confirmación y se conservaron los hashes de las otras veintisiete. Las fuentes de las capturas se incorporaron desde los archivos reales del build, sin depender del servidor temporal que las produjo. Las fechas de los demás recorridos se mantuvieron.

El checker del manual y el índice detallado terminó con **cero errores**; los avisos corresponden a documentos locales sin URL de visor y a una aplicación sin catálogo central de traducciones. El menú temático se validó por su contrato de navegación. La QA final de los tres HTML y cuatro páginas `.htm` aprobó **28 vistas, cuatro recorridos y 217 destinos locales**, en Chromium/WebKit a 390/1280, sin errores de JavaScript o desbordes y con inputs estables. Incluye el ancla de confirmación, recarga, Inicio, hoja móvil del índice, acordeones y regreso al menú. El primer intento del arnés esperaba una clase de enlace de otro manual; se corrigió para usar el enlace real «Volver al menú de manuales» y se repitió la matriz completa.

Esta validación documental no equivale al cierre integral de T198/T208/T210/T211 ni de los gates operativos. No hubo nuevos envíos reales ni cambios productivos.

## Trazabilidad de lo inspeccionado

- `src/modules/auth/constants/auth-evidence-capture.ts`: solicitud mínima de claims y nonce.
- `src/modules/auth/constants/better-auth-config.ts`: consentimiento del proveedor nativo.
- `src/modules/auth/infrastructure/better-auth/google-identity-evidence-plugin.ts`: intención autorizada, nonce y verificación mediante el proveedor original.
- `src/modules/auth/infrastructure/better-auth/google-id-token-evidence-verifier.ts`: fecha de autenticación derivada del claim firmado.
- `src/modules/auth/domain/policies/recent-authentication.ts`: ventana y scope actuales.
- `src/modules/auth/domain/policies/google-account-confirmation.ts`: elegibilidad temporal de la respuesta firmada del intento actual.
- `src/modules/auth/constants/reauthentication-ui.ts`: confirmación y recuperación conservando la sesión de Google.
- `contracts/auth-evidence.md`, T011/T031/T032/T202, FR-032 y TC-013: contrato vigente. Las evidencias anteriores al cambio conservan su alcance histórico.
