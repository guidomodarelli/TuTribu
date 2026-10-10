# Ensayo ON externo de verificación de contacto

Preparación sobre `9ca50aa9`. Estado: preparado para revisión, no autorizado ni ejecutado. Complementa [la matriz local](contact-verification-channel-requirements-baseline.md) y [los gates operativos](operational-gates.md), sin sustituir ni aprobar OG-01 a OG-06. T106 permanece abierta; el objetivo conserva las 212 tareas.

## Alcance concreto propuesto

Dos tribus de prueba aisladas, un líder autorizado con conexiones Zavu propias y un solicitante de prueba que controla los destinos. Se ensaya correo, SMS y WhatsApp por separado; la política admite un tipo de contacto por tribu, por lo que correo y teléfono requieren configuración y conexiones independientes del mismo líder. No se cambia el tipo fijo de una academia activada. En la tribu telefónica, cambiar el canal principal SMS a WhatsApp y habilitar su alternativa exige comandos versionados explícitos y recursos preparados; no se simula ese cambio con SQL administrativo.

| Ensayo | Destino y recurso que debe confirmar el usuario | Máximo de POST externos |
| --- | --- | --- |
| Correo | Buzón controlado, sender de correo y dominio ya verificado | 3: diagnóstico, código inicial y reenvío explícito |
| SMS | Teléfono controlado, país E.164 y sender SMS preparado | 3: diagnóstico, código inicial y reenvío explícito |
| WhatsApp con alternativa explícita | El mismo teléfono, sender/plantilla Authentication/idioma preparados y sender SMS de la misma tribu | 4: diagnóstico WhatsApp, diagnóstico SMS, código WhatsApp y reemplazo SMS consentido |

Tope del piloto: diez POST externos entre ambos scopes de tribu, incluidos los intentos fallidos o inciertos. Este conteo no establece una tarifa ni garantiza un costo; el pagador fija también un presupuesto monetario y su medio de control antes de comenzar. Si una capacidad ya posee diagnóstico real vigente, no se repite para consumir el máximo. Un ensayo parcial acredita sólo el canal/versión efectivamente observado; no se marca preparado otro canal.

El mismo solicitante usa seis pedidos y quince códigos incorrectos entre los tres recorridos. Se programan tres ventanas separadas por la expiración efectiva del historial horario: cada recorrido empieza con capacidad para sus cinco fallos y valida el código nuevo antes de agotar los diez fallos por hora. Se conservan los máximos de veinte fallos por día y cinco pedidos por hora/veinte por día acumulados de cuenta/contacto. Dos recorridos consecutivos con cinco fallos cada uno cerrarían la validación local del segundo, incluso después del reenvío; no se los programa dentro de la misma ventana móvil. No se borran eventos ni se cambia de propósito/canal para eludir límites. Los diagnósticos del líder conservan sus propios límites. La alternativa SMS reemplaza el código WhatsApp al mismo teléfono y comparte consumo; nunca se habilita fallback automático.

## Preparación previa y datos faltantes

1. Elegir el entorno de prueba y su URL, las dos tribus y cuentas participantes. El target del repositorio es Vercel activo o Cloudflare Workers alternativo; cualquier despliegue nuevo necesita autorización separada. No se despliega por este plan.
2. Acreditar OG-01 y OG-02: cliente Google ya preparado, callback/recencia firmados, roles actuales, hosting, keyrings separados, época y recuperación cerrada. Hasta entonces no se guardan credenciales operativas ni se activa una conexión real. No se modifica el proyecto OAuth por inferencia.
3. El líder carga su credencial mediante el formulario privado autorizado y el backend; no se pega una key, cookie, código ni conexión de base de datos en chat, fixtures, logs o evidencia. Se registra sólo referencia opaca del recurso y versión. La ausencia de credencial no puede usar una key global de TuTribu.
4. Confirmar dueño/pagador, presupuesto monetario, canales permitidos y destinos concretos en un registro privado autorizado. En el repositorio se guarda sólo un identificador opaco de autorización, fecha, alcance y booleanos de aprobación, sin PII completa.
5. Comprobar acceso efectivo a cada recurso con la key de su tribu, país permitido antes de diagnóstico telefónico, sender explícito y plantilla/idioma actuales. No crear sender, plantilla, DNS o cuenta Meta sin autorización específica. Registrar `isTestMode` observado y el entorno efectivo.
6. Mantener las notificaciones externas de admisión apagadas durante este piloto. Los pasos de admisión ON requieren la activación autorizada de las tribus de prueba mediante su flujo real, después de cerrar OG-06 y los demás prerrequisitos aplicables. Si falta ese cierre, sólo se puede preparar el ensayo y no ejecutar ni simular su marker. El piloto no activa otras academias o producción por inferencia.

