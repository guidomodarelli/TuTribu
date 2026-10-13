# Traceability: Academy Admissions and Tenant Messaging

**Estado**: índice de planificación; no hay tareas de código ni pruebas ejecutadas certificadas por este archivo.

## Cómo usar esta matriz

Cada FR aparece una vez. Las historias y SC asociados indican dónde buscar el recorrido y el resultado; no reemplazan los escenarios de aceptación ni prueban cobertura por sí solos. El plan deberá añadir para cada fila las tareas, pruebas concretas, archivos afectados y documentación. Una tarea transversal puede cubrir varios FR, pero ninguno puede desaparecer por agruparlos.

Los 71 escenarios identificados en las 12 historias y los 45 casos límite de `spec.md` también deben quedar relacionados individualmente con pruebas. Los TC de `technical-contract.md` son restricciones de diseño verificables; cumplir un SC no permite omitir un FR.

## Historias y escenarios

| Historia | Recorrido | Escenarios definidos |
|---|---|---|
| US-01 | Solicitar admisión manual sin contratar mensajería | US-01-AC-01 a US-01-AC-05 (5) |
| US-02 | Elegir la política y la verificación adicional | US-02-AC-01 a US-02-AC-06 (6) |
| US-03 | Automatizar habilitados y revisar excepciones | US-03-AC-01 a US-03-AC-06 (6) |
| US-04 | Canjear invitaciones personales no transferibles | US-04-AC-01 a US-04-AC-07 (7) |
| US-05 | Comprobar un contacto dentro de la tribu | US-05-AC-01 a US-05-AC-07 (7) |
| US-06 | Conectar Zavu con credenciales propias | US-06-AC-01 a US-06-AC-07 (7) |
| US-07 | Rotar y suspender conexiones sin cruzar cuentas | US-07-AC-01 a US-07-AC-06 (6) |
| US-08 | Resolver y notificar sin duplicar trabajo | US-08-AC-01 a US-08-AC-06 (6) |
| US-09 | Conservar decisiones consistentes ante cambios | US-09-AC-01 a US-09-AC-06 (6) |
| US-10 | Preservar membresías y reglas comerciales | US-10-AC-01 a US-10-AC-06 (6) |
| US-11 | Controlar abuso, privacidad y costos | US-11-AC-01 a US-11-AC-05 (5) |
| US-12 | Extender el proveedor sin cambiar admisiones | US-12-AC-01 a US-12-AC-04 (4) |

## Requisitos individuales

