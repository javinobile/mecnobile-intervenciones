# SPEC 01 — Creador de presupuestos

> **Status:** Aprobado
> **Depends on:** —
> **Date:** 2026-11-03
> **Objective:** Agregar una sección "Presupuestos" en el menú donde ADMIN y MECHANIC armen presupuestos de mano de obra, repuestos y trabajos de terceros, los emitan por PDF o email y opcionalmente los conviertan en OT.

## Por qué existe esta spec

Hoy, cuando un cliente consulta cuánto sale un trabajo, no hay forma de dejarlo registrado en el sistema sin abrir una OT. Abrir una OT exige cliente, auto y kilometraje reales, y además consume un número de OT. El presupuesto es un documento previo, más liviano, que puede no convertirse nunca en trabajo.

## Alcance

**Entra:**

- Nueva entrada "Presupuestos" en el sidebar (`/dashboard/presupuestos`), visible para ADMIN y MECHANIC.
- Listado **paginado** de todos los presupuestos confeccionados (10 por página, del más nuevo al más viejo), con búsqueda por Nº de presupuesto, nombre del cliente o dominio, y filtro por estado. La búsqueda y la página viajan en la URL (`?q=&estado=&page=`), igual que en Clientes y OT.
- Alta y edición de un presupuesto con datos del cliente y del vehículo.
- El cliente y el auto se pueden vincular a registros existentes (`Client` / `Car`) o cargar como texto libre.
- Ítems de tres tipos (mano de obra, repuesto, trabajo de tercero), cada uno con descripción e importe **manual**.
- Total del presupuesto separado por tipo, más el total general.
- Numeración correlativa propia ("Presupuesto Nº N"), independiente de la de las OT.
- Estados `BORRADOR`, `ENVIADO`, `ACEPTADO` y `RECHAZADO`, más el estado *Vencido*, que se calcula a partir de la fecha de validez.
- Fecha "válido hasta": se calcula con un nuevo campo en Configuración del taller (`quoteValidityDays`, default 15) y se puede editar a mano en cada presupuesto.
- Botón "Emitir presupuesto": si el campo email está completo, envía el PDF por email y pasa a `ENVIADO`. Si no hay email, pasa a `ENVIADO` y ofrece descargar el PDF.
- Descarga del PDF en cualquier estado, con el mismo membrete que el comprobante de OT.
- Botón "Reenviar email" para presupuestos ya enviados que tengan email.
- Marcar a mano como Aceptado o Rechazado.
- Edición permitida mientras el presupuesto no esté `ACEPTADO`.
- Borrado de presupuestos no aceptados (`BORRADOR`, `ENVIADO`, `RECHAZADO`, incluidos los vencidos), con confirmación. Es un borrado físico y se llevan los ítems en cascada.
- **Un presupuesto `ACEPTADO` es un documento cerrado.** No se pueden editar sus datos ni sus ítems, no se puede borrar y no cambia más de estado. Solo admite descargar el PDF, reenviarlo por email y convertirlo en OT.
- Botón opcional "Convertir en OT" sobre un presupuesto `ACEPTADO`. Abre el formulario de "Abrir OT" ya precargado y, al crear la OT, copia los ítems y deja el presupuesto vinculado.

**Fuera de alcance (para specs futuras):**

- Envío del presupuesto por WhatsApp. Requiere una plantilla nueva aprobada por Meta.
- Cálculo de mano de obra por horas × tarifa horaria.
- Cantidad × precio unitario en repuestos.
- IVA discriminado y descuentos globales. Un descuento se carga como ítem con importe negativo.
- Duplicar presupuestos.
- Papelera o recuperación de presupuestos borrados.
- Que el cliente acepte o rechace el presupuesto por su cuenta (link público o WhatsApp).
- Acceso de VIEWER.

## Modelo de datos

Cambios en `prisma/schema.prisma`:

