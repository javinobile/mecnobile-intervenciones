# Backlog de specs

Ideas que van a tener su propia spec. No están definidas todavía: se diagraman con el tiempo y, cuando estén maduras, se pasan a una spec numerada con `/spec`.

---

## Área de clientes (rol VIEWER)

**Idea:** el rol `VIEWER` va a ser el **cliente del taller** entrando a un área de clientes propia, separada del panel del taller.

**Qué podría hacer (a definir):**

- Consultar el historial de su vehículo (OT del sistema actual + historial antiguo por VIN).
- Otras funciones que se irán sumando con el tiempo.

**Estado actual del rol VIEWER (lo que hay que tener en cuenta al diseñarlo):**

- **Hoy no puede entrar a nada.** `src/app/dashboard/page.tsx` manda a `/login` a cualquier rol que no sea ADMIN o MECHANIC, y el resto del panel redirige a `/dashboard`. No se corrigió a propósito: el acceso del VIEWER se va a definir en esta spec.
- **Lo usa el bot de WhatsApp.** El usuario técnico `whatsapp-bot@mecnobile.local` se crea con rol `VIEWER` (`getOrCreateBotUserId` en `src/lib/whatsapp/bot-flow.ts`). Si VIEWER pasa a ser "cliente", ese usuario necesita otro rol o una marca que lo excluya del login.
- **No hay vínculo entre `User` y `Client`.** Hoy un `User` es personal del taller y un `Client` es un registro del padrón, sin relación entre ellos. El área de clientes necesita saber qué `Client` es el usuario logueado (y por lo tanto qué autos son suyos vía `CarOwnership`).
- `middleware.ts` todavía le permite `/dashboard/interventions` y `/dashboard/profile`, y la gestión de usuarios (`CreateUserModal`, `EditStaffUserModal`, `updateUserRole`) lo trata como un rol más del personal del taller.

**Preguntas abiertas para cuando se escriba la spec:**

- ¿Cómo se da de alta un cliente como usuario? (invitación por email o WhatsApp, autoregistro validado por DNI, alta manual del ADMIN…)
- ¿El área de clientes vive bajo `/dashboard` o en una ruta propia (por ejemplo `/clientes`)?
- ¿Qué ve del historial: solo OT cerradas, también las abiertas, montos, ítems?
- ¿Puede ver sus presupuestos y aceptarlos él mismo? (hoy la aceptación la marca el taller; la aceptación por parte del cliente quedó fuera de la SPEC 01).