| Requisito | Tema | Historias | Resultados relacionados | Foco de validación |
|---|---|---|---|---|
| FR-001 | `scope` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-002 | `login` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-003 | `modes` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-004 | `axes` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-005 | `extra` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-006 | `identity_type` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-007 | `invalid_combinations` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-008 | `defaults` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-009 | `policy_version` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-010 | `confirmation` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-011 | `no_referrer` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-012 | `commerce` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-013 | `feature_off` | US-01, US-02, US-10 | SC-001, SC-002, SC-003, SC-019 | Matriz de políticas y recorrido de configuración/confirmación. |
| FR-014 | `base_evidence` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-015 | `google_evidence` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-016 | `off_manual` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-017 | `off_auto` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-018 | `off_exception` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-019 | `on_evidence` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-020 | `email_snapshot` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-021 | `phone_snapshot` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-022 | `claimed_contact` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-023 | `binding` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-024 | `binding_lifetime` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-025 | `proof_scope` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-026 | `global_boundary` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-027 | `proof_reuse` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-028 | `identity_change` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-029 | `trust_notice` | US-01, US-02, US-04, US-05, US-09 | SC-001, SC-002, SC-003, SC-006, SC-017 | Evidencia positiva y negativa, alcance, cambios y conflicto de cuenta/contacto. |
| FR-030 | `zavu_only` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-031 | `one_connection` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-032 | `leader_credentials` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-033 | `wizard` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-034 | `api_key` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-035 | `sender` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-036 | `minimum_fields` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-037 | `external_setup` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-038 | `capability_state` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-039 | `test_request` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-040 | `test_code` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-041 | `test_live` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-042 | `candidate_activate` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-043 | `key_mask` | US-06, US-07, US-12 | SC-009, SC-010, SC-014, SC-020 | Configuración guiada y contratos del proveedor; ensayos autorizados por canal. |
| FR-044 | `secrets_protection` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-045 | `secret_separation` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-046 | `tenant_context` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-047 | `no_platform_fallback` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-048 | `rotation` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-049 | `job_version` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-050 | `disconnect` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-051 | `emergency_suspend` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-052 | `compromise` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-053 | `delete_secret` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-054 | `leadership_connection` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-055 | `channel_failure` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-056 | `draft_cleanup` | US-06, US-07, US-11 | SC-007, SC-008, SC-010, SC-012, SC-017 | Autorización, secretos, trabajos concurrentes y cambios de conexión. |
| FR-057 | `code_lifecycle` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-058 | `code_sender` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-059 | `resend` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-060 | `route_explicit` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-061 | `sms_alternative` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-062 | `delivery_error` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-063 | `unknown_delivery` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-064 | `no_arbitrary_send` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-065 | `rate_limits` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-066 | `quota_leader` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-067 | `quota_accounting` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-068 | `quota_exhausted` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-069 | `cost_notice` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-070 | `allowed_destinations` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-071 | `no_sensitive_testing` | US-05, US-07, US-11 | SC-006, SC-009, SC-010, SC-011, SC-012 | Reloj controlado, intentos, transporte incierto y cupos concurrentes. |
| FR-072 | `list_management` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-073 | `list_match` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-074 | `list_binding` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-075 | `list_exception` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-076 | `list_remove` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-077 | `csv_preview` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-078 | `csv_confirm` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-079 | `csv_idempotent` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-080 | `csv_safe` | US-03 | SC-001, SC-013, SC-016, SC-021 | Persistencia, CSV, duplicados y habilitaciones no transferibles. |
| FR-081 | `invitation_fields` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-082 | `invitation_off_phone` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-083 | `invitation_checkbox` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-084 | `invitation_waiver` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-085 | `invitation_expiry` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-086 | `invitation_immutable` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-087 | `invitation_unique` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-088 | `invitation_secret` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-089 | `invitation_redeem` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-090 | `invitation_no_consume` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-091 | `invitation_existing` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-092 | `invitation_revoke` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-093 | `invitation_final` | US-04 | SC-001, SC-003, SC-005, SC-017 | Destinatario, lista, plazos, canje único y reintentos simultáneos. |
| FR-094 | `request_states` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-095 | `request_unique` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-096 | `request_automatic` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-097 | `request_message` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-098 | `request_review` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-099 | `request_exception_reason` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-100 | `request_atomic` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-101 | `request_reject` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-102 | `request_cancel` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-103 | `request_expiry` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-104 | `request_new_attempt` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-105 | `verification_epoch` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-106 | `request_attach_proof` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-107 | `policy_off_proofs` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-108 | `request_eligibility` | US-01, US-03, US-08, US-09 | SC-001, SC-004, SC-005, SC-006, SC-017 | Máquina de estados, política vigente y efecto de membresía consistente. |
| FR-109 | `inbox` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-110 | `request_detail` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-111 | `bulk` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-112 | `internal_notifications` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-113 | `external_email` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-114 | `email_preferences` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-115 | `email_recipients` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-116 | `notification_outbox` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-117 | `notification_auth` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-118 | `notification_control` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-119 | `reminder` | US-01, US-08 | SC-004, SC-012, SC-015, SC-017 | Bandeja, permisos, preferencias y procesamiento durable de avisos. |
| FR-120 | `server_authorization` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-121 | `private_content` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-122 | `nonrecoverable` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-123 | `commercial_recovery` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-124 | `current_member` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-125 | `other_membership` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-126 | `reentry` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-127 | `pause` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-128 | `mode_exit` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-129 | `conduct_cancel` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-130 | `privacy_errors` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-131 | `audit` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-132 | `retention` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-133 | `accessibility` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-134 | `leader_invites` | US-07, US-09, US-10, US-11 | SC-004, SC-006, SC-007, SC-008, SC-017, SC-018, SC-019 | Aislamiento, privacidad, regresión comercial y accesibilidad. |
| FR-135 | `provider_contract` | US-02, US-10, US-12 | SC-007, SC-019, SC-020, SC-021 | Contratos sustituibles, activación cerrada y evidencia de entrega. |
| FR-136 | `capability_registry` | US-02, US-10, US-12 | SC-007, SC-019, SC-020, SC-021 | Contratos sustituibles, activación cerrada y evidencia de entrega. |
| FR-137 | `dependency_injection` | US-02, US-10, US-12 | SC-007, SC-019, SC-020, SC-021 | Contratos sustituibles, activación cerrada y evidencia de entrega. |
| FR-138 | `first_activation` | US-02, US-10, US-12 | SC-007, SC-019, SC-020, SC-021 | Contratos sustituibles, activación cerrada y evidencia de entrega. |
| FR-139 | `legacy_routes` | US-02, US-10, US-12 | SC-007, SC-019, SC-020, SC-021 | Contratos sustituibles, activación cerrada y evidencia de entrega. |
| FR-140 | `rollback` | US-02, US-10, US-12 | SC-007, SC-019, SC-020, SC-021 | Contratos sustituibles, activación cerrada y evidencia de entrega. |
| FR-141 | `delivery_complete` | US-02, US-10, US-12 | SC-007, SC-019, SC-020, SC-021 | Contratos sustituibles, activación cerrada y evidencia de entrega. |
| FR-142 | `metrics` | US-02, US-10, US-12 | SC-007, SC-019, SC-020, SC-021 | Contratos sustituibles, activación cerrada y evidencia de entrega. |

