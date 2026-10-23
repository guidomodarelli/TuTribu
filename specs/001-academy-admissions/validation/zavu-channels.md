# Validación local de mensajería y runtimes

Fuente de producto:4c3ec071a2b5f51427f3d62102d86b110159dee0. Los cambios posteriores df4315be son documentales y no alteran el código compilado. Este informe conserva el alcance de T094 y no acredita los gates OG-01, OG-02 ni OG-03, Google externo, BYOK de un líder real, destino/pagador, mensajes reales o hosting desplegado.

## Disponibilidad del piloto local, 18 de octubre de 2026

La consulta de `https://dev-tutribu.app/test/academia/admissions/messaging/connections` terminó en `ERR_CONNECTION_REFUSED`. El nombre resolvió a loopback y no había un listener local en el puerto 443. La inspección de procesos no encontró un comando Next o portless en ejecución. No pudo consultarse desde la interfaz la conexión que el usuario había guardado.

La configuración del checkout principal conserva autenticación y cliente Google, con origen `https://dev-tutribu.app`, pero no define keyrings, época, entorno ni recovery lock de mensajería. La inspección registró únicamente presencia de variables y origen; nunca valores de credenciales. El starter actual del repositorio usa `https://dev.tutribu.app`, que difiere del origen configurado del piloto anterior. Recuperar ese servidor requiere resolver el origen y su configuración externa de claves antes de reutilizar la conexión cifrada. Esta comprobación no inicia envíos ni altera las tres ramas protegidas; T106/T204/T205 conservan su pendiente.

El [piloto nuevo posterior](isolated-local-pilot.md) ya conserva servidor, configuración cifrada y conexión candidata comprobada; el checkpoint de indisponibilidad anterior sigue siendo histórico. La [preparación real de Zavu](admission-pilot-provider-preparation.json) confirmó producción y saldo positivo, únicamente WhatsApp habilitado, sin correo/SMS ni plantillas previas. Se creó una plantilla Authentication en español y se solicitó su aprobación: pasó de pendiente en la respuesta a rechazada en el panel. La causa requiere acceso a Meta; el estado de pago de plantillas también permanece sin preparar. No se atribuye el rechazo a una causa no informada, no se repitió el POST y se conservan cero mensajes reales. Este avance no acredita los siete AC por canal, recepción, cien operaciones A/B ni idempotencia externa; T106/T204/T205 siguen pendientes.

Después del ingreso del usuario, el [formulario nativo de Meta](admission-pilot-meta-template-block.json) devolvió explícitamente que la cuenta no tiene permiso para crear una plantilla de mensaje. La cuenta aparece aprobada; el negocio sin verificar y el pago ausente conservan su estado independiente, sin establecer una relación causal no informada. La configuración quedó en una comprobación de teléfono por SMS que requiere al usuario. No se cambió de categoría ni se usó texto libre para sustituir la plantilla Authentication exigida.

## SDK, SQL y recorrido de preparación

El SDK0.57.0 real con transporte propio cerrado tiene cobertura de email/SMS/WhatsApp, sender explícito, plantilla Authentication y Template.language, páginas vacías/continuación/fallo tardío, headers/credenciales aislados y clasificación segura de fallos. La suite local actual de sender pasó13 casos en1,06s. Los baselines de inspección, recursos, configuración, credencial y dispatch conservan sus matrices completas y los errores previos; no se cuenta un test omitido como ejecutado.

PostgreSQL real en ramas Neon propias acredita versiones/slots, SecretStore/Web Crypto, outbox/marker/reservas, país y versión de uso vigentes, diagnóstico recibido, ready y activación explícita. SQL47445 pasó la dependencia de avisos y88221 cinco casos de activación; Native25414 pasó creación/suspensión/retiro sin alterar avisos/academia ni llamar al SDK. Los baselines respectivos contienen comandos y resultados.

Native13095 terminó cuatro casos verdes en3601,56s, Chromium/WebKit1280/390: usage ausente, inicio explícito, AR guardado v2 por interfaz antes del primer SMS, diagnóstico/código recibido, ready y activación con original/current. No parte de países preparados por SQL. Conserva SDK3 por caso y no crea AdmissionPolicy ni habilita avisos.63961 focal posterior pasó el rechazo de una candidata SMS mientras correo ON exige email y selección después de OFF explícito, sin otro SDK.

