# Correo de admisión ante caída del proveedor y nueva composición del procesador

## Alcance y resultado

Incremento de pruebas para T177/T185/T191 sobre el código de producto de `ff227a521f3d9bcf16b24799459aa87f643bdae8`. El nuevo ensayo [admission-notification-outage-restart.test.ts](../../../tests/unit/modules/messaging/infrastructure/admission-notification-outage-restart.test.ts) terminó con **un caso aprobado, cero fallidos y cero omitidos**, con **3.602 inputs estables**. La cohorte identifica por hash el ensayo agregado y el resto del árbol de trabajo.

Al registrar este ensayo en `2d688865`, el inventario conservaba **181 completas, 31 pendientes y 212 totales**, junto con las 71 temáticas aprobadas. Este caso incorpora evidencia del fallo y de su procesamiento posterior; la verificación integral de los seis escenarios de US8 conserva su alcance completo. El cierre posterior del modelo T180 y el inventario vigente figuran en [la auditoría consolidada](notifications-and-scheduler.md#cierre-del-modelo-t180), sin ampliar lo acreditado por este Native.

## Recorrido ejecutado

1. El helper autorizado crea una rama propia del proyecto TuTribu, aplica los artefactos y prepara un grupo individual real con sus fuentes de admisión ya confirmadas.
2. La composición de mensajería usa los repositorios PostgreSQL, las guardas de grupo, la preparación privada y el SDK reales. El único borde controlado es el transporte HTTP del proveedor, que responde 503.
3. El worker registra el marker y el resultado incierto. Se espera también la observación de su trabajo original antes de consultar el almacenamiento.
4. Otra composición nueva reconstruye repositorios, adapters y factories sobre la misma base. Consulta el original conservado sin repetir la petición al proveedor.
5. El helper cierra sus conexiones y elimina su rama propia. Las operaciones de Neon registran la eliminación terminada; la consulta posterior conserva sólo las tres ramas originales o ajenas.

Todos los efectos SQL pertenecen a la rama temporal. Las credenciales reales de Zavu, los destinatarios del piloto y las conexiones productivas permanecen fuera de este transporte. No hubo mensajes reales, migración productiva ni despliegue.

## Contratos observados

| Propiedad | Resultado |
| --- | --- |
| Primer procesamiento | Un original adquirido y autorizado; cero aceptados, uno `unknown`, cero efectos sin resolver por el backend. |
| Transporte | Una petición POST al transporte controlado, con respuesta 503. El resultado propio no contiene el mensaje privado de ese error. |
| Registro durable | Una entrega `unknown`, un intento y una reserva consumida. |
| Fuentes de admisión | Se conservan las identidades, estados y versiones de las solicitudes y las identidades y tipos de las obligaciones. |
| Original de la entrega | Se conservan su identidad, grupo, idempotencia y fecha límite; el plazo está dentro de sus veinticuatro horas originales. |
| Nueva composición | Cero originales adquiridos, cero aceptados y ninguna petición adicional. La entrega sigue `unknown`, con un intento y una reserva. |

El primer worker completó la persistencia de su observación en 34.706 ms, dentro del presupuesto original. La composición siguiente terminó en 3.033 ms. Son dos observaciones del ensayo, sin certificación de percentiles o de un driver operativo. El resultado `workerOutcome=completed` describe el trabajo del procesador; la entrega permanece incierta y conserva su consumo.

La prueba recompone el procesador sobre el almacenamiento conservado. La restauración de copias, las claves del hosting y el reinicio operativo mantienen sus propias verificaciones. Las variantes de resolución de solicitudes, la autorización HTTP, los canales y el resto de US8 conservan las pruebas y criterios que les corresponden.

## Ejecución y procedencia

```text
RUN_ADMISSION_SQL_TESTS=1 pnpm exec vitest run tests/unit/modules/messaging/infrastructure/admission-notification-outage-restart.test.ts --reporter=json --outputFile=.git/codex-us8-outage-native-first.json
```

En Windows se configuró la variable sólo en el proceso de prueba. El comando terminó con exit code 0. Sus recibos privados son `.git/codex-us8-outage-native-first-target.json`, `.git/codex-us8-outage-native-first-outcome.json`, `.git/codex-us8-outage-native-first.json` y su log. El target y el outcome confirman los 3.602 hashes sin cambios durante la ejecución.

El chequeo actual de tipos de tests y el lint de los dos ensayos modificados pasaron. La revisión aislada de Codex verificó dos fuentes, siete contextos y nueve recibos estables y terminó sin hallazgos accionables; SHA256 del dictamen: `162c5a06982058db257a409bd92719a79c54be1a7e10225bf005ce3efbdd0133`.

El [CI exacto de `ff227a52`](https://github.com/guidomodarelli/TuTribu/actions/runs/39015288706) aprobó 551 archivos y 5.934 casos, con 315 archivos y 879 casos omitidos, además de lint, ambos chequeos de tipos y build de 56 páginas. Pertenece al padre del nuevo ensayo; el Native de este documento tiene su ejecución propia y el checkpoint que lo guarde requiere su propio CI.

El checkpoint `2d688865f8d6606bbd4642dadd900ee6f80a1b2d` ya guarda el ensayo y este documento. Su [CI propio](https://github.com/guidomodarelli/TuTribu/actions/runs/39018974323) terminó aprobado con 551 archivos y 5.934 casos aprobados, 316 archivos y 880 casos omitidos, lint, ambos chequeos de tipos y build de 56 páginas. El Native sigue siendo el caso independiente descrito arriba; su omisión en CI no se presenta como otra ejecución Native.

## Límites conservados

El ensayo acredita la conservación de una solicitud pendiente, sus obligaciones y el grupo al fallar el transporte, y el comportamiento de una composición posterior. T176–T191 mantienen sus criterios íntegros hasta completar su auditoría. SC-015 y OG-05 requieren todavía el driver frecuente, la infraestructura saludable y las mediciones operativas; OG-03 y OG-04 conservan sus ensayos reales autorizados y sus límites originales.
