# Comprobación de contacto: alcance visible y recuperación

Incremento de T098 sobre `a45f6ed3`. Se mantienen 115 tareas completadas y 97 pendientes de 212; T098 permanece abierta hasta acreditar su matriz completa. No se sustituyen los gates de entrega externa, otras fuentes o navegación de aplicación por pruebas del presenter.

## Brecha reproducida y cambio

FR-029 exige explicar el servicio conectado por el líder y los límites de comprobar un contacto. El paso existente aclaraba la academia y la solicitud, pero omitía dependencia de la cuenta de mensajería, identidad civil y pertenencia a WhatsApp. La regresión focal terminó roja por la explicación ausente: un fallo real, ocho casos fuera de selección. Se agregaron dos párrafos en español con las clases BEM existentes, sin cambiar permisos, requests, estado, validación o transporte.

El presenter sigue recibiendo props y callbacks; el container conserva cuenta/datos/acciones, el hook conserva cancelación/recuperación y el adapter guarda DTOs públicos propios. No se introduce otra fuente de datos, mock de plataforma, validación de filas/provider, constante de contrato o refresco de ruta.

## Evidencia local actual

- Cuatro archivos de pruebas existentes ejecutaron 46 casos verdes, cero fallos/omisiones: presenter, container común/pendiente y dos suites del hook.
- El presenter conserva la máscara y permite validar código vigente con transporte accepted/delivered/failed/unknown/suppressed/cancelled; esos estados no inventan proof ni ejecutan issue/resend.
- La alternativa SMS exige consentimiento y fin de espera, mantiene teléfono fijado y sólo ejecuta el callback explícito. El caso previo conserva ocultación cuando la alternativa no está permitida.
- Tres rechazos del puerto propio, por límite, indisponibilidad y credenciales, mantienen feedback visible y no permiten presentar ingreso sin proof. El retry explícito limpia el error anterior antes de resolver, muestra busy y acepta el desafío confirmado sin inventar comprobación.
- Casos existentes conservan vencimiento, limpieza de campos, resultado incierto/consulta del original, pérdida de cuenta, cancelación, observación independiente y adjunción a la misma pending sin renovar fechas.
- Después del CI se agregó una suite del hook con tres casos verdes adicionales, sin cambiar producto/build ni los cuatro archivos revisados. Comprueba la propuesta SMS explícita con el UUID original y sin autoridad de contacto en el body, reemplazo del desafío y limpieza del código, validación sólo del reemplazo, bloqueo temprano antes de autorización/escritura y conservación del original al retirar permiso o consentimiento. Tipos de tests y lint focal posteriores también pasan. Se distinguen estos tres casos de los 46 y del total de CI anteriores.
- Tipos de tests y lint terminaron con exit 0. CI terminó con exit 0: 451 suites y 4.669 casos verdes en 587,45 s; 168 suites/506 casos omitidos por gates propios. El build de Next 16.3.4 terminó correctamente después de compilar en 17,8 s y validar TypeScript en 6,3 s. Los casos omitidos no acreditan SQL ni navegador; la matriz Native adicional se ejecuta sobre este build.

Las pruebas de error usan dobles del puerto browser propio. React, beez-ui, Zod y browser storage se ejercitan realmente. Sus mensajes sintéticos representan DTOs seguros ya traducidos; no prueban la clasificación del SDK, acreditada por las matrices de los owners.

La revisión independiente de los cuatro archivos de código/tests terminó sin hallazgos accionables sobre HEAD `a45f6ed3`, con cuatro hashes inicial/final estables: manifiesto `DA19B7499A0CB8A1C71413823BDECB112AC35A62E9BC308EE4AC78DC20F97F09`. Confirmó el alcance de FR-029 y las regresiones de transporte/prueba, consentimiento SMS y limpieza de feedback. No se acreditaron CI/Native antes de terminar ni se cerró T098.

La suite adicional SMS también cerró con cero hallazgos y hash estable: `65C64142D174B70149FB38D1AB0E1AFBB41DB39AE973877EC3ECE4A76310D75C`. El conjunto local final de cinco archivos pasó 49 casos sin fallos ni omisiones. El manual incorpora cinco capturas nuevas del recorrido real con datos sintéticos, conserva las otras 31 y pasó dieciséis renders/interacciones en Chromium/WebKit a 1280/390, con exit 0, sin errores ni desbordes. Los checkers no tienen errores; conservan dos advertencias conocidas por documento local sin URL publicada y ausencia de catálogo central de traducciones. Sus 162 enlaces resuelven archivo y ancla.

La revisión documental detectó dos P3 aceptados sobre seis hashes estables, manifiesto `11A34B7E40F3F06C87D1271C13C405338F19B7A8D43FA04A10ADFCAFD7CC708D`: la entrada nueva se había agregado bajo una versión publicada en lugar de Unreleased, y la captura de pending se tomó durante la lectura posterior, con controles todavía ocupados. La entrada se movió al bloque vigente; la captura se repitió con espera de estado estable después del resultado terminal de la matriz que mantuvo sus archivos congelados. No se acredita el render anterior como validación del payload corregido.

