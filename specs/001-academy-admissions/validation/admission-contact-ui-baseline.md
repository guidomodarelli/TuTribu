# Interfaz de comprobación de contacto

El paso común de código y prueba está conectado a la presentación inicial y a una pendiente propia. La validación de este incremento está completa, pero T098/T103/T104 conservan sus criterios restantes: siguen 97 de 212 tareas completas y 115 pendientes.

## Cambios guardados

- `5f5da4ff1a0f6ffcbf7dd10aba64a96a1bf6b6e8`: presenter, hook, adapter, referencias y aplicación en el container común; arquitectura, CHANGELOG y regresiones.
- `4fb2fd8e90cb5d8fb5c4444ba11e969616f3a8c7`: consentimiento bloqueado desde el primer render hasta resolver cuenta y referencias.
- `f18b5ee93d6d762ed57e054f67a65a8c09f296c9`: manuales, cinco capturas reales, arnés nativo y protección de sus diagnósticos privados.

Los tres checkpoints se commitearon y subieron normalmente a `feature/academy-admissions-spec`; local y remoto coincidieron después de cada push. No se creó PR, publicó documentación externa ni desplegó el producto.

## Comportamiento implementado

`AdmissionContainer` conserva la entrada única de datos y la cuenta actual. El hook posee acciones explícitas, cancelación, plazo de observación y recuperación; el presenter usa `beez-ui` real y SCSS/BEM sin consultar sesión, HTTP ni proveedor. OFF y anónimo omiten el paso. El reloj inicial procede del servidor y las referencias se restauran después del montaje.

Cada escritura comprueba la cuenta antes y después de la respuesta, conserva su UUID antes del POST y bloquea duplicaciones. El almacenamiento guarda referencias, sin código, destino, credencial, cookie, confirmación ni snapshot aceptado. La restauración consulta originales reales sin POST y desmarca el consentimiento. Una ausencia mantiene la referencia; no autoriza otra emisión.

El transporte se observa por separado y no bloquea comprobar un código vigente. Un reenvío cancela observaciones anteriores; una respuesta tardía no reemplaza el estado del desafío nuevo. El teléfono y país del código permanecen fijados en ambos formularios. La prueba permite presentar o aplicar a la misma pendiente/version, conservando fechas y sin conceder membresía o verificación global. Una prueba vencida permite reenvío explícito al mismo contacto. No se ejecuta `router.refresh` ordinario.

## Validación final

| Validación | Resultado y alcance |
| --- | --- |
| Regresión conjunta | 107 casos en 11 suites, 11,79 s; UI real, puertos propios, contratos y recuperación |
| Flujos existentes | 45 casos, 10,40 s; presentación, revisión y operaciones originales |
| Privacidad del arnés | 2 casos con Playwright real, 1,10 s; input deshabilitado y descarga autenticada fallida de fuente |
| Tipos y lint | Producción, tests y lint sin errores |
| Build del código `4fb2fd8` | Compilación 19,5 s, TypeScript 4 s, 46 páginas |
| Matriz nativa final | 4/4 casos, 911,21 s; Chromium y WebKit a 1280 y 390 px, sin skips |
| Manuales | 24 renders en ambos motores/tamaños; 16 frames en el manual propietario, navegación y anclas válidas |
| Enlaces | 177 enlaces relativos comprobados antes de actualizar la fuente; sus destinos y anclas se conservaron |

La matriz nativa usó Next real, cookie Better Auth firmada, PostgreSQL/crypto/SDK reales y transporte externo cerrado. Cada caso conservó una sola emisión, recuperó su respuesta perdida mediante GET, comprobó el código y presentó una pending con prueba aplicada. Acreditó una entrega, un evento, una prueba y cero membresías, sin overflow ni errores JS. Los tiempos por caso fueron 227,99 s, 224,53 s, 230,22 s y 223,31 s. Las cuatro ramas propias y sus servidores se cerraron y su eliminación fue comprobada.

La matriz final comenzó antes de incorporar el wrapper de privacidad del arnés; el código productivo y su build permanecieron inmutables. El wrapper y el exporter tienen su ejecución real independiente de las dos fallas controladas. No se acreditan entregas productivas pagas ni gates externos por estos resultados.

## Defectos reproducidos y corregidos

- La denegación de cuenta dejaba fase ocupada. La regresión fue roja y el fix libera controles con mensaje de sesión seguro.
- La restauración no tenía deadline y el GET de entrega sobrevivía al unmount. Ambas regresiones fueron rojas; los controllers conservan referencias y cancelan los requests.
- La recarga de un reenvío lo interpretaba como emisión. La recuperación reconoce sólo namespaces originales issue/resend completados.
- El formulario común permitía cambiar teléfono después de obtener prueba. Ambos formularios y el callback del container preservan ese contacto; el mensaje sigue editable.
- La UI habilitaba comprobar mientras el GET de transporte mantenía el bloqueo interno. La observación es ahora independiente.
- Una respuesta de entrega A sobrescribía B después del reenvío. La regresión intercalada fue roja y el guard descarta A aun si ignora el abort.
- El consentimiento podía habilitarse antes de terminar la restauración y luego perderse. La regresión del primer render fue roja; readiness bloquea controles y explica preparación sin afirmar envío.
- Los errores de Playwright podían incluir OTP o cookie. La entrada de código y el GET/body de fuentes devuelven errores fijos sin causa privada. Las pruebas reales usan aserciones booleanas para no imprimir datos privados.

Las revisiones independientes cerraron sin hallazgos accionables y conservaron sus hashes finales: código `C0DC08EC8B495EC4871A2F3695832BD3F27AF8F185B4A06D06B61E362210ED7C` (21 archivos); readiness `E44328570D4BE63D2B110C7A281C4FE3935E217C4777AD3ADF8883626669775A` (4); arquitectura/CHANGELOG `47AA060C37829E8C38E9E11EA6BC45A2445152BA0A20FDA5648898441763343A` (2); manuales/capturas/arnés `E088D192E0758D665CC15E8763BA64AAD3244DCA46D123AB571012208D743D68` (10).

## Evidencia previa y límites

Se conservan las corridas rojas: selector CSS Modules de captura inexistente; timeout de 30 s del interceptor de test; contenedor global vacío de alertas interpretado como error; consentimiento perdido al cargar WebKit. Un GET de proyecto Neon agotó 15 s antes de crear rama y se reejecutó sin repetir mutaciones. Una fixture de teléfono usó primero una etiqueta inexistente; se corrigió al copy real antes de acreditar el rojo del campo habilitado. Una revisión intermedia registró el cambio concurrente de una regresión y no declaró falso el manifiesto congelado.

Las cinco capturas sanitizadas corresponden a antes del código, respuesta perdida, código solicitado, código comprobado y pending con prueba. Los manuales registran fuente `4fb2fd8`, conservan las capturas anteriores y pasan los checkers con dos advertencias conocidas: documento local sin URL publicada y ausencia de catálogo i18n central. La herramienta de source-trace cambió newlines del script de navegación sin cambiar su contenido; se repuso el bloque canónico y la advertencia desapareció.

Faltan los siete AC completos por todos los canales/fuentes, recuperación de contactos vinculados, integración nominativa/allowlist, reevaluación y gates externos. Esta evidencia acredita el incremento común y su matriz; no cierra esas tareas ni la feature completa.