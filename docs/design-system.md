# WarrantyPass design system

The source of truth for how WarrantyPass looks. Every token described here is
implemented in [`src/index.css`](../src/index.css) — if the two disagree, the
CSS is right and this file needs fixing.

**Status:** Phase 2. Tokens, base styles, and the shared primitives below are
shipped code.

---

## Principles

WarrantyPass is a consumer utility that people open when something has gone
wrong with a product — a receipt is missing, a warranty might be expiring, a
buyer wants proof. The interface should feel calm, legible, and trustworthy.

1. **Quiet, not styled.** Content is the receipt, the warranty date, the
   ownership history. Chrome stays out of its way.
2. **Legibility over density.** Generous spacing, comfortable line height, and
   real type hierarchy. Never sacrifice readability to fit more on screen.
3. **One accent, used sparingly.** Blue marks the primary action in a view.
   If everything is emphasised, nothing is.
4. **Boring is a feature.** This app makes claims about ownership and proof.
   Novelty in the UI undermines that.

---

## Tokens

Tailwind v4 is configured in CSS. **There is no `tailwind.config.js`** — tokens
live in the `@theme` block of `src/index.css`, and each one is emitted as a
utility automatically.

### Colour

| Token             | Value     | Utility           | Use                             |
| ----------------- | --------- | ----------------- | ------------------------------- |
| `--color-canvas`  | `#f8fafc` | `bg-canvas`       | Page background                 |
| `--color-surface` | `#ffffff` | `bg-surface`      | Cards sitting on the canvas     |
| `--color-line`    | `#e2e8f0` | `border-line`     | Card borders, dividers, rules   |
| `--color-ink`     | `#0f172a` | `text-ink`        | Headings and body text          |
| `--color-ink-muted` | `#64748b` | `text-ink-muted` | Secondary text, labels, hints   |
| `--color-brand-50`  | `#eff6ff` | `bg-brand-50`   | Tinted callouts                 |
| `--color-brand-100` | `#dbeafe` | `bg-brand-100`  | Tinted callouts                 |
| `--color-brand-200` | `#bfdbfe` | `border-brand-200` | Accent borders               |
| `--color-brand-500` | `#3b82f6` | `bg-brand-500`  | Hover states                    |
| `--color-brand-600` | `#2563eb` | `bg-brand-600`  | Primary buttons, links, focus   |
| `--color-brand-700` | `#1d4ed8` | `bg-brand-700`  | Pressed / active                |

Warranty status, added in phase 2 for the dashboard and detail pages. Each ramp
is a tint, a border, and a text colour dark enough to clear AA on its own tint.

| Token                 | Value     | Utility              | Use                    |
| --------------------- | --------- | -------------------- | ---------------------- |
| `--color-success-50`  | `#ecfdf5` | `bg-success-50`      | Active badge tint      |
| `--color-success-200` | `#a7f3d0` | `border-success-200` | Active badge border    |
| `--color-success-700` | `#047857` | `text-success-700`   | Active badge text      |
| `--color-warning-50`  | `#fffbeb` | `bg-warning-50`      | Expiring badge tint    |
| `--color-warning-200` | `#fde68a` | `border-warning-200` | Expiring badge border  |
| `--color-warning-700` | `#b45309` | `text-warning-700`   | Expiring badge text    |
| `--color-danger-50`   | `#fef2f2` | `bg-danger-50`       | Expired / error tint   |
| `--color-danger-200`  | `#fecaca` | `border-danger-200`  | Expired / error border |
| `--color-danger-700`  | `#b91c1c` | `text-danger-700`    | Expired text, form errors, invalid field borders |

**Status is never signalled by colour alone.** The badge always spells out
"Warranty active", "Expiring soon", or "Warranty expired", so it still works in
monochrome and for anyone who cannot separate the three tints.

Use the semantic names, not Tailwind's built-in palette. Writing `bg-slate-50`
where you mean `bg-canvas` breaks the ability to retheme later.

> Tailwind v4 tree-shakes unused tokens, so a token you haven't used yet won't
> appear in the built CSS. That's expected, not a broken config.

### Type, shape, and spacing

| Token           | Value                            | Utility       |
| --------------- | -------------------------------- | ------------- |
| `--font-sans`   | System UI stack                  | `font-sans`   |
| `--radius-card` | `1rem`                           | `rounded-card` |

Everything else — the type scale, the spacing scale, breakpoints — is
Tailwind's default. That is deliberate: those defaults are well-proportioned,
and a bespoke scale is maintenance we haven't earned yet.

**No web fonts.** The system UI stack renders instantly, needs no CDN, and
looks native on every platform. Revisit only if there's a real brand reason.

### Adding a token

Add it to `@theme` in `src/index.css`, then document it in the tables above.
Don't introduce a config file, and don't declare ad-hoc custom properties in
component files.

---

## Layout conventions

- **Container:** `mx-auto max-w-3xl px-6` for reading-width content;
  `max-w-5xl` or `max-w-6xl` for dashboard grids.
