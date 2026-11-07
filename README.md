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

Design round 1 is awaiting approval. No application code yet. Phase 1 (schema, client booking flow, provider onboarding with KYC, admin desk) starts after the design system is approved.

## Planned stack

Next.js (App Router), TypeScript, Tailwind v4, Postgres 16, Drizzle ORM, zod, iron-session, vitest, Playwright, pnpm. Money is stored as integer minor units in NPR.
