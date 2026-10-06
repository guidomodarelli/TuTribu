# Base de desafíos locales y crypto

**Feature**: `001-academy-admissions`. **Base publicada**: `12fd7dcb404540f784e13f6c6921d341ff2da58f`.

## Alcance implementado

Las primitivas puras de desafío comprueban el scope actual, propósito, reloj y presupuesto de fallos resuelto por el owner. Proponen validar una vez o registrar un fallo sin modificar el snapshot. El quinto fallo invalida el desafío y retira sus referencias a material temporal. La aplicación de una prueba requiere scope vigente y frescura inferior a quince minutos, sin reutilización ni aprobación implícita. El diagnóstico no adquiere propósito de admisión.

Las primitivas de infraestructura usan Web Crypto real: AES-256-GCM, IV de 96 bits, tag de 128, AAD inequívoco; HMAC-SHA-256 verificado mediante `subtle.verify`; seis dígitos mediante rejection sampling. El envelope OTP está ligado al contexto completo y al vencimiento original, con máximo diez minutos. No se recupera después del vencimiento aunque la purga todavía no haya corrido.

El importador recibe keyrings externos distintos para credenciales, envelopes OTP, MAC, tokens de invitación, fingerprints y operaciones. Rechaza material reutilizado entre claves/propósitos, importa claves no exportables y limpia sus copias temporales. Las claves retiradas, contexto/entorno/época cruzados y el recovery lock cierran la operación. No se escribe ni configura un secreto real del hosting.

## Evidencia ejecutada

Pasaron 33 casos de desafío/proof y 28 de crypto. La ejecución conjunta de las siete suites actuales de dominio, auth y crypto pasó 196 pruebas. Se ejercen primitivas reales sin mocks de plataforma, red, mensajes ni claves productivas.

Los casos incluyen TTL exacto, fecha inválida/futura, cinco fallos, desafíos anteriores o consumidos, cuenta/tribu/contacto/propósito/época/conexión/canal cruzados, prueba aplicada a otro pedido y revocación. AES-GCM cubre IV/ciphertext alterados y AAD cruzado; HMAC cubre cada campo de contexto, claves no exportables y cambio de época externa. La rotación lee claves retenidas, escribe con la activa y rechaza una retirada. No se infiere de ello que los contadores persistidos ya conserven continuidad.

Las suites se escribieron y ejecutaron antes de crear los módulos: inicialmente no pudieron cargar esos imports ausentes. Después de implementarlos se ejercieron los comportamientos descritos. Pasaron lint y ambos chequeos de tipos; la evidencia SQL y Workers no se sustituye por estos resultados Node.

## Trabajo pendiente

T012, T015, T034, T036 y T037 permanecen abiertos por sus dependencias y escenarios restantes. Faltan SecretStore/contextos autorizados, almacenamiento/purga durable, CAS y contadores globales, emisión/adjunción de pruebas con solicitud y auditoría, configuración de keyrings del hosting y ensayo real en Workers. Todavía no se cambia una ruta, el login, una cuenta ni una membresía.

Todos los gates mantienen el registro de [operational-gates.md](operational-gates.md), especialmente OG-02. `spec.md`, `technical-contract.md`, identificadores normativos y checklists permanecen íntegros. El owner arquitectónico es [academy-admissions.htm](../../../docs/architecture/academy-admissions.htm).
