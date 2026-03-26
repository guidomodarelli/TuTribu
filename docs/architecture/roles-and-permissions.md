# Roles y permisos por comunidad

## Proposito y limites

Este documento define **como modelamos roles y permisos** en la aplicacion.

Su objetivo es fijar:

* la separacion entre autenticacion, autorizacion y modelo de permisos
* la fuente de verdad del sistema
* los roles y estados canonicos del MVP
* la matriz base de capacidades por comunidad
* el reparto de responsabilidades entre Supabase, Postgres/RLS y Next.js

Este documento **no** define SQL detallado ni policies completas de RLS. Para el limite exacto de RLS, mira `docs/architecture/rls-simple.md`. Para el tenant canonico del producto, mira `docs/architecture/multi-tenancy.md`.

---

# Separacion de capas

## 1. Autenticacion

Responde:

**quien es el usuario**

La autenticacion la resuelve **Supabase Auth**. Eso incluye sesion, JWT, cookies y `auth.users.id` como identidad estable.

## 2. Autorizacion

Responde:

**si ese usuario puede acceder o modificar un recurso**

La autorizacion real se resuelve con:

* `community_members`
* `community_id`
* policies de RLS
* casos de uso y servicios de aplicacion

RLS protege el acceso estructural a los datos. La app sigue resolviendo reglas de negocio, workflows y validaciones mas dinamicas.

## 3. Modelo de permisos

Responde:

**que capacidades tiene un usuario dentro de una comunidad**

En este producto, el modelo de permisos esta acotado por comunidad. No existe un rol global unico para toda la aplicacion que reemplace el rol dentro del tenant.

La regla practica es esta:

> **Auth responde quien es el usuario**
> **`community_members` responde que rol y estado tiene en cada comunidad**
> **RLS decide si puede tocar los datos**
> **Next.js refleja esos permisos y orquesta acciones**

---

# Fuente de verdad

La fuente de verdad del sistema de roles por comunidad es:

* `community_members(community_id, user_id, role, status)`

Reglas fijas:

* el rol siempre esta acotado por `community_id`
* un mismo usuario puede tener roles distintos en comunidades distintas
* `profiles` no debe guardar el rol de comunidad como atributo global
* JWT y custom claims no reemplazan la relacion `community_members`
* los roles globales no reemplazan permisos por comunidad

---

# Tipos canonicos

```ts
type CommunityRole = 'owner' | 'admin' | 'member'
type CommunityStatus = 'active' | 'muted' | 'blocked'
```

## Roles por comunidad

* `owner`
* `admin`
* `member`

## Estados por comunidad

* `active`
* `muted`
* `blocked`

## Roles globales reservados

Si mas adelante aparecen claims globales, deben tratarse como un sistema aparte y solo para permisos de plataforma. Ejemplos posibles:

```ts
type PlatformRole = 'platform_admin' | 'support_agent' | 'internal_staff'
```

Esos roles quedan **reservados** como extension futura y no forman parte del mecanismo principal del MVP.

---

# Matriz base de permisos

La matriz del MVP se deriva de:

* jerarquia de rol
* `status`
* alcance por `community_id`

No se introduce todavia una tabla separada de permisos finos.

## `owner`

Puede:

* editar comunidad
* borrar comunidad
* transferir ownership
* nombrar admins
* remover admins
* moderar miembros
* bloquear o silenciar miembros
* moderar contenido dentro de su comunidad

## `admin`

Puede:

* moderar contenido dentro de su comunidad
* silenciar miembros
* bloquear miembros si la regla de negocio lo permite
* aprobar o rechazar contenido moderable
* invitar o gestionar miembros si el caso de uso lo habilita

No puede:

* borrar comunidad
* cambiar owner
* transferir ownership

## `member`

Puede:

* ver comunidad
* participar segun las capacidades habilitadas del producto
* crear o editar solo su propio contenido permitido

No puede:

* moderar miembros
* cambiar configuracion de comunidad
* reasignar roles

---

# Efecto de `status`

## `active`

Mantiene los permisos normales segun su `role`.

## `muted`

Mantiene acceso de lectura dentro de la comunidad, pero pierde participacion activa en interacciones como:

* publicar
* comentar
* responder
* otras acciones equivalentes de participacion

## `blocked`

Pierde acceso tenant-scoped de lectura y escritura para esa comunidad.

En la practica:

* no debe poder ver datos privados de esa comunidad
* no debe poder crear ni modificar contenido
* no debe poder seguir actuando como miembro activo

---

# Responsabilidades por capa

## Supabase Auth

Responsable de:

* identidad del usuario
* login
* sesion
* JWT y cookies

No es responsable de:

* roles por comunidad
* matriz de permisos por comunidad

## Postgres + RLS

Responsable de:

* hacer cumplir acceso por tenant
* hacer cumplir ownership
* hacer cumplir membership
* negar lecturas y escrituras cuando el usuario no cumple la policy

No es responsable de:

* toda la logica de negocio dinamica
* toda la UX del producto

## Next.js

Responsable de:

* leer el rol y estado del usuario en la comunidad actual
* ocultar o mostrar acciones en la UI
* redirigir o devolver errores de aplicacion cuando corresponde
* orquestar mutaciones server-side con casos de uso, server actions y route handlers

Regla importante:

* ocultar un boton mejora UX, pero no concede permisos
* si RLS niega una operacion, la app no debe asumir que la UI la vuelve valida

---

# Flujos base

## Crear comunidad

1. el usuario autenticado crea la comunidad
2. se inserta la fila en `communities`
3. se crea la membership inicial en `community_members`
4. esa membership inicial queda como `owner` + `active`

## Promover a admin

1. un `owner` ejecuta la accion
2. se actualiza `community_members.role` a `admin`
3. la accion no debe estar disponible para `member`

## Mutear miembro

1. un `owner` o `admin` ejecuta la accion si el caso de uso lo permite
2. se actualiza `community_members.status` a `muted`
3. el usuario mantiene lectura, pero pierde participacion activa

## Bloquear miembro

1. un `owner` o `admin` ejecuta la accion segun las reglas del caso de uso
2. se actualiza `community_members.status` a `blocked`
3. el usuario pierde acceso tenant-scoped a esa comunidad

## Transferir ownership

1. solo el `owner` actual puede ejecutar la accion
2. la comunidad pasa a tener un nuevo `owner`
3. el owner anterior deja de tener ese rol segun el caso de uso definido

---

# Anti-patrones

Evitar:

* guardar un unico rol global en `profiles`
* tratar JWT como fuente primaria de roles por comunidad
* serializar toda la matriz de membresias en custom claims
* confiar solo en ocultar botones en frontend
* hacer toda la autorizacion en middleware de Next.js
* convertir RLS en motor completo de workflows y reglas de producto
* introducir una tabla de permisos finos antes de que el MVP realmente la necesite

---

# Escenarios de validacion

El documento debe seguir siendo consistente con estos escenarios:

* un mismo usuario puede ser `owner` en la comunidad A, `admin` en la B y `member` en la C
* ocultar una accion en Next.js no concede acceso si RLS la niega
* un usuario `muted` puede seguir entrando, pero no publicar ni comentar
* un usuario `blocked` no puede leer ni modificar datos de esa comunidad
* un claim global futuro no autoriza por si solo acciones dentro de una comunidad
* crear comunidad siempre crea tambien la membership inicial `owner/active`

---

# Regla final

La decision arquitectonica del MVP es esta:

> **los roles por comunidad viven en Postgres, se modelan con `community_members`, se protegen con RLS y se reflejan en Next.js solo como capa de experiencia y orquestacion**
