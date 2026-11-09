# Saait

Date-first booking platform for photographers, videographers and content creators in Nepal. Providers publish fixed packages and a calendar; clients lock a date with a deposit; the platform guarantees the booking with a vetted backup pool. Urgent requests broadcast to verified providers by SMS. KYC gates every provider.

Read `docs/system-plan.md` before changing anything. It is the source of truth for roles, data model, flows, fees and phases. `docs/validation-report.md` explains why the product is shaped this way; do not reintroduce bidding, cheapest-first sorting or per-transaction commissions without a decision recorded there.

## Design

- Design system name: Saait. Tokens are documented on the design-system board in `design/canvas/project/DesignSystem.dc.html`.
- Colours: Ink #1F1D2B, Stone #6A6775, Line #E4E0D8, Sindoor #B3121F (the single commit action and errors), Marigold #E89B00 (wedding dates and urgent), Teal #0E6B63 (verified, success). White ground, no shadows, one-pixel lines. Dark mode is a second mode on the same tokens (ground #141320, Ink #F3F1EC, Line #2E2C3A; the full table is in `docs/proposals/leakage-and-rewards.md` section 14); it follows the device and can be overridden from the header.
- Type: Mukta only, Devanagari-first. Weights 400 to 800 carry hierarchy.
- Radii: 12 controls and day cells, 14 buttons and inputs, 16 tiles and cards, 999 chips. Spacing on a 4 px grid. Phone gutter 20 px, desktop 64 px.
- Sindoor appears at most once per screen. Marigold buttons belong to the urgent flow only. Packages are never sorted cheapest-first by default.

## Conventions (when code lands)

- pnpm only.
- Money is integer minor units in NPR with a currency column alongside. Format only at the edge.
- zod at every input boundary: server actions, route handlers, form data, env.
- `src/server/*` is the only code that touches the database.
- Drizzle migrations are forward-only.
- Tests colocated as `*.test.ts`; browser e2e in `tests/e2e`.
- One conventional commit per task; the message explains why.
- Only the deposit flows through the platform; the balance is paid client to provider directly. Withholding applies to released deposits only. Confirm with the accountant before changing.
