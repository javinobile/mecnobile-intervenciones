# SPEC 03 — Flujo conversacional del bot de WhatsApp

> **Status:** Implementado
> **Depends on:** —
> **Date:** 2026-11-12
> **Objective:** Rediseñar la conversación del bot de WhatsApp (turnos, estado, historial, cancelación) para que sea corta, use botones y listas, reconozca al cliente por su teléfono y deje de repetir menús y ayudas en cada mensaje.

## Por qué existe esta spec

El bot (`src/lib/whatsapp/bot-flow.ts`) es una máquina de estados por palabras clave que resulta invasiva y rígida:

- El menú `HELP_HINT` (6 líneas) se pega en casi todos los mensajes terminales (éxito de turno, cancelación, reinicio, errores, "no te entendí"). Además cada paso agrega un pie `stepHint` y un `DATE_HINT`/`TIME_HINT` que repiten lo que ya dice el cuerpo, y el horario semanal completo sale en cada prompt de día.
- Un simple "hola" arranca el pedido de turno con saludo + menú + pregunta en un solo mensaje.
- No hay botones ni listas en todo el flujo conversacional (solo en `notifyAppointmentAlternatives`, que sale de la UI del mecánico).
- Las palabras clave `estado`, `cancelar`, `ayuda` y `reiniciar` no se normalizan: "Estado?" o "Cancelar." no funcionan, y "quiero saber cómo va mi auto" cae en "No te entendí".
- El turno pide nombre y patente aunque el teléfono ya identifica al cliente y sus autos (estado e historial sí lo usan). Fecha y hora son dos pasos largos y no se ofrecen horarios.
- Los comandos globales se evalúan antes que el paso actual: una avería que diga "historial de frenos" desvía el flujo; una propuesta de horarios pendiente bloquea todo texto; "1/2/3" colisiona con elegir un auto.
- El timeout de 30 min es mudo (`expireStaleConversations` corre antes y `expireConversationIfStale` es código muerto): el cliente pierde el pedido sin saberlo y recibe "No te entendí".
- `cancelar` **borra** el turno (`appointment.delete`) sin confirmar y sin avisar al taller.
- Confirmar "sí" en una coincidencia difusa de patente **modifica el dominio del auto** (`updateCarLicensePlateCorrected`) a partir de un chat sin autenticar.
- Los errores exponen reglas internas ("el auto tiene que tener una OT ABIERTA"), no hay forma de hablar con una persona y los audios/imágenes no reciben respuesta.
- Los avisos de historial aprobado/rechazado salen como texto libre sin plantilla de respaldo: fuera de la ventana de 24 h de Meta no llegan y el fallo solo queda en `console.error`.

## Alcance

**Entra:**

### Principios

- Un solo mensaje del bot por paso. Sin pies de ayuda repetidos.
- El menú aparece solo cuando el cliente lo pide (`menu`, `ayuda`, "hola") o cuando el bot no entiende, y como botones/lista, no como bloque de texto.
- Toda elección cerrada (menú, sí/no, auto, día, horario, turno a cancelar) usa botones o lista interactiva. El texto libre sigue siendo aceptado como alternativa.
- Los mensajes no exponen reglas internas del sistema y siempre ofrecen una salida (otra acción o hablar con el taller).

### Reconocimiento de intención

- Todas las keywords pasan por `normalizeBotKeyword` (sin acentos, mayúsculas ni puntuación): "Estado?", "*estado*", "Cancelar." funcionan.
- Frases naturales: "quiero saber cómo va mi auto", "necesito un turno", "pasame el historial", "quiero cancelar el turno".
- "hola"/"buenas" ya **no** inician un turno: muestran el saludo con el menú.
- Los comandos globales no interrumpen pasos de texto libre (avería, nombre, email): lo que el cliente escribe en esos pasos se toma como respuesta, salvo `reiniciar`/`menu`/`cancelar` exactos.
- Los ids de botón llevan prefijo por tipo (`menu:`, `car:`, `slot:`, `confirm:`, `cancel:`), así "1/2/3" por texto se interpreta según el paso activo y no colisiona con las propuestas de horario.

### Saludo y menú

`Hola {Nombre}, soy el asistente de Nóbile. ¿En qué te ayudo?` (sin nombre si el teléfono no es de un cliente) con botones **Sacar turno** · **Estado de mi auto** · **Más opciones**. WhatsApp limita a 3 botones, por eso **Más opciones** abre otros 3 botones: **Pedir historial** · **Cancelar un turno** · **Hablar con el taller** (el historial y la cancelación también se piden escribiendo).

