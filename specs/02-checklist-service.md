# SPEC 02 — Checklist de service en las OT

> **Status:** Implementado
> **Depends on:** —
> **Date:** 2026-11-03
> **Objective:** Permitir marcar una OT como "service" y, en ese caso, registrar un checklist de puntos (configurable por el ADMIN) indicando cuáles se revisaron y cuáles se cambiaron, para que salga en el comprobante de la OT y en el historial del auto.

## Por qué existe esta spec

Hoy no hay forma de distinguir una OT de service de una reparación común, ni de dejar registrado qué se revisó y qué se cambió (filtros, aceites, líquidos, etc.). Esa información queda, en el mejor de los casos, en la descripción o en las notas como texto libre, y no se puede consultar ni mostrar de forma ordenada. Además, una reparación normal puede incluir también un service, así que "es service" no es un tipo excluyente de OT sino una marca que se agrega.

## Alcance

**Entra:**

- Nuevo campo `isService` en la OT: checkbox "Es service".
- El checkbox está en el alta de la OT ("Abrir OT") y en el detalle de la OT mientras esté `ABIERTA`. Una OT `CERRADA` o `CANCELADA` lo muestra en solo lectura.
- El checkbox va arriba, en la sección "Detalles" de la OT, junto con un resumen de lo marcado ("3 cambiados · 2 revisados") y un botón "Abrir checklist" ("Ver checklist" en solo lectura). Al tildarlo se abre un **popup** con la tabla del checklist con los puntos activos del catálogo. Cada punto puede quedar **sin marcar**, **Revisado** o **Cambiado**.
- En el alta, los puntos marcados se guardan junto con la creación de la OT.
- En el detalle, cada cambio en el checklist se **autoguarda** al instante. Si falla, se muestra el error y el control vuelve al valor anterior.
- Destildar "Es service" con puntos marcados pide confirmación y borra esos puntos.
- Permisos de edición: mismas reglas que los ítems de la OT (`canMutateOt`): ADMIN y MECHANIC según las reglas actuales, bloqueado con la OT no abierta y, para el MECHANIC, también con cancelación pendiente (el ADMIN conserva la edición, igual que en los ítems). La validación está en las server actions, no solo en la UI.
- **Catálogo de puntos configurable por ADMIN** en Configuración del taller (`/dashboard/settings`): agregar, renombrar, reordenar y desactivar/reactivar puntos.
- Un punto desactivado no se ofrece en OT nuevas ni en OT abiertas que no lo tengan marcado, pero las OT que ya lo usaron lo siguen mostrando.
- El nombre del punto se copia (snapshot) en cada OT al marcarlo: renombrar o desactivar un punto del catálogo no altera OT pasadas.
- Lista inicial precargada por migración: Aceite de motor, Filtro de aceite, Filtro de aire, Filtro de habitáculo, Filtro de combustible, Aceite de caja, Líquido refrigerante, Líquido de frenos, Bujías, Correa de distribución, Correa de accesorios, Pastillas y discos de freno, Neumáticos y presión, Batería, Luces, Escobillas.
- **Comprobante PDF de la OT:** si es service, sección "Service realizado" con una tabla de los puntos marcados (Punto · Revisado · Cambiado).
- **PDF de historial del auto** (incluido el que se envía por email desde una solicitud de WhatsApp): en cada OT de service, un **resumen en texto, sin tabla**, del estilo `Service — Cambiado: aceite de motor, filtro de aceite. Revisado: líquido de frenos, luces.`
- **Visor de historial en pantalla** (detalle del auto): mismo resumen en texto en las OT de service.
- **Listado de OT:** badge "Service" en las OT con `isService`, y filtro "Solo services" que viaja en la URL (`?service=1`) y se combina con la búsqueda y el filtro de estado existentes.

**Fuera de alcance (para specs futuras):**

- Campo propio de kilometraje del service (10.000 km, 60.000 km…): no hace falta, porque el kilometraje ya se registra en la OT (`mileageKm`) al abrirla.
- Plantillas por kilometraje que pre-marquen puntos.
- Observación por punto (ej. "pastillas al 30%").
- Vincular el checklist con los ítems/costos: marcar "Cambiado" **no** crea ni sugiere un ítem `REPUESTO`. Repuestos y mano de obra se siguen cargando como hoy.
- Puntos libres escritos a mano en una OT puntual (fuera del catálogo).
- Recordatorio de próximo service al cliente (WhatsApp/email).
- Mostrar el checklist en la respuesta `estado` del bot de WhatsApp.
- Editar el checklist en OT cerradas o canceladas.
- Checklist en presupuestos (SPEC 01).
- Acceso de VIEWER.

