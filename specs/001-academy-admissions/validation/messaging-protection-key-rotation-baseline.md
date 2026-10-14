# Rotación privada de claves de protección

Unidad sobre `08c295da45f0cd5d57c9fe3ae46a15146249bd0b`. Conserva las 212 tareas originales y los criterios completos de T166/T168. Ambas quedan completadas en su alcance de pruebas SQL/crypto y productor privado: 167 completadas y 45 pendientes. No acredita configuración del hosting, restore, programación, despliegue ni gates externos.

## Responsabilidades y persistencia

`RotateMessagingProtectionKeysUseCase` valida límites de 1–100, con 25 por defecto. `PostgresMessagingProtectionKeyRotation` comparte una única transacción y revalida autoridad backend, recovery lock, entorno, época y topología de los seis keyrings antes de importar material y durante todo el lote. No genera claves ni cambia la credencial BYOK. La composición privada se obtiene de `buildMessagingProtectionKeyRotationModule`; no incorpora ruta HTTP, botón o scheduler.

La migración idx168 selecciona únicamente la versión seleccionada o candidata aún utilizable. Conserva credencial, referencias, selección, versiones, fechas, política, límites, reservas, consumo e intents originales. Usa CAS sobre referencia/keyId, comprueba con las claves actuales cada envelope preparado y registra auditoría sólo por cambios efectivos. No reanima retiros, purgas, candidatas abandonadas o namespaces eliminados. Los scopes ocupados se omiten y el resultado conserva trabajo restante.

La revisión inicial identificó un ciclo real entre namespace y tribu: el DELETE toma la tribu antes de retirar el namespace, mientras la FK de auditoría de la rotación podía esperar esa tribu después de retener el namespace. La corrección fija el padre mediante `FOR KEY SHARE NOWAIT` antes de connection/version/envelope; si está ocupado, omite ese scope sin una espera inversa. La prueba nueva ejecuta DELETE físico en ambos órdenes, observa la espera exacta mediante PostgreSQL y espera todas sus transacciones antes de liberar la rama propia.

La migración idx167 conserva pruebas HMAC de dominio fijo para `contact_fingerprint` y `operation_payload`. Son metadata inmutable de enrutamiento sin contacto, token o material de clave, con RLS y escritura privada. El wrapper autenticado es de sólo comparación: una petición ordinaria no puede inscribir ni sustituir claves globales. Cambiar material bajo un mismo keyId cierra la operación antes de crear otra identidad o consumo.

El rollout privado debe reconciliar el inventario original conocido del hosting mediante `registerMessagingPrivateMacKeyMaterial` antes de abrir requests. No se inscribe material histórico por inferencia de la primera petición ni del job rutinario. Un id referenciado sin prueba original requiere reconciliación explícita; sólo un id nuevo sin referencias puede inscribirse durante el preflight privado. Las pruebas existentes no se reemplazan y sobreviven al retiro de cuenta/tribu.

## Continuidad

El bridge de contacto deriva todos los fingerprint retenidos y conserva su sujeto global. La falta de un predecesor con consumo activo no bridged cierra nuevos envíos hasta reconciliarlo o vencer su ventana original, sin liberar consumo. El ledger firma operaciones nuevas con el activo y verifica cada original con su keyId persistido; la rotación no reescribe payloads ni intents. El reconocimiento del vínculo mínimo y la vinculación básica comprueban también el material original antes de derivar otra huella.

OTP conserva envelope, código, MAC e intento originales con las claves retenidas hasta el menor plazo de necesidad/TTL. `pendingOtpMaterial` informa drenaje; no autoriza retirar todas las claves antiguas ni sustituye inventarios de MAC local, payloads, vínculos o invitaciones. Cipher rotation y BYOK rotation mantienen responsabilidades distintas.

Los contadores sólo se publican después del commit confirmado. La pérdida de respuesta conserva `operation_unresolved` y causa privada; no hay retry automático. Una continuación explícita consulta la fuente y no vuelve a rotar los envelopes ya actuales. Los stops conocidos conservan su clasificación y revierten cipher, auditoría y nuevas pruebas de material del lote.

## Evidencia y límites

Tipos de producto/tests y lint pasan. La revisión de sólo lectura final confirma cero hallazgos accionables y 38 hashes sin drift, manifest SHA256 `ee650580f6b2e6c446ce8af89327179d108946ea17d57fe10bd20721e5cba262`. El build productivo real en la copia administrada termina con código cero, con dependencias publicadas y configuración sintética; no modifica claves del hosting.

Las tandas Native terminaron y sus resultados se distinguen a continuación. Los primeros reportes conservan la preparación anterior de los casos de contacto, corregida con preflight privado explícito para el nuevo identificador; no se cambian las expectativas de identidad o consumo. La pasada general del checkpoint anterior registra 5168 aprobados, 28 fallos de suscripciones y 756 exclusiones; no se presenta como un verde global ni como ejecución del target final. El contraste aislado de las dos suites de suscripciones sobre la base termina con 89 aprobados y los mismos 28 fallos, sin diferencias de casos fallidos. No son una regresión de esta unidad.

