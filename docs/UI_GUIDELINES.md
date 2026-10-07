# UI guidelines (learned from the Profile rework, Oct 2026)

Propittu is for owners who want to feel **organised and calm**. Every screen should read like the
Profile tab: flat, quiet, aligned, and only what matters. These rules came from the owner's reviews
of Profile, Plan & Usage, Help & Support, tickets and Delete account — follow them on every new or
reworked screen, and check them before handing anything over.

## 1. Layout

- **Flat, free-flowing pages.** Content sits on the page background, not in stacks of rounded
  cards. Rounded corners only where they mean something (chat bubbles, the picker sheet, small
  status badges, buttons).
- **Sections = a heading + its entries.** Use `ListGroup` with `plain` and a `title`. Entries are
  indented 12 pt from the heading (automatic for titled plain groups); lists without a heading
  (e.g. the rows inside a tab) are flush with the page edge.
- **One edge.** Page padding is 16 pt. Headings, page headers, tabs and buttons start at 16 pt;
  indented entries at 28 pt. Non-row content inside a section (a field, a note) uses the same
  14 pt inner padding as rows so it lines up.
- **Section page header**: `PageHeader` — big title + optional badge, one line right beneath
  (rich text via `Strong`), the page's main action on the right, vertically centred.
- **Fixed things at the bottom**: the primary action in `Footer`; chat reply bar docked by
  `ChatThread`.

## 2. Nothing moves

- No layout shift on arrival: load what a section needs **before** rendering the page
  (`LoadingState` until then), so content below never jumps when data arrives.
- No slide or stagger animations on page entry. Gentle motion only where it explains something
  (e.g. expanding a section with `LayoutAnimation`).
- Badges are **vertically centred** next to text (the `Badge` wrapper handles this — don't add
  `alignSelf` overrides).

## 3. Components to reuse (in `src/components`)

| Need | Use |
|---|---|
| Section with rows | `ListGroup plain title=… [action] [collapsible]` + `ListRow` |
| Edit a value in place | `InlineEdit` (saves on the first tap of ✓ or Done; shows the new value at once) |
| Usage line (used / limit / left) | `UsageRow` |
| Page top (title, badge, line, action) | `PageHeader` / `Strong` |
| Tabs | `Segmented variant="text"` (active on a soft brand pill, never bold) |
| Status | `Badge` (`size="lg"` when the status is the point of the screen) |
| Text input in a flat form | `TextField variant="flat"` (no box; hairline turns brand on focus) |
| Dropdown in a flat form | `Select variant="flat"` (label, value, chevron, hairline; opens the sheet) |
| Conversation | `ChatThread` (header, bubbles, docked reply bar with paperclip on the right) |
| Attachments | `useAttachmentAdder` + `AttachmentPreviews` |
| Pick from options | the bottom sheet via `dialog.actions` (scrolls, ticks the chosen one) |
| Log out anywhere | `useLogout` |
| Plan badge, plan purchase | `planBadge`, `usePlanPurchase` (`src/lib/plans.ts`) |

Never copy a component into a screen; extend the shared one with an option instead.

## 4. Words and data

- **No internal codes for customers** (PR-, ST-, ORD-): show the property name, service name and
  date. `withoutCodes()` strips them from old text. Staff screens may show codes; the order
  number appears only on the receipt.
- Short, plain sentences. Don't repeat what a heading or badge already says (e.g. no "Name"
  caption above a name, no "Your plan" next to a plan already marked current).
- Badges carry status at a glance: Trial orange, paid plan green, Locked red; Incomplete only
  when something is missing (no "Complete"/"Verified" noise).
- Show only what matters (plans compare on properties only; payments are one list).

## 5. Before handing over (checklist)

1. Every element on the 16 pt edge, entries at 28 pt, right edges aligned.
2. Badges centred; tabs evenly spread; nothing bold that shouldn't be.
3. Nothing jumps or slides when the page opens or data loads.
4. No boxes or borders that aren't needed; flat fields and dropdowns in forms.
5. No internal codes, no duplicated words.
6. Built from shared components; no dead code left behind; `tsc`, `eslint`, Prettier clean.
