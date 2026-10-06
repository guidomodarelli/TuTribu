# Base privada de mensajería

**Feature**: `001-academy-admissions`. **Base de trabajo**: `5c357c06f4c575bf573e5ad7d0d9ccbe10a102b0`. Avance parcial de T013/T022/T041/T042; no acredita OG-02/OG-03/OG-04.

## Artefactos y alcance

`20261005092000_create_tenant_messaging.sql` crea trece tablas privadas de conexiones, versiones, recursos, diagnósticos, envelopes, deliveries/attempts y presupuesto. Su factory Drizzle pertenece a `messaging/infrastructure/database` y se compone desde el schema compartido. SQL conserva la autoridad de FORCE RLS, grants, triggers y referencias diferidas entre owners.

La política de uso empieza en versión 1 con países vacíos y cupos 100/200. Puede persistirse antes de tener conexión o AdmissionPolicy. Los cambios efectivos incrementan una vez; los países se comparan como conjunto sin orden significativo. Un no-op conserva la versión. Reservar/envíar no cambia esa configuración ni reinicia los contadores.

`20261005092500_guard_messaging_attempts.sql` agrega primitivas privadas de claim acotado, autorización/reserva/marker indivisibles, recuperación de leases y finalización por CAS del intento. Ninguna función recupera una key o hace RPC. Las versiones de configuración y el payload/identidad de la entrega son inmutables. Los enlaces compuestos fijan el ámbito tenant; el envelope OTP comparte origen y ventana exactos con su desafío/entrega.

## Evidencia ejecutada

La suite real se ejecuta con `RUN_ADMISSION_SQL_TESTS=1` en ramas efímeras propias de `TuTribu`, con datos sintéticos y cleanup verificado. No necesita secretos del proveedor ni realiza envíos.

- Defaults de la política sin conexión/política de admisión, CHECK de incremento efectivo/no-op, rechazo de CAS obsoleto y proyección Drizzle real de países como array.
- Cien transacciones concurrentes contra cien deliveries y el último cupo: una autorización, noventa y nueve `quota_exceeded`. El pool de la rama propia se configura explícitamente para cien checkouts; se conserva el helper protegido del runtime y su guard de abandono. No se modifica el pool productivo.
- Pérdida de worker después del marker: delivery/attempt `unknown`, reserva `consumed` y política versión 1. Reutilizar la lease/version anterior devuelve `stale`, sin otra autorización.
- Países vacíos, país no autorizado y retiro con entrega en cola: `suppressed` sin attempt/reserva. El desafío emitido conserva estado/plazo y no se invalida por cambiar solo países.
- La versión de uso leída al autorizar puede ser posterior a la de cola: el intento registra la vigente. Retirar después del marker conserva la reserva. `accepted` pasa a `delivered` por la misma identidad; una respuesta vieja `unknown` con versión antigua devuelve `stale`.
- Dos workers reclaman entregas distintas. Reconciliar una lease sin marker permite otro claim con versión nueva y no crea un intento.
- Las referencias compuestas rechazan conexión de otra tribu y ventana OTP distinta del desafío. El rol real sin bypass no lee ciphertext ni inserta envelopes. Las versiones de configuración y el destinatario de la entrega no se editan; una seleccionada suspendida sigue ocupando su unicidad.

El primer escenario de cien competidores reprodujo `42883` sin las funciones. Su ejecución inicial con diez slots y timeout de checkout expuso saturación del arnés; se configuró únicamente el pool de test para su concurrencia explícita. El caso de países detectó primero que el driver devuelve timestamp como string; el fixture ahora consume ese valor real y el caso pasó completo.

La revisión nativa encontró dos comportamientos incorrectos, reproducidos por separado con SQL real: sandbox autorizaba uso productivo y una capacidad activa con prueba de hace veinticinco horas quedaba suprimida. Se separó el diagnóstico limitado del uso productivo y se dejó el plazo de veinticuatro horas en la activación de la candidata. También se completaron los cinco FKs y unique de origen exacto en Drizzle mediante referencias lazy de composición; los nombres/columnas soportados no quedan fuera de la proyección usada por Drizzle Kit.

Los 54 tests de componentes relacionados también pasaron en orden aleatorio, incluyendo foco después de retirar un material y los dos fallos reportados. El fallo de CI en el foco se debía a comprobar antes del `requestAnimationFrame`; se conserva la expectativa y se espera su efecto observable. Los documentos de arquitectura se comprobaron en Chromium y WebKit, a 390/1280, sin desborde ni enlaces locales rotos.

## Pendientes conservados

T013 y T022 siguen abiertos. Faltan cerrar todos sus casos con los repositorios/SecretStore/transportes reales y autorización actual completa. T041/T042/T043 aún requieren los writers/puertos de aplicación, counters agregados y ventanas de abuso, preferencias, ausencia acreditada antes de liberar, fairness, scheduler y pruebas del marker frente al SDK fuera de transacción.

Estas primitivas SQL no sustituyen reglas complejas de aplicación ni el protocolo de restore externo. La policy privada del owner no concede audiencia pública. No se habilitan endpoints, academias, canales o rePOST de resultados inciertos. Los ensayos externos siguen requiriendo los gates y recursos reales de [operational-gates.md](operational-gates.md).

`spec.md`, `technical-contract.md`, checklists e identificadores normativos se conservan; ninguna prueba estructural cierra una validación humana o de proveedor.
