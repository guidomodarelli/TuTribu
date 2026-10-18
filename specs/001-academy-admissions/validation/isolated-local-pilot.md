# Piloto local recuperable

El usuario confirmó que no existe un archivo privado con las claves originales y pidió preparar un entorno nuevo. Se conserva la rama protegida del piloto anterior. El entorno nuevo usa una rama hija propia de TuTribu, separada de producción, y el líder existente de la tribu `test`.

Se aplicó el journal SQL versionado únicamente a la rama nueva. Se generaron seis keyrings independientes, una época y un secreto de sesión propios. Sus claves importadas son no extraíbles; la inscripción y comprobación de continuidad de los dos propósitos HMAC pasaron en la base propia. La configuración y la nueva clave de Zavu están cifradas con Windows DPAPI `CurrentUser`, fuera de Git. Se verificó su recuperación desde procesos distintos, sin archivos intermedios con material en claro. La recuperación requiere el mismo perfil de Windows.

El servidor usa `https://dev.tutribu.app`, el origen local actual del repositorio. Se actualizó portless de 0.13.0 a la versión mínima requerida 0.15.5 y se verificaron DNS a loopback, CA ya confiable y la respuesta HTTPS 200. El navegador comprobó el liderazgo de `test` y el formulario vacío de conexiones. No se cambiaron los archivos dotenv del repositorio ni se usó su conexión productiva para SQL.

## Clave y conexión

Por pedido expreso del usuario se creó en la organización TuTribu de Zavu una clave de producción dedicada al piloto. Se conservan las claves anteriores. La clave nueva no figura en este documento, capturas ni logs; su copia privada recuperable usa DPAPI.

El usuario completó la comprobación de dispositivo de Google y TuTribu confirmó después la autenticación reciente. Se guardó **«Piloto TuTribu test»** mediante el formulario privado del producto. La UI confirmó la candidata en estado borrador, configuración 1; una consulta PostgreSQL de sólo conteos confirmó una conexión en `test`. Guardar la conexión no valida credencial, canales o recepción, ni selecciona una conexión activa.

Una confirmación propia posterior permitió ejecutar la comprobación real de la credencial: Zavu confirmó una cuenta de producción y la UI mostró «Credencial comprobada». No se envió un mensaje. El piloto se reinició después mediante portless usando el build ya validado; recuperó del almacén cifrado la misma configuración, base y claves. Este modo compilado evita recompilar rutas durante el ensayo y no acredita por sí solo una mejora de latencia.

La comprobación de la credencial y las preparaciones de recursos conservan su autorización y resultado propios. El piloto conserva el máximo autorizado de diez mensajes en total y USD 20, sólo para correo, SMS y WhatsApp preparados y los destinos ya autorizados. Hasta este checkpoint se enviaron **cero mensajes**.

El inventario independiente conserva cuatro ramas: las tres anteriores y el piloto nuevo persistente. La rama nueva tiene custodia y finalidad explícitas; no es un residuo de las pruebas efímeras. Esta preparación local no acredita los ensayos de restauración y control externo en Node/Workers ni cierra OG-01 a OG-06.
