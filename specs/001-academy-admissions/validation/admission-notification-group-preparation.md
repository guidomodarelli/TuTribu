# Preparación atómica del correo agrupado — avance de T185

## Alcance y límites

Este incremento conserva todas las descripciones, IDs, dependencias y criterios de las 212 tareas originales. No cierra ninguna: 181 completas y 31 pendientes, con 71 aprobaciones temáticas intactas. T185/T186 mantienen su alcance integral.

`PostgresAdmissionNotificationGroupPreparation` recibe sólo tribu, grupo existente y versión original observada. Conserva el executor protegido de backend, el fence de tribu y los locks de los hechos actuales antes de cerrar grupo y miembros. Cada fuente se vuelve a evaluar contra su cuenta y correo confiable actuales, rol, solicitud, preferencia, habilitación y versión seleccionada de correo preparada y probada. No admite contactos, roles, capacidad ni contenido de un navegador.

Una capacidad temporalmente no disponible conserva el grupo abierto con resultado explícito. Una preferencia omitida, rol retirado o falta de correo confiable suprime las unidades correspondientes. Los vencimientos son los originales del evento; el manifest toma el menor plazo restante. Los efectos de miembros, cierre, contenido completo y único outbox original comparten la misma transacción. Una denegación tardía revierte el conjunto; el aviso interno y la decisión mantienen sus owners.

El replay con la versión original devuelve una referencia mínima al mismo outbox. No modifica recursos, claves, texto o vencimiento. Un comando con otra versión se rechaza; una respuesta incierta no inicia otro envío ni retry automático. El preparador no descifra credenciales ni llama a un proveedor, y todavía no tiene composición pública.

## Contenido completo y continuidad

El intent incluye grupo, versión, manifest íntegro ordenado, canal correo, remitente exacto, asunto, texto genérico en español y enlace pasivo a la bandeja autenticada o al pedido propio. No contiene nombres, motivos internos, contactos, códigos ni credenciales. La dirección confiable se utiliza transitoriamente para vincular la firma y no se persiste en el intent. Los casos de contenido del solicitante son contratos de dominio; la cohorte Native de este incremento prepara grupos de revisión y cierres históricos.

`createAdmissionNotificationEmailIntentMac` tiene un dominio independiente del MAC individual anterior, que permanece sin cambios. Una proyección en orden fijo autentica todo el contenido consumido, cada miembro, pagador y versión de conexión, destinatario, idempotencia, versión de consumo y relojes nativos exactos; no depende del orden de claves de `jsonb` ni trunca a `Date`.

`assertReconciledMessagingPrivateMacKeyMaterial` exige backend nativo y bloquea primero todas las pruebas ya existentes. Reutiliza después el comparador original sobre esas filas inmutables, de modo que no puede inscribir una clave nueva. Su configuración inicial está reconciliada antes de firmar. Después del último reloj se vuelve a leer recovery, entorno, época y disponibilidad de claves, y se verifica el payload recién firmado con ese material final. Un reemplazo tardío bajo el mismo keyId no permite confirmar efectos; esta verificación no añade otra consulta SQL después del último snapshot.

## Evidencia actual

- Pasan 150 casos locales en seis archivos completos, cero fallos y cero omisiones, con 2098 inputs estables: 13 de contenido, 39 de integridad, 87 de políticas existentes y 11 del contrato individual anterior.
- Lint, tipos de producto y tipos de tests terminan con código cero sobre los 15 archivos TypeScript modificados.
- La revisión final de código termina con cero hallazgos accionables:15 modificados, 7 normativos, 23 contextos y 13 recibos con hashes estables. Es revisión de código; el contraste conjunto de toda la evidencia y documentación conserva su propio recibo.
- La cohorte Native actual completa terminó **cinco pasados, cero fallos y cero omisiones en tres archivos**, sin filtros, con 2095 inputs estables y proceso consumido. Usa PostgreSQL y Web Crypto reales, datos y claves sintéticos, sin SDK ni mensajes reales. Sus cinco casos, junto a los 150 locales, suman **155 casos actuales distintos** por archivo y nombre; ninguno procede de sondas, rojos o la cohorte reemplazada.
- La arquitectura pasó ocho vistas y 86 enlaces en Chromium/WebKit a 390/1280, con recursos heredados conservados. La comprobación se renovó después de precisar la continuidad final, sin errores, desbordes ni enlaces ausentes.

## Historia de errores conservada

La primera cohorte Native terminó 2/1/0 en un archivo completo, con 2092 inputs estables. Pasaron ventana agrupada real, concurrencia y contenido íntegro, y los cierres históricos. El segundo caso intentaba generar un aviso para un guardián después de que el propio test le retirara el rol. pg directo confirmó `42501` en el writer; el control con el líder vigente pasó, con ambas sondas revertidas. Sólo se movió la creación de esos hechos antes del cambio de rol. El diagnóstico temporal se eliminó tras comprobar propiedad y hash; no cuenta como cobertura del producto.

La revisión inicial encontró dos controles incompletos: última configuración y material MAC previamente reconciliado. Un primer rojo Native 0/1 se conservó; el rojo detallado 0/1/0, completo y con 2093 inputs estables, registró fulfilled en las seis variantes: recovery, entorno, época, clave de payload retirada, material distinto bajo el mismo keyId y un keyId nunca reconciliado. Se corrigieron sin enrolar material desde la preparación.

La revisión posterior identificó otra variante: cambio de material bajo el mismo keyId únicamente en el último snapshot. Su Native 0/1/0 completo, con 2093 inputs estables, observó grupo y outbox reales y devolvió fulfilled:queued, frente al rechazo esperado. La corrección verifica el MAC completo con el snapshot final.

La cohorte de cuatro casos iniciada antes de esa última corrección se conserva como antecedente. Su fuente anterior se archivó antes de editarla; terminó y se consumió con cuatro pasados, cero fallos y cero omisiones, pero sourceInputsStable:false impide usarla como comprobación de la versión corregida. La cohorte actual de cinco casos incluye todos esos escenarios. No se cosen los reportes anteriores ni se suman sondas o filtros para presentar un Native completo verde.

## Trabajo integral pendiente

Continúan pendientes la autoridad actual del grupo antes de presupuesto/secretos/RPC, recuperación funcional auditada, preparación del sender independiente de códigos, selección y purga acotadas, composición de mantenimiento protegido, runs, scheduler, estado visible y gates operativos. El dispatcher debe revalidar autoridad actual de cada miembro y marker original; esta preparación no concede permiso de envío.

La latencia del mantenimiento completo no está medida. Estos casos no prueban rendimiento externo, driver saludable, aceptación/entrega del proveedor o el cierre integral de US8. No hay despliegue, migración productiva ni nuevo envío real por este incremento.

El inventario oficial de Neon posterior a todos los productores confirma **cero ramas temporales propias y tres originales conservadas, tres en total**. La comprobación es de sólo lectura; las ramas de validación fueron retiradas por sus owners. La revisión conjunta final y el CI propio del futuro checkpoint siguen siendo pasos independientes antes de cerrar este incremento privado.
