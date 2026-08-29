# TriLearn UI kit

Every screen in `app/` is built from these primitives. The goal is that a screen
file describes *what* it shows, never *how* it is coloured or spaced.

## Rules

1. **Compose, don't re-implement.** No hand-rolled cards, chips, buttons or
   skeletons in screen files. If a screen needs a new shape, add it here.
2. **Colour comes from `useTheme()`.** Never a raw hex or a Tailwind palette
   shade. The only exceptions, each commented where they appear, are:
   - white text and translucent whites on a `primary`-filled card,
   - camera overlays, which sit over a live feed rather than a themed surface,
   - the white quiet zone behind a QR image, which must stay white to scan.
3. **Layout uses the `spacing` / `radius` tokens** from `src/theme/tokens.ts`.
4. **Every interactive element needs an accessible name and a ≥44pt target.**
   The primitives here already provide both — keep it that way when extending.

## Theming

`src/theme/tokens.ts` holds two complete palettes ("academic teal", light and
dark). Both are **machine-checked** by `src/__tests__/theme.contrast.test.ts`:
body text ≥4.5:1 on its background, non-text UI ≥3:1. Add a token, add its
pairing to that test — never hand-check a ratio.

`ThemeProvider` resolves the active palette from the user's preference
(`system` / `light` / `dark`, persisted per device).

### Why the provider never writes to `Appearance`

Light/dark once desynced because the provider read the OS scheme from
`useColorScheme()` *and* wrote the resolved scheme back via
`Appearance.setColorScheme()` — the same value. Choosing "Dark" therefore
destroyed the real OS preference, and "System" could never recover it.
NativeWind's `colorScheme.set()` does that same hidden write, which is why it
is not driven either.

The rule now: **read the OS scheme, never write it.** `resolveThemeName()` is
the single place a preference plus an OS scheme becomes a theme, and
`theme.provider.test.tsx` pins that behaviour.

The first paint waits on `isHydrated` so a stored choice applies before render
rather than flashing the default.

`tailwind.config.js` mirrors the same tokens so `className` stays usable, but
the app has no `dark:` classes — style through `useTheme()`.

## Accessibility conventions

- **Status is never colour-only.** Every `Badge` tone pairs with an icon, and
  progress is exposed through `accessibilityRole="progressbar"`.
- **Loading skeletons are hidden** from assistive tech (`SkeletonList`); the
  screen announces its state instead.
- **Errors are live regions**, so a failure that replaces a skeleton is spoken.
- **Motion respects the OS.** `Skeleton` stops pulsing and `Sheet` cross-fades
  instead of sliding when "reduce motion" is on.
- **Text scales.** Everything renders through `Text`, which applies a sane
  `maxFontSizeMultiplier` per variant rather than disabling scaling.
- **Section titles carry `accessibilityRole="header"`** so screen-reader users
  can navigate by heading.

## Dashboard rule

A dashboard answers **"what do I need to do now?"**, not "what screens exist".

- Never rebuild the tab bar as tiles — those destinations are already one tap
  away, and large duplicates waste the most valuable space on the screen.
  `QuickLinks` is for secondary destinations only.
- Lead with the thing the role acts on: the student's next class and subjects
  below the attendance requirement; the instructor's classes today, each with a
  direct "Take attendance"; the admin's pending application queue; the
  coordinator's at-risk students.
- Prefer surfacing a few real rows over a count. A number tells someone there
  is work; the rows let them start it.

## Components

| Component | Use for |
| --- | --- |
| `Screen`, `ScreenHeader` | Screen shell: canvas, gutters, header, pull-to-refresh, pinned footer |
| `Text` | All text. Pick a `variant` and a `tone`, never a font size |
| `Card`, `PressableCard` | Content containers, tappable or not |
| `Button`, `IconButton` | Actions. `IconButton` requires an `accessibilityLabel` |
| `Input` | Labelled fields, with error live regions and a password reveal |
| `Select` | Picker that opens a sheet of radio options |
| `FilterChips` | Horizontal single-select filter row |
| `Badge` | Status pills (icon + tinted fill) |
| `StatTile` | Compact label/value pair, merged into one accessible node |
| `ProgressBar` | Determinate progress, announced as a percentage |
| `ListRow` | Settings-style rows and menus |
| `Avatar` | Initials avatar (decorative — the name is always shown beside it) |
| `Section`, `Divider` | Titled content groups and hairlines |
| `QuickLinks` | Compact shortcut row — secondary destinations only, never tabs |
| `Sheet` | Bottom sheet for detail views |
| `Skeleton`, `SkeletonCard`, `SkeletonList` | Loading placeholders |
| `EmptyState`, `ErrorState`, `InlineNotice` | The three non-happy paths |
