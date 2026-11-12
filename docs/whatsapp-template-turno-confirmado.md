# Plantillas Meta WhatsApp para turnos

## Confirmación: `turno_confirmado`

Orden de envío del sistema:

1. **Texto libre** generado por la app (dentro de la ventana de 24 h desde el último mensaje del cliente).
2. Si eso falla (ventana cerrada), plantilla Utility `turno_confirmado`.

Creación en Meta:

1. Meta Business / WhatsApp → Message templates → Create.
2. Categoría: **Utility**.
3. Nombre: `turno_confirmado`.
4. Idioma: `Spanish (ARG)` / `es_AR`.
5. Body:

```text
Hola {{1}}, tu turno en Nóbile quedó confirmado.
Fecha: {{2}}
Hora: {{3}}
Te esperamos en el taller. Si no podés asistir, avisanos por este medio.
```

Parámetros enviados por el sistema:

- `{{1}}`: nombre del cliente
- `{{2}}`: fecha en español
- `{{3}}`: hora

## Alternativas: `turno_alternativas`

Fuera de la ventana de 24 h Meta no permite títulos de botón dinámicos (fechas/horas).
La plantilla usa **3 botones Quick Reply fijos** (`Opcion 1` / `Opcion 2` / `Opcion 3`);
las fechas reales van en el body (`{{2}}`). Al enviar, el sistema pone payload dinámico
`turno_slot_0` … `turno_slot_2` (el webhook lo recibe igual que un botón interactivo).

1. Crear plantilla con categoría **Utility**.
2. Nombre: `turno_alternativas`.
3. Idioma: `Spanish (ARG)` / `es_AR`.
4. Body:

```text
Hola {{1}}, no podemos recibir tu auto en el horario solicitado.
Opciones disponibles:
{{2}}
Elegí una opción con los botones (o respondé 1, 2 o 3).
```

5. Buttons → Quick Reply (exactamente 3, texto **sin variables**):
   - `Opcion 1`
   - `Opcion 2`
   - `Opcion 3`
6. Ejemplos de variables para la revisión:
   - `{{1}}`: `Juan Pérez`
   - `{{2}}`:

```text
1) lunes 10 de agosto de 2026 a las 09:00
2) lunes 10 de agosto de 2026 a las 11:00
3) martes 11 de agosto de 2026 a las 10:30
```

Parámetros enviados por el sistema:

- Body `{{1}}`: nombre del cliente
- Body `{{2}}`: bloque numerado (2 o 3 líneas)
- Payload botón índice 0/1/2: `turno_slot_0` / `turno_slot_1` / `turno_slot_2`

Si el mecánico propone solo 2 horarios, el body lista 2; tocar `Opcion 3` responde que
esa opción no está disponible.

### Botones dentro de la ventana de 24 h

Mientras la conversación esté abierta (24 h desde el último mensaje del cliente), las
alternativas se envían como **mensajes interactivos** (no plantilla): el título del botón
es el horario corto (máx. 20 caracteres), por ejemplo `lun 10/08 09:00`, con el mismo
ID `turno_slot_N`. El cliente toca y el turno queda confirmado.

Si esa vía falla (ventana cerrada), el sistema usa la plantilla de arriba y, como último
recurso, texto numerado. En todos los casos el webhook confirma con el payload o con
`1` / `2` / `3` y luego envía `turno_confirmado`.

## Envío a revisión y configuración

1. Agregar valores de ejemplo a cada variable en Meta.
2. Enviar ambas plantillas a revisión.
3. Esperar estado **Approved**.
4. Verificar en `.env`:

```env
WHATSAPP_TEMPLATE_TURNO_CONFIRMADO=turno_confirmado
WHATSAPP_TEMPLATE_TURNO_ALTERNATIVAS=turno_alternativas
WHATSAPP_TEMPLATE_HISTORIAL_APROBADO=historial_aprobado
WHATSAPP_TEMPLATE_HISTORIAL_RECHAZADO=historial_rechazado
WHATSAPP_TEMPLATE_LANGUAGE=es_AR
WORKSHOP_CONTACT_PHONE=3482220236
```

5. Recrear el contenedor para cargar el entorno actualizado.

## Plantillas de respaldo de historial

Los avisos de historial autorizado/rechazado salen primero como texto libre (ventana de 24 h). Si Meta lo rechaza
(ventana cerrada), el sistema usa estas plantillas **Utility** en español (`es_AR`), que hay que crear y aprobar en Meta:

| Plantilla (default) | Variables | Texto sugerido |
|---------------------|-----------|----------------|
| `historial_aprobado` | `{{1}}` dominio · `{{2}}` email | `Tu historial del dominio {{1}} fue autorizado y enviado a {{2}}. Revisá tu casilla (y spam).` |
| `historial_rechazado` | `{{1}}` dominio · `{{2}}` motivo | `Tu solicitud de historial del dominio {{1}} no pudo ser autorizada ({{2}}). Si necesitás ayuda, escribinos.` |

