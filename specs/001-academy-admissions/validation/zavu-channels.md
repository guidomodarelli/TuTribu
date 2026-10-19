# Piloto controlado por canal

T204 y OG-03 siguen pendientes. La autorización vigente permite hasta diez envíos en total y USD 20 de consumo a los destinos controlados que proporcionó el usuario. Esos destinos y las claves se conservan fuera del repositorio. Correo, SMS y WhatsApp fueron autorizados; sólo se prueban los canales con sus recursos preparados.

## Preparación observada del piloto aislado

- La configuración de uso se guardó por la UI propia en versión 2: Argentina, diez códigos diarios y cero avisos diarios. Se recuperó el original antes del reintento explícito; no se escribió por SQL para evitar esa entrada.
- La candidata conserva correo y SMS configurados en **configuración 3**. Después de añadir SMS se comprobó nuevamente su credencial mediante la UI propia y Zavu la reconoció como cuenta de producción. El remitente SMS se consultó en la aplicación y se volvió a identificar mediante el SDK oficial con transporte limitado a GET de senders; no se aprovisionó otro número.
- La lectura autenticada de configuración confirmó `credentialState:valid`, `credentialMode:production`, canales `email` y `sms`, ambos `unprepared` y sin `testedAt`. Esa preparación no equivale a un código recibido ni a una conexión seleccionada o activa.
- El dominio de correo y su remitente estaban verificados y activados en Zavu, con sus registros DNS autorizados. La última observación de WhatsApp conservó el rechazo de su plantilla Authentication y del permiso de creación nativo en Meta. No se reinterpreta como una plantilla aprobada ni se usa SMS como fallback.

La confirmación de cuenta de las acciones anteriores se completó con Google conservando su sesión, según el [contrato actualizado](google-authentication.md). Las consultas y guardados no emitieron mensajes. Las capturas de esos resultados quedan en el área privada del trabajo, sin exportar la clave, destinatarios o datos de la cuenta a esta evidencia.

## Pendiente antes del cierre

Todavía hay **cero envíos de diagnóstico de TuTribu**, cero códigos recibidos y ningún canal certificado en este piloto. Faltan emisión/recepción/verificación explícitas por versión y canal, la preparación aprobada de WhatsApp, el contraste A/B y los restantes errores y condiciones de T204. Cualquier intento aceptado o incierto conservará su consumo y referencia; no se repetirá automáticamente.

La [consulta inicial del proveedor](admission-pilot-provider-preparation.json) y el [rechazo anterior de Meta](admission-pilot-meta-template-block.json) conservan su fecha y alcance históricos. No describen por sí solos el estado posterior de correo y SMS. Los ensayos con transporte cerrado se registran aparte y no se suman a recepción externa, gasto ni mensajes reales del piloto.
