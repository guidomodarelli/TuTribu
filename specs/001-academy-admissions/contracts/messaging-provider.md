# Messaging Provider Contract

**Estado**: diseño propuesto sobre SDK oficial `@zavudev/sdk@0.57.0`; integración/compatibilidad runtime y recursos de cuentas aún no probados. [Research R-06 a R-11](../research.md), [modelo](../data-model.md), [errores](errors-and-recovery.md).

## Puertos propios y contexto

| Puerto | Responsabilidad y contrato |
| --- | --- |
| `MessagingProviderRegistry` | Descriptor/factory allowlisted; producción solo zavu. Futuro adapter debe aportar capacidades/mapper/contratos reales; no un switch de proveedor en dominio |
| `MessagingConnectionInspector` | Autenticar credencial, consultar/validar recursos y proyectar metadatos/capacidades por versión; sin envío implícito |
| `VerificationMessageSender` | Despachar mensaje de código de desafío/diagnóstico autorizado por canal explícito; no decide prueba o login |
| `AdmissionNotificationSender` | Mensaje de evento/preferencia autorizados por correo; no comprueba contacto ni cambia decisión |
| `SecretStore` | Recuperar envelope solo después de contexto/rol/época/retiro autorizados; sin reglas de admisión |
| `DeliveryRepository/UsageLimiter` | Identidad, reserva, lease, intento, outcomes y cuota concurrentes; sin SDK ni claves en contratos públicos |

Contexto interno obligatorio: usuario/actor apropiado, tribu, propósito, recurso, conexión/versión, entorno lógico/época externa y correlación. IDs del cliente se resuelven, no se convierten en contexto confiable. Factory por operación; ningún singleton cambia API key/sender. Recursos/clave no se eligen por nombre de proveedor solamente.

## Configuración SDK y transporte

`apiKey` y `baseURL=https://api.zavu.dev` explícitos, timeout inicial 15 s, `maxRetries:0`, `logLevel:'off'`. Rechazar clave ausente antes de crear cliente. El transporte propio controla URL/método/headers efectivos: Authorization/sender corresponden al contexto, no a `ZAVUDEV_CUSTOM_HEADERS` ni otro default global. No registrar request/response bodies; no usar `options.idempotencyKey` como promesa de header automático.

