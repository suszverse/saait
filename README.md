# Saait

A date-first booking platform for photographers, videographers and content creators in Nepal.

Providers publish fixed packages and a live calendar. Clients pick a city, a date and a service type, see who is free that day with real prices, and lock the date with a deposit. Negotiation stays free through chat and custom offers; the date lock, the deposit guarantee and the backup pool are what the platform sells. Urgent requests inside 72 hours are broadcast to verified providers by SMS in waves. Every provider passes KYC before going public.

"Saait" (साइत) is the Nepali word for an auspicious date. The name is a working title.

## What is in this repository

| Path | What it is |
| --- | --- |
| `docs/validation-report.md` | Full idea validation: Nepal market, comparables, regulation, ranked risks, cheap experiments |
| `docs/system-plan.md` | The product and system plan: roles, data model, flows, fees, tax handling, urgent booking, KYC, phases, architecture |
| `docs/research/` | The four research notes behind the report, with sources |
| `design/canvas/project/` | Source files for the approved-pending design round: design system board, seven phone screens, admin desk |

The live, interactive design canvas is at https://claude.ai/artifact/CVem25VV81krRNQFTZmwUT (private to the owner until shared).

## Status

Phase 1 is in progress as a website (phone and desktop); a native app comes later. Progress is tracked in `docs/plans/saait-phase-1.md`. The Figma file and its known gaps are described in `docs/design/figma.md`.

## Running it locally

You need Node 22+, pnpm 10 and Postgres 16.

```bash
pnpm install
cp .env.example .env.local        # then fill in the secrets it describes
createdb saait && createdb saait_test
pnpm db:migrate && pnpm db:seed   # Butwal cluster, providers, Falgun 2083 wedding dates
pnpm dev
```

Sign in with any Nepali mobile number. In development the SMS adapter prints the code to the server log and stores it in `sms_log`. The seed includes a demo client (9812345678) and an operator (9857099001) for the verification desk at `/admin/kyc`.

| Command | What it does |
| --- | --- |
| `pnpm test` | Unit and database tests against `DATABASE_URL_TEST` (`.env.test.local`) |
| `pnpm e2e` | Playwright journeys on phone and desktop against a throwaway `saait_e2e` database |
| `pnpm jobs:tick` | Expires 24-hour holds and retries unsent SMS. Run it every few minutes in production |
| `pnpm db:generate` | Creates a new forward-only migration after a schema change |

Payments run through a manual adapter in Phase 1: clients send the deposit to the company wallet with their booking code, and the desk confirms it through the signed webhook. `PAYMENT_SIMULATOR=on` adds a "simulate payment" button, and it is refused unless `DEPLOY_ENV` is `local` or `staging`.

## Planned stack

Next.js (App Router), TypeScript, Tailwind v4, Postgres 16, Drizzle ORM, zod, iron-session, vitest, Playwright, pnpm. Money is stored as integer minor units in NPR.