### Turno

1. **Auto.** Si el teléfono corresponde a un cliente: un auto → `¿El turno es para tu {Marca Modelo} ({patente})?` [Sí] [Otro auto]; varios → lista; ninguno u "otro" → se pide la patente. El nombre solo se pregunta si el cliente no se pudo identificar por teléfono.
2. **Avería.** `¿Qué le pasa o qué trabajo necesita?` Se guarda lo escrito, sin interpretarlo como comando.
3. **Día y hora.** Lista con los próximos días hábiles según el horario del taller (`isWorkingDay`), luego lista de horarios del día elegido (`checkSlotWithinSchedule`), **excluyendo los horarios ocupados** (ver "Disponibilidad"). También se acepta texto libre, incluso fecha y hora juntas ("mañana a las 9"). El horario semanal completo solo se muestra si el cliente elige un día no laborable o lo pide.
4. **Resumen y confirmación.** Resumen corto (auto, avería, día y hora) con [Confirmar] [Cambiar]. Recién al confirmar se crea el `Appointment` PENDIENTE con `source: WHATSAPP`. El cierre es una línea ("Listo, quedó pendiente de confirmación del taller. Te avisamos por acá"), sin menú.
5. **Anti-duplicados.** Si ya hay un turno PENDIENTE/PROPUESTA_ENVIADA/CONFIRMADO del mismo teléfono y patente, el bot lo informa y ofrece cambiarlo o cancelarlo en vez de crear otro.

**Patente desconocida o con coincidencia difusa:** el bot ya **no** modifica el dominio de ningún auto. Si hay coincidencias difusas puede mostrarlas y preguntar "¿Es este tu auto?", pero lo que se guarda en el turno es la patente tal cual la escribió el cliente más una nota interna para que el staff valide o corrija el dominio. Se elimina el `PLATE_MIGRATION_NOTE` del mensaje al cliente.

### Disponibilidad

- Un horario **no se ofrece** si choca con un turno activo (PENDIENTE, PROPUESTA_ENVIADA o CONFIRMADO; `CANCELADO` libera el horario). La regla aplica en la lista de horarios y también al escribir una hora en texto libre: si está ocupada, el bot lo dice y ofrece los horarios libres más cercanos de ese día (o "elegir otro día").
- Si un día no tiene horarios libres, no aparece en la lista de días.
- La verificación se repite al **confirmar**, para cubrir dos clientes eligiendo el mismo horario a la vez ("Ese horario se acaba de ocupar, elegí otro").
- Los turnos cargados a mano desde el panel y los creados por el bot cuentan igual.
- **Duración:** `Appointment` solo tiene `startsAt`, sin duración, y un auto puede quedarse varios días en el taller. La disponibilidad **no** modela la permanencia del auto: solo reserva el momento de **recepción**. Cada turno ocupa un bloque de **120 minutos** desde `startsAt` (o hasta `endsAt` si un turno manual lo tiene cargado) (promedio estimado), definido como constante en `src/lib/workshop-schedule` para poder ajustarlo (o pasarlo a `WorkshopSettings`/env más adelante). Dos turnos chocan si sus bloques de 120 min se superponen; los horarios ofrecidos son consecutivos y no superpuestos (ej. 9:00, 11:00, 13:00...).

### Estado

- Un solo auto con OT abierta → respuesta directa. Varios → lista de autos.
- Sin autos en taller: `No veo ningún auto en el taller con este número. ¿Querés sacar un turno o hablar con el taller?` + botones. Sin explicar reglas internas.
- Se mantiene el texto del reporte (plantilla y Groq opcional). Sin pie de ayuda.

### Historial

- Selección de auto igual que en estado (directo si hay uno, lista si hay varios).
- Pedido de email: si el cliente ya tiene uno, [Usar {email}] [Otro]. Se aclara una sola vez que un administrador autoriza el envío.
- Un email nuevo ingresado por el bot **no pisa** el email guardado de la ficha del cliente: queda registrado solo en la `CarHistoryRequest` y el ADMIN decide al aprobar.
- Cierre corto, sin menú.

### Cancelar