## Modelo de datos

Cambios en `prisma/schema.prisma`, en una migración nueva:

```prisma
model Intervention {
  // ...campos existentes...

  /// Marca de service. Independiente del tipo de trabajo: una reparación puede incluir un service.
  isService     Boolean                    @default(false)
  serviceChecks InterventionServiceCheck[]

  @@index([isService])
}

enum ServiceCheckStatus {
  REVISADO
  CAMBIADO
}

/// Catálogo de puntos de service, administrado por el ADMIN en Configuración.
model ServiceChecklistItem {
  id        String  @id @default(uuid())
  name      String  @unique
  sortOrder Int     @default(0)
  active    Boolean @default(true)

  checks InterventionServiceCheck[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

/// Punto marcado en una OT. Solo existen filas para los puntos Revisado o Cambiado;
/// "sin marcar" = no hay fila.
model InterventionServiceCheck {
  id             String       @id @default(uuid())
  interventionId String
  intervention   Intervention @relation(fields: [interventionId], references: [id], onDelete: Cascade)

  checklistItemId String?
  checklistItem   ServiceChecklistItem? @relation(fields: [checklistItemId], references: [id], onDelete: SetNull)

  /// Snapshot del nombre del punto al marcarlo
  name      String
  /// Snapshot del orden, para listar igual que el catálogo de ese momento
  sortOrder Int                @default(0)
  status    ServiceCheckStatus

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([interventionId, checklistItemId])
  @@index([interventionId])
}
```

Convenciones:

- La migración inserta la lista inicial en `ServiceChecklistItem` con `sortOrder` 10, 20, 30… (usa `gen_random_uuid()`), así producción la recibe con `prisma migrate deploy` sin depender de `db:seed`.
- Los puntos no se borran nunca: solo `active = false`. `onDelete: SetNull` es solo una protección; el nombre queda en el snapshot.
- Al renombrar un punto se actualiza solo `ServiceChecklistItem.name`; las filas de `InterventionServiceCheck` ya creadas conservan su `name`.
- Tipo serializable para el cliente (sin Decimals involucrados):

```ts
type ServiceCheckDto = {
  checklistItemId: string | null;
  name: string;
  sortOrder: number;
  status: 'REVISADO' | 'CAMBIADO';
};
```

## Plan de implementación

1. **Migración y modelo.** Agregar `isService`, `ServiceCheckStatus`, `ServiceChecklistItem` e `InterventionServiceCheck` con el insert de la lista inicial. `yarn db:migrate`, `yarn db:generate`, reiniciar `yarn dev`. Verificación: `npx tsc --noEmit` sin errores y los 16 puntos en la tabla.
2. **Actions del catálogo** en `src/actions/service-checklist.actions.ts` (`requireAdmin` para mutar): `listServiceChecklistItems({ includeInactive })`, `createServiceChecklistItem(name)`, `renameServiceChecklistItem(id, name)`, `setServiceChecklistItemActive(id, active)`, `moveServiceChecklistItem(id, 'up' | 'down')`. Nombre obligatorio, sin duplicados (case-insensitive, mensaje claro). `revalidatePath('/dashboard/settings')`.
3. **UI del catálogo** en `src/components/settings/ServiceChecklistSettings.tsx`, montado en `/dashboard/settings` como sección "Checklist de service": lista con subir/bajar, renombrar inline, desactivar/reactivar (los inactivos se ven atenuados) y campo para agregar.
4. **Actions del checklist en la OT** (en `src/actions/intervention.actions.tsx`, reutilizando `assertOtEditableForItems`): `setInterventionIsService(interventionId, isService)` — al pasar a `false` borra todas las filas en la misma transacción — y `setServiceCheck(interventionId, checklistItemId, status | null)` — `null` borra la fila; si no existe la crea copiando `name` y `sortOrder` del catálogo; rechaza si la OT no es service o si el punto está inactivo y la OT no lo tenía. `revalidatePath` del detalle y del listado.
5. **`getInterventionDetail`** devuelve `isService` y `serviceChecks: ServiceCheckDto[]` ordenados por `sortOrder`, más los puntos activos del catálogo para armar la tabla.
6. **Componente `src/components/interventions/ServiceChecklist.tsx`** (client): checkbox "Es service" + tabla con, por punto, un control de tres estados (Sin marcar / Revisado / Cambiado). Filas = puntos activos del catálogo ∪ puntos ya marcados en la OT (aunque estén inactivos). Modo controlado (para el alta) y modo autoguardado con `interventionId` (para el detalle), con revert y mensaje de error si falla. Destildar con puntos marcados abre confirmación. Modo solo lectura para OT no editables.
7. **Detalle de la OT** (`src/app/dashboard/interventions/[id]/page.tsx`): montar `ServiceChecklist` en modo autoguardado dentro de la sección "Detalles" (arriba, antes del formulario de la OT), con el checkbox y el resumen en línea y la tabla en un popup; en solo lectura si la OT no está `ABIERTA` o el usuario no puede editarla. Si la OT no es service y no es editable, no se muestra.
8. **Alta de la OT** (`NewInterventionForm.tsx` + `CreateOtPayload` + `createIntervention`): montar `ServiceChecklist` en modo controlado; enviar `isService` y `serviceChecks: { checklistItemId, status }[]` opcionales; `createIntervention` crea las filas en la misma transacción. Sin esos campos el alta se comporta igual que hoy (incluida la conversión desde presupuesto y desde turno).
9. **Comprobante PDF** (`OtComprbantePdf.tsx` + `generateOtPdfBase64`): sección "Service realizado" con tabla Punto · Revisado · Cambiado (marca en la columna que corresponda) solo si `isService` y hay puntos marcados, ubicada siempre al final del comprobante (después de los ítems y el total; si la OT no tiene ítems, solo se ve la tabla). Si es service sin puntos marcados, una línea "Service (sin puntos registrados)".
10. **Historial del auto**: helper `formatServiceSummary(checks)` (en `lib/` o `src/lib/`) que arma el texto `Service — Cambiado: … Revisado: …` (omite el grupo vacío). Usarlo en `CarHistorialPdf.tsx` (vía `generateCarHistoryPdfBase64`, que alimenta también el email de `approveCarHistoryRequest`) y en `CarHistoryViewer.tsx`.
11. **Listado de OT**: `getInterventionsPage` acepta `service?: boolean` y filtra por `isService`; `InterventionsSearchForm.tsx` agrega el checkbox "Solo services" que escribe/borra `?service=1` y resetea la página; badge "Service" en cada fila con `isService`.

