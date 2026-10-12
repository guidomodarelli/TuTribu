# Matriz de cuotas, cadencia y validación local

Base de trabajo `1eabf787`; T164 abierta. Los cinco AC de US11 y sus controles de permisos/privacidad/alcance siguen repartidos entre las tareas T164/T165/T167 y se deben comprobar íntegros antes de cerrar esta tarea. Este registro no convierte una prueba aislada en una matriz completa.

## Incremento validado de tres canales

`tests/unit/modules/messaging/application/messaging-usage-and-abuse.test.ts` añade tres casos para correo, SMS y WhatsApp. Usa PostgreSQL propio, identidad/caso de uso actuales, dispatcher, preparación, SDK real y transporte controlado. Después de una entrega aceptada, reduce el cupo de verificación a cero y suspende la conexión; verifica localmente el código vigente, su replay y el replay de emisión sin nuevo envío. Conserva reserva consumida, intento aceptado y política ON, sin membresía ni verificación global de identidad.

La primera ejecución Native terminó con cero casos aprobados, tres fallidos y cero excluidos. Los tres casos intentaban abrir un envelope ya eliminado después de la entrega real: el error pertenecía al test y no justificaba restaurar material secreto en producción. Ese reporte permanece fallido.

Después del terminal se corrigió la prueba para capturar el código recibido por el transporte controlado sólo en una variable privada y efímera. También exige que el envelope transitorio se haya eliminado antes de validar localmente. El replay conserva el DTO original íntegro. Tipos y lint de esta versión pasaron; SHA256: `12FCA164B76D8D6C422DFD9EBE73E29EDF9E5900BB8699A2D17A9E26F2B8087B`. La revisión actualizada terminó sin hallazgos y la reejecución completa terminó con tres casos aprobados, cero fallidos y cero excluidos; cada caso confirmó también la limpieza de su rama propia. No se restaura el material secreto ni se modifica producción para el test.

La reejecución actual de cinco suites de contratos terminó con 37 casos aprobados, cero fallidos y cero excluidos: `reserve-messaging-usage`, `manage-messaging-usage-use-cases`, `read-messaging-usage-operation`, `message-dispatch` y `admission-policy-country-facts`. Ejercen casos de uso reales mediante puertos propios y temporizadores reales donde corresponde; este lote local no prueba contadores PostgreSQL ni transporte SDK.

Un segundo lote local terminó con 18 casos aprobados, cero fallidos y cero excluidos: rutas de políticas de uso, componente de configuración con UI compartida real, cliente HTTP propio, intent y continuación de reautenticación. Valida permisos/input/DTO, cambios de configuración y recuperación de la operación original con dobles en puertos propios; no sustituye el recorrido Next/Better Auth/PostgreSQL del owner de US6. Este primer incremento reúne 55 casos locales y tres Native nuevos aprobados; el siguiente apartado añade otros tres Native. T164 permanece abierta por el resto de su matriz original.

## Despacho nuevo con cupo cero

`messaging-zero-quota-admission.test.ts` añade tres casos de correo, SMS y WhatsApp mediante el owner actual. La solicitud confirmada se conserva, pero el worker debe diferir el despacho por cuota antes de preparar credenciales: cero llamadas al proveedor, intentos o reservas. La presentación real sin prueba sigue denegada por `additional_verification_required`; no se crean solicitud de ingreso ni membresía y la política ON conserva su versión y época.

El chequeo específico de tipos de tests, el chequeo de aplicación y lint pasaron. La revisión terminó sin hallazgos accionables; SHA256 `0296F3691E66586DDE9EFA4BEDC3A2B0508A187C7F689CAB5DB1C4B7D0442B41`. El lote Native terminó con tres casos aprobados, cero fallidos y cero excluidos, incluida la limpieza de sus ramas propias. El incremento actual suma seis casos Native nuevos aprobados; el resto de la matriz de T164 sigue abierto.

## Matriz original por contrastar

| Requisito | Cobertura localizada | Estado para esta tarea |
|---|---|---|
| Cuenta/contacto/desafío/tribu/plataforma, canales, cadencia y diagnóstico | `code-request-budget`, `contact-budget-continuity`, `credential-validation-budget`, `contact-verification-channel-failure-limits`. | Auditar casos y ejecutar los faltantes; no afirmar matriz completa. |
| Último cupo entre cien competidores | `delivery-attempts-and-usage`. | Prueba real existente localizada; falta validación actual de T164. |
| Reducción de cupo/país antes y después del marker | `delivery-attempts-and-usage`, `admission-phone-dispatch-pipeline`, `messaging-usage-policy-configuration`, nuevo `messaging-zero-quota-admission`. | Tres canales con cuota cero y ON aprobados; contrastar el resto de la matriz de reducción/countries. |
| Código conocido válido con cupo agotado y caída/suspensión | Nuevo archivo y `contact-verification-persistence`. | Nuevo incremento de tres canales aprobado; el resto de la matriz conserva su alcance. |
| Configuración temprana/CAS independientes del consumo, conexión y época | `messaging-usage-policy-configuration`, sus use cases y UI real de US6. | Reusar el owner existente; auditar versión/no-op/replay/consumo y concurrencia. |
| Cinco AC, permisos y cero fugas de US11 | Contratos/owners/rutas/UI de T165/T167 y pruebas existentes. | No se acredita mediante filas PostgreSQL o un test de compilación. |

La cuota de envío se aplica a la autorización del marker/dispatch. No se infiere que emitir un desafío con cupo agotado deba rechazarlo antes de su creación. No hay cambios de producción, SDK, schema o configuración desplegada en este incremento.

## Brechas concretas de validación pendientes

La auditoría no confirmó un fallo de producción. Identificó pruebas que deben aislar el techo horario de cuenta al cambiar contacto; conservar consumo al alternar conexión/canal y sesión; agotar el bucket de verificación compartido por admisión, diagnóstico y SMS alternativo sin consumir el de avisos; y autorizar un marker con país permitido por el líder pero prohibido por la plataforma.

Para los cinco AC originales también falta incluir una plantilla explícita en la matriz HTTP de campos prohibidos y observar el logger/traza finales ante credencial/código y error upstream. Las pruebas locales de alcance/propósito y snapshots de autenticación global cubren AC-05; este criterio no exige repetir un ensayo OAuth externo. La carrera real de cien competidores por el último cupo de avisos ya está localizada y debe verificarse junto al resto de la matriz, sin inventar otra carrera por el nombre de la tarea.

La reducción a cero con trabajo ya en cola cuenta con una prueba real en `verification-delivery-pipeline.test.ts`; el nuevo recorrido de tres canales añade la raíz de admisión y la presentación sin proof, sin duplicar implementación de producto. La reejecución de cuatro suites existentes de presupuestos terminó con 18 casos aprobados, cero fallidos y cero excluidos: cinco de solicitudes/cadencia, tres de continuidad de contacto, siete de validación de credenciales y tres de fallos por canal. Las fuentes conservaron sus hashes y la limpieza propia quedó confirmada. Este lote acredita esos contratos existentes y no elimina las seis brechas observables de la auditoría.