La pasada focal final aprueba 41 casos de límites, routing sin importación prematura, crypto y retención de intents. La QA de arquitectura, manual, menú e índice detallado aprueba dieciséis vistas Chromium/WebKit a 390/1280, con 1036 enlaces locales, recarga con ancla y navegación real del índice/regreso. Dos capturas móviles se inspeccionan visualmente; no hay desbordes ni errores JavaScript. Los dos manuales pasan el checker sin errores. Sus tres advertencias corresponden a documentos locales sin URL de iframe, ausencia de catálogo central y el falso positivo del extractor: ambos scripts coinciden íntegramente con Heritage canónico. La copia de build queda archivada por el gestor, con estado archivado confirmado.

Todas las integraciones usan ramas efímeras propias, claves sintéticas independientes y transporte de proveedor controlado. No hay envíos externos, cambios de hosting, regeneración de claves del piloto ni intervención sobre producción o el piloto conservado.

## Auditoría de cierre de T166 y T168

| Criterio íntegro | Cadena comprobada y alcance |
|---|---|
| Retiro inmediato, purga en 24 h, sin reactivación | SecretStore y mantenimiento privado de credenciales; pruebas históricas de deadline original, más composición actual y exclusión de retiros/purgas del nuevo productor |
| Candidata/borrador, siete días + 24 h | Política y owner Native previos, más composición actual: versión candidata exacta, seleccionada coexistente, deadlines y consumo conservados |
| Terminales 180 días / auditoría 365 días | `buildAdmissionDataRetentionModule` y cuatro Native actuales de composición, con material fresco, límite compartido, replay, rollback y commit perdido; se conserva la evidencia previa de los cortes y archivo |
| OTP hasta diez minutos / menor necesidad | Validación local y tres Native actuales de `verification-material-maintenance.test.ts`: envelope aceptado destruido sin invalidar código/cupo, unknown vigente retenido, TTL original y purga concurrente |
| Cuenta/tribu eliminadas sin liberar vínculo | Native actual de cuenta eliminada: reserva HMAC, rechazo de reasignación, contacto ajeno admitido con predecesor retenido y cierre si se retira; reutilización actual y evidencia histórica de archivo/eliminación; DELETE concurrente real en ambos órdenes |
| Fingerprint durante toda ventana activa | Tres Native de subjects/aliases, ambos lados de la ventana de retiro y cinco de presupuesto actual: id original, hourly/UTC daily/cooldown, concurrencia y cierre sin predecesor, sin contador nuevo |
| Payload MAC durante la ventana original | Native de payload persistido más crypto local: firma nueva con activo, verificación con keyId original, retiro que detiene acceso privado/SDK, conciliación del mismo intent y una recepción controlada; no se reescribe MAC/fecha/reserva |
| Cipher separado de BYOK, reservas e identidad | Cinco Native del productor: lote bounded/idempotente, misma credencial/ref/version, selección, cuotas y consumo intactos, material cambiado bajo igual id, rollback por autoridad/restore/época y commit real sin respuesta |
| Continuidad cerrada ante material no reconciliado | Tres Native de pruebas inmutables: ningún sujeto/consumo/intent nuevo con material cambiado, wrapper ordinario sin inscripción y reconciliación legacy sólo privada |

La evidencia nueva reúne treinta recorridos Native distintos: dieciséis de rotación/material/contacto/payload/migración, cinco aprobados de retención/reutilización y nueve de cuenta/cuotas/OTP. El 5/1 anterior conserva el fallo de preparación de la clave nueva; la repetición actual de cuenta termina verde sin modificar su expectativa. La aplicación y replay del journal real ejercen sus 68 migraciones. No se suman de nuevo los reportes iniciales o la evidencia histórica reutilizada.

Después de sustituir estados SQL por sus constantes canónicas de idéntico valor, el focal final repite tres recorridos actuales: rotación completa y DELETE en ambos órdenes. Termina 3/0, con cuatro casos fuera de ese filtro explícito; estos cuatro ya pasaron en la tanda completa anterior. El build final compara sus veinte fuentes productivas con el snapshot revisado y termina con código cero. Tipos de producto/tests y lint pasan. La revisión identifica cero implementación faltante y cero hallazgos accionables tras corregir el P2.

Los equivalentes reales reemplazan sólo los nombres de archivo propuestos, sin reducir criterios ni trazabilidad. El acceso es la composición backend privada, como en los owners de retención; no se inventa un recorrido humano. Driver/scheduler siguen en T186, hosting/restore/ensayos en T199/T201/T203 y sus gates, y el resto documental transversal en T174. Ningún FR, SC, RG u OG completo se certifica por cerrar estos dos owners. La suite general conserva sus 28 fallos preexistentes de suscripciones; el cierre no afirma que todo el repositorio esté verde.
