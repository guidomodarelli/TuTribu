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

## Adjunción a pendiente existente

Sobre `1974e760`, la prueba SQL crea y confirma primero una solicitud pending con contacto declarado y proof null. Registra submitted_at/expires_at/status/version, y después adjunta proof local y cambia la versión junto con el consumo aplicado de esa prueba. El snapshot posterior conserva ambas fechas y status pending, sube sólo a versión 2 y mantiene el proof exacto. Los checks previos de diagnóstico/prueba/consumo/invalidez siguen ejercitándose. La ejecución con los 33 casos de dominio pasó 34 casos sin skips en 34,16 segundos; lint y tipos de tests posteriores verdes. La revisión nativa final de esta ampliación cerró sin hallazgos, con los tres hashes de tests estables y todos sus comandos terminados. T015 queda completada como cobertura de reglas y persistencia de adjunción.

## Trabajo pendiente

T036 está completada como modelos y transiciones de dominio, con T015/T020 y los 179 casos puros revalidados. T012 queda completada como cobertura criptográfica y de continuidad: sus 28 casos reales siguen verdes dentro de los 349 locales actuales (13,42 segundos); tres SQL de contactos comprueban consumo original con claves retenidas/retiradas y cierre sin puente. T034 quedó completada sobre dc9479db después de satisfacer T012/T028/T022 y revalidar los ochenta y seis casos crypto/HTTP actuales con revisión sin hallazgos. T037 conserva su cierre pendiente; ninguno acredita hosting, Workers, restore ni OG-02.

El Store privado tiene evidencia en [secret-store-baseline.md](secret-store-baseline.md); validación, proof, presupuestos e issuer/resend están en [contact-verification-baseline.md](contact-verification-baseline.md), y el pipeline de despacho en [message-dispatch-baseline.md](message-dispatch-baseline.md). Siguen pendientes sus factories/rutas, los límites restantes, productores/mantenimiento/purga, keyrings del hosting y ensayo real en Workers. Este avance no habilita un flujo nuevo.

Todos los gates mantienen el registro de [operational-gates.md](operational-gates.md), especialmente OG-02. `spec.md`, `technical-contract.md`, identificadores normativos y checklists permanecen íntegros. El owner arquitectónico es [academy-admissions.htm](../../../docs/architecture/academy-admissions.htm).