`messages.send` siempre lleva `'Zavu-Sender'`, `channel`, `fallbackEnabled:false` e identidad estable en body `idempotencyKey`. La alternativa SMS del producto es una nueva intención/desafío del solicitante, no el fallback automático del proveedor. Configurar una conexión no modifica sender/canal global del proveedor. [Código oficial de mensajes](https://github.com/zavudev/sdk-typescript/blob/ecd7329a08a03f7751afe319a5d5f170af1f48a9/src/resources/messages.ts), [cliente oficial](https://github.com/zavudev/sdk-typescript/blob/ecd7329a08a03f7751afe319a5d5f170af1f48a9/src/client.ts).

## Credential inspection y recursos

`me.retrieve()` comprueba autenticación y `isTestMode`; guardar por versión `credentialValidationStatus/credentialValidatedAt` y referencias privadas de proyecto/equipo/key. Un prefijo válido no acredita entorno; una credencial autenticada no acredita canal preparado/probado.

`senders.list/retrieve` y `templates.list/retrieve` paginan con limit/cursor, items/nextCursor. SDK versionado es autoridad para método/shape; no `retrieve({messageId})`, `zavuSender` o `result.id` de ejemplos antiguos. La selección manual, cuando list no esté autorizada, exige detalle y/o diagnóstico real autorizado que compruebe recurso/canal. Si no hay validación posible, se conserva incompleto.

Proyectar solo datos necesarios propios. `Sender.channels` indica capacidades; phone/email aislados no bastan. Plantilla OTP es AUTHENTICATION aprobada para sender, con idioma del recurso. Nunca retornar `webhook.secret` u objeto completo. No inventar `senders:read`; comprobar acceso efectivo de operaciones y capacidades reales. [Senders](https://docs.zavu.dev/api-reference/list-senders), [tipos de sender](https://github.com/zavudev/sdk-typescript/blob/ecd7329a08a03f7751afe319a5d5f170af1f48a9/src/resources/senders/senders.ts), [tipos de plantilla](https://github.com/zavudev/sdk-typescript/blob/ecd7329a08a03f7751afe319a5d5f170af1f48a9/src/resources/templates.ts).

## Mapping de mensajes

| Propósito/canal | Request del adapter, derivado en servidor |
| --- | --- |
| Código de correo | destinatario del contexto, `channel:email`, `messageType:text`, subject/text de catálogo propio y código del desafío |
| Código SMS | teléfono E.164/país autorizado, `channel:sms`, `messageType:text`, texto propio; no sms_oneway implícito |
| Código WhatsApp | `channel:whatsapp`, `messageType:template`, `content.templateId` configurado/validado, `content.templateVariables['1']` con código |
| Idioma WhatsApp | Validar selección contra `Template.language`; no enviar campo language/templateLanguage que el SDK no soporta |
| Aviso de admisión | Solo correo confiable autorizado, subject/text y URL de pantalla autenticada; mensaje externo seguro, nunca motivo interno |

No `from` arbitrario: el origen de correo pertenece al sender preparado. No aceptar text/template/API key/sender/destinatario genéricos desde un solicitante. Guardar/formato de campos no envía; prueba requiere destino visible y consentimiento de consumo. [Correo](https://docs.zavu.dev/guides/sending-messages/email), [SMS](https://docs.zavu.dev/guides/sending-messages/sms), [OTP WhatsApp](https://docs.zavu.dev/guides/whatsapp/templates/otp).

Sandbox realiza envíos reales limitados, no pruebas gratuitas universales ni validación del sender productivo. Un diagnóstico de versión/canal produce `ConnectionDiagnostic`, nunca evidencia global o proof de admisión. Recurso no preparado/sandbox/diagnóstico antiguo no habilita producción. La aceptación externa no confirma que el líder recibió/introdujo el código; solo la verificación local del diagnóstico acredita su resultado.

## Outbox: secuencia observable

1. Persistir evento/desafío y entrega con unique lógico y versión fija; ninguna RPC dentro de esa transacción.
2. Claim acotado de due work con `leaseToken/leaseUntil/version`; commit.
3. Transacción nueva revalida estado/época/capacidad, actor/rol/preferencia y presupuesto/vigencia. Reserva cupo y persiste `attemptId/sendAuthorizedAt/in_flight` antes de salir.
4. Recuperar secreto autorizado y ejecutar SDK real fuera de locks, con timeout y sin retries internos. Preservar payload/huella del mismo intent.
5. Finalizar con CAS del mismo attempt/lease. Respuesta tardía aporta evidencia al intento correcto; no pisa una versión más nueva. Código/envelope se purga cuando deja de necesitarse y al vencer como máximo a diez minutos.

Después del marker se considera posible despacho incluso si murió antes del fetch. Lease sin marker puede reencolar; con marker incierto mantiene cuota y `unknown`. Falta clave/rol antes de autorización no envía. Reducir cupo no cancela mensajes aceptados; revalidar nuevas salidas.

## Consulta, idempotencia y webhook

`messages.retrieve(messageId)` únicamente sobre ID propio registrado. No existe lookup por idempotencyKey en API/tipos consultados; no usar `messages.list` para enumerar historia/destinos. Mapear queued/sending/sent/accepted/delivered/read a transporte propio; unexpected/received/pending URL verification no verifica al usuario.

No hay TTL ni regla same-key/different-payload documentada. Guardar `payloadMacKeyId`, huella y conexión/versión; `409` no es aceptación sin correlación. Hasta ensayo autorizado de scope/ventana/payload/409, no rePOST de resultado ambiguo. Rechazo definitivo conserva causa propia; retry permitido se acota al desafío/evento y nunca cambia de cuenta. [OpenAPI](https://docs.zavu.dev/openapi.json).

Webhook es opcional para el onboarding mínimo. Si se implementa, firma v2 sobre timestamp y bytes originales, comparación constante, replay acotado/dedupe de event id y correlación con entrega emitida. No downgrade ni cambio de identidad/membership por callback; no reconfigurar un webhook compartido externo. [Seguridad de webhook](https://docs.zavu.dev/guides/receiving-messages/security).

## Secrets y restore

AES-GCM/HMAC/keyrings y AAD siguen el modelo; credencial nunca vuelve al UI tras guardar. `fingerprintKeyId/payloadMacKeyId` permiten continuidad de contadores/identidad durante rotación. Rotar cipher key y reemplazar BYOK son operaciones distintas. Keyrings/epoch están fuera del snapshot DB; restore cierra todos los dispatchers, cambia epoch/keys y exige reconexión/prueba. Ninguna tombstone restaurada reactiva secret antiguo.

## Verificación requerida

SDK real con fetch propio inyectado: auth/sender/canal/false-fallback correctos; defaults/global headers no alteran contexto; sin retry automático; recursos paginados/filtrados; status/código antes de texto; 409 no correlacionable; abort/timeout y marker anterior; A/B intercalado; key/AAD/epoch cruzados; ningún secreto en DTO/log.

Ensayos reales separados y autorizados: producción de correo/SMS/WhatsApp, sender/template/idioma exactos, no fallback bajo fallo, clave/permisos/env, dedupe/ventana, consulta por ID, rotación/retiro/costos/países. Un doble valida reglas propias, no entrega externa. La cuenta del líder puede mostrar contenido en el proveedor; no se promete ocultar allí OTP ni borrar su historial.
