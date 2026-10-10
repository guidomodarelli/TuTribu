# Alternativa SMS y prueba de una solicitud pendiente

Incremento de T098 sobre `c190a5a7`. Conserva 115 tareas completadas y 97 pendientes de 212; no completa la tarea por preparar la matriz. El producto y el build validado en el checkpoint anterior permanecen iguales.

## Recorrido bajo prueba

La nueva suite usa la página real de una solicitud común pendiente, con fechas originales y contacto ausente. La cuenta nativa confirma el teléfono y el envío WhatsApp. La alternativa SMS se elige después de la espera real: sólo hay un reenvío, conserva el número y los presupuestos, reemplaza el desafío y limpia el código anterior. La prueba compara estados persistidos de ambos desafíos.

Después de emitir SMS, la fixture deja en cero el cupo de nuevos envíos y suspende su transporte sin invalidar el código. La misma UI comprueba localmente el código y aplica la prueba opaca a la solicitud original. Se exige una sola adjunción/auditoría, solicitud todavía pending con versión incrementada y fechas idénticas, contacto fijado y ninguna membresía o presentación adicional. Las acciones no agregan una navegación de documento ni refrescan la ruta completa.

El transporte HTTP propio es exclusivo de esta fixture. SDK, Better Auth, PostgreSQL, crypto, React, Next y beez-ui permanecen reales. El preload restringe método/path/credential/destino, remitente por canal, plantilla WhatsApp o texto SMS, fallback deshabilitado e idempotencia. La recepción se simula sólo por IPC privado; ningún código, cookie, credential, body o destino completo se escribe en evidencia o diagnósticos.

## Estado de validación

Tipos de tests y lint focal terminados correctamente; la advertencia inicial de un parámetro no usado se corrigió antes de congelar el target. La primera corrida selecciona Chromium a 1280 para detectar fallos del recorrido antes de ejecutar la matriz completa. Sus resultados terminales y la revisión independiente se registran antes del cierre del incremento. Los otros tres casos no se acreditan por esta selección.

La primera corrida terminó verde en 366,33 s: un caso ejecutado y tres filtrados, servidor/rama cerrados. Después se añadió un contador de solicitudes RSC, además de documentos, para detectar un refresco completo; también se comprueba un código incorrecto real antes del correcto y la limpieza de ese error al corregirlo. Tipos y lint pasan. La matriz ampliada se ejecuta sobre el producto/build anterior sin cambios, manteniendo sus dos archivos congelados.

La matriz ampliada sobre ese build terminó con dos casos Chromium verdes (411,22/404,74 s a 1280/390) y dos WebKit rojos (241,01/243,45 s) al esperar el campo de código tras la respuesta inicial. Sus dos hashes permanecieron estables. No se presenta el conjunto como verde. Se incorporó la consulta explícita del original cuando el browser conserva incertidumbre, siguiendo el recorrido existente de la suite telefónica y sin otro POST; su repetición sobre el build actualizado se registra antes del cierre.

La revisión del target inicial encontró dos ajustes aceptados del arnés: cierre garantizado del navegador si falla su setup o context.close, y exclusión de content de plantilla en SMS. El test inicial cambió después de su ejecución focal, por lo que su manifiesto no se presenta como estable final. La matriz en marcha conserva el target ampliado; los ajustes y sus resultados focales/revisión se registrarán después de su salida terminal. No hay cambios de producto ni se da por cerrada T098.

La cobertura de errores de proveedor y límites antes de emitir mantiene sus escenarios pendientes. Esta suite no acredita entregas pagas externas, gestión de pertenencia WhatsApp ni identidad civil; tampoco completa US5 o los gates operativos.

## Errores de emisión en navegador

Se agregó una suite complementaria con la misma UI/SDK/SQL reales y el preload compartido existente, sin modificarlo. Exige que cupo cero rechace antes de emitir o despachar y conserve un mensaje seguro; después de cambiar el cupo real, sólo un retry explícito permite emitir. El proveedor responde HTTP 503 a ese único envío. La consulta propia muestra entrega fallida y mantiene el código como entrada local separada, sin proof, solicitud, raw provider message ni otro despacho. Cuenta solicitudes RSC y documentos, verifica ausencia de refresco completo y conserva feedback hasta la nueva acción.