53055 y86683 conservan sus resultados rojos de pruebas posteriores: el primer montaje contaba todas las alertas, incluido el anunciador de rutas de Next, y un caso no alcanzó readiness.73163 vuelve a ejecutar esa ampliación con una assertion específica del error requerido y confirmación observable de lectura actual; todavía está en curso y no se usa como evidencia verde de este informe.

## Builds locales

54885 build Node/Windows terminó verde: Next16.3.4 compiló20,8s, TypeScript3,7s y46 páginas. El comando real fue pnpm run build; no modifica configuración desplegada.

Se creó una copia archivada del commit4c3ec071 en Ubuntu22.04/WSL, con Node24.21.0 oficial linux-x64 cuya suma SHA256 se comprobó frente a SHASUMS256.txt. Pnpm12.6.0 ejecutó install --frozen-lockfile y resolvió721 paquetes, con dependencias nativas Linux. No se copiaron .env ni credenciales del checkout; el build recibió únicamente configuración sintética generada en memoria. El primer directorio /tmp desapareció al reiniciar la sesión WSL y no produjo un build; el intento final utilizó un directorio propio persistente para la validación.

25919 pnpm run build:cloudflare terminó con salida0: Next16.3.4 compiló30,1s, TypeScript9,3s y46 páginas; OpenNextCloudflare1.20.6/AWS4.1.4 generó .open-next/worker.js con workerd compatibility_date2026-05-31. No hubo deploy ni publicación.

40225 preview workerd local comprobó por HTTP POST /api/tribes/synthetic/messaging/connections con input inválido:400/invalid_input del DTO propio. Usa --local, datos sintéticos y PostgreSQL cerrado sin conexión real; acredita únicamente el boundary del bundle en Workers, sin certificar SQL, auth Google o SDK externos en ese runtime. El wrapper no cerró todos sus descendientes al enviar SIGTERM; se verificaron grupo de proceso y cwd bajo el directorio propio y se terminaron sólo esos descendientes. Después el proceso terminó con salida0 y se comprobó su ausencia. La limpieza del directorio y sus materiales de prueba queda registrada al finalizar la validación.

Los ensayos operativos y la activación de academias permanecen sujetos a operational-gates.md. La copia Linux, sus variables sintéticas y outputs son recursos temporales de este trabajo; no forman parte del producto ni de una entrega desplegada.

El [checkpoint del piloto nuevo](isolated-local-pilot.md) conserva la preparación real posterior en Zavu y Meta. La confirmación telefónica hecha por el usuario permitió abrir facturación, pero la nueva creación de la misma plantilla Authentication volvió a recibir el rechazo de permisos. En ese checkpoint la cuenta todavía no tenía método de pago y el formulario quedó para el usuario. Esta inspección no equivale a diagnóstico recibido, canal listo, activación ni aislamiento A/B.

El [checkpoint después del pago](admission-pilot-meta-payment-checkpoint.json) confirma la configuración completada por el usuario, la desaparición de la alerta en la vista recargada de Meta y que Zavu enlaza el mismo recurso. La plantilla siguió recibiendo el rechazo de permisos. La lectura SDK todavía informó que no podía enviar plantillas; no se atribuye una causa a esa diferencia con el panel. El usuario eligió el portfolio actual «La Pampita - Olavarría» y completará su verificación comercial en Meta; la presentación y el resultado siguen pendientes. No se cambia la identidad del negocio ni se repite la plantilla por esa elección. El piloto mantiene cero mensajes y OG-03/OG-04 siguen pendientes.

El pedido posterior del usuario cambió la continuación a un negocio separado llamado «TuTribu». Después de su autorización expresa de las Condiciones comerciales se [creó el portfolio y se confirmó su correo](admission-pilot-meta-tutribu-created.json). El usuario completó sus datos legales en Meta y el guardado quedó confirmado, sin conservar esos valores en artefactos. El Centro de seguridad indica que no necesita verificar la organización y no ofrece el inicio estándar. Tras autorizar el CAPTCHA y las condiciones específicas de WhatsApp/Cloud API, la consulta actual mostró la cuenta TuTribu/Educación creada y aprobada, con un número conectado y el negocio sin verificar. Zavu aún conserva la asociación anterior: su formulario advierte un límite de una cuenta activa y USD 7 mensuales por otra, con Pro requerido para activarla. Se consultó la preferencia antes de contratar, reemplazar o conceder acceso; no hubo suscripción, cambio de asociación ni envíos. Los recursos utilizables por Zavu y los ensayos por canal siguen pendientes; [estado del piloto](isolated-local-pilot.md).

