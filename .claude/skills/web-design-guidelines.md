# BlinkSpot Web Design Guidelines

Design system rules for all UI work in this codebase. Apply these on every component review and patch.

---

## 1. No Generic AI Styling Templates
- Never use placeholder gradients, rainbow borders, or glow effects that don't match the brand palette
- Brand palette: `#191D23` (base), `#2A2F38` (surface), `#57707A` (muted), `#C5BAC4` (accent), `#DEDCDC` (text), `#B3FF00` (success/neon), `#00E5FF` (cyan/video)
- All interactive elements must use the brand's dark-mode tokens — never `bg-white text-black` in the dashboard

## 2. Vertical Boundary Enforcement
- Every scrollable region must be wrapped in a `flex flex-col` + `overflow-y-auto` parent with a fixed `max-h` or `h-full`
- Never let content bleed below the viewport without a scroll container
- Panel sidebars (`xl:col-span-1`) must use `h-[700px]` or `h-screen sticky top-0` — never unbounded height

## 3. Button isLoading States
- Every Button that triggers a background API call MUST show a loading state:
  ```tsx
  <Button disabled={isLoading}>
    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ActionIcon />}
    {isLoading ? "Processing..." : "Action Label"}
  </Button>
  ```
- Never allow a button to remain clickable while its action is still in flight
- Input fields must be `disabled` when their section is fetching (`isAutofilling`, `isGenerating`, etc.)

## 4. Keyboard Navigation
- Every clickable `<div>` that acts as a button must have:
  - `role="button"` or `tabIndex={0}`
  - `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handler(); }}`
- Modals must trap focus: first focusable element receives focus on open, Escape closes
- Radio/checkbox groups in modals must be navigable with arrow keys via `fieldset` + `legend`
- Form fields in modals must have visible `<label>` elements (not just placeholder text)

## 5. Semantic Accessible HTML
- Use `<button>` not `<div onClick>` for interactive controls
- Use `<label htmlFor="id">` paired with `<input id="id">` — never floating labels without association
- Group related form fields in `<fieldset>` with `<legend>` (especially in multi-step wizards)
- Use `aria-label` on icon-only buttons: `<button aria-label="Close modal"><X /></button>`
- Image upload zones need `role="button"` + `aria-label="Upload image"` + keyboard click support
- Status badges should use `role="status"` or `aria-live="polite"` when they update dynamically

## 6. Interaction Feedback
- Card selection (mode pickers, platform toggles) must show an instant visual focus ring on click, not just on hover
- Selected state ring: `ring-2 ring-[#C5BAC4]/60 ring-offset-2 ring-offset-[#191D23]`
- Never rely on CSS hover alone for selected state — always use `data-selected` or conditional className
- Drag-and-drop zones must show a `dragover` border change (dashed → solid + colour pop)

## 7. Empty States
- Every list/grid that can be empty needs a styled empty state (icon + heading + sub-text)
- Never render an empty white box or invisible area

## 8. Seedance Multi-Image UX Rules
- Each Seedance `@ImageN` slot must be a clearly numbered card with a prominent drop zone
- Slot height: minimum `aspect-square` or `h-32` — never too small to click
- The "Add Image" button must be full-width or clearly visible, not a tiny icon
- The `@ImageN` tag pill must be visible at all times (not just on hover)
- Limit indicator ("2/5 images") must be shown so users know how many slots remain