Tipos/lint de esta nueva suite terminaron verdes. Su primera selección Chromium a 1280 y la matriz SMS se ejecutan en dos ramas propias independientes sobre el mismo build inmutable; ninguna ejecución iniciada se presenta como verde sin resultado terminal.

La primera selección de errores fue roja al esperar un rechazo por cupo diario como si fuese el límite global de pedidos. La repetición diagnóstica mostró HTTP 201, un desafío, una entrega, un evento de pedido y cero envíos externos/pruebas/membresías, con código visible y controles libres. El cupo diario difiere el despacho; no rechaza necesariamente la creación del desafío. Se corrigió ese oráculo y se conserva la distinción.

La investigación reprodujo una brecha de producto adicional: el reader omitía `quota_exceeded` interno al buscar sólo códigos públicos y el hook descartaba `safeReason`. El reader ahora lo proyecta a `usage_limit_reached`; hook/container presentan el catálogo seguro sin ocultar la entrada del código. Una prueba roja del hook acreditó el feedback ausente antes del fix. Las cinco suites locales posteriores pasaron 51 casos, con tipos/lint verdes. Una revisión de seis hashes estables identificó y aceptó un P2 restante: el motivo anterior persistía durante un nuevo reenvío. La regresión de resend diferido fue roja y se agregó limpieza de delivery al iniciar issue/resend/SMS, conservándola al editar/verificar/consultar. La evidencia final distingue cada snapshot y no usa el build anterior como prueba del nuevo feedback.

La primera validación general observó además dos fallos del fixture de importación CSV: su fecha fija venció a las 08:00 UTC del día de ejecución. `confirm` aplica la vigencia real con Date.now; no era una regresión del producto. La fixture ahora conserva renderedAt actual y expiresAt a partir de la retención canónica, sin omitir la regla. Sus seis casos focales pasan. El conjunto final local de contacto e importación quedó verde; se registrará el CI terminal y su repetición sobre los archivos finales antes de acreditar el build.

La primera CI terminó roja y no llegó a build. Una segunda CI se interrumpió deliberadamente al aceptar otra carrera del feedback, con salida terminal y sin procesos propios restantes; no fue un timeout de observación ni se presenta como verde. Limpiar delivery no bastaba si un GET viejo seguía vivo durante resend. La nueva regresión intercaló GET antiguo y POST nuevo diferidos, confirmó el rojo y luego pasó al abortar las observaciones anteriores al iniciar issue/resend/SMS. La respuesta vieja que ignora abort se resuelve antes del POST y ya no restaura el motivo previo. Edición, verificación y lectura conservan su comportamiento. El conjunto local final pasó 59 casos, con tipos de producto/tests y lint global verdes; la revisión y nueva CI/build se registran contra el snapshot final.

La revisión final de código cerró con cero hallazgos, nueve hashes inicial/final estables sobre HEAD `c190a5a7`, manifiesto `E80E262D3AD9DBB749020D38D8E4F48347687B7ABD6DA6D0BA5022B69CEEE7C7`. La tercera CI se inicia contra ese target; build y Native nuevos sólo se acreditan al terminar. T098 permanece abierta con 115 completadas y 97 pendientes.

La tercera CI terminó con exit 0 sobre los nueve archivos congelados: lint, tipos de producto/tests, 452 suites y 4.676 casos verdes en 581,52 s; 170 suites/514 casos omitidos por gates propios. El build final compiló en 32,2 s, validó tipos en 7 s y generó 50 páginas. Las omisiones no acreditan SQL ni browser. La matriz SMS y la de errores se ejecutan ahora sobre este build, cada una en sus ramas propias; no se dan por verdes al iniciarlas. El incremento de código puede guardarse como checkpoint validado, mientras manuales, capturas y resultados Native completan el mismo trabajo sin cerrar T098.
