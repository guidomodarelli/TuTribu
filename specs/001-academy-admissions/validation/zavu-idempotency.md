# Idempotencia de Zavu (T205, OG-04)

Ensayo autorizado por el usuario el 2026-10-19 sobre el piloto local aislado, con la conexión candidata de producción (configuración 3), su remitente de correo y el único destino controlado que el usuario indicó. El SDK es `@zavudev/sdk` 0.57.0, con los mismos parámetros que `ZavuMessageDeliveryTransport`: canal correo, remitente en `Zavu-Sender`, `fallbackEnabled: false`, `idempotencyKey` propio y reintentos del SDK apagados. Los recibos privados guardan el destino enmascarado y hashes de clave e IDs: `.git/admission-pilot-zavu-idempotency.json`, `-bodies.json` y `-window-30m.log`.

## Primera clave

| Paso | Respuesta | Efecto |
| --- | --- | --- |
| Envío original | 202, `queued` | Un correo aceptado. |
| Misma clave y mismo payload | 409 | Sin envío nuevo. |
| Misma clave y payload distinto | 409 | Sin envío nuevo. |
| Consulta por ID propio | 200, `delivered`, mismo ID y canal | Sólo lectura. |

El transporte observó cuatro peticiones: tres `POST /v1/messages` y una consulta del ID propio. Hubo un único mensaje del proveedor.

## Cuerpo del 409

Una segunda clave repitió el envío original (202) y, cinco segundos después, las dos variantes. Ambas devolvieron 409 con **el mensaje original completo** en `message`: `id`, `to`, `from`, `senderId`, `channel`, `direction`, `status`, `providerMessageId`, costo y fechas. Una repetición posterior con la clave guardada confirmó el mismo ID en ambas variantes y estado `delivered`, sin envío nuevo.

Conclusiones verificadas:

- La deduplicación es por clave dentro de la credencial: el contenido no forma parte de la comparación. Un payload distinto con la misma clave no se rechaza de otra forma ni se envía.
- El 409 está correlacionado: devuelve el mensaje original. Un cliente puede recuperar su ID y estado sin volver a enviar.
- No hay reenvío al repetir la clave en la ventana observada.

## Cambio en el producto

`ZavuMessageDeliveryTransport` clasificaba cualquier 409 como `unknown` sin ID. Ahora, si el 409 trae el mensaje original de este mismo intento (salida, canal, remitente y destinatario; el correo se compara sin distinguir mayúsculas), conserva su ID y clasifica su estado igual que una respuesta exitosa. Un 409 sin mensaje correlacionable sigue `unknown`. El producto sigue sin reenviar automáticamente: el 409 sólo aparece en una continuación explícita del mismo intento original. Tres casos con el SDK real sobre transporte HTTP cerrado cubren la recuperación y los rechazos por otro remitente, otro destinatario y mensaje entrante.

## Ventana

La segunda clave se envió a las 12:09 UTC del 2026-10-19 y se repitió a las 12:40:21 UTC, unos 31 minutos después, con el mismo payload y con el payload distinto. Las dos repeticiones respondieron 409 con el mensaje original completo (mismo hash de ID, estado `delivered`) y no hubo envío nuevo: la deduplicación se sostiene al menos 31 minutos.

## Alcance no medido

No se midió el límite superior de la ventana ni el alcance entre credenciales o proyectos: el usuario decidió no crear una segunda conexión de Zavu. Por eso el producto no asume un TTL: un 409 sólo se reconoce cuando trae el mensaje correlacionado del mismo intento, y fuera de ese caso la entrega sigue `unknown` sin rePOST automático.

## Consumo

Dos correos reales aceptados, uno por clave, al destino controlado. El contador privado del piloto pasó de dos a cuatro emisiones dentro del tope de 500 y del límite de USD 20.
