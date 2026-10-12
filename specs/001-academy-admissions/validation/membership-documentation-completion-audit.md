# Documentación propietaria de conservación de membresías

Base `1e7b48d9`, 160 completas/52 pendientes/212. T162 conserva todos sus requisitos originales y permanece abierta hasta revisión, SourceTrace y QA final. Este trabajo reconcilia comportamiento ya implementado; no modifica producto, schemas, permisos, conexiones ni recursos externos.

## Cobertura original por fuente

| Requisito | Fuente propietaria actualizada y evidencia funcional |
|---|---|
| Alcance y permisos: pertenencia, verificación y grants separados | `academy-access.htm`, `academy-mode.html`, `members.html`; readers reales de acceso/cursos y auditoría completa de T154/T153, con grants/matrícula preservados. |
| Snapshot active/muted, identidad/rol/fecha e historial NULL | `academy-access.htm`, `subscriptions.htm`, `members.html`; política y applier actuales, Native de recuperación gratuita/paga, nueve negativos privilegiados/NULL y conservación de la misma instancia. |
| Fundamentos básicos/pagos simultáneos y billing antiguo | `subscriptions.htm`, `members.html`, `internal-operations.html`; T153/T154/T156 y `membership-protected-boundaries-baseline.md`, sin revocar una fuente por otra inactiva. |
| Pago legítimo y cancelación externa indivisible | `subscriptions.htm`, `joining-options.html`; tres owners actuales de pagos y T159, decisión de sistema/aviso único sin aprobación ficticia, canje y binding conservados. |
| Vías anteriores, pagas e invitaciones personales | `referral-invitations.htm`, `joining-options.html`; T155/T157/T158, llegada legacy común sin dispensa, contratos comerciales separados y bootstrap inicial único. |
| RLS simple, cuenta/sesión/tribu y consulta propia sin pertenencia | `rls-simple.htm`; runtime/NOBYPASS, writers y funciones de proyección con DTO mínimo, roles actuales y guardas de commit reales. La excepción no abre datos privados ni escritura directa. |
| Preflight y activación explícita por tribu | `academy-access.htm`, `academy-mode.html`, índices; T161, inventario/runtime actuales, NULL/privileged sin backfill, policy/marcador atómicos y readiness separada. |
| Pausa frente a salida/eliminación y rollback cerrado | `academy-access.htm`, `referral-invitations.htm`, `internal-operations.html`; T156/T160, marcador durable, retiro de autorizaciones, original y envíos inciertos conservados. |
| UI disponible frente a API, resolución de historia y gates pendientes | `members.html`, `internal-operations.html`; no se inventan botones de directorio ni recuperación genérica. Contacto/código y configuración disponibles se enlazan a sus manuales propietarios; restore/rollout mantienen T201/T203/OG-02/OG-06. |
| Índices, navegación y trazabilidad | Seis HTML temáticos/índices, SourceTrace previo consultado y scripts/capturas/esquemas preservados; QA final y nuevo checkpoint pendientes. |
| CHANGELOG | Se precisa la entrada existente de `Unreleased`, sin una entrada nueva que atribuya funcionalidad adicional a este cambio documental. |

## Diagnóstico y validación documental

La auditoría inicial de once documentos confirmó cinco frases obsoletas y el alcance de once owners; manifiesto estable `9466B9B26E3E7A2E0D48BDB6DF84DA90CF77D13CCC1A4A3ACEAB5B4ACB36612B`. Se corrigen ausencia de settings/legacy después del marcador, owners de membresía ya integrados, salida/reingreso y fuentes ya acreditadas, pantalla de comprobación de contacto disponible y consultas propias de preadmisión con pertenencia todavía ausente. La activación por tribu implementada se distingue de habilitación de producción.

Las seis comparaciones iniciales de SourceTrace recuperaron los cambios contra las fuentes históricas; las referencias a incrementos locales antiguos del manual interno se reconcilian con el alcance actual y sus owners. Los scripts de los seis manuales/índices quedan iguales al commit inicial, incluidas sus ilustraciones; no se recapturan ni se reclasifican esquemas como pantallas reales. Las capturas actuales del flujo protegido permanecen en el manual de admisión enlazado.

Los cinco documentos numerados modificados pasan el helper estático, sin errores. La primera QA de documento falló por un selector inventado del arnés para la hoja de contenido; el documento no tenía ese control. Se corrige el arnés usando la píldora y el diálogo existentes, sin cambiar el manual para satisfacer esa expectativa. El rojo no acredita recorridos. La repetición alcanzó el render móvil de arquitectura y detectó tablas existentes sin contenedor: Chromium medía 593 px y WebKit 634 px en una ventana de 390. El diagnóstico real mostró las tablas responsables; el contenedor horizontal del diseño mantiene ahora el documento en 390 px y conserva el scroll de la tabla, sin ocultar el contenido. La repetición completa posterior termina exit0 con 40 renders, 112 recorridos y 396 comprobaciones de enlaces internos en Chromium/WebKit a 1280/390, sin errores ni desbordes (`codex-t162-guides-current-qa.log`).

No se ejecutan pruebas nuevas de backend ni build del producto por estas ediciones de prosa: la funcionalidad conserva los resultados previos y se valida la conducta observable de documentos, navegación, anclas, esquemas y render en Chromium/WebKit a 1280/390. SourceTrace y cierre de T162 quedan pendientes hasta el checkpoint y la QA final.

La revisión inicial del cambio encontró un P3 adicional: la sección open join no delimitaba el modo clásico sin corte y omitía el marcador. Se corrigió conforme al selector vigente, preservando retornos y cobros legítimos. El rerun del mismo reviewer termina sin hallazgos accionables sobre los once owners, con manifiesto estable `B8C5173C9B5B4D7F1C4BBD01E8038CFC3A2A51DCD11B8BDA00E093650EBCD6DA`. El render completo está comprobado por su ejecución real; no se acredita desde la lectura estática.