- **Vertical rhythm:** `py-16` on mobile, `sm:py-24` for major sections.
  Generous is correct here.
- **Cards:** `rounded-card border border-line bg-surface p-6 sm:p-8`.
  Borders, not shadows — a hairline reads as calmer than a drop shadow and
  stays crisp on every display.
- **Mobile first.** Write the small-screen layout, then add `sm:` / `md:`
  refinements. Every page must be usable at 375px wide.

---

## Component patterns

**Buttons.** [`ButtonLink`](../src/components/ui/ButtonLink.tsx) for navigation,
[`Button`](../src/components/ui/Button.tsx) for actions. Same shape, same
`primary` / `secondary` variants — pick by whether the thing navigates or does
something. One primary per view section.

**Form fields.** [`TextField` and `SelectField`](../src/components/ui/FormField.tsx).
Every control gets a real `<label for>`, and hints and errors are wired through
`aria-describedby` so a screen reader announces the error with the field rather
than leaving it as unattached red text. Invalid fields also get
`aria-invalid` and a `border-danger-700` edge — never colour alone.

**Status badge.** [`WarrantyStatusBadge`](../src/components/products/WarrantyStatusBadge.tsx).
A bordered pill using the status ramps, always with a text label.

**Empty state.** Heading, one muted sentence explaining what's missing, and a
single primary action. No illustration.

**Loading.** Skeleton blocks (`animate-pulse bg-line`) shaped like the content
they replace, wrapped in `role="status"` with an `sr-only` description. Never a
spinner alone.

**Error state.** Say what failed and offer a retry. An error must never be
rendered as an empty state — a user who is told they have no products will add
them again.

Build these as React components under `src/components/` rather than repeating
class strings. Extract on the second use, not in anticipation of one.

---

## Accessibility

A single focus ring is defined globally in `@layer base`: a 2px
`--color-brand-600` outline at 2px offset, on `:focus-visible`. Never remove
it without providing an equivalent.

Measured contrast against `--color-canvas`:

| Pair                       | Ratio    | Verdict                     |
| -------------------------- | -------- | --------------------------- |
| `ink` on `canvas`          | ~17.1:1  | Passes AAA comfortably      |
| `ink-muted` on `canvas`    | ~4.6:1   | Passes AA, with no margin   |
| White on `brand-600`       | ~5.2:1   | Passes AA                   |

`ink-muted` clears the 4.5:1 AA threshold by roughly a tenth of a point. Use it
for secondary prose at normal size and weight only — not for text below 14px,
not at light weights, and never for essential information that has no other
visual cue.

---

## Motion

Restraint by default. Colour and background transitions on hover/focus are
fine (~150ms). No entrance animations, no parallax, no scroll effects, no
spring or bounce. Respect `prefers-reduced-motion` for anything beyond a
colour change.

---

## Voice

Sentence case everywhere, including buttons and headings. Plain language:
"Add product", not "Create a new WarrantyPass entry". Address the reader as
"you"; the product is "WarrantyPass", never "we". No hype, no enterprise
vocabulary, no emoji in the UI.

---

## Relationship to the reference document

[`docs/reference/creativity-studio.md`](reference/creativity-studio.md) is a
design system for an unrelated creative-agency marketing site, reverse
engineered from a JPEG comp. It is kept for inspiration and is **not**
implemented.

**Borrowed from it:**

- Token-first discipline — no invented values scattered through components.
- Semantic aliases (`surface`, `line`, `ink`) layered over a raw palette.
- Motion restraint: no bounce, no parallax, no entrance animations.
- Sentence case everywhere; no emoji; no enterprise-speak.
- One primary action per view section.

**Deliberately not adopted:**

| Their rule                        | Ours                          | Why                                                       |
| --------------------------------- | ----------------------------- | --------------------------------------------------------- |
| Orange gradient accent + glow     | Flat blue `brand-600`         | Utility app, not an agency site; flat reads calmer         |
| "Cards have no borders"           | Hairline `border-line`        | Phase 1 brief specifies subtle borders                     |
| "No flat white backgrounds"       | Plain `canvas` / `surface`    | Blob fields and dot grids are noise around receipt data     |
| Bakbak One + Poppins via CDN      | System UI stack               | No runtime CDN dependency; instant render                  |
| "Everything interactive is a pill"| Consistent `rounded-card`     | Pills suit marketing CTAs, not dense app forms             |
| Lucide icons via unpkg            | (undecided)                   | Any icon set must be bundled, not fetched at runtime       |
| Plain CSS + 19 hand-built components | Tailwind utilities         | One styling system, not two                                |

Note that the reference document explicitly excludes app and dashboard
patterns — "no data-display components... If you need any of these, they are
new design work." Most of WarrantyPass is exactly that, so the majority of
this system will be original regardless.

---

## Open questions

- **Icons.** No set chosen. Whatever we pick must be bundled, not CDN-loaded.
- **Dark mode.** Not designed. Tokens are structured to make it possible later
  by redefining them under a `prefers-color-scheme` block.
- ~~**Status colours.**~~ Resolved in phase 2 — see the status ramps above.
