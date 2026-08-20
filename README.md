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
  widget contract's storage service. No account, no cloud sync, no
  network calls of any kind — this widget never calls `fetch`.
- Caps the list at **200 items**, each up to 80 characters. That's a
  deliberate ceiling: the host allows each widget up to 64,000
  characters of stored data, and worst case — 200 items at the maximum
  length, made entirely of characters that need JSON-escaping —
  serializes to roughly **42,600 characters, about two-thirds of the
  cap**, with ~21,000 characters to spare. See the comment above
  `MAX_ITEMS` in `grocery-list/index.js` for the exact arithmetic.
- It does *not* sync between devices, share a list between households,
  categorize or aisle-sort items, or support multiple lists. It's one
  shared list, for one kiosk, kept simple on purpose.

## Install

1. Download or clone this repo.
2. Copy the `grocery-list/` folder into `widgets/` at the root of your
   Rootboard install (SSH, SD card — however you reach the kiosk's
   filesystem).
3. On the kiosk, open **Settings → Widgets** and enable **Grocery
   List**.

No build step, no restart — the kiosk picks up the folder as soon as
it's there.

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