Faltan entorno/URL y disponibilidad de los prerrequisitos, cuentas/destinos, credenciales y recursos del líder, autorización del pagador y techo monetario. Esta lista describe los datos necesarios para concretar el ensayo; no autoriza el envío.

## Ejecución y evidencia por canal

1. Leer la cuenta/sesión/rol, política ON, conexión/versión/capability y versión efectiva de uso; confirmar el scope privado exacto. Capturar sólo metadatos permitidos y tiempos, nunca material de autenticación.
2. El líder pide el diagnóstico expresamente, recibe el mensaje en el destino autorizado e introduce el código en el formulario. Registrar recepción real, canal y remitente observados; la aceptación HTTP por sí sola no acredita recepción ni contacto del solicitante.
3. El solicitante confirma un pedido de código de admisión. Registrar el marker y versión efectiva, un único POST, reserva/consumo y estado de transporte. Confirmar que todavía no hay proof, canje, binding ni membresía.
4. Introducir cinco códigos incorrectos y comprobar el rechazo terminal, sin otro envío ni prueba. Un reenvío explícito tras la espera debe conservar los fallos acumulados. Para WhatsApp usar la alternativa SMS expresamente permitida al mismo número en ese reemplazo; comprobar invalidación del desafío anterior, nuevo canal y cuotas históricas.
5. Introducir el código nuevo correcto dentro de su plazo. Debe crear sólo una proof propia para cuenta/contacto/tribu/propósito actuales. Comparar invariantes globales de ambas identidades mediante información privada procesada en el backend, exportando sólo booleanos; no modificar login, recovery, linking o `emailVerified`.
6. Guardar por caso el scope opaco, fecha, commit, entorno, autorización, versiones solicitada/autorizada/actual, conteos, expected/observed y resultado terminal. Atribuir la evidencia exclusivamente a ese canal/versión y conservar cualquier fallo o recepción no confirmada.

Los demás negativos de scope, vencimiento, ownership y países ya tienen evidencia local SQL/UI/SDK según la matriz; no se extrapola este piloto a un escenario externo que no ejecutó. OG-04 conserva su ensayo de deduplicación autorizado separado: no se provoca pérdida de respuesta, rePOST o `409` deliberado dentro de este piloto básico. Si el proceso queda `unknown`, se conserva consumo y sólo se consulta un ID propio conocido; no se reutiliza el presupuesto restante para reenviar automáticamente. OG-05 tampoco se aprueba por este recorrido focal.

## Fuentes revalidadas para la preparación

Consulta oficial de 2026-10-10, sin llamada autenticada ni envío: la key de prueba de Zavu entrega WhatsApp real al equipo desde su sandbox y no acredita senders propios ni correo/SMS productivos. El piloto debe registrar el modo real; un prefijo de key o una prueba sintética no certifica OG-03. [Zavu Authentication](https://docs.zavu.dev/authentication).

El correo exige dominio propio verificado, y la plantilla WhatsApp de autenticación exige preparación y aprobación aplicables al recurso real. Estos requisitos se verifican para la cuenta aportada, sin prometer costos o latencia ni ejecutar configuraciones externas. [Zavu Email Setup](https://docs.zavu.dev/guides/email/setup), [Zavu OTP Authentication](https://docs.zavu.dev/guides/whatsapp/templates/otp).

La enumeración de remitentes es paginada; se consulta sólo el proyecto accesible y el DTO propio excluye secretos y payload raw. El SDK instalado y sus tipos prevalecen sobre ejemplos antiguos para la invocación concreta. [Zavu List Senders](https://docs.zavu.dev/api-reference/list-senders).
