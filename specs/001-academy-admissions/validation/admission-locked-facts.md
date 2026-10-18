# Lectura agrupada de hechos actuales

T200/T209 permanecen abiertas. La última carga sin instrumentación conservó cien resultados correctos y p95 de 5.945,30 ms, frente al objetivo inferior a 3.000 ms. Este cambio reduce viajes del cliente; sus pruebas funcionales no acreditan todavía ese objetivo.

## Cambio y límites

El writer de presentación y decisión reemplaza sus cuatro lecturas de academia, política, pertenencia y cuenta por `read_locked_admission_facts`. La función ejecuta los mismos SELECT y locks compartidos en ese orden dentro de la transacción original. Devuelve únicamente los campos que el writer ya consumía. El helper de infraestructura mapea las fechas mediante el mismo mapper que la lectura ordinaria de política.

La función es `VOLATILE SECURITY INVOKER`, con search path fijo y sin ampliar privilegios de tablas. PostgreSQL [obtiene una instantánea nueva para cada consulta interna de una función VOLATILE](https://www.postgresql.org/docs/18/xfunc-volatility.html). Así se conserva la lectura de una pertenencia insertada mientras la primera consulta esperaba un lock. No se convierte la secuencia en un CTE con una única instantánea inicial.

El owner conserva su autorización, sus fences y las comprobaciones repetidas del ledger. La lectura de configuración externa sigue después de estos datos; el reloj nativo sigue después de esa espera. No se cachea cuenta, sesión, rol ni material de claves. Las reglas y propuestas de elegibilidad siguen en TypeScript.

La migración `20261018123401_read_locked_admission_facts.sql`, journal 188, añade la función. Sólo se ha aplicado a ramas propias de validación; no a la base predeterminada.

## Secuencia funcional

1. El primer test falló al no existir todavía el adapter. El intento SQL posterior falló al invocar la nueva función.
2. Una consulta directa con `pg` en otra rama propia confirmó SQLSTATE **42883**, sin conservar URI ni parámetros privados.
3. Tras la migración, el contrato inicial pasó en PostgreSQL real: ausencia auténtica, mapeo de política, actualización posterior a una espera, lock retenido e invoker sin elevación.
4. La ampliación y la regresión de transacciones de sesión pasaron **dos de dos tests Native**. La ampliación comprueba los cuatro locks por contención real, pertenencia/política/correo actualizados después de esperar, fecha de activación con precisión de dominio y SQLSTATE **42501** tanto para el acceso original como para la función desde un rol sin SELECT. El catálogo confirma invoker y volatilidad.
5. La regresión existente conserva tres adquisiciones/liberaciones por presentación, replay original, revocación de sesión, cambio de usuario/sesión y cuenta eliminada entre claim y efecto; no crea ingresos ni entregas espurias.

El [reporte saneado](admission-locked-facts-contracts.json) conserva esos estados. Los resultados privados están en `.git/admission-locked-facts-{red,native-red,green,integration}.json`. La compilación real del host Node incluyó 635 inputs. Tipos de producto, tipos de tests y lint pasaron. El build completo de Next 16.3.4 terminó con salida 0 y 56 páginas estáticas, usando configuración sintética y sin conexión productiva.

La regresión seleccionada de decisiones y cancelaciones pasó dos casos Native, con veinte casos de ese archivo fuera de la selección. Comprueba una pendiente única entre replay y otro enlace, recuperación de la aprobación básica comprometida, rechazo de una cancelación ajena y cancelación propia durante pausa con replay terminal. Su reporte privado es `.git/admission-locked-facts-decisions.json`; no se acredita el archivo entero a partir de esa selección. El inventario administrativo final conservó exactamente las tres ramas originales.

## Rendimiento pendiente

La cohorte completa debe usar el checkpoint guardado, 10.000 entradas y cien solicitantes simultáneos, con la capacidad y límites previos. Debe conservar cincuenta ingresos/cincuenta pendientes, stock, replay, pool balanceado y cero entregas, además del p95 inferior a tres segundos. El número menor de viajes no sustituye esa medición ni los criterios de visibilidad y aceptación del scheduler.