```prisma
enum QuoteStatus {
  BORRADOR
  ENVIADO
  ACEPTADO
  RECHAZADO
}

/// Presupuesto previo a una OT. Cliente y auto pueden ser registros existentes o texto libre.
model Quote {
  id          String      @id @default(uuid())
  quoteNumber Int         @unique @default(autoincrement())
  status      QuoteStatus @default(BORRADOR)

  // Vínculos opcionales con el padrón
  clientId String?
  client   Client? @relation(fields: [clientId], references: [id], onDelete: SetNull)
  carId    String?
  car      Car?    @relation(fields: [carId], references: [id], onDelete: SetNull)

  // Snapshot / datos libres (se precargan desde Client/Car si hay vínculo; editables)
  customerName       String
  customerPhone      String?
  customerEmail      String?
  vehiclePlate       String?
  vehicleDescription String?   // marca, modelo, año en texto libre

  description String?   // motivo de la consulta / trabajo pedido
  notes       String?   // observaciones que salen en el PDF

  validUntil DateTime
  total      Decimal @default(0.00) @db.Decimal(10, 2)

  sentAt     DateTime?
  acceptedAt DateTime?
  rejectedAt DateTime?

  /// OT creada a partir de este presupuesto (conversión opcional)
  interventionId String?       @unique
  intervention   Intervention? @relation(fields: [interventionId], references: [id], onDelete: SetNull)

  createdById String
  createdBy   User   @relation("QuoteCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)

  items QuoteItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, createdAt])
  @@index([clientId])
  @@index([carId])
}

model QuoteItem {
  id          String               @id @default(uuid())
  quoteId     String
  quote       Quote                @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  type        InterventionItemType // reutiliza REPUESTO / MANO_DE_OBRA / TRABAJO_TERCERO
  description String
  amount      Decimal              @db.Decimal(10, 2)
  sortOrder   Int                  @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([quoteId])
}
```

También se agregan las relaciones inversas en `Client` (`quotes Quote[]`), `Car` (`quotes Quote[]`), `Intervention` (`quote Quote?`) y `User` (`quotesCreated Quote[] @relation("QuoteCreatedBy")`). En `WorkshopSettings` se agrega:

```prisma
  /// Días de validez por defecto de un presupuesto nuevo.
  quoteValidityDays Int @default(15)
```

Convenciones:

- **Vencido no se guarda en la base.** Se calcula al mostrar el presupuesto: `status` en (`BORRADOR`, `ENVIADO`) y `validUntil` anterior al inicio del día actual (hora local del taller, `TZ`).
- `total` es la suma de `QuoteItem.amount` y se recalcula en cada alta, edición o baja de un ítem, igual que `Intervention.cost`.
- `quoteNumber` lo asigna una secuencia de Postgres (`autoincrement()`). Un número nunca se reutiliza, aunque se borre el presupuesto: puede haber huecos, pero no dos documentos distintos con el mismo número.
- Solo se puede editar, cambiar de estado o borrar si `status != ACEPTADO`. Esta regla se valida en cada server action, no solo en la UI.
- Al convertir en OT, cada `QuoteItem` pasa a `InterventionItem` con `hours = null`, `unitPrice = amount` y `amount = amount`.
- Rutas en español (`/dashboard/presupuestos`), modelos en inglés y valores de enum en español, igual que el resto del proyecto.

## Plan de implementación