## Criterios de aceptación

- [ ] `npx tsc --noEmit` termina sin errores.
- [ ] Después de `yarn db:migrate:deploy` sobre una base vacía, `ServiceChecklistItem` tiene los 16 puntos iniciales, activos y en el orden listado.
- [ ] En Configuración, un ADMIN puede agregar, renombrar, subir/bajar y desactivar/reactivar puntos; agregar un nombre ya existente (con otras mayúsculas) muestra un error y no crea nada.
- [ ] Un MECHANIC no puede ejecutar las actions del catálogo (respuesta de acceso denegado aunque se llamen directo).
- [ ] En "Abrir OT", tildar "Es service" muestra la tabla con los puntos activos; crear la OT con dos puntos en Cambiado y uno en Revisado deja `isService = true` y exactamente esas 3 filas.
- [ ] Crear una OT sin tildar "Es service" deja `isService = false` y ninguna fila; las conversiones desde presupuesto y desde turno siguen funcionando igual.
- [ ] En el detalle de una OT `ABIERTA` sin service, tildar "Es service" lo guarda sin botón y al recargar sigue tildado.
- [ ] En el detalle, cambiar un punto a Revisado, luego a Cambiado y luego a Sin marcar deja, tras cada recarga, la fila con el estado correspondiente y finalmente sin fila.
- [ ] Destildar "Es service" con puntos marcados pide confirmación; al cancelar no cambia nada; al confirmar queda `isService = false` y sin filas.
- [ ] En una OT `CERRADA` o `CANCELADA`, el checkbox y el checklist se ven deshabilitados, y llamar a `setServiceCheck` / `setInterventionIsService` sobre ella devuelve error.
- [x] Con cancelación pendiente, un MECHANIC recibe error en las mismas actions, igual que con `upsertInterventionItem`; el ADMIN conserva la edición (mismas reglas que los ítems).
- [ ] Renombrar un punto del catálogo no cambia el nombre que muestra una OT donde ya estaba marcado.
- [ ] Desactivar un punto lo saca de la tabla de OT nuevas, pero una OT que lo tenía marcado lo sigue mostrando con su estado.
- [ ] El comprobante PDF de una OT de service muestra la sección "Service realizado" con una fila por punto marcado y la marca en la columna Revisado o Cambiado; una OT sin service no muestra la sección.
- [ ] El PDF de historial del auto y el visor en pantalla muestran, en cada OT de service, el resumen en texto `Service — Cambiado: … Revisado: …` sin tabla.
- [ ] El listado de OT muestra el badge "Service" en las OT de service; con "Solo services" tildado la URL tiene `?service=1` y solo aparecen OT con `isService`, combinable con el filtro de estado y la búsqueda.
- [ ] Marcar "Cambiado" en un punto no crea ni modifica ningún `InterventionItem` ni el `cost` de la OT.

