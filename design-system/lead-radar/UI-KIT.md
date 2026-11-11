# Lead Radar UI kit

Foundation for every page. Read this before building or restyling a screen. Companion to `MASTER.md` and `pages/app.md` (§11 = glass and motion).

## Rules of the road

- Import primitives from `@/components/ui` (barrel). `src/components/ui.tsx` is a temporary re-export shim for older imports; delete it once the dev server on :3000 has been restarted.
- Never hard-code palette classes (`slate-*`, `indigo-*`, `bg-white`). Use semantic tokens only; they flip with the theme.
- Pages render **inside** the shell. Do not wrap a page in `<AppShell>`: `src/app/(app)/layout.tsx` does it. Use `useShell()` from `@/components/AppShell` for toasts, the leads list and worker state.
- Wrap page content in `PageContainer` and start with one `PageHeader`.
- Tailwind caches `tailwind.config.ts`: **restart `npm run dev` after changing it**.

## Tokens (CSS variables in `src/app/globals.css`, exposed in `tailwind.config.ts`)

| Use | Classes |
| --- | --- |
| Canvas / surfaces | `bg-canvas` (rarely), `bg-surface`, `bg-surface-2` |
| Text | `text-fg`, `text-fg-muted`, `text-fg-subtle` |
| Borders | `border-border`, `border-border-strong` |
| Brand | `bg-primary`, `text-primary-text`, `bg-primary-soft`, `border-primary-border`, `text-primary-on` |
| Accent (Game Trading) | `bg-accent`, `bg-accent-soft`, `text-accent-text` |
| Status | `success`, `warning`, `danger`, `info`, each with `-soft`, `-border`, `-solid`; text uses the bare name |
| Categories | `cat-website`, `cat-app`, `cat-design`, `cat-automation`, `cat-gaming`, `cat-other` (+ `-soft`) |
| Shadows | `shadow-float`, `shadow-glow` |
| Radius | `rounded-ctl` (6px), `rounded-card` (12px) |
| Motion | `duration-fast/base/slow`, `ease-soft`, `ease-spring` |

Dark mode: `data-theme="dark"` on `<html>` (set before paint by the init script). Tailwind `dark:` works through the `selector` strategy.

## Glass and aurora

- `<AuroraBackground />` (mounted once in `app/layout.tsx`) draws the drifting colour field. Keep `html` as the only opaque background; **never put an opaque background on `body` or page wrappers** or the aurora disappears.
- `.glass` (cards/panels), `.glass-strong` (menus, drawers, modals), `.glass-subtle` (nested panels, dashed empty states), `.glass-edge-r/-b/-t` (sidebar, top bar, bottom bar).
- Fallbacks: solid `surface` when `backdrop-filter` is unsupported or `prefers-reduced-transparency`.
- Rules: at most 3 overlapping blurred layers; do not blur table rows, list items or cells; text on glass must stay AA.
- Form fields: `.field`. Buttons: `.btn`, `.btn-primary` (gradient + glow), `.btn-secondary` (glass), `.btn-danger`. Prefer the `Button` component.

## Motion

All motion uses transform/opacity only and is disabled by `prefers-reduced-motion`.

| Need | Use |
| --- | --- |
| Page enter | automatic via `(app)/template.tsx` (`.page-in`) |
| Staggered list/grid | `<Stagger step={40}>` or `.stagger-item` with `--i` |
| Scroll reveal | `<Reveal delay={80}>` |
| Animated number | `<CountUp value={n} format={...} />` (StatTile uses it) |
| New row highlight | `.row-new`, entry `.row-in` |
| Hover lift / press | `.lift` |
| Skeleton | `Skeleton`, `.shimmer` |
| Charts | `.grow-x`, `.grow-y`, `.draw-line` (used by `charts.tsx`) |
| Live indicator | `.live-dot` |
| Theme switch | `useTheme().setTheme(t, {x, y})` runs a circular View Transition reveal from the click point (falls back to an instant swap) |

Overlays (`Modal`, `Drawer`, palette, popovers) fade and blur the backdrop in and exit at about 65% of the enter time. Toasts show a countdown bar.

## Primitives (all from `@/components/ui`)

`Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Field`, `Switch`, `Checkbox`, `TagInput`, `RepeatableInput`, `Tabs`, `SegmentedControl`, `Badge`, `Chip`, `StatusBadge`, `TrustBadge`, `CategoryChip`, `CountBadge`, `Card`, `StatTile`, `Banner`, `Notice`, `JobNote`, `SaveBar`, `EmptyState`, `Skeleton`, `SkeletonRows`, `ProgressBar`, `Modal`, `Drawer`, `ToastStack`, `Tooltip`, `Table` family, `Popover`, `MenuItem` (onClick receives the mouse event), `MenuLabel`, `MenuSeparator`, `Kbd`, `Divider`, `Avatar`, `Sparkline`, `MiniBars`, `FunnelChart`, `BarList`, `AuroraBackground`, `Stagger`, `Reveal`, `CountUp`.