1. **Esquema y migración.** Agregar `QuoteStatus`, `Quote`, `QuoteItem`, las relaciones inversas y `WorkshopSettings.quoteValidityDays`. Crear la migración con `yarn db:migrate` (nombre `quotes`) y correr `yarn db:generate`. Verificación: `yarn db:migrate:status` limpio y la app sigue arrancando.
2. **Validez en Configuración.** Sumar `quoteValidityDays` a `getWorkshopSettings` / `updateWorkshopSettings` (`src/actions/settings.actions.ts`) y un input numérico en `src/components/settings/SettingsForm.tsx` (rango 1–365). Verificación: se guarda y se relee desde Configuración del taller.
3. **Permisos y menú.** Agregar la regla `{ prefix: '/dashboard/presupuestos', roles: ['ADMIN', 'MECHANIC'] }` en `middleware.ts` y el ítem "Presupuestos" con `staffOnly: true` en `src/components/layout/Sidebar.tsx`. Crear `src/app/dashboard/presupuestos/page.tsx` con un listado vacío. Verificación: VIEWER no ve el ítem y si entra a la URL lo redirige a `/dashboard`.
4. **Acciones de lectura y alta.** Crear `src/actions/quote.actions.tsx` (`'use server'`, protegido con `requireStaff`) con `getQuotesPage({ page, query, status })`, que devuelve `{ quotes, totalCount, totalPages, currentPage }` con 10 por página, busca por Nº, nombre o dominio y calcula *Vencido*. También `getQuoteDetail` y `createQuote` (`validUntil` por defecto y snapshot de cliente/auto si viene vinculado). Los `Decimal` se convierten con `.toNumber()` antes de salir hacia el cliente.
5. **Listado paginado.** `src/components/quotes/QuotesTable.tsx` con Nº, fecha, cliente, dominio, total, estado (incluido *Vencido*) y botón "Nuevo presupuesto". `page.tsx` lee `q`, `estado` y `page` de `searchParams`. Para la búsqueda y la paginación se reutilizan `SearchForm` y `PaginationLink` de `src/components/clients/`, o se generalizan si hiciera falta.
6. **Formulario de alta.** `src/app/dashboard/presupuestos/new/page.tsx` y `src/components/quotes/QuoteForm.tsx`: datos del cliente y del vehículo, con búsqueda opcional que reutiliza `searchClientsForOt` / `searchCarsForOt` y precarga los campos libres. Al guardar queda en `BORRADOR` y redirige al detalle.
7. **Detalle e ítems.** `src/app/dashboard/presupuestos/[id]/page.tsx` y `src/components/quotes/QuoteItemsEditor.tsx` (tipo, descripción, importe), con totales por tipo y general. Acciones `updateQuote`, `upsertQuoteItem` y `deleteQuoteItem`, que recalculan `total`. Si el presupuesto está `ACEPTADO`, la edición se bloquea tanto en la UI (solo lectura) como en las acciones (devuelven error).
8. **Borrar.** Acción `deleteQuote(id)`, que rechaza el borrado si `status = ACEPTADO`. Botón "Borrar" con confirmación en el detalle y en la fila del listado, visible solo en presupuestos no aceptados. Después de borrar, se vuelve al listado con `revalidatePath`.
9. **PDF.** `src/components/quotes/QuotePdf.tsx` con el membrete de `src/lib/pdf-logo.ts`: Nº, fecha, válido hasta, cliente, vehículo, ítems agrupados por tipo, totales y notas. Acción `generateQuotePdfBase64` y botón de descarga en el detalle.
10. **Emitir y reenviar.** Acción `issueQuote`. Si hay `customerEmail`: valida el formato, envía con `sendMailWithPdfAttachment` y, solo si el envío sale bien, pasa a `ENVIADO` con `sentAt`. Si no hay email: pasa a `ENVIADO` y la UI ofrece descargar el PDF. Acción `resendQuoteEmail` para presupuestos `ENVIADO` o `ACEPTADO` con email (no cambia el estado, actualiza `sentAt`). Si `isMailConfigured()` es falso con un email cargado, se muestra el error y no cambia nada.
11. **Aceptar y rechazar.** Acciones `acceptQuote` y `rejectQuote` (con `acceptedAt` / `rejectedAt`) y sus botones en el detalle. Se puede rechazar desde `BORRADOR` o `ENVIADO`, y aceptar solo desde `ENVIADO`, aunque esté vencido. Aceptar pide confirmación ("El presupuesto queda cerrado y no se podrá modificar ni borrar") y es irreversible.
12. **Convertir en OT.** Botón "Convertir en OT" en presupuestos `ACEPTADO` sin `interventionId`, que navega a `/dashboard/interventions/new?presupuesto=<id>`. `src/app/dashboard/interventions/new/page.tsx` carga el presupuesto y precarga en `NewInterventionForm` el cliente y el auto vinculados (o los datos libres para buscar o crear), la descripción y los ítems. `createIntervention` recibe un `quoteId` opcional: dentro de la misma transacción copia los ítems, recalcula `cost` y setea `Quote.interventionId`. Si el presupuesto ya estaba convertido, falla con un mensaje.

