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
WHATSAPP_TEMPLATE_LANGUAGE=es_AR
```

5. Recrear el contenedor para cargar el entorno actualizado.

## Conversación del bot (FSM)

Patrón usado: **drafts descartables** + turno recién al final.

Pasos: `AWAIT_ISSUE` → `AWAIT_PLATE` → (`AWAIT_NAME`) → `AWAIT_DATE` → `AWAIT_TIME` → turno `PENDIENTE`.

| Comando | Efecto |
|---------|--------|
| `turno` / `hola` | Empieza (o reinicia) el pedido |
| `estado` | Estado de la OT abierta del auto (identifica por este WhatsApp) |
| `historial` | Solicita historial PDF del auto (email → admin autoriza) |
| `estado AA123BB` | Igual, forzando dominio si tenés más de un auto |
| `reiniciar` | Borra solo el pedido a medias; **no** toca turnos ya creados |
| `cambiar fecha` | En el paso de la hora, vuelve a preguntar el día |
| `cancelar` | Cancela el turno activo de ese WhatsApp (si hay varios: `cancelar 1`) |
| `ayuda` | Lista comandos |

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
2. Si hay varios autos con OT → pide dominio.
3. Pide un *email* de destino.
4. Se crea una solicitud **PENDIENTE** (solo un ADMIN puede autorizar en Dashboard → Solicitudes historial).
5. Al autorizar: se genera el PDF (sin precios), se envía por SMTP, se guarda el email en la ficha del cliente y se avisa por WhatsApp.
6. El ADMIN también puede imprimir el historial desde la ficha del vehículo (sin WhatsApp).

Fecha y hora se piden **por separado** y en lenguaje natural:

| El cliente escribe | Se interpreta |
|--------------------|---------------|
| `9/8`, `9 de agosto`, `25 dic`, `hoy`, `mañana` | día |
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
- **Timeout**: 30 minutos sin respuesta → se cierra el draft y se avisa; no se crea turno.
- **Purge**: turnos `PENDIENTE` / `PROPUESTA_ENVIADA` sin acción hace más de 7 días se eliminan al listar el calendario.
- **Agenda**: el calendario se refresca solo cada 25 segundos (se pausa si la pestaña está oculta o el mecánico está editando).

### Abrir OT desde un turno

Solo los turnos **CONFIRMADO** muestran el botón de llave inglesa, que abre el alta de OT con la
patente y la avería del turno precargadas. Al crear la OT el turno queda vinculado
(`Appointment.interventionId`), el botón se reemplaza por un acceso `OT #n` y no se puede abrir una
segunda OT desde el mismo turno.