Si el aviso falla, el panel del ADMIN lo informa en el mensaje de resultado de la solicitud.

## Conversación del bot (FSM)

Patrón usado: **drafts descartables** + turno recién al confirmar. Un solo mensaje del bot por paso, sin menús ni pies
de ayuda repetidos; las elecciones cerradas van con **botones** (hasta 3 opciones) o **listas** (más de 3). Siempre se puede
responder escribiendo (el número de la opción, el dominio, "mañana 9"…). Si Meta rechaza el mensaje interactivo, el bot cae a texto numerado.

Pasos del turno: `AWAIT_CAR_CHOICE` | `AWAIT_PLATE` → (`AWAIT_PLATE_CONFIRM`) → (`AWAIT_DUP`) → (`AWAIT_NAME`) → `AWAIT_ISSUE`
→ `AWAIT_SLOT_DAY` → `AWAIT_SLOT_TIME` → `AWAIT_CONFIRM` → turno `PENDIENTE`.
Otros pasos: `AWAIT_STATUS_PLATE`, `AWAIT_HISTORY_PLATE`, `AWAIT_HISTORY_EMAIL_CHOICE`, `AWAIT_HISTORY_EMAIL`,
`AWAIT_CANCEL_CHOICE`, `AWAIT_CANCEL_CONFIRM`.

**Menú**: saludo (`hola`, `buenas`…, ya no inicia un turno) → botones *Sacar turno* · *Estado de mi auto* · *Más opciones*
(*Pedir historial* · *Cancelar un turno* · *Hablar con el taller*).

Las palabras clave se normalizan (sin acentos, mayúsculas ni signos: `Estado?`, `*estado*`, `Cancelar.`) y también se
entienden frases como "quiero un turno", "cómo va mi auto" o "pasame el historial".

| Palabra / frase | Efecto |
|-----------------|--------|
| `turno`, "quiero un turno" | Empieza el pedido de turno |
| `estado`, `estado AA123BB`, "cómo va mi auto" | Estado de la OT abierta del auto (identifica por este WhatsApp) |
| `historial`, `historial AA123BB` | Solicita historial PDF del auto (email → admin autoriza) |
| `cancelar`, `cancelar 2` | Cancela un turno (pide confirmación; el turno pasa a `CANCELADO`, **no se borra**) |
| `taller`, "hablar con el taller" | Muestra el teléfono del taller (`WORKSHOP_CONTACT_PHONE`, default `3482220236`) |
| `menu` / `reiniciar` | Descarta el pedido a medias (no toca turnos ya creados) y muestra el menú |
| `ayuda` | Muestra el menú (o repite la pregunta del paso en curso) |

En pasos de **texto libre** (avería, nombre, dominio, email) las palabras clave no interrumpen: una avería que diga
"historial de frenos" se guarda como avería. Solo `menu`/`reiniciar` (y `cancelar`, que abandona el pedido) salen de ahí.

### Turno

1. **Auto**: si el teléfono es de un cliente, ofrece sus autos (`¿El turno es para tu Fiat Palio (ABC123)?`); si no, pide el dominio. Si el dominio es parecido a uno cargado, lo consulta, pero **el bot nunca modifica el dominio del auto**: guarda lo que escribió el cliente y una nota en el turno (`[Dominio a validar]`) para que el taller lo corrija.
2. **Turno duplicado**: si ya hay un turno activo del mismo teléfono y dominio, ofrece mantenerlo o cancelarlo.
3. **Nombre** (solo si no se conoce) y **avería**.
4. **Día y horario**: lista de los próximos días con horarios libres, luego los horarios del día. También acepta texto libre, incluso fecha y hora juntas (`mañana a las 9`, `15/8 16:30`, `lunes 9 de la mañana`).
5. **Resumen** con *Confirmar* / *Cambiar horario*. Recién al confirmar se crea el turno `PENDIENTE` (`source: WHATSAPP`).

### Disponibilidad

Cada turno reserva un bloque de **120 minutos** desde su hora de llegada (`APPOINTMENT_BLOCK_MINUTES` en
`src/lib/workshop-schedule.ts`; usa `endsAt` si el turno manual lo tiene cargado). No modela los días que el auto se
queda en el taller: solo la recepción. Un horario que se superpone con un turno `PENDIENTE`, `PROPUESTA_ENVIADA` o
`CONFIRMADO` no se ofrece; uno `CANCELADO` libera el horario. Si el cliente escribe una hora ocupada, el bot le ofrece
los horarios libres más cercanos. Se revalida al confirmar por si otro cliente tomó el horario.

### Cancelación