```tsx
import { Button, Card, EmptyState } from '@/components/ui';
import { PageContainer, PageHeader } from '@/components/shell';

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Tasks" subtitle="What needs doing today" actions={<Button variant="primary">New task</Button>} />
      <Card>...</Card>
    </PageContainer>
  );
}
```

## Shell contract

Files: `src/components/AppShell.tsx` (state, realtime, toasts, `useShell`), `src/components/shell/*` (Sidebar, Topbar, TopbarMenus, MobileNav, CommandPalette, WorkerStatus, PageHeader, `nav.ts`, `counts.ts`).

Modules (single source of truth: `shell/nav.ts`):

| Group | Routes |
| --- | --- |
| Overview | `/` Dashboard |
| Work | `/leads`, `/pipeline`, `/outbox`, `/tasks`, `/contacts`, `/deals` |
| Game Trading (collapsible, accent) | `/trading`, `/trading/buyers`, `/trading/sellers`, `/trading/market`, `/trading/catalog` |
| Insights | `/analytics` (`/insights` redirects), `/activity` |
| Setup | `/sources`, `/capture`, `/settings`, `/help` |

Badges: Leads = new today, Outbox = drafts + unread replies, Tasks = due today/overdue, Deals = open. Counts live in `shell/counts.ts` and swallow errors. Bell uses `useActivityFeed` (`src/lib/activity.ts`, unread vs `lr:activity-seen`). `+` creates a lead (→ `/capture`), a task (modal inserting into `tasks`) or a deal (→ `/deals?new=1`). Mobile bottom bar: Dashboard, Leads, Pipeline, Outbox, More sheet. The command palette lists every module plus quick actions.

### Add a page

1. Create `src/app/(app)/<route>/page.tsx` (client component if it uses hooks) with `PageContainer` + `PageHeader`.
2. Add a `NavItem` to a group in `shell/nav.ts`; the sidebar, More sheet, palette and page title pick it up.
3. For a badge, add a key to `BadgeKey` and a query in `counts.ts`, then set `badge` on the item.
4. Platform tables types live in `src/lib/types-platform.ts` (`Deal`, `Task`).

## Ownership

Module pages are owned by the forks that build them (Dashboard, Pipeline, Tasks, Contacts, Deals, Trading/*, Activity, Sources, Help). Foundation (tokens, `ui/`, `shell/`, `theme/`, `AppShell.tsx`, login) is changed only by the foundation owner; request changes rather than forking styles.

## Do / don't

- Do use `glass` for top-level panels and flat `bg-surface-2/60` for rows inside them.
- Do show loading with `Skeleton` and errors with `Banner`.
- Don't use emoji as icons (use `@/components/Icons`), don't animate width/height, don't add inline scripts.

## Motion (radar character)

Rules: one easing (`--ease-out`), durations `--dur-fast` 120, `--dur` 180, `--dur-slow` 260, `--dur-draw` 640 (charts only); page transition 220. Animate transform/opacity (clip-path for bar fills). Exits are about 65% of the enter time. Motion must say where something came from, what changed, what is live or loading. Only two ambient loops exist (logo sweep, live ping); both pause when the tab is hidden (`html[data-hidden]`, set by `shell/MotionRuntime`) and under reduced motion. No springs, confetti or bobbing blobs.

- Canvas: `AuroraBackground` = quiet colour fields + dot grid (radial fade) + radar rings (top-right, opacity .04-.05) + film grain.
- `RadarMark` (ui): logo tile with a 9 s conic beam. `.ping-ring` (inside a `relative` dot, `text-*` colour): soft live ping.
- `useBlip(value)` returns `'blip'` (number went up: pop + one-shot ring), `'badge-pop'` (other change) or `''`. Put it on the element: `className={useBlip(n)}`. `CountBadge` already does this; `--blip-color` sets the ring colour. Keep `animate-fresh`/`.row-new` for new table rows.
- Spotlight: `.glass`, `.glass-strong` and `[data-spotlight]` follow the pointer automatically (fine pointers only).
- `useSlider(activeKey)` + `.slider-thumb` + `data-on="true"` on the active child: sliding thumb (Tabs, SegmentedControl, sidebar `.nav-pill`).
- `usePresence(open, exitMs)` keeps a panel mounted for its exit; used by Modal, Drawer, Popover, CommandPalette. Classes `animate-pop` / `animate-pop-out`.
- `CountUp` counts up on mount and re-ticks on change. Charts draw/grow on mount (`draw-line`, `grow-y`, `fill-in` with `--i` stagger).
- Lists: `.item-in` (slide + highlight on insert), `<Collapse open>` / `.collapse-row[data-open]` (removal). Toasts show a countdown bar that pauses on hover.
- `shell/MotionRuntime` also draws the thin route progress bar (`.route-progress`).
