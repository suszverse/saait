# Figma: Saait design system

File: https://www.figma.com/design/PbMGsYMr8ymqtGi8CPdnbz (Susan Shrestha's team, drafts)

Built on 2026-11-08 from `design/canvas/project/*.dc.html`. The `.dc.html` sources remain the spec; this file is the editable copy.

## Page "Design system"

- **Variables.** Three collections, each with one mode named Value. Colour has 14 variables, scoped to fill, text or stroke. Spacing has 8 (space/4 to space/56). Radius has 4 (control 12, button 14, card 16, chip 999). Every variable has a WEB code syntax such as `var(--color-sindoor)` or `var(--radius-button)`. `src/app/globals.css` uses the same names.
- **Text styles.** Mukta: Display 44/50 ExtraBold, Title 28/34 ExtraBold, Heading 18/24 Bold, Body 16/24 Regular, Small/Regular 14/20, Small/Semibold 14/20, Micro 12/16 SemiBold.
- **Icons.** 16 icon components (`Icon/*`, 24 px). Strokes are bound to Ink. The paths are copied from the screens and match `src/components/ui/icons.tsx`.
- **Components.** All fills, strokes and radii are bound to variables.
  - Button: Primary, Secondary, Urgent, Tertiary, Disabled. Has a Label property.
  - Filter chip: Default, Selected. Has a Label property.
  - Status chip: Verified, Saait, Urgent, Under review, Rejected.
  - Day cell: State × Saait. Has Day and Date properties.
  - Text input: Default, Focus, Error. Has Label, Value and Helper properties and show/hide toggles.
  - Package card: Size Regular or Compact × State. Has name, price, description, specs and peak-note properties.
  - Provider tile: 4:5 image, Verified toggle, name, meta and price.
  - Bottom nav: Client, Provider.

## Page "Screens"

The nine artboards are built from component instances and keep the canvas.json order. They are:

- the 1280-wide Design system board
- seven 390×844 phone screens: Home, Results, Provider, Booking, Urgent, Provider home, KYC
- the 1280-wide Admin KYC desk

Photos are grey rectangles in the source tones.

## Page "Web screens"

Desktop layouts of the website at 1440 wide. They were captured from the running site on localhost with the seeded data, so they show what is built, not a mockup. Each capture is raw frames with no component instances; use them as the reference when redesigning the desktop layout.

| Frame | Route | Node |
|---|---|---|
| W1 Home: pick a date | `/` | 19:17 |
| W2 Free on this date | `/results` | 20:17 |
| W3 Provider and packages | `/p/[slug]` | 21:17 |
| W4 Lock the date | `/book/[slug]` | 24:17 |
| W5 Urgent request | `/urgent` | 22:17 |
| W6 Sign in | `/login` | 23:17 |
| W7 Provider: today | `/provider` | 25:17 |
| W8 Provider: get verified | `/provider/kyc` | 26:17 |
| W9 Admin: verification queue | `/admin/kyc` | 27:17 |
| W10 Admin: review provider | `/admin/kyc/[id]` | 28:17 |

The source mockups were phone-only apart from the admin screen, so the first Figma pass had no desktop client screens. This page was added on 2026-11-08 to close that gap.

## Not reproduced faithfully

- **Interactive state.** The .dc.html screens toggle state; Figma shows one static state per screen. Urgent shows the posting form, not the "2 have accepted" view. Provider home shows the open alert, not the accepted or dismissed states. Admin shows 3 of 6 checks done, so Approve is disabled.
- **Board height.** The Design system board is 2602 px tall, not the 1560 px set in canvas.json. The type ramp and package cards hug their content instead of cropping. The phone and admin rows were moved down to sit below it.
- **Admin height.** Admin KYC is 1178 px tall, not 900. The detail panel hugs its content; the HTML sets min-height 900 and grows the same way in a browser.
- **Provider home bottom.** The featured-slot card runs under the bottom nav. The HTML clips the same overflow.
- **Button labels.** Every Button variant shares one default label in the component set ("Lock this date"); instances set their own text. Status chip has no Label property, so each type keeps its fixed word.
- **Variables vs tokens.** Single-use greys stay raw hex and are not tokens: placeholder tones #D9D4CB, #C7C9CF, #CFC9D6, #E0DCD3, #BFC3C9, and checkbox border #A8A4B0. The design system does not name them.
- **Checkboxes.** Booking add-ons and the admin checklist use frames, not a component. The board has no checkbox component.

## Copy found wrong during the build

- **Refund deadline.** Booking says "Full refund if you cancel before Magh 12" for a Falgun 12 event. Magh 2083 has 29 days, so the plan's rule ("more than 30 days out") makes it Magh 11. The site generates this line from the policy.
- **Anita Gurung Photography.** Results shows her verified, but Admin shows her under review. The seed data follows Results. The admin queue uses the other four names from the Admin screen.