El [checkpoint posterior de conexión](admission-pilot-tutribu-whatsapp-connection.json) acredita Pro y las dos cuentas activas después de autorizar USD 27 mensuales, condiciones adicionales y el acceso a los activos concretos. Meta permitió seleccionar el número existente de TuTribu; no hizo falta otro teléfono ni se reemplazó la asociación anterior. El resumen visible de facturación confirma USD 20/mes de Pro y USD 7/mes de cuenta adicional. La plantilla nueva `tutribu_access_code_es` se presentó sólo para TuTribu y quedó pendiente; la anterior conserva su rechazo. El aviso general de elegibilidad del editor no sustituye el resultado actual de revisión. La cuenta activa y la plantilla pendiente todavía no acreditan el diagnóstico del producto, recepción de código, disponibilidad de correo/SMS, OG-03 u OG-04. Continúan cero mensajes reales.

El mismo recibo registra un recurso SMS adicional: el número US gratuito incluido en Pro quedó provisionado y el panel muestra SMS/voz. No se agregó una suscripción por ese número ni se enviaron mensajes. Falta acreditar su uso internacional, seleccionarlo mediante el owner del producto y completar su diagnóstico; el correo sigue sin recurso preparado. No se infiere capacidad productiva de la etiqueta del inventario.

El [checkpoint posterior de correo](admission-pilot-email-domain-connected.json) confirma seis registros DNS autorizados, dominio verificado para envío y `admissions@notify.tutribu.app` activo en el remitente TuTribu. El cargo adicional de USD 3 inmediato y mensual fue autorizado por separado: base mensual USD 30, saldo observado USD 17. No se habilitaron recepción ni informes DMARC a terceros. El SDK 0.57.0 confirmó correo/WhatsApp en TuTribu y SMS/WhatsApp en el remitente anterior, sin enviar mensajes. La plantilla nueva pasó a rechazada; Meta devolvió explícitamente falta de permiso de la cuenta TuTribu al crear Authentication en su formulario nativo. No hay plantilla aprobada ni diagnóstico por canal completado, y esos resultados no cierran gates.

Se verificó ausencia de procesos cuyo cwd perteneciera al directorio Linux propio y se comprobó su identidad exacta, parent y source-commit antes de eliminarlo. La ausencia final quedó confirmada; sus .dev.vars y variables de prueba no permanecen. El worker generado medía2278bytes y su SHA256 era d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45. Se conserva sólo metadata sanitizada del receipt local, sin credenciales ni conexión.


<a id="current-pilot-preparation"></a>

## Preparación posterior del piloto

T204 y OG-03 siguen pendientes. La autorización vigente permite hasta diez envíos en total y USD 20 de consumo a los destinos controlados que proporcionó el usuario. Esos destinos y las claves se conservan fuera del repositorio. Correo, SMS y WhatsApp fueron autorizados; sólo se prueban los canales con sus recursos preparados.

### Preparación observada del piloto aislado

- La configuración de uso se guardó por la UI propia en versión 2: Argentina, diez códigos diarios y cero avisos diarios. Se recuperó el original antes del reintento explícito; no se escribió por SQL para evitar esa entrada.
- La candidata conserva correo y SMS configurados en **configuración 3**. Después de añadir SMS se comprobó nuevamente su credencial mediante la UI propia y Zavu la reconoció como cuenta de producción. El remitente SMS se consultó en la aplicación y se volvió a identificar mediante el SDK oficial con transporte limitado a GET de senders; no se aprovisionó otro número.
- La lectura autenticada de configuración confirmó `credentialState:valid`, `credentialMode:production`, canales `email` y `sms`, ambos `unprepared` y sin `testedAt`. Esa preparación no equivale a un código recibido ni a una conexión seleccionada o activa.
- El dominio de correo y su remitente estaban verificados y activados en Zavu, con sus registros DNS autorizados. La última observación de WhatsApp conservó el rechazo de su plantilla Authentication y del permiso de creación nativo en Meta. No se reinterpreta como una plantilla aprobada ni se usa SMS como fallback.

La confirmación de cuenta de las acciones anteriores se completó con Google conservando su sesión, según el [contrato actualizado](google-authentication.md). Las consultas y guardados no emitieron mensajes. Las capturas de esos resultados quedan en el área privada del trabajo, sin exportar la clave, destinatarios o datos de la cuenta a esta evidencia.

### Pendiente antes del cierre