## Criterios de aceptación

- [ ] ADMIN y MECHANIC ven "Presupuestos" en el sidebar; VIEWER no lo ve y al entrar a `/dashboard/presupuestos` lo redirige a `/dashboard`.
- [ ] Se puede crear un presupuesto solo con nombre del cliente e ítems, sin vincular `Client` ni `Car`.
- [ ] Al vincular un cliente o un auto existentes, se precargan nombre, teléfono, email, dominio y descripción del vehículo, y se pueden editar.
- [ ] Dos presupuestos creados seguidos reciben números consecutivos, y crear presupuestos no cambia la numeración de las OT.
- [ ] Si se borra el último presupuesto, el siguiente que se crea no reutiliza su número.
- [ ] Con más de 10 presupuestos, el listado muestra 10 por página y navega entre páginas manteniendo la búsqueda y el filtro.
- [ ] Buscar por Nº de presupuesto, por parte del nombre del cliente o por el dominio devuelve los presupuestos que coinciden.
- [ ] Un presupuesto nuevo tiene "válido hasta" = hoy + `quoteValidityDays`, y la fecha se puede cambiar.
- [ ] Cambiar `quoteValidityDays` en Configuración afecta solo a los presupuestos nuevos.
- [ ] El total general es la suma exacta de los importes de los ítems y se muestra separado en mano de obra, repuestos y trabajos de terceros.
- [ ] Un presupuesto `BORRADOR` o `ENVIADO` con `validUntil` pasado se muestra como "Vencido" en el listado y en el detalle.
- [ ] El PDF se descarga en cualquier estado y muestra Nº, fechas, cliente, vehículo, ítems por tipo y totales.
- [ ] "Emitir" con un email válido manda un correo con el PDF adjunto y el presupuesto pasa a `ENVIADO`.
- [ ] "Emitir" sin email pasa a `ENVIADO`, no envía correo y ofrece la descarga del PDF.
- [ ] Si el envío de email falla (SMTP caído o sin configurar), el presupuesto sigue en `BORRADOR` y se muestra el error.
- [ ] "Reenviar email" en un presupuesto `ENVIADO` envía el PDF con los datos actuales.
- [ ] Un presupuesto en `BORRADOR`, `ENVIADO`, `RECHAZADO` o vencido se puede borrar desde el listado y desde el detalle, después de confirmar, y desaparece del listado.
- [ ] Un presupuesto `ACEPTADO` no muestra botones de editar, borrar, aceptar ni rechazar, y llamar a esas acciones directamente devuelve un error sin modificar nada.
- [ ] Un presupuesto `ACEPTADO` permite descargar el PDF, reenviar el email y convertir en OT.
- [ ] "Convertir en OT" abre "Abrir OT" precargado. Al guardar, la OT tiene los mismos ítems e importes, su `cost` es igual al total del presupuesto y el presupuesto muestra el link a la OT.
- [ ] Un presupuesto ya convertido no muestra el botón "Convertir en OT", y llamar a la acción de nuevo devuelve un error sin crear una segunda OT.
- [ ] `npx tsc --noEmit` no suma errores nuevos respecto de `main`.

## Decisiones

