# UI Component Pattern Reference

Framework-agnostic catalog of 60+ interface components with best practices, layout rules, states, and anti-patterns. Use as companion to `ui-ux-engine.md`.

---

## Navigation & Wayfinding

### Header / App Bar
- Sticky top, 56–64 px height
- Logo left, primary nav center or left, actions right
- On mobile: collapse nav into hamburger or bottom bar
- Max 1 level of nesting visible; deeper = drawer or page

### Navigation (primary)
- 5–7 top-level items max
- Active state: bold weight + underline/indicator, not just color
- Icons optional but consistent (all or none)
- Mobile: bottom tab bar (5 max) or hamburger drawer

### Sidebar / Drawer
- Left for navigation, right for detail/context
- 240–320 px desktop width
- Collapsible to icon-only (56–72 px)
- Overlay on mobile with backdrop; push on desktop
- Close: X button, backdrop click, Escape

### Breadcrumbs
- Show path hierarchy, not history
- Current page = plain text (not link)
- Separator: `/` or `>`
- Collapse middle items on mobile with `...`

### Tabs
- 2–7 tabs; more = scrollable or dropdown
- Active indicator: bottom border (horizontal) or left border (vertical)
- Content changes instantly (no page reload)
- On mobile: consider accordion or scrollable pills
- Never nest tabs inside tabs

### Pagination
- Show current page, total pages, prev/next
- Allow page size selection (10/25/50/100)
- Truncate with ellipsis for large ranges: `1 2 ... 8 9 10`
- Mobile: simplified prev/next only

### Bottom Navigation (mobile)
- 3–5 items max
- Icons + short labels
- Active: filled icon + accent color
- 56–64 px height + safe area inset

---

## Data Display

### Card
- Hierarchy: media → title → meta → action
- Shadow OR border, never both
- Consistent corner radius within a set
- Touch target: entire card clickable, or explicit action buttons
- Hover: subtle lift (2–4 px shadow increase)

### List / List Item
- Consistent vertical lanes: avatar | content | action
- Fixed-width slots for icons/actions (even when empty)
- Dividers between items OR spacing, not both
- Active/selected: background highlight
- Swipe actions on mobile (delete, archive)

### Table / Data Table
- Sticky header row
- Right-align numbers, left-align text
- Sortable columns with arrow indicator
- Row hover highlight
- Zebra stripes OR dividers, not both
- Responsive: horizontal scroll or card-collapse on mobile
- Empty state row when no data

### Badge / Tag
- 1–2 words max
- Pill shape for status; square for category
- Limited color palette (max 5–6 semantic colors)
- Dot badge for count-only indicators

### Avatar
- Circle for people, rounded-square for workspaces/orgs
- Fallback: initials (1–2 chars) on colored background
- Sizes: 24 (inline), 32 (list), 40 (card), 56+ (profile)
- Group: overlap with `z-index`, max 4 visible + `+N`

### Tooltip
- Appears on hover/focus after 300–500 ms delay
- Disappears immediately on leave
- Max 1–2 lines of text
- Never put interactive content inside
- Position: above by default, flip if clipped

### Accordion / Expandable
- Chevron icon rotates on expand
- Only one open at a time (optional, context-dependent)
- Smooth height animation (200–300 ms)
- Header always visible; content collapses

### Timeline
- Vertical line with event nodes
- Newest first OR chronological (be consistent)
- Node: icon/dot + timestamp + description
- Alternate sides on desktop if space allows

### Stat / KPI Card
- Hierarchy: label → value → trend
- Value: large, bold, prominent
- Trend: arrow + percentage, semantic color (green/red)
- Compact: fits in grid of 2–4 across

### Skeleton / Loading Placeholder
- Match actual layout shape and size
- Shimmer animation (left-to-right pulse)
- Show after 300 ms delay (avoid flash for fast loads)
- Never mix skeleton + real content in same section

### Empty State
- Illustration or icon + helpful headline + primary CTA
- Positive framing ("Create your first..." not "Nothing here")
- Center-aligned vertically and horizontally
- Never leave a blank screen with no guidance

### Progress Bar
- Determinate: show percentage or step count
- Indeterminate: animated bar for unknown duration
- Color: primary for progress, semantic for status (success/error)
- Height: 4–8 px

### Spinner
- Use only for indeterminate waits < 3 seconds
- Show after 300 ms delay
- Center in the loading region, not the whole page
- Pair with text for waits > 2 seconds

---

## Forms & Input