El bot pide confirmación y deja el turno en `CANCELADO` (`canceledAt`, `canceledBy = CLIENTE_WHATSAPP`). El calendario
del panel lo muestra en rojo ("Cancelada por el cliente por WhatsApp") hasta que el taller lo elimine. No se pueden cancelar
por el bot turnos que ya tienen una OT abierta.

### Timeout y mensajes no soportados

- 30 minutos sin respuesta → al próximo mensaje el bot avisa "el pedido se cerró por inactividad" y ofrece empezar de nuevo.
- Audios, imágenes, ubicaciones, etc.: responde que solo lee texto y muestra el menú.
- Con horarios propuestos por el taller pendientes, el bot ya no bloquea el resto: si el cliente escribe otra cosa se la procesa normalmente.

### Consulta de estado (`estado`)

1. Se toma el **número del chat**.
2. Se buscan solo vehículos con OT **ABIERTA** ligados a ese teléfono/turnos (autos sin OT se ignoran).
3. Si hay **una** OT abierta → responde el progreso.
4. Si hay **más de un auto con OT abierta** → pide el *dominio* (o el número de la lista).
5. Atajo: `estado AA123BB` / `estado JSB-555`.
6. Texto con **Groq** (`GROQ_API_KEY`) en tono del taller → cliente; si falla o no hay key, plantilla con descripción + ítems.
7. La **fecha/hora estimada de entrega** es opcional en la OT abierta (`estimatedReadyAt`). Si el mecánico la carga, el mensaje de *estado* la incluye; si no, se informa que todavía no hay horario confirmado.

### Historial del vehículo (`historial`)

1. Cliente escribe *historial* (mismo WhatsApp del cliente).
2. Si hay varios autos con historial → lista para elegir.
3. Si el cliente ya tiene email, ofrece *Usar ese email* / *Otro email*; si no, lo pide.
4. Se crea una solicitud **PENDIENTE** (solo un ADMIN puede autorizar en Dashboard → Solicitudes historial).
5. Al autorizar: se genera el PDF (sin precios), se envía por SMTP, se guarda el email en la ficha del cliente **solo si todavía no tenía uno** (el bot nunca pisa el email existente) y se avisa por WhatsApp (con plantilla de respaldo fuera de la ventana de 24 h).
6. El ADMIN también puede imprimir el historial desde la ficha del vehículo (sin WhatsApp).

Fecha y hora se pueden escribir en lenguaje natural:

| El cliente escribe | Se interpreta |
|--------------------|---------------|
| `9/8`, `9 de agosto`, `25 dic`, `hoy`, `mañana`, `lunes` | día |
| `16`, `16:30`, `16 hs`, `4 de la tarde`, `mediodía`, `16 y media` | hora |

Validaciones del día y la hora:

- Un día anterior a hoy se rechaza (no se “corrige” al año siguiente salvo que esté a más de 120 días atrás, para casos como `2 de enero` pedido en agosto).
- Si el día es hoy, la hora debe ser posterior a la hora actual.
- Una hora suelta de 1 a 7 se repregunta (`4` podría ser 04:00 o 16:00) en lugar de adivinar.

### Días y horarios de atención

Se configuran en **Dashboard → Configuración del taller** (solo ADMIN), no en variables de entorno:
si el taller trabaja sábados y/o domingos, y la hora de apertura y cierre (con horario propio para el sábado).

La validación se aplica en los tres caminos: el bot rechaza días cerrados y horas fuera de
atención, y también se valida al crear un turno manual y al proponer alternativas.

> **Zona horaria**: `TZ=America/Argentina/Buenos_Aires` debe estar definida para el contenedor.
> Sin eso el proceso corre en UTC y los horarios que se envían por WhatsApp salen corridos
> respecto a los que eligió el mecánico. La imagen ya incluye `tzdata` y ese valor por defecto.

Otras reglas:

- **Teléfono**: se guarda siempre en `clientPhone` + `whatsappWaId` al crear el turno (sirve para identificar y cancelar).
- **Timeout**: 30 minutos sin respuesta → se cierra el draft y se avisa al próximo mensaje; no se crea turno.
- **Purge** (al abrir el calendario, sin cron; 7 días de retención): se eliminan los `PENDIENTE` / `PROPUESTA_ENVIADA` creados hace más de 7 días, los `CONFIRMADO` cuya fecha pasó hace más de 7 días y los `CANCELADO` cancelados hace más de 7 días. Borrar un turno no afecta a la OT abierta desde él.
- **Agenda**: el calendario se refresca solo cada 25 segundos (se pausa si la pestaña está oculta o el mecánico está editando).

### Abrir OT desde un turno

Solo los turnos **CONFIRMADO** muestran el botón de llave inglesa, que abre el alta de OT con la
patente y la avería del turno precargadas. Al crear la OT el turno queda vinculado
(`Appointment.interventionId`), el botón se reemplaza por un acceso `OT #n` y no se puede abrir una
segunda OT desde el mismo turno.