- Se listan los turnos activos (PENDIENTE, PROPUESTA_ENVIADA, CONFIRMADO), también cuando hay uno solo, y se elige con botón o lista (se acepta el número solo, sin repetir "cancelar").
- Confirmación [Sí, cancelar] [No, mantener].
- Nuevo estado `CANCELADO` en `AppointmentStatus`: el turno **no se borra**, queda registrado y deja de ocupar calendario. Se agrega `canceledAt` y `canceledBy` (cliente por WhatsApp / staff).
- El taller se entera: aviso visible en el panel (badge/lista de turnos cancelados) para que no se espere a un cliente que canceló.

### Transversales

- **Timeout:** se cierra el borrador a los 30 min (sin cron: se evalúa en el mensaje siguiente del cliente por usuario, no con un `updateMany` global previo) y el bot **avisa**: `El pedido se cerró por inactividad y no se guardó ningún turno. ¿Empezamos de nuevo?` + [Sacar turno] [Menú].
- **Reiniciar / menú:** respuesta corta ("Listo, empecemos de nuevo") + menú en botones. Sin texto de ayuda largo.
- **No entendido:** una línea + botones del menú + "Hablar con el taller". Tras dos "no entendí" seguidos en el mismo paso, se ofrece salir o hablar con el taller.
- **Hablar con el taller:** el bot responde con el teléfono del taller, **3482220236** por defecto, configurable con la variable de entorno `WORKSHOP_CONTACT_PHONE` (se agrega a `.env.example` y `env-template`). Sin aviso interno ni campo en `WorkshopSettings`.
- **Mensajes no soportados** (audio, imagen, ubicación, documento): respuesta única "Por acá solo puedo leer texto. ¿Te ayudo con alguna de estas opciones?" + menú.
- **Propuestas de horario del taller** (`tryHandleProposalChoice`): dejan de bloquear el resto del bot. Si el cliente escribe algo que no es una elección, se le recuerda la propuesta pendiente una vez y se procesa el mensaje normalmente.
- **Avisos fuera de la ventana de 24 h:** aprobado/rechazado de historial y confirmación de turno pasan por plantillas de respaldo (como ya hace `notifyAppointmentConfirmed`). Si el envío falla, se registra el error (no solo `console.error`).
- **Resultado de envío:** el FSM revisa el resultado de `sendTextMessage`/interactivos y reintenta o registra el fallo.

**Fuera de alcance (para specs futuras):**

- Interpretar lenguaje natural con IA (Groq u otro) para enrutar intenciones: el enrutado sigue siendo por keywords/regex.
- Cupo máximo de turnos por día y capacidad por tipo de trabajo (la disponibilidad se limita a evitar choques de horario, ver "Disponibilidad").
- Recordatorios de turno y avisos proactivos de estado de la OT ("tu auto está listo").
- Presupuestos por WhatsApp (SPEC 01) y checklist de service en `estado` (SPEC 02).
- Autenticación del cliente por código/DNI: la identidad sigue siendo el teléfono del chat.
- Área de clientes y cambios al rol VIEWER (ver `specs/backlog.md`). El usuario técnico del bot (`whatsapp-bot@mecnobile.local`, rol VIEWER) no se toca.
- Optimizar el full-scan de `Client` por teléfono en `findCarsForWhatsApp`/`findCarsWithOpenOtForWhatsApp` (se hace si el rendimiento lo exige).

## Modelo de datos

Migración nueva (sin editar migraciones existentes):

```prisma
enum AppointmentStatus {
  PENDIENTE
  PROPUESTA_ENVIADA
  CONFIRMADO
  CANCELADO          // nuevo
}

model Appointment {
  // ...campos existentes...
  canceledAt  DateTime?
  canceledBy  String?   // "CLIENTE_WHATSAPP" | id de usuario del staff
}

model WhatsAppConversation {
  // ...campos existentes...
  draftPlateNote String?   // nota interna para el staff si el dominio es dudoso
  unknownCount   Int @default(0)  // "no entendí" seguidos en el paso actual
}

model WorkshopSettings {
  // ...campos existentes...
}
```

Hay que revisar todos los listados y filtros de turnos (calendario, purga de 7 días, `findClientAppointments`, conteos) para que `CANCELADO` se excluya donde corresponde y se vea donde corresponde (listado de cancelados).

Nuevos pasos del FSM (`WhatsAppConversation.step`): `AWAIT_CAR_CHOICE`, `AWAIT_SLOT_DAY`, `AWAIT_SLOT_TIME`, `AWAIT_CONFIRM`, `AWAIT_CANCEL_CHOICE`, `AWAIT_CANCEL_CONFIRM`, `AWAIT_HISTORY_EMAIL_CHOICE`. Los pasos `AWAIT_PLATE_CONFIRM` y `AWAIT_NAME` se mantienen con comportamiento reducido.

