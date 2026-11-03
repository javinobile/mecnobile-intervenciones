# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Mecnobile Intervenciones: workshop management system for a mechanic shop (work orders / "OT", cars, clients, appointments "turnos", WhatsApp bot). Next.js 16 App Router + React 19 + Prisma 6 + PostgreSQL, Tailwind v4, NextAuth v4. UI text, domain terms, comments and commit messages are in Spanish (Argentina).

## Commands

Package manager is **Yarn**.

```bash
yarn dev                  # next dev --turbopack (localhost:3000)
yarn build                # next build --turbopack (type errors are ignored: ignoreBuildErrors=true)
npx tsc --noEmit          # the only real type check — build won't catch type errors
docker compose up db -d   # local Postgres on localhost:5432

yarn db:generate          # prisma generate → ./generated/prisma (gitignored)
yarn db:migrate           # prisma migrate dev (DEV ONLY)
yarn db:migrate:deploy    # apply pending migrations without reset
yarn db:migrate:status
yarn db:clone             # clone local DB to rehearse migrations
yarn db:fix-checksums     # report (--apply fixes) checksums of edited migrations
yarn db:check-drift       # indexes/defaults/duplicates report
yarn db:seed              # tsx prisma/seed.ts
```

There is no test suite and no linter configured.

After `yarn db:generate`, restart `yarn dev` — the dev server keeps the old Prisma Client in memory and fails with errors like `Cannot read properties of undefined`.

Local env: `cp env-template .env.local`; `AUTH_SECRET` and `NEXTAUTH_SECRET` must hold the same value. See `.env.example` for all integrations (Meta WhatsApp Cloud API, Groq, SMTP/Mailgun, legacy historial API, `TZ`). Never point local dev at the production DB.

## Deploy

`./build-and-push.sh` (reads `deploy.env`): pg_dump backup from the VPS container `taller_db` into local `backup-*.dump` (keeps 5, `KEEP_BACKUPS=N`) → SSH tunnel → `fix-migration-checksums --apply` + `prisma migrate deploy` against prod → `docker buildx` linux/amd64 → push to `registry.mecnobile.com.ar`. Watchtower on the VPS pulls the new `taller_app` image. Flags: `SKIP_BACKUP=1`, `SKIP_PROD_MIGRATE=1`. This script touches production — don't run it unless asked.

## Architecture

- **Two `lib` folders, two import styles.** Root `lib/` (`prisma.ts`, `utils.ts`, plate search/fuzzy matching, `legacy-historial.ts`) is imported with relative paths (`../../lib/prisma`). `src/lib/` (WhatsApp, Groq, SMTP, auth guards, workshop schedule, PDF logo) is reachable via the `@/*` → `./src/*` alias. The Prisma client and types (`Prisma`, enums, `Decimal`) come from the custom output `generated/prisma`, **not** `@prisma/client`.
- **Data access goes through Server Actions** in `src/actions/*.actions.ts(x)` (`'use server'`), called directly from pages and client components; they `revalidatePath` after mutations. There are no REST endpoints besides NextAuth and the WhatsApp webhook. Decimal fields (`cost`, `amount`, `unitPrice`, `hours`) must be converted with `.toNumber()` before crossing to client components.
- **Auth/roles**: credentials provider with bcrypt, JWT sessions carrying `role` (`ADMIN | MECHANIC | VIEWER`) and `id` (`src/auth.ts`). Route-level access is defined in `middleware.ts` (`routeRules`, most specific prefix first). Inside actions use `src/lib/auth-guards.ts` (`requireSession`/`requireStaff`/`requireAdmin`, `canEditMasterRecord` — a MECHANIC may edit a car/client only while linked to an open OT). Keep middleware and action-level checks consistent when adding routes.
- **Work orders (Intervention)**: `otNumber` is assigned sequentially in `createIntervention`. Items (`InterventionItem`: REPUESTO / MANO_DE_OBRA / TRABAJO_TERCERO) roll up into `cost`; labor uses `WorkshopSettings.hourlyRate` but the amount can be overridden manually. `clientId` on the OT is a snapshot of the owner at that time (ownership history lives in `CarOwnership`). Cancellation is two-step: a mechanic sets `cancelRequestedAt` (status stays `ABIERTA`, shown as `PENDIENTE_CANCELACION`), an ADMIN approves/rejects. PDFs (OT receipt, car history) are rendered server-side with `@react-pdf/renderer`.
- **WorkshopSettings** is a singleton row with id `"default"` (hourly rate, business hours used to validate appointments, owner commission %).
- **WhatsApp bot**: `src/app/api/whatsapp/webhook/route.ts` verifies the Meta signature and delegates to `src/lib/whatsapp/bot-flow.ts`, a keyword-driven FSM (`turno`, `estado`, `historial`, `cancelar`, `reiniciar`, `ayuda`) whose draft state is persisted in `WhatsAppConversation` with a 30-min idle timeout. Appointments created there are `source: WHATSAPP`; confirmations go out via Meta templates (`meta-client.ts`, see `docs/whatsapp-template-turno-confirmado.md`). `estado` replies can be rewritten colloquially by Groq (`src/lib/ai/groq-client.ts`, optional). `historial` creates a `CarHistoryRequest` that an ADMIN approves in `/dashboard/historial-solicitudes`, after which the PDF is emailed via SMTP. Phone numbers are matched through several Argentine variants (`54`/`549`) in `phone.ts`.
- **Legacy history**: `lib/legacy-historial.ts` queries the previous system's API by 17-char VIN and parses its free-text history into OT-like entries, shown alongside current OTs in the car history viewer.
- **Time zone matters**: appointment slots and WhatsApp messages depend on `TZ` (workshop local time, `HH:mm` strings in settings); without it the container runs in UTC and times shift.
- **Migrations**: some were edited after being applied, hence `db:fix-checksums`. Prefer new migrations over editing existing ones; rehearse risky ones with `db:clone`.