Al cerrar la preparación anterior todavía había **cero envíos de diagnóstico de TuTribu**, cero códigos recibidos y ningún canal certificado en este piloto. El resultado posterior se registra a continuación. Faltan la preparación aprobada de WhatsApp, el contraste A/B y los restantes errores y condiciones de T204. Cualquier intento aceptado o incierto conserva su consumo y referencia; no se repite automáticamente.

La [consulta inicial del proveedor](admission-pilot-provider-preparation.json) y el [rechazo anterior de Meta](admission-pilot-meta-template-block.json) conservan su fecha y alcance históricos. No describen por sí solos el estado posterior de correo y SMS. Los ensayos con transporte cerrado se registran aparte y no se suman a recepción externa, gasto ni mensajes reales del piloto.

### Emisión y confirmación posteriores

El [checkpoint por canal](admission-pilot-channel-checkpoint.json) registra dos emisiones de diagnóstico mediante TuTribu en la configuración 3. El correo llegó a la casilla controlada y su código se ingresó en el formulario privado; la aplicación confirmó la prueba y la lectura autenticada devolvió `email:prepared` con `testedAt` de 2026-10-19T01:34:52.200Z. No se guardó el código en artefactos ni se activó la candidata.

La segunda emisión fue SMS al teléfono controlado. Zavu aceptó el intento; su consulta focal por ID propio seguía devolviendo `queued` a las 2026-10-19T02:03:44.114Z, con costo informado cero. El usuario informó que no lo había recibido. Una observación posterior de la aplicación y PostgreSQL mostró el diagnóstico `verified` y el canal comprobado; eso acredita la confirmación local del código, pero **no acredita recepción externa del SMS** mientras el proveedor conserve `queued` y no exista otra evidencia de entrega. No se usa ese resultado para cerrar OG-03 ni activar producción.

La consulta de recursos también confirmó un número propio SMS/voz activo, todavía sin asignar a ningún remitente; el remitente SMS utilizado es distinto. Esa observación no establece por sí sola la causa de la cola y queda pendiente resolver su configuración. No se cambió el remitente ni se emitió un tercer mensaje.

El piloto conserva dos solicitudes consumidas de diez y la candidata sin seleccionar. El saldo observado después del correo fue USD 16,60 frente a USD 17 antes de emitirlo; la diferencia de USD 0,40 es una observación de saldo, no una tarifa por mensaje deducida. T204 y OG-03/OG-04 siguen pendientes; WhatsApp y el contraste A/B mantienen su alcance completo.

<a id="sms-queue-diagnosis-2026-10-23"></a>

### Diagnóstico de la cola SMS, 23 de octubre de 2026

La revisión de sólo lectura del panel de Zavu (2026-10-23 03:10Z, 00:10 en Buenos Aires) explica por qué ningún SMS de diagnóstico salió de la cola:

- El sender que usa la conexión para SMS es el predeterminado del proyecto, cuyo número es el WhatsApp personal argentino del usuario. Zavu lo lista con WhatsApp y SMS, pero el canal SMS del proyecto figura «En configuración».
- El número propio de EE. UU. incluido en Pro figura «Sin conectar: no envía ni recibe». No está asignado a ningún sender.
- Los tres diagnósticos SMS emitidos por TuTribu (19, 21 y 22 de octubre) siguen en cola en los registros del proveedor; ninguno figura entregado ni fallido.

**Ningún `verified` SMS anterior acredita recepción.** El panel de registros de Zavu muestra el cuerpo completo de cada mensaje, incluido el código. El diagnóstico del 22 de octubre quedó `verified` diez segundos después de emitirse con el SMS todavía en cola: el código no pudo leerse en el teléfono. Los diagnósticos SMS del 19 y del 21 de octubre tienen el mismo estado del proveedor. Estos resultados acreditan sólo la validación local del código y no se usan para OG-03, T106 ni T204. Esta evidencia no reproduce códigos.

El conteo de «dos de diez envíos» quedó desactualizado. Desde el 19 de octubre la rama del piloto registra once diagnósticos aceptados por Zavu (ocho de correo, tres SMS) y quince avisos de admisión aceptados por otros ensayos. El saldo observado es USD 16,28. El 2026-10-22 el usuario fijó un tope nuevo de **diez envíos sólo para este ensayo**, contado desde esta revisión, y conservó el tope de USD 20; también autorizó conectar el número de EE. UU. como canal o sender SMS. Esa conexión y los envíos posteriores se registran a continuación.
