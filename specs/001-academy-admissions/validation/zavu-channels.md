# Validación local de mensajería y runtimes

Fuente de producto:4c3ec071a2b5f51427f3d62102d86b110159dee0. Los cambios posteriores df4315be son documentales y no alteran el código compilado. Este informe conserva el alcance de T094 y no acredita los gates OG-01, OG-02 ni OG-03, Google externo, BYOK de un líder real, destino/pagador, mensajes reales o hosting desplegado.

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

Se verificó ausencia de procesos cuyo cwd perteneciera al directorio Linux propio y se comprobó su identidad exacta, parent y source-commit antes de eliminarlo. La ausencia final quedó confirmada; sus .dev.vars y variables de prueba no permanecen. El worker generado medía2278bytes y su SHA256 era d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45. Se conserva sólo metadata sanitizada del receipt local, sin credenciales ni conexión.