- **Sí:** cliente y auto opcionales con snapshot en texto. Permite presupuestar a gente que todavía no es cliente sin ensuciar el padrón, y el PDF no cambia si después se edita el `Client`.
- **No:** cliente y auto obligatorios. Obligaría a dar de alta registros por cada consulta, aunque nunca se concrete.
- **Sí:** importes manuales por ítem, separados por tipo. Decisión del usuario: el presupuesto es una estimación y no tiene que atarse a la tarifa horaria.
- **No:** horas × tarifa y cantidad × precio unitario. Se descartó para el presupuesto. Al convertir en OT, el importe pasa como `unitPrice`/`amount`, y en la OT se puede ajustar.
- **Sí:** reutilizar el enum `InterventionItemType` para los ítems. La conversión a OT es directa y los tipos no se desfasan.
- **Sí:** numeración propia con una secuencia de Postgres (`autoincrement()` + `@unique`). Como se pueden borrar presupuestos, `count + 1` (lo que usan las OT) o `max + 1` reutilizarían números de documentos ya enviados a clientes. La secuencia además elimina la carrera entre altas simultáneas.
- **Sí:** borrado físico de los no aceptados. Decisión del usuario: los borradores y los rechazados no tienen valor de documento. Quedan huecos en la numeración y se aceptan.
- **No:** borrado lógico (`deletedAt`). Agrega filtros en todas las consultas para un caso que no lo necesita.
- **Sí:** `ACEPTADO` es irreversible y deja el presupuesto cerrado. Decisión del usuario: una vez aceptado, es un documento. La regla se valida en las server actions, no solo ocultando botones.
- **Sí:** *Vencido* calculado y no guardado. No necesita cron ni job, y cambiar `validUntil` lo corrige al instante.
- **Sí:** email automático solo al "Emitir" y solo si hay dirección. Se puede trabajar el borrador sin mandarle nada al cliente por accidente.
- **Sí:** si falla el envío, el estado no cambia. Así `ENVIADO` con email cargado significa que el correo efectivamente salió.
- **Sí:** se puede editar después de enviado, con reenvío. Los precios de repuestos cambian seguido, así que se prefirió esto a congelar y duplicar.
- **Sí:** convertir en OT reutilizando el formulario "Abrir OT". Ese formulario ya resuelve la búsqueda y el alta de cliente y auto, el kilometraje y la transferencia de dueño, y duplicarlo sería mantener dos flujos.
- **Sí:** aceptar se permite aunque esté vencido. Es una marca manual del taller y puede respetar el precio si quiere.
- **No:** IVA y descuentos. Se mantiene el criterio actual de la OT: el total es la suma de los ítems.
- **No:** WhatsApp como canal de envío. Requiere una plantilla nueva aprobada por Meta y va en otra spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Dos altas simultáneas toman el mismo `quoteNumber` | Lo asigna la secuencia de Postgres, que es atómica. |
| Borrar por error un presupuesto ya enviado al cliente | Confirmación obligatoria antes de borrar. Los aceptados no se pueden borrar. |
| `NewInterventionForm.tsx` es grande (~950 líneas) y la precarga puede romper "Abrir OT" normal | La precarga entra por props opcionales. Sin `?presupuesto=`, el formulario se comporta exactamente igual que hoy. |
| SMTP no configurado en algún entorno | `isMailConfigured()` se chequea antes de enviar; el error es explícito y el estado no cambia. La descarga del PDF siempre funciona. |
| Vencido mal calculado por zona horaria | La comparación se hace contra el inicio del día en hora local del taller (`TZ`), igual que los turnos. |
| Conversión doble a OT | `interventionId @unique` y chequeo dentro de la misma transacción de `createIntervention`. |

## Qué **no** entra en esta spec

- Envío por WhatsApp.
- Cálculo por horas × tarifa o cantidad × precio unitario.
- IVA y descuentos globales.
- Duplicar presupuestos.
- Papelera o recuperación de presupuestos borrados.
- Borrar o modificar presupuestos aceptados.
- Aceptación del cliente por su cuenta (link público o WhatsApp).
- Acceso de VIEWER.

Cada uno de estos, si se hace, va en su propia spec.
