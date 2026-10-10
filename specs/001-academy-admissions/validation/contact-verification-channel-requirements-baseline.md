# Matriz de verificación adicional por canal

Preparación de T106 sobre `9fcd3302`, con T104/T105 completas y 123 tareas completadas de 212. Esta matriz conserva el alcance de los siete AC, los tres canales, las fronteras de países/cupos y los ensayos ON externos autorizados. Encontrar un test o un tipo no acredita su ejecución ni su suficiencia.

| Criterio | Correo | SMS | WhatsApp | Evidencia adicional necesaria |
| --- | --- | --- | --- | --- |
| AC-01: pedido explícito, cuenta/conexión/destino y límites | Pipeline nativo de correo y contratos HTTP existentes | Pipeline telefónico nativo | Pipeline telefónico nativo | Contrastar ejecuciones vigentes, UI y preparación; ensayos externos separados. |
| AC-02: código vigente, prueba local y autenticación global intacta | Writer/persistencia nativos | Validación telefónica nativa | Pipeline telefónico nativo | Registrar sesiones, cuentas, evidencia y `emailVerified` sin cambios; no confundir entrega con prueba. |
| AC-03: cuenta, tribu, desafío y propósito ajenos | Otra cuenta/tribu y UUID de desafío inexistente: SQL nativo verde | Otra cuenta/tribu y UUID de desafío inexistente: SQL nativo verde | Otra cuenta/tribu y UUID de desafío inexistente: SQL nativo verde | El cruce con otro desafío real y el cruce de propósito permanecen pendientes por canal. No se extrapola esta ejecución a esos bordes ni a todos los efectos de invitación. |
| AC-04: cinco fallos, vencimiento y límites acumulados | Writer y persistencia existentes | Debe contrastarse por canal | Debe contrastarse por canal | No reset por reenvío, configuración o canal; escenarios observables de UI. |
| AC-05: alternativa SMS explícita | No hay alternativa telefónica para un correo | Destino de la alternativa, misma cuenta/contacto | Origen configurado de la alternativa | Invalidación anterior, consumo común, sender preparado y consentimiento; no sustituir por fallback automático. |
| AC-06: aceptado/entregado no acredita contacto | Pipeline nativo sin proof y UI existente | Pipeline telefónico sin proof | Pipeline telefónico sin proof | Comprobar estado de transporte y proof sólo después de código correcto. |
| AC-07: vínculo de otra cuenta y recuperación segura | SQL/binding y container existentes | Debe contrastarse el contrato telefónico | Debe contrastarse el contrato telefónico | No reasignación, owner no revelado, ayuda operable y cero efectos de admisión. |

## Frontera de países y versión de uso

Las pruebas existentes de `delivery-attempts-and-usage.test.ts` ejercen reducción de países antes/después del marker en diagnósticos. No se usan para afirmar el recorrido completo de admisión. El incremento actual de `admission-phone-dispatch-pipeline.test.ts` añade cuatro casos SMS/WhatsApp con cambio de país en los bordes reales del worker, SDK y PostgreSQL: antes del marker espera cero RPC/attempt/reservation; después exige conservar el intento autorizado y su versión efectiva. Ambos conservan el código local vigente, la política ON y el consumo original sin reset.

Los cuatro casos terminaron verdes contra PostgreSQL y el SDK reales en 532,58 s, sin fallos: SMS antes del marker 127,01 s, WhatsApp antes 130,82 s, SMS después 138,10 s y WhatsApp después 136,65 s. Los dos casos sin reducción quedaron fuera de esa selección. Su repetición posterior terminó verde en 271,08 s, dos casos y cuatro filtrados; se conserva como una corrida distinta. El typecheck encontró un narrowing del resultado dentro del callback SQL; se corrigió usando un snapshot const ya confirmado, sin cambiar producto ni expectativas. Types/tests y lint finales tienen exit 0. No se suman los casos omitidos como ejecutados.

## Ejecuciones y autorizaciones

La ejecución local inicial de aplicación, reglas de desafío y boundary de errores pasó 55 casos sin fallos. Se distingue de las ejecuciones SQL/SDK, UI y entregas externas. T106 y US5 continúan abiertos.

Los ensayos ON externos requieren los recursos y cierres de `operational-gates.md`: preparación de hosting/identidad, credenciales y recursos del líder, pagador y destinos expresamente autorizados. Esta preparación no envía mensajes reales ni aprueba esos gates; tampoco modifica OAuth, producción o login global. Antes de solicitar la autorización se completará la matriz local y se presentará el ensayo concreto con su alcance.

Los casos registran uso solicitado v2, intento autorizado v2 cuando existe y política vigente v3 después de retirar países. Antes del marker hay cero llamadas al SDK, intentos y reservas; después hay un único POST con reserva consumida. Antes de introducir el código no hay proof ni membresía. Tras validarlo hay una prueba local, un solo evento de pedido, política ON/epoch/version sin cambios y las mismas cuentas, sesión y `emailVerified=false`; el transporte nunca acredita por sí solo el contacto. Cada rama propia confirmó su eliminación. Esta ejecución cubre esa frontera SMS/WhatsApp; no certifica todavía todos los AC, la matriz de UI o entregas externas.

La revisión del incremento de países terminó con cero hallazgos, tres hashes estables y manifiesto 799C7F1B37C93458ECFDB4198BDDBAF2D3392A4809D17BC636AAA558268B73E8 sobre HEAD 9fcd3302. Confirmó las fronteras reales de los hooks y los oráculos sin mocks de librerías.

Los casos de aislamiento de cuenta/tribu/desafío de `admission-verification-scope-isolation.test.ts` se parametrizaron para correo, SMS y WhatsApp. La ejecución nativa terminó con exit 0, tres casos verdes y cero omitidos en 400,67 s: correo 141,85 s, SMS 129,14 s y WhatsApp 129,69 s. Un código auténtico no puede validarse desde otra cuenta o tribu reales ni con un UUID de desafío inexistente; después de los rechazos, la cuenta original conserva la posibilidad de validarlo. Se preservan los oráculos originales de ausencia de efectos nuevos y autenticación global, con PostgreSQL y criptografía reales. Cada fixture conserva su preparación específica y limpieza de rama propia. El reporte local es `.git/codex-t106-channel-isolation-native.json`; no se acredita un cruce contra otro desafío real ni de propósito que esta suite no ejecuta.

El cruce contra otro desafío real, el cruce de propósito, los restantes AC por canal, UI y ensayos ON autorizados conservan su verificación pendiente. T106 permanece abierta y siguen 123 tareas completas y 89 pendientes.
