# Bloqueo después de una restauración real

## Alcance y estado

Este avance de **T199** ejercita el código de producto existente sobre `991972d2d0f0aaf860ca4f816ebf71bd7dafa780` y cinco fuentes de prueba nuevas, identificadas por sus hashes en el recibo privado. No introduce cambios funcionales ni cierra tareas: siguen **196 completas, 16 pendientes y 212 totales**, con **71 temáticas aprobadas**. T199 conserva pendiente la reapertura controlada; T201, T203 y OG-02 mantienen su alcance completo.

La [infraestructura de copia aislada](messaging-restore-copy-baseline.md) crea un padre sintético propio y una hija exacta. El checkpoint del padre permanece inmutable durante el ensayo. Los adapters de la hija se componen de nuevo con su capacidad SQL; no reutilizan closures del padre. No se ejecuta SQL, restore ni limpieza sobre las tres ramas originales o ajenas.

## Escenario y resultados observados

La creación, configuración, diagnóstico y activación de la conexión usan sus owners reales. También se ejecutan la política ON abierta, la emisión y verificación locales, la solicitud pendiente y el dispatcher con SDK real y transporte HTTP propio cerrado. Se conserva un resultado incierto auténtico del owner tras perder la respuesta de su único POST sintético. Ningún transporte recurre a la red.

Antes de restaurar, el mismo secreto se abre correctamente y la prueba aplicada permite aprobar realmente la solicitud en la hija. Luego se pausa la política y se desconecta la conexión: sus dos versiones conservan el historial de retiro, se invalida la prueba disponible y se cancela el envío en cola. La restauración real devuelve filas, pruebas, solicitudes, outbox y contabilidad al checkpoint; la membresía aprobada en la hija desaparece. Las claves y la época externas permanecen fuera del snapshot.

| Control real | Resultado observado después del restore |
| --- | --- |
| Recovery lock externo | Preflight no preparado; secreto, activación, decisión, solicitud y código rechazados. |
| Época externa nueva, conservando todas las claves antiguas | Secreto rechazado; código antiguo invalidado sin prueba nueva; decisión y solicitud antiguas rechazadas; ningún ingreso concedido. |
| Clave de credencial retirada con época coincidente | Secreto rechazado antes del descifrado. Esta variante aísla el gate de claves; no es una instrucción operativa para retroceder la época. |
| Dispatcher real sobre el envío antiguo | Cero autorizados, aceptados, entregados e inciertos nuevos; cero llamadas al transporte después del restore. |
| Web Crypto nativo observado sin reemplazar su implementación | Cero llamadas a `decrypt` durante los controles posteriores al restore. |
| Historial del intento incierto | Intentos, reservas, consumo y fila `unknown` originales conservados sin duplicación. Solicitudes y conjunto de IDs de pruebas preservados. |

El caso comprueba que las sesiones, los códigos y las pruebas continúan dentro de sus plazos reales durante las negativas. Refresca evidencia nativa antes de congelar el checkpoint, sin ampliar la ventana de diez minutos del producto. Un éxito indebido corta el caso inmediatamente; las discrepancias de código público se acumulan como fallos de la misma ejecución, sin aceptar un rechazo genérico.

## Validación y evidencia

- Native final: **un archivo, un caso aprobado, cero fallos y cero omitidos**, en aproximadamente 18 minutos. **3.620 inputs y dos helpers privados estables** durante toda la ejecución; no hubo errores del reporter seguro.
- Tipos de tests, lint focal y comprobación del diff aprobados. Revisión Codex final sin hallazgos accionables, con **35 inputs estables**; su dictamen estático precede al Native y no certifica un despliegue.
- Se conservan tres intentos anteriores fallidos: una expectativa incompleta sobre las dos versiones del secreto, un fallo cuyo wrapper no preservó la causa en JSON y un código de rechazo esperado incorrectamente. Se corrigieron los oráculos y la observabilidad contrastándolos con los owners reales; no se cambió producto para obtener verde.
- La observación final de Neon confirmó **tres ramas originales o ajenas y cero ramas restantes propias o desconocidas**.

| Recibo privado | SHA256 |
| --- | --- |
| Informe Native final | `314709ea102199fb3ff742a2adebfc6f653fee57992fde7d80709fb2dede6614` |
| Resultado e inputs estables | `f6d0d80fb75899c4f0423167e6f4f9098b8fad93b494d965048349859a6bedc6` |
| Target y hashes iniciales | `8f81682c4006968f2da12ae41bcf9afa33448389fb4481e657865f14e2f52556` |
| Revisión estática final | `5009f8b63926449b37ab19a86a6a432ddb50848200d592c8d18b547a8b6e6d49` |
| Inventario final de ramas | `ab81e204408283057d53194f177769dbd75d1b6de84c4e8571740197b8972eeb` |

Los recibos quedan en `.git/` fuera del árbol versionado. No contienen claves, URI, contactos, códigos ni credenciales. Los cinco archivos de prueba son `tests/support/messaging-restore-fixture.ts`, `tests/support/messaging-restore-admission-fixture.ts`, `tests/support/messaging-restore-dispatch-fixture.ts`, `tests/support/constants/messaging-restore-safety.ts` y `tests/unit/modules/messaging/infrastructure/messaging-restore-safety.test.ts`.

## Condiciones todavía pendientes

Este hito demuestra negativas de recuperación en Node con Web Crypto y PostgreSQL reales. Todavía falta ejercitar la reapertura con conexión nueva, diagnóstico y política actuales, y completar el protocolo privado que suspende o invalida filas antiguas con la recuperación bloqueada. Tampoco demuestra cierre de todas las instancias o drivers operativos, configuración externa real de ambos targets ni sus ensayos de hosting. No envía mensajes externos, no cambia hosting y no sustituye T201, T203 ni OG-02.
