# Variables externas en una función Node aislada

## Resultado y alcance

El [recibo del ensayo real](admission-node-environment-preflight.json) confirma que Neon CLI 8.0.10 y `@neon/config` 1.8.4 pudieron desplegar una función propia mediante `neon.ts`, leyendo un valor de prueba desde el entorno del proceso del controlador. El comando usó `--no-env-pull`; el valor y el bearer privado no formaron parte de sus argumentos. Se usó un canario deliberadamente no secreto antes de instalar material criptográfico.

El plan admitido contenía únicamente un `noop` de la rama propia y la creación de su función. El controlador verificó los dos pasos y cero conflictos antes de aplicar. No solicitó cambios de cuentas, permisos, otros servicios, región o capacidad. La función cerraba antes de responder si faltaba el bearer, había vencido su plazo o la identidad nativa de la rama no coincidía.

La llamada anónima recibió **401** y la autenticada **200**. El host informó Node **24.16.0** y la comparación del hash confirmó el valor recibido por su entorno; el valor no se devolvió. El controlador local usó Node **24.21.0**. La identidad de la rama usa `NEON_BRANCH`, como el host de rendimiento existente.

La inspección de archivos del directorio temporal propio encontró cero apariciones del valor canario. Esa inspección sólo cubrió ese directorio: no certifica todo el filesystem ni el almacenamiento interno del proveedor. La comprobación acredita el transporte de configuración al proceso remoto; no demuestra todavía instalación de seis keyrings, cifrado en reposo, rotación, restore o reapertura de una academia.

## Preparación fallida y retirada

Se conservan los intentos anteriores al positivo: incompatibilidad del formato local del controlador, rechazo del slug por superar veinte caracteres, un plan que terminó antes del despliegue al cerrarse su entrada y el guard que consultaba una variable de rama incorrecta. Este último devolvió 401 anónimo y 403 autenticado; se corrigió usando el contrato existente del host. No se atribuyen esos fallos a la aplicación.

El plan interrumpido no creó función; su rama se retiró después de comprobar ID, nombre, parent, ausencia de función y condición no default. Los demás intentos con recursos ejecutaron su retirada. La función y rama del caso positivo se eliminaron y un inventario independiente confirmó las cuatro ramas persistentes anteriores, incluido el piloto nuevo. No se leyeron datos de usuarios para esta sonda ni se enviaron mensajes.

## Trabajo que habilita

Esta ruta permite preparar la distribución de claves sintéticas independientes por propósito entre hosts propios, sin derivarlas de PostgreSQL ni ponerlas en argumentos o archivos de configuración con valores literales. La carga completa conserva sus obligaciones de identidad, una sola academia y lista, cien solicitantes realmente simultáneos, p95 de todas las muestras originales, stock y replay. No se ha ejecutado esa distribución ni una nueva medición con varios procesos. T200/T209 y OG-02 siguen pendientes.
