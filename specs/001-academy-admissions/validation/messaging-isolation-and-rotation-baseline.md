# Aislamiento y revocación durante espera

Alcance: evidencia adicional de T134, sin cerrar la tarea ni US7. El objetivo conserva82/212 completas y130 pendientes.

Se extrae el fixture real de verification-delivery-pipeline a tests/support/verification-delivery-pipeline-fixture.ts para compartir issuer/ledger/marker/Web Crypto/SecretStore/SDK. La observación de metadata es lazy y no añade consultas a los escenarios existentes. El fixture de emisión admite un sender sintético opcional que se fija al crear la versión inmutable; sus consumidores previos mantienen el default.

61030 final verde44,20s total: revocación real de email durante un fence exclusivo de tribu. El dispatcher reclama y su autorización queda bloqueada; pg_blocking_pids confirma el holder exacto. Tras confirmar capability unprepared/testedAtnull, PostgreSQL suprime el trabajo antes del marker:0 llamadas al SecretStore,0 requests SDK,0 intentos y0 reservas. No modifica el clock/timeout productivo ni mockea bibliotecas.

15872 rojo97,47s total en la prueba nueva A/B: el montaje retuvo la primera respuesta SDK mientras preparaba/persistía la segunda en SQL, superando el timeout real15s y obteniendo unknown. La segunda cuenta y su receipt habían pasado. Se corrige sólo el orden del montaje: prepara ambas mediante los adapters reales antes de intercalar los RPC y confirma los receipts después de liberar ambas respuestas. Mantiene SDK15s/retries0 y las mismas assertions de scope/consumo.39027 rerun de los dos casos está en curso; no se acredita antes del exit.

39027 terminó verde140,98s total con los dos casos. El escenario A/B usa ramas propias distintas, SQL/marker/SecretStore/Web Crypto reales y un transporte SDK compartido cerrado: A llega primero y espera mientras B recibe accepted; los dos receipts quedan únicamente en su delivery/attempt/conexión/version original, con una reserva consumed cada uno. Headers de Authorization se comparan como booleanos para evitar que un assertion fallido vuelque material privado. No usa configuración global ni modifica el timeout15s. Las ramas fueron limpiadas por sus owners antes del exit.

Tipos de tests, lint focal y diff-check pasan sobre los helpers/test actualizados.44869 está ejecutando la regresión original de jsonb/crypto/SDK tras la extracción; la carrera de respuesta tardía después de un swap real sigue pendiente y T134 permanece abierta.

44869 final verde54,30s total, un caso y seis filtrados: el consumer original conserva el frozen jsonb, descifra el código y la credencial por los adapters reales, hace SDK sólo fuera de SQL, confirma una reserva consumed y valida el código localmente. La extracción no cambia su comportamiento. La auditoría independiente de T076/T081 sobre HEADa204aaca permite cerrar esas dos tareas y deja84/212 completas128 pendientes; T134 y la respuesta tardía siguen abiertos.