### Form (general)
- Single-column layout: faster to scan and complete
- Labels above inputs (vertical), or beside (horizontal for dense forms)
- Group related fields with spacing or section headers
- Primary action at bottom-right; secondary (cancel) at bottom-left
- One primary button per form section

### Text Input
- Visible label always (never placeholder-only)
- Placeholder: format hint only ("es. mario@email.it")
- Validation: inline on blur, not on every keystroke
- Error: red border + helper text below
- Success: green check (optional, not for every field)
- Clear button (X) for search inputs

### Textarea
- Min 3 rows visible; auto-grow preferred
- Character count if limit exists
- Resize: vertical only (or none on mobile)

### Select / Dropdown
- Native select on mobile (better UX)
- Custom dropdown on desktop with search for 10+ options
- Placeholder: "Seleziona..." (not empty)
- Multi-select: chips for selected values

### Combobox / Autocomplete
- Debounce input: 200–300 ms
- Show loading indicator during fetch
- "Nessun risultato" message when empty
- Allow free-text entry if appropriate
- Keyboard: arrow keys navigate, Enter selects, Escape closes

### Checkbox
- Use in forms that require explicit Save
- Group related checkboxes with a label
- Indeterminate state for "select all" with partial selection
- Touch target: 44 px minimum

### Radio Button
- Use when only one option can be selected
- Always show all options (don't hide in dropdown for < 5)
- Default: pre-select most common option
- Vertical layout preferred; horizontal only for 2–3 short options

### Toggle / Switch
- Immediate effect only (no Save button needed)
- Label describes the ON state
- Never use in forms that require Save (use checkbox instead)
- Touch target: 44 px minimum

### Slider
- Show current value label
- Min/max labels at ends
- Step markers for discrete values
- Range slider: two handles with fill between

### Date Picker
- Native on mobile; custom calendar on desktop
- Allow manual text input as alternative
- Format hint in placeholder
- Disable past/future dates when contextually appropriate
- Week starts on Monday (Europe) or Sunday (US): respect locale

### Time Picker
- 24h or 12h based on locale
- Allow manual text input
- Step: 5 or 15 minutes (avoid 1-minute granularity unless needed)

### File Upload
- Drag-and-drop zone + click fallback
- Show accepted formats and max size
- Preview: thumbnail for images, filename for others
- Progress bar during upload
- Remove/replace action after upload

### Color Picker
- Preset palette first; custom picker optional
- Show selected color swatch next to input
- Accessible: include color name or hex as text

### Rich Text Editor
- Minimal toolbar: bold, italic, link, list
- Don't expose HTML to users
- Autosave or explicit Save depending on context
- Mobile: simplified toolbar (collapsible)

---

## Overlay & Feedback

### Modal / Dialog
- Trap focus inside; return focus on close
- Close: X button + Cancel button + Escape key + backdrop click
- Max width: 480–560 px for forms, 760 px for content
- No modal inside modal (use page or drawer instead)
- Title + content + actions (footer)
- Destructive action: red, right-most in footer

### Drawer / Side Panel
- Right for detail/edit, left for navigation
- Width: 320–480 px desktop; full-width mobile
- Close: X button + Escape + backdrop click
- Slide animation: 200–300 ms

### Popover
- Triggered by click (not hover, that's tooltip)
- Arrow pointing to trigger element
- Close: click outside, Escape, or explicit close
- Max 1 popover visible at a time

### Dropdown Menu
- 7 +/- 2 items max visible without scroll
- Group with dividers
- Destructive actions: last, in red
- Keyboard: arrow keys navigate, Enter selects, Escape closes
- Check mark for selected option (if applicable)

### Toast / Snackbar
- Auto-dismiss: 4–6 seconds
- Allow manual dismiss (X button)
- Stack newest on top; max 3 visible
- Undo action for destructive operations
- Position: bottom-center (mobile), bottom-right (desktop)
- Semantic colors: info (blue), success (green), warning (amber), error (red)

### Alert / Banner
- Semantic colors + icon (info/success/warning/error)
- Max 2 sentences
- Dismissible (X) or persistent (for critical info)
- Full-width in context; not floating

### Confirmation Dialog
- Clear question in title ("Eliminare workspace?")
- Explain consequences in body
- Two actions: Cancel (secondary) + Confirm (primary/destructive)
- Destructive confirm: red variant
- Never auto-close; require explicit user action

### Notification (push/in-app)
- Title + body + optional action
- Click navigates to relevant content
- Group by source (workspace, task, etc.)
- Badge count on icon for unread

---

## Layout & Structure

### Page Layout
- Max content width: 960–1200 px (centered)
- Sidebar + main content on desktop
- Stack vertically on mobile
- Sticky header; scrollable main area
- Safe area insets for mobile (notch, home indicator)

### Grid / Masonry
- Responsive columns: 1 (mobile) → 2 (tablet) → 3–4 (desktop)
- Consistent gap: 12–16 px
- Masonry: for variable-height cards
- Grid: for uniform-height cards

### Divider
- Horizontal between sections
- Subtle: 1 px, low-opacity color
- With label: centered text on divider line
- Never stack multiple dividers

### Spacing System
- Base unit: 4 px or 8 px
- Scale: 4, 8, 12, 16, 24, 32, 48, 64
- Tighter gaps group related elements
- Generous gaps separate sections
- Consistent within a screen

### Container / Section
- Heading + content + optional footer
- Card style (border/shadow) or flat (spacing only)
- Collapsible sections for dense pages

---

## Interactive Patterns

### Button
- Verb-first labels ("Salva modifiche", not "Invia")
- Hierarchy: primary (1 per section), secondary, tertiary/ghost
- Loading state: spinner replaces label, button disabled
- Icon-only: must have aria-label
- Min touch target: 44 px
- Disabled: visually distinct but readable; explain why if possible

### FAB (Floating Action Button)
- One per screen max
- Primary creation action
- Bottom-right, above safe area
- Hide on scroll down, show on scroll up (optional)
- 56 px default size

### Icon Button
- Always has aria-label
- 40–48 px touch target
- Hover: subtle background highlight
- Active: pressed state

### Link
- Underlined or clearly colored (not just color)
- Text describes destination (never "click here")
- External links: open in new tab with `rel="noopener"`
- Visited state: optional, context-dependent

### Chip / Pill
- Removable: X button inside
- Selectable: toggle active state
- Max width with ellipsis for long text
- Group: wrap with consistent gap

### Toggle Button Group
- 2–5 options
- Single or multi-select
- Clear active state (filled background)
- Keyboard accessible

### Search
- Prominent placement (header or top of content)
- Keyboard shortcut hint (Cmd/Ctrl+K)
- Debounce: 200–300 ms
- Clear button when input has value
- Recent searches / suggestions dropdown
- "Nessun risultato" with helpful suggestions

### Drag & Drop
- Visual indicator on drag start (opacity, shadow)
- Drop zone highlight on hover
- Smooth reorder animation (200–300 ms)
- Touch: long-press to initiate (200 ms delay)
- Accessibility: keyboard reorder alternative

### Infinite Scroll / Load More
- Loading indicator at bottom
- "Load more" button as alternative to auto-load
- Preserve scroll position on back navigation
- Show total count if known

---

## Specialized Components

### Calendar / Agenda
- Month/week/day views
- Today highlighted
- Event dots/bars on day cells
- Navigation: prev/next month with arrows
- Mobile: vertical scroll preferred over grid

### Map
- Default zoom level showing relevant content
- Pin/marker clustering for density
- Info popup on marker click
- "My location" button
- Touch: pinch-to-zoom, pan

### Audio Player
- Play/pause, progress bar, duration
- Waveform visualization (optional)
- Volume control (desktop)
- Compact inline variant for lists

### Image Viewer / Lightbox
- Click to enlarge
- Backdrop overlay (dark)
- Close: X, backdrop click, Escape
- Pinch-to-zoom on mobile
- Swipe between images if gallery

### Stepper / Wizard
- Show all steps with labels
- Current step highlighted
- Completed steps: checkmark
- Allow back navigation
- Mobile: simplified top bar with step count

### Copy to Clipboard
- Click icon/button to copy
- Brief confirmation: "Copiato!" tooltip or toast
- Revert icon after 2 seconds

---

## Anti-Patterns (Never Do)

- Rainbow badges with no semantic meaning
- Modal inside modal
- Disabled button with no explanation
- Spinner for predictable layouts (use skeleton)
- "Click here" links
- Hamburger menu on desktop when space allows
- Auto-advancing carousels
- Placeholder-only form fields (no visible label)
- Equal-weight buttons (no primary/secondary distinction)
- Body text < 14 px
- Infinite nesting of accordions or dropdowns
- Auto-playing audio/video
- Tooltips on mobile (no hover)
- Form validation on every keystroke
- Confirmation dialogs for non-destructive actions