## Decisiones

- **Sí:** "Es service" como booleano en la OT, no como tipo excluyente. Decisión del usuario: una reparación normal puede incluir también un service.
- **Sí:** checkbox en el alta y en el detalle mientras la OT está `ABIERTA`. Cerrada o cancelada queda de solo lectura, igual que ítems y costos.
- **No:** editar el checklist en OT cerradas, ni siquiera el ADMIN. Se mantiene el criterio de que una OT cerrada es un documento.
- **Sí:** catálogo configurable por el ADMIN en base de datos, con lista inicial. Una lista fija en código obligaba a un deploy para cambiar un punto.
- **Sí:** lista inicial insertada por migración y no por `db:seed`. El seed no corre en producción; la migración sí (`build-and-push.sh`).
- **Sí:** tres estados por punto (sin marcar / Revisado / Cambiado). En un service algunas cosas se revisan y otras se reemplazan; un checkbox simple perdía esa diferencia.
- **No:** observación por punto. Se pidió mantenerlo simple.
- **No:** campo propio de kilometraje del service. La OT ya registra el kilometraje (`mileageKm`) al abrirse, y ese es el kilometraje al que se hizo el service; duplicarlo sería redundante.
- **No:** plantillas por kilometraje que pre-marquen puntos. Decisión del usuario; si se necesita, va en otra spec.
- **Sí:** solo se guardan filas para los puntos marcados. "Sin marcar" no ocupa espacio y el resumen se arma directo de las filas.
- **Sí:** snapshot del nombre (y del orden) en cada punto marcado, y desactivar en vez de borrar. El historial de un auto no debe cambiar porque se renombró o se dio de baja un punto.
- **Sí:** destildar "Es service" borra los puntos, con confirmación. Conservarlos ocultos dejaría datos que no se ven en ningún lado.
- **Sí:** checkbox y resumen arriba en "Detalles", tabla en un popup. Cambio pedido por el usuario durante la implementación: al final de la página había que scrollear mucho para encontrar el check. El resumen en línea evita que lo marcado quede oculto al cerrar el popup.
- **No:** tabla del checklist en línea al final del detalle. Primera versión implementada; quedaba fuera de vista.
- **Sí:** autoguardado por click en el detalle. El mecánico lo completa con el auto delante; un botón "Guardar" se olvida fácil.
- **Sí:** mismos permisos que los ítems (`canMutateOt`). No se inventa una regla nueva para algo que se edita en la misma pantalla.
- **No:** vincular el checklist con ítems/costos. El checklist es registro técnico; los repuestos se cobran como ítems, como hoy.
- **Sí:** tabla en el comprobante de OT y resumen en texto en el historial. Decisión del usuario: en el historial, con muchas OT, una tabla por OT ocupa demasiado.
- **Sí:** filtro del listado en la URL (`?service=1`), como el resto de los filtros de OT.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `NewInterventionForm.tsx` es grande (~1000 líneas) y sumar el checklist puede romper "Abrir OT", la conversión desde presupuesto o desde turno | Los campos nuevos del payload son opcionales; sin ellos `createIntervention` se comporta igual que hoy. El checklist es un componente aparte en modo controlado. |
| Dos clicks rápidos sobre el mismo punto en el autoguardado llegan desordenados | `@@unique([interventionId, checklistItemId])` + upsert; la UI deshabilita el punto mientras su guardado está en curso. |
| Desactivar un punto que está marcado en una OT abierta | La tabla muestra la unión de puntos activos y ya marcados; el punto se sigue viendo y se puede desmarcar, pero no volver a marcar en otra OT. |
| `gen_random_uuid()` no disponible en la versión de Postgres de producción | Viene incluida desde Postgres 13; verificar la versión de `taller_db` antes del deploy y ensayar con `yarn db:clone`. |
| PDF de historial muy largo en autos con muchos services | Se usa resumen en texto, una línea por OT, sin tabla. |

## Qué **no** entra en esta spec

- Campo propio de kilometraje del service (ya está en `mileageKm` de la OT) y plantillas que pre-marquen puntos.
- Observaciones por punto.
- Vínculo entre checklist e ítems/costos de la OT.
- Puntos libres fuera del catálogo.
- Recordatorios de próximo service.
- Checklist en la respuesta `estado` del bot de WhatsApp.
- Edición del checklist en OT cerradas o canceladas.
- Checklist en presupuestos.
- Acceso de VIEWER.

Cada uno de estos, si se hace, va en su propia spec.
