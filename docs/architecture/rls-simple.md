# RLS simple

## Que significa

RLS simple significa usar **Row Level Security** para seguridad estructural de acceso a datos, sin convertir SQL en el motor completo de reglas de negocio.

La idea practica es:

> **RLS para acceso a filas**
> **App layer para reglas de negocio complejas**

---

# Que valor da

RLS sigue siendo parte de la linea base de seguridad porque:

* reduce checks duplicados en handlers
* evita huecos entre UI y backend
* protege aunque alguien llegue directo a la base o a un endpoint interno

---

# Que acoplamiento introduce

Si usamos RLS simple, nos acoplamos a:

* Postgres
* policies de acceso a datos
* contexto de request seteado por la app

En este repo, la identidad para RLS entra desde:

* `current_setting('app.current_user_id', true)`
* `current_setting('app.current_user_email', true)`
* tablas protegidas con `FORCE ROW LEVEL SECURITY` cuando la app usa una conexion compartida por `DATABASE_URL`

Ese acople es aceptable porque:

* la app mantiene control de la identidad
* RLS sigue siendo Postgres puro
* las reglas de negocio importantes no quedan enterradas en SQL

---

# Que va en RLS

## Casos adecuados

* ownership por `user_id = current_app_user_id`
* acceso por pertenencia a `community_id`
* acceso via `community_members`
* acceso por rol simple
* lectura y escritura sobre filas del propio usuario

La regla importante es:

* la sesion identifica al usuario
* `community_members` resuelve pertenencia y rol
* RLS usa el contexto `app.current_user_*`

## Ejemplos

* un usuario solo ve comunidades a las que pertenece
* un miembro solo ve datos de comunidades donde tiene membresia
* un usuario solo puede insertar la membership inicial de owner de la comunidad que acaba de crear

---

# Que queda fuera

No meter en RLS:

* workflows complejos
* visibilidad muy dinamica
* reglas temporales complejas
* validaciones de UX
* limites comerciales
* automatizaciones de negocio

Modelo mental:

* RLS responde: **"puede tocar esta fila?"**
* la app responde: **"tiene sentido permitir esta accion ahora?"**

---

# Recomendacion

Para este proyecto:

* **RLS fuerte para acceso a datos**
* **simple y entendible**
* **basada en ownership, membership y tenant scope**
* **sin mover toda la logica de producto a SQL**

Eso mantiene:

* seguridad real
* menos bugs de permisos
* buen desacople respecto de la capa de auth
* proteccion efectiva aunque la app consulte Postgres con un rol owner-like compartido