El identificador corto de “Tema” es únicamente una etiqueta de trazabilidad, no un nombre de función obligatorio ni una ampliación de entidades.

## Restricciones técnicas

| Restricción | FR relacionados | Evidencia que debe producir el plan/implementación |
|---|---|---|
| TC-001 | FR-001, FR-002, FR-012, FR-026, FR-135 | Propietario de cada responsabilidad y rutas que la atraviesan. |
| TC-002 | FR-135, FR-136, FR-137 | Imports/fronteras, contratos propios y composición real. |
| TC-003 | FR-030, FR-135, FR-136 | Zavu como único adaptador productivo y prueba de sustitución en borde propio. |
| TC-004 | FR-002, FR-046, FR-120, FR-121 | Autorización específica de solicitantes sin membership y objetos cruzados. |
| TC-005 | FR-046, FR-049, FR-137 | Intercalado A/B, cachés y jobs con conexión/versión correctas. |
| TC-006 | FR-120, FR-046, FR-032 | Rol efectivo de Postgres/RLS y denegación desde rutas directas. |
| TC-007 | FR-025, FR-026, FR-029 | Rechazo de OTP local en login, recuperación, linking y otra tribu. |
| TC-008 | FR-014, FR-015, FR-020 | Pruebas de autoridad, claims ausentes y correos externos no asumidos. |
| TC-009 | FR-025, FR-027, FR-040 | Contexto completo, aplicación única y diagnóstico separado. |
| TC-010 | FR-057, FR-058, FR-044 | Generación/verificador seguro y protección del material temporal de envío. |
| TC-011 | FR-059, FR-105, FR-106, FR-107 | Reloj/época/reenvío, pendientes y carreras con cambios de política. |
| TC-012 | FR-044, FR-045, FR-046 | Custodia real, acceso restringido y claves protegidas separadamente. |
| TC-013 | FR-034, FR-043, FR-032, FR-045 | Ingreso seguro, reautenticación y ausencia de secreto en salida/telemetría. |
| TC-014 | FR-050, FR-053, FR-056 | Retirada inmediata, purga, caché y restauración segura. |
| TC-015 | FR-030, FR-035, FR-047, FR-064 | Credenciales explícitas, remitente y host permitidos. |
| TC-016 | FR-033, FR-035, FR-036, FR-136 | Campos mínimos por canal, paginación y DTOs filtrados sin secretos. |
| TC-017 | FR-037, FR-039, FR-042 | Ausencia de compras/modificaciones externas sin autorización. |
| TC-018 | FR-060, FR-061, FR-062 | Canal estricto, alternativa explícita y mappers de errores. |
| TC-019 | FR-100, FR-095, FR-089, FR-023 | Constraints/transacciones y concurrencia real de la admisión. |
| TC-020 | FR-116, FR-117, FR-118, FR-049 | Evento durable, consumidor idempotente y permisos al despachar. |
| TC-021 | FR-063, FR-059, FR-067 | ID estable, timeout/409/payload y reconciliación sin duplicación ciega. |
| TC-022 | FR-065, FR-066, FR-067, FR-068 | Último cupo concurrente, contadores agregados y cambios de versión. |
| TC-023 | FR-058, FR-062, FR-063, FR-120 | Callbacks autenticados si se usan; ninguna entrega cambia identidad. |
| TC-024 | FR-048, FR-051, FR-052, FR-054 | Candidata, cambio atómico, suspensión y nuevo liderazgo. |
| TC-025 | FR-001, FR-123, FR-124, FR-138, FR-139, FR-140 | Inventario completo de rutas, regresión y activación/rollback. |
| TC-026 | FR-141, FR-071, FR-135 | TDD, pruebas de comportamiento/SQL/E2E y ensayos externos autorizados. |
| TC-027 | FR-131, FR-132, FR-133, FR-141, FR-142 | Observabilidad sanitizada y documentación operativa accesible. |

## Registro de evidencia posterior

Al generar tareas, extender cada fila con: identificador de tarea, tipo de prueba, nombre/ruta de prueba, precondiciones, resultado esperado, resultado observado, entorno/commit y documento actualizado. El estado inicial de ejecución es pendiente. No inventar una prueba aprobada para llenar la matriz.

Los ensayos de Zavu deben distinguir correo, SMS y WhatsApp; éxito de un canal no habilita los demás. Un ensayo no autorizado o sin recursos reales se registra como pendiente, no como éxito inferido de un mock. Las pruebas de reglas y contratos propias pueden ejecutarse con dobles en los bordes que el repositorio permita.

Toda discrepancia encontrada se resuelve en la fuente normativa y se propaga a plan/tareas. No alterar solo esta matriz para ocultar un requisito sin implementación.