## Cambios técnicos

- `src/lib/whatsapp/bot-flow.ts`: reordenar el despacho (paso activo para texto libre primero, luego intents globales), unificar `normalizeBotKeyword`, eliminar `HELP_HINT`/`stepHint` y reemplazarlos por menú interactivo, agregar los pasos nuevos, corregir la expiración (aviso real y eliminación del código muerto), anti-duplicados y cancelación con confirmación.
- `src/lib/whatsapp/meta-client.ts`: agregar `sendInteractiveList` (existe `sendInteractiveButtons`; límites de Meta: 3 botones con título ≤ 20 caracteres, lista hasta 10 filas), helpers de mensajes y de verificación del resultado de envío.
- `src/app/api/whatsapp/webhook/route.ts`: pasar el **id** del botón/fila (hoy pasa el título como texto) y responder a tipos de mensaje no soportados.
- `src/lib/whatsapp/ot-status.ts`, `src/lib/whatsapp/car-history-flow.ts`: reutilizar `findCarsForWhatsApp` para ofrecer los autos del cliente en el turno; reglas de email del historial.
- Slots: reutilizar `describeSchedule`, `isWorkingDay`, `checkSlotWithinSchedule` y `parseClientDate`/`parseClientTime` (`src/lib/whatsapp/phone.ts`), agregando un parser de "fecha + hora" en un mensaje y un generador de próximos días/horarios hábiles.
- `src/actions/car-history.actions.tsx`: plantillas de respaldo para aprobado/rechazado y no pisar `Client.email` desde un email ingresado en el bot.
- Acciones de turnos (`src/actions/*appointment*`) y UI de calendario: soportar `CANCELADO`, mostrar quién canceló y cuándo, avisar al taller de cancelaciones del cliente.
- `.env.example` / `env-template`: `WORKSHOP_CONTACT_PHONE` (default `3482220236`), leída en `src/lib/whatsapp/config.ts`.
- Nuevas plantillas de Meta (historial aprobado, historial rechazado) y actualización de `docs/whatsapp-template-turno-confirmado.md`, hoy desactualizado (le falta `AWAIT_PLATE_CONFIRM`, el match difuso de patentes y `AWAIT_STATUS_PLATE`, y dice que `cancelar` cancela "el turno activo" sin aclarar que borraba).

## Fases

1. **Quick wins** (bajo riesgo, sin migración): quitar `HELP_HINT`/`stepHint` repetidos y recortar los hints, normalizar keywords y frases, "hola" → saludo, arreglar el timeout con aviso, mensajes de error amables con salida, respuesta a audios/imágenes, no pisar `Client.email` ni el dominio del auto.
2. **Botones y listas:** menú principal, sí/no, selección de auto, id de botón en el webhook, propuestas que no bloquean.
3. **Turno inteligente:** autos por teléfono, días y horarios en listas, fecha+hora en un mensaje, resumen de confirmación, anti-duplicados.
4. **Cancelación y notificaciones:** `CANCELADO` + migración, confirmación, aviso al taller, plantillas de respaldo, "hablar con el taller".

Cada fase se puede liberar por separado.

## Verificación

- `npx tsc --noEmit` (el build ignora errores de tipos).
- Simular mensajes entrantes contra el webhook local para cada flujo: saludo/menú, turno de cliente conocido con 1 y N autos, turno de número desconocido, patente nueva y con coincidencia difusa, estado con 0/1/N autos, historial con email guardado y nuevo, cancelar con 1 y N turnos y confirmación, timeout >30 min, audio/imagen, botón vs texto, keywords con puntuación y frases naturales.
- Verificar que ningún mensaje del bot dispara el menú de texto completo ni repite pies de ayuda.
- Verificar que cancelar deja el turno en `CANCELADO` y desaparece del calendario activo, y que el taller ve la cancelación.
- Verificar disponibilidad: horario ocupado no listado, texto libre sobre horario ocupado, día lleno oculto, carrera de dos clientes al confirmar, turno cancelado que libera el horario.
- Probar plantillas de respaldo con ventana de 24 h vencida en entorno de pruebas de Meta.
- Rehearsal de la migración con `yarn db:clone`. No apuntar el dev local a la DB de producción.
