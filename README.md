# rootboard-widget-grocery-list

A real grocery list for [Rootboard](https://github.com/SchrodingerEQ/Rootboard.me)
— add items, check them off as you shop, and clear the checked ones
when you're done. This is the reference community widget: it's built
entirely on Rootboard's public widget contract, using nothing a
third-party widget author couldn't also use.

## What it does — and doesn't

- Add, check off, remove, and bulk-clear checked items, right from the
  kiosk's touchscreen.
- Sorts manually (the order you added items), alphabetically, or with
  checked items pushed to the bottom — pick one in the widget's
  settings.
- Persists to the kiosk itself (survives reloads and restarts) via the
  widget contract's storage service. Nothing leaves the kiosk — storage
  talks only to the kiosk's own server, and this widget never calls
  `fetch`, phones home, or contacts any third party.
- Caps the list at **200 items**, each up to 80 characters, and the
  widget's input strips control characters and stray Unicode surrogates
  before anything gets stored (a real widget's `<input>` can't type
  those, but a hand-edited storage file could contain them, and they'd
  otherwise inflate JSON-escaping far past what the arithmetic below
  assumes). With that sanitization in place, worst case — 200 items at
  the maximum length, every character a `"` (the worst ordinary
  character JSON still has to escape) — serializes to **~42,623
  characters, about two-thirds of the host's 64,000-character cap**,
  with ~21,377 characters to spare. See the comment above `MAX_ITEMS` in
  `grocery-list/index.js` for the exact arithmetic. As a backstop
  independent of that math, the widget also refuses to persist any
  change that would push the real serialized size past 60,000
  characters, showing a "list full" notice instead.
- It does *not* sync between devices, share a list between households,
  categorize or aisle-sort items, or support multiple lists. It's one
  shared list, for one kiosk, kept simple on purpose.

## Install

1. Download or clone this repo.
2. Copy the `grocery-list/` folder into `widgets/` at the root of your
   Rootboard install (SSH, SD card — however you reach the kiosk's
   filesystem).
3. On the kiosk, open the settings popover and find **Grocery List**
   under **Community Widgets** — that's the section for widget folders
   Rootboard has discovered but that aren't part of the dashboard
   config yet. (The **Widgets** section above it only lists built-in
   widgets; community widgets like this one stay under **Community
   Widgets** even after you enable them.) Flip its switch on.

No build step, no restart — the kiosk picks up the folder within a
minute of it landing in `widgets/` (or immediately if you already have
the settings popover open when you drop it in).

## Settings

- **Sort** — `Manual (add order)` (default), `Alphabetical`, or
  `Checked items last`.
- **Confirm before clearing checked items** — on by default. Shows an
  inline "clear N items?" prompt before the bulk-clear button actually
  removes anything (no `window.confirm()` — this is a kiosk with no
  browser chrome, so the prompt is drawn in the widget itself). Turn it
  off if your household doesn't want the extra tap.

## Trust

**There is no sandbox.** Like every Rootboard widget, this one runs
with the same access to the page, DOM, network, and same-origin API
that Rootboard itself has. It doesn't use that access for anything
beyond the contract's storage and settings services — no `fetch`
calls, nothing phoned home, fully offline — but you should still only
install widgets you trust, exactly as you would any other software.
See [CONTRACT §7](https://github.com/SchrodingerEQ/Rootboard.me/blob/main/docs/plans/widget-system/CONTRACT.md#7-trust-model-v1--stated-plainly)
for the full statement.

## Build your own

This widget is a reference example, not a special case — it's built on
the exact same public contract any third-party widget uses. Start from
[rootboard-widget-template](https://github.com/SchrodingerEQ/rootboard-widget-template)
and its [30-minute tutorial](https://github.com/SchrodingerEQ/rootboard-widget-template/blob/main/TUTORIAL.md)
to build your own from scratch.

## License

MIT — see [LICENSE](LICENSE). Use this code as a starting point for
your own widget; no attribution required (though appreciated).