La matriz Native original terminó con exit 0: cuatro casos verdes y cero omisiones/fallos, Chromium a 1280/390 en 226,48/214,47 s y WebKit a 1280/390 en 224,19/219,94 s. Ejercitó Next, Better Auth, PostgreSQL, crypto, beez-ui y SDK reales, con transporte cerrado, una emisión por caso, GET original tras respuesta perdida, código local y presentación pending con una prueba aplicada, sin membresía. Servidores y ramas propias se cerraron; el producto y sus cuatro hashes permanecieron iguales durante la ejecución. Esta matriz acredita la explicación y el recorrido común; no acredita los demás escenarios pendientes de T098.

Tras ese resultado terminal se ajustó únicamente la espera del test antes de la captura final: la casilla de cancelación debe estar disponible y el paso de comprobación anterior debe desaparecer. Tipos de tests y lint focal pasan. La repetición selecciona sólo Chromium a 1280 para recapturar este estado; los otros tres casos se distinguen como filtrados en esa nueva corrida. El producto y el build siguen siendo los de CI, sin cambios posteriores.

La repetición de captura terminó verde en 234,42 s, con un caso ejecutado y tres filtrados. El resultado final conserva cinco capturas, sin “Enviando código…” ni “Cancelando solicitud…” en la pending; esa pantalla conserva el contacto enmascarado y la solicitud pendiente sin volver a pedir comprobación. Se mantuvieron las otras 31 capturas. La revisión del ajuste del test cerró con cero hallazgos y hash estable: `13BDA0872AC5FCCF74EF1B5DEE96F1FCBFB382D09B62860F3F7928B59E148BF6`. La inspección visual del documento final confirma el estado estable; los checkers y 162 enlaces siguen sin errores.

El payload corregido terminó su QA adicional con exit 0: dieciséis renders y los controles reales de ambos índices, regreso, enlace directo/recarga, acordeones, Inicio, hoja de contenido móvil y puntos de captura en Chromium/WebKit a 1280/390. No hubo errores JavaScript, desbordes ni frames inválidos. Esta corrida corresponde a las capturas finales, diferenciada del render previo al fix.

La repetición de la revisión documental cerró con cero hallazgos accionables: los dos P3 están corregidos, cinco payloads coinciden con el asset, 31 capturas anteriores/scripts/estilos preservados y seis hashes estables, manifiesto `A021BC18569CBFCDA22B45894A3D5ECC4563167555D78E14B0D8EB26898E45D4`. La revisión no ejecutó QA; su salida terminal adicional fue confirmada por el proceso propietario después. T098 sigue abierta con 115 tareas completadas y 97 pendientes.

## Validación pendiente

| Cláusula de T098 | Evidencia actual y siguiente comprobación |
| --- | --- |
| Contacto/canal/destino enmascarado y acción explícita | Presenter/container locales verdes; Native común con FR-029 verde en ambos motores/tamaños, más repetición seleccionada de captura estable. |
| Espera, expiración y fallos | Componentes/hook cubren bloqueo de vencimiento, cooldown y feedback; backend T095–T097 acredita límites y rechazos. El ensayo UI actual no simula avance de diez minutos como si fuese SQL real. |
| Unknown/quota/provider down y código local validable | Seis estados del presenter y tres rechazos del puerto browser propio verdes; hook conserva operación incierta y consulta sin POST. Falta consolidar estos rechazos en el navegador real. |
| SMS alternativo al mismo número | Dos casos del presenter acreditan ocultación, consentimiento, espera y teléfono fijado; tres del hook acreditan body mínimo ligado al desafío original, reemplazo/code cleanup y bloqueo sin permiso/cooldown/consentimiento. T095 conserva la alternativa nativa SQL. Falta la elección completa desde UI contra los owners reales. |
| Feedback persistente y limpieza stale | Container acredita error visible, ausencia de éxito falso y limpieza antes del retry explícito; los hooks existentes descartan entregas anteriores y cancelan scope obsoleto. |
| Adjunción a misma pending | Container conserva request/version/plazo y no presenta otra solicitud; T096/T097 acreditan commit SQL/HTTP. Falta completar el recorrido de adjunción desde navegador. |
| Alcance de FR-029 y EC-42 | Nueva explicación antes de consentimiento y regresión local verde: contacto para esta academia, servicio conectado por líder, sin garantía de identidad civil o pertenencia WhatsApp; administración de pertenencia continúa explícita. |

El caso nativo de navegador comprueba la explicación antes del consentimiento en Chromium/WebKit a 1280/390 sobre el build de este cambio, y las cinco capturas corresponden a su repetición seleccionada estable. Renders del payload corregido y revisión final tienen resultado terminal. El checkpoint `e7747c26` está commiteado y subido; los tres manuales registran ese commit real conservando sus 79/89/86 rutas de fuente y sus scripts. T098 no se cierra con esta ampliación: queda por consolidar todos sus escenarios reales de UI y alternativa SMS/errores/attachment en navegador.
