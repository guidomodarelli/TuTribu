# Destrucción de material OTP recuperable

**Feature**: `001-academy-admissions`. **Base**: `dc9479db759481455349aef936573967b2b14a0a`. T037 completa sus primitivas privadas con dependencias T012/T034/T036 cerradas. Scheduler, integración operativa de T186/T187 y gates mantienen su estado pendiente.

## Contrato implementado

El envelope OTP sirve al despacho; el MAC sirve a la comprobación local del código. Eliminar los bytes recuperables no consume el código, no lo verifica, no cambia su vencimiento ni libera una reserva. La versión del desafío cambia una vez al retirar su referencia; estado issued, MAC y fechas originales permanecen cuando todavía corresponden. Un código vigente puede verificarse después con su MAC y scope actuales.

`purge_messaging_verification_envelopes` es una función privada de SQL versionado, sin EXECUTE público. Procesa hasta cien registros con SKIP LOCKED y adquiere delivery → challenge → envelope. Vuelve a leer y comprobar elegibilidad/reloj después de los locks. Retira referencia y bytes juntos; replay no vuelve a cambiar la versión. No consulta proveedor ni keyrings y puede destruir material antiguo durante recovery sin descifrarlo.

Se elimina material expirado, invalidado, anterior, sin referencia vigente o de una entrega accepted/delivered/cancelled. Una entrega unknown/in_flight vigente conserva su identidad y material hasta el fin de su necesidad/plazo. Failed/suppressed vigentes no se eliminan sólo por ese estado, para conservar la posibilidad de una recuperación técnica autorizada; no se concede retry ni se extiende TTL.

`PostgresVerificationMaterialMaintenance` exige autorización de backend antes y después de la mutación, usa el guard existente y devuelve únicamente un contador confirmado. Una retirada de permiso revierte la destrucción; una respuesta perdida conserva error tipado privado. El helper ligado a la misma transacción permite que `PostgresMessageDeliveryRepository.complete` retire bytes al confirmar una recepción definitiva. La recepción y la eliminación se confirman en un solo commit, sin otro checkout ni un efecto externo bajo locks. La autorización específica de purga también se revalida.

## Evidencia

Los tests se escribieron antes de la implementación. Los tres SQL standalone iniciales pasaron en 92,82 segundos: accepted borra una vez y el código correcto sigue produciendo una proof local; unknown conserva el envelope; dos batches concurrentes retiran dos expirados sin duplicación; permiso revocado revierte y un rol no-bypass recibe 42501 al invocar directamente la función.

La ampliación del pipeline real reprodujo un envelope todavía presente después de accepted. La integración del repositorio corrige ese caso y valida MAC sin bytes recuperables. La ejecución integrada de quince SQL (ocho repo, cuatro pipeline y tres mantenimiento) terminó en 537,95 segundos: catorce verdes y un fallo de limpieza HTTP 401 de Neon, después del trabajo del caso de marker perdido. Se revalidó el perfil DEFAULT mediante CLI oficial, se eliminó sólo su rama exacta tras comprobar id/nombre/padre/default=false/fecha, y se confirmó ausencia. El caso afectado pasó en la repetición focal de 44,70 segundos; los siete previamente verdes de su archivo se excluyeron por selección. Quedan así los quince comportamientos validados con el mismo código, sin convertir el fallo administrativo en éxito ni atribuir una suite completa verde a la primera ejecución.

Los tres archivos locales de driver/SDK/uso pasaron veintidós casos en 1,14 segundos. Lint y ambos chequeos de tipos pasaron. La build normal Node 24.21.0/Next 16.3.4, con variables sintéticas de proceso hacia loopback inaccesible y configuración original, compiló en 11,1 segundos, terminó tipos y las 40 páginas estáticas. La revisión nativa cerró con cero hallazgos accionables y nueve hashes estables. Las dos páginas arquitectónicas pasaron ocho renders Chromium/WebKit a 390/1280, sin desbordes ni enlaces locales rotos, y se verificó el cierre de los navegadores.

## Pendientes

El cierre de T037 cubre generación uniforme, HMAC del contexto completo con `subtle.verify`, envelope independiente de diez minutos y eliminación transaccional al dejar de necesitarse. El mantenimiento privado también elimina expirados sin descifrar. La revalidación actual pasó tres SQL de mantenimiento junto a cinco regresiones del writer en 162,37 segundos; la ampliación del reloj final pasó seis SQL del writer y catorce de emisión/diagnóstico por separado. La revisión de las primitivas T037/T038 terminó sin hallazgos y siete hashes estables. No se interpreta este cierre de infraestructura como un scheduler instalado ni como certificación de eliminación física periódica en hosting.

Conectar el sweep de expirados y su frecuencia mediante mantenimiento autorizado, validar el comportamiento operativo Node/Workers y los gates. El vencimiento de diez minutos ya impide descifrado/uso del código; el driver periódico todavía debe acreditar el plazo de eliminación física cuando no llega una recepción. No se promete eliminación de backups ni versiones históricas de PostgreSQL. No se aplicaron migraciones en default/producción ni se enviaron mensajes externos.

Decisión propietaria: [tenant-messaging.htm](../../../docs/architecture/tenant-messaging.htm).
