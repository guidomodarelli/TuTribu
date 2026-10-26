# Entradas públicas y protección persistente: T155/T158

El alcance mantiene historia pública, UI de academia, llamadas directas, checkout, creación inicial y roles reales. La entrada directa anterior sigue siendo compatibilidad previa a la activación; una academia protegida muestra Solicitar ingreso y usa el owner común. No se elimina la compatibilidad previa sólo para obtener una prueba verde ni se afirma protección antes de activar.

## Fallo reproducido y corrección

`academy_offer_requires_admission_request` dependía de la fila de settings y del modo academia. Al borrar settings después de activar, devolvía false pese al marcador irreversible de `tribes`. El escenario real de PostgreSQL termina con un fallo/cero omitidos (`.git/codex-t158-durable-entry-marker-red.json`, línea44, expected true/received false). La migración `20261011210000_preserve_admission_entry_marker.sql` lee sólo el marcador de la tribu por slug; no cambia las guardas de escritura, concede membresías ni modifica precios.

La revalidación termina exit0 con tres aprobados y seis casos fuera del filtro (`.git/codex-t158-durable-entry-marker-fixed.json`). Comprueba la navegación en runtime/NOBYPASS antes y después de activar, ausencia de efectos de lectura, conservación del marcador tras borrar settings o volver a legacy, y los selectores y escrituras antiguas cerrados tras perder la política o usar flags falsos. No se presentan los seis filtrados como acreditados.

## Creación inicial y guardas SQL

El caso nuevo usa `createTribe`, whitelist real y `PostgresTribeCreationRepository`, sin reemplazar el SDK ni la plataforma. Crea exactamente la instancia del creador como líder activo, sin fuente de admisión ni petición artificial. Tras activar, los seis intentos de insertar leader/guardian/tribemate desde runtime y NOBYPASS con paid true y el flag técnico apagado deben rechazarse por la guarda de procedencia.

La primera prueba NOBYPASS falló con 42501 porque el rol sintético carecía de permisos EXECUTE de dos funciones usadas por las policies. El diagnóstico conserva únicamente rol/rol propuesto/SQLSTATE, sin parámetros ni filas sensibles. Se añadieron las mismas concesiones de fixture que ya usa el test de cutover; no se cambió producción para debilitar RLS. El caso termina exit0, un aprobado/cero omitidos (`.git/codex-t155-bootstrap-native-policy-privileges.json`), con 23514 en los seis rechazos y sólo el líder original persistido.

## UI, HTTP y evidencia adicional

El primer caso ampliado de UI termina exit0, un test/cero omitidos que recorre Chromium/WebKit a1280/390px (`.git/codex-t155-public-entry-guards-first.json`). Visita academia → Solicitar ingreso → formulario, historia sin formulario gratuito, rechaza body vacío/paid/role/token en academy/join y paid/old token en subscriptions/start, conserva cero miembros/suscripciones antes de la confirmación y mantiene el ingreso histórico explícito como pendiente. Los 43 contratos locales actuales terminan aprobados/cero omitidos (`.git/codex-t158-entry-contracts-current.json`); tipos de tests y lint pasan.

La ampliación agrega un precio membership activo y una integración sintética guardados en la misma academia para probar que el rechazo de checkout procede del modo y marcador actuales. El transporte externo propio mantiene SDK/fetch internos reales y bloquea únicamente Mercado Pago, contando cualquier llamada antes de I/O. Termina exit0, un caso/cero omitidos en377958,0793ms (`.git/codex-t155-public-entry-with-valid-price.json`): cuatro motores/tamaños, cero RPC, miembros o suscripciones antes de la confirmación y una petición pendiente después. No se hacen cobros ni se usan credenciales de personas. Las dos capturas nuevas de academia/historia son reales y se integran conservando las44 anteriores,46 en total.

La compilación de producción termina exit0 (`.git/codex-t158-final-build.log`). La UI previa a la activación mantiene la compatibilidad verificada; no se elimina el overload anterior de joinAcademy ni se afirma protección antes de activar. La implementación existente se contrasta por su recorrido alcanzable y sus guardas, no por la mera presencia de un método. El cierre de T155/T158 se decide con la matriz completa siguiente, la revisión independiente y la trazabilidad documental actualizada.
