// grocery-list — a real, family-useful widget built purely on the public
// Rootboard widget contract (apiVersion 1). This is the reference example:
// everything below uses only what any third-party widget can reach —
// `container`, the `host` object, and the DOM. See
// docs/plans/widget-system/CONTRACT.md in the Rootboard repo for the
// normative rules; this file's comments call out the touch points that
// aren't obvious from reading straight through, in the same spirit as
// the template's hello-world widget.
//
// Plain ESM, no dependencies, no build step — served to the browser
// exactly as written.

// The host caps a widget's stored JSON blob at 64,000 characters
// (CONTRACT §4). At 200 items with an 80-character item cap, worst case
// serializes to ~42,400 characters — 66% of the cap, with ~21,500
// characters of headroom. See the repo README for the full arithmetic.
//
// That number is only true because `clampText()` strips control
// characters (\x00-\x1F, \x7F-\x9F) and lone surrogates before slicing.
// Those escape to `\uXXXX` under `JSON.stringify` — 6 characters each —
// not the 2x ("," -> "\"") a naive reading of "escaping" suggests. Left
// unsanitized, 200 items of 80 such characters would serialize to
// 200 * 80 * 6 = 96,000 characters just for the text fields, blowing
// straight through the 64,000 cap — reachable not through this widget's
// own UI (the `<input>` can't type a control character), but through a
// hand-edited storage blob loaded on `host.storage.get()`. With control
// chars and lone surrogates stripped, the worst remaining case is an
// ordinary printable character that still needs JSON escaping — `"` or
// `\` — which is genuinely 2x, so the number above is a real bound, not
// an aspiration. `STORAGE_SIZE_GUARD` below is the belt-and-suspenders
// backstop in case that reasoning is ever wrong.
const MAX_ITEMS = 200;
const MAX_ITEM_TEXT_LENGTH = 80;
// Hard backstop, independent of the arithmetic above: refuse to persist
// any mutation that would push the serialized blob past this size,
// rather than trust the MAX_ITEMS/MAX_ITEM_TEXT_LENGTH math alone. Set
// comfortably under the host's real 64,000-character cap so this trips
// (and shows the user a clear notice) before a write would ever be
// silently rejected by the host.
const STORAGE_SIZE_GUARD = 60_000;
const SORT_MODES = ["manual", "alphabetical", "checked-last"];

// A short, good-enough-unique id. Not crypto.randomUUID(): that API
// requires a secure context (HTTPS or localhost), and a kiosk reached
// over plain HTTP on a home LAN is not guaranteed to be one. Time +
// randomness in base36 is plenty unique for one family's list on one
// device — ids only need to be unique within this widget's own array.
// The random tail is `Math.random().toString(36).slice(2, 8)` — up to 6
// base36 chars, but `toString(36)` drops trailing zeros/short results,
// so the tail can be shorter than 6. A collision needs two `Add` taps
// landing in the *same millisecond* (same `Date.now()` prefix) AND the
// random tail matching too — vanishingly unlikely for one household's
// taps, not impossible in the abstract.
function makeId() {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Strips characters JSON.stringify would blow up to \uXXXX (6 chars) —
// C0/C1 control characters and lone (unpaired) UTF-16 surrogates — before
// slicing to length. This is what keeps the worst-case-serialization
// arithmetic above MAX_ITEMS honest: without it, a hand-edited storage
// blob full of control characters could serialize far past the host's
// 64,000-character cap even while satisfying MAX_ITEMS/MAX_ITEM_TEXT_LENGTH.
// Valid surrogate PAIRS (real astral characters — emoji, etc.) are left
// alone; only a half of a pair with no matching partner is removed.
function stripUnsafeChars(text) {
  return text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

function clampText(text) {
  return stripUnsafeChars(String(text).trim().slice(0, MAX_ITEM_TEXT_LENGTH));
}

function readSettings(values) {
  const sortMode = SORT_MODES.includes(values.sortMode) ? values.sortMode : "manual";
  const confirmClear = typeof values.confirmClear === "boolean" ? values.confirmClear : true;
  return { sortMode, confirmClear };
}

function sortItems(items, sortMode) {
  if (sortMode === "alphabetical") {
    return [...items].sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: "base" }));
  }
  if (sortMode === "checked-last") {
    // Stable sort: unchecked items keep their relative order, then
    // checked items keep theirs, checked pushed after unchecked.
    return [...items].sort((a, b) => Number(a.done) - Number(b.done));
  }
  return items; // "manual": the stored array order IS the display order
}

function buttonBaseStyle() {
  // 48px meets the kiosk's touch-target minimum (CONTRACT §8).
  return `
    min-height: 48px;
    min-width: 48px;
    padding: 0 20px;
    border-radius: 8px;
    border: 1px solid transparent;
    font: inherit;
    cursor: pointer;
    box-sizing: border-box;
  `;
}

function accentButtonStyle() {
  return buttonBaseStyle() + `
    background: var(--rb-accent);
    color: var(--rb-on-color-ink);
    border-color: var(--rb-accent);
  `;
}

function dangerButtonStyle() {
  return buttonBaseStyle() + `
    background: var(--rb-danger-wash);
    color: var(--rb-danger-ink);
    border-color: var(--rb-danger-border);
  `;
}

function plainButtonStyle() {
  return buttonBaseStyle() + `
    background: var(--rb-chip);
    color: var(--rb-ink);
    border-color: var(--rb-border-strong);
  `;
}

// Scoped to this widget's own container id, so it never leaks style rules
// onto the rest of the host page — CONTRACT §8 says "touch only container,
// host, and your own bundled code," and an injected <style> with an
// unscoped selector would violate that even though the element itself
// lives inside `container`. CONTRACT §8 also calls for 56px touch targets
// on ≥1920px screens (up from the 48px baseline every button/input below
// already sets inline); media queries can't be expressed in inline
// `style.cssText`, so a scoped stylesheet is the only contract-legal way
// to add them.
function touchTargetUpsizeStyle(scopeId) {
  const style = document.createElement("style");
  style.textContent = `
    @media (min-width: 1920px) {
      #${scopeId} button,
      #${scopeId} input {
        min-height: 56px;
        min-width: 56px;
      }
    }
  `;
  return style;
}

export default {
  mount(container, host) {
    // ---- state -----------------------------------------------------------
    // `items` is the only thing persisted (CONTRACT §4 `host.storage`,
    // one JSON blob per widget). `settings` mirrors the manifest-declared
    // fields, read via `host.settings.get()` and kept live via
    // `host.settings.subscribe()`. `confirmingClear` is purely local UI
    // state — never persisted. `lastLoaded` holds the raw object last
    // returned by `host.storage.get()` (or `{}` before the first load) so
    // `persist()` can preserve fields a future version of this widget
    // might store that this version doesn't know about — see `persist()`.
    // `loadState` gates the add form; see the loading-notice wiring below.
    let items = [];
    let settings = readSettings(host.settings.get());
    let confirmingClear = false;
    let lastLoaded = {};
    let loadState = "loading"; // "loading" | "loaded" | "error"

    function persist() {
      // Fire-and-forget/debounced by the host — this widget never needs
      // to manage retries or batching itself (CONTRACT §4). Spreading
      // `lastLoaded` first means any field a future version of this
      // widget wrote (and this version doesn't understand) survives a
      // round-trip through this version instead of being silently
      // dropped — `version`/`items` always win since they're spread
      // last. This version writes `version: 1` unconditionally; a future
      // version bump is what would give that field meaning.
      host.storage.set({ ...lastLoaded, version: 1, items });
    }

    // Worst case for "one more item" uses a maximally-escaped,
    // maximally-long placeholder rather than guessing at what the user is
    // about to type — mirrors how MAX_ITEMS disables the form
    // pre-emptively rather than waiting for a rejected submit. Cheap
    // enough to call on every render: worst case ~200 short JSON objects.
    function wouldExceedGuardWithOneMore() {
      const placeholder = { id: "i".repeat(20), text: '"'.repeat(MAX_ITEM_TEXT_LENGTH), done: false };
      return JSON.stringify({ ...lastLoaded, version: 1, items: [...items, placeholder] }).length > STORAGE_SIZE_GUARD;
    }

    // ---- DOM shell (built once; mount() runs a single time per
    // CONTRACT §3's keep-alive mounting) ------------------------------------
    const root = document.createElement("div");
    // Scopes the injected touch-target stylesheet above to just this
    // instance's subtree — see touchTargetUpsizeStyle()'s comment.
    root.id = `rb-grocery-list-${host.widgetId}`;
    root.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 24px;
      height: 100%;
      box-sizing: border-box;
      overflow-y: auto;
      color: var(--rb-ink);
    `;
    root.appendChild(touchTargetUpsizeStyle(root.id));

    const heading = document.createElement("h1");
    heading.textContent = "Grocery List";
    heading.style.cssText = "margin: 0; font-size: 24px;";
    root.appendChild(heading);

    const addForm = document.createElement("form");
    addForm.style.cssText = "display: flex; gap: 8px;";

    const input = document.createElement("input");
    // type="text" is what makes this OSK-eligible — the kiosk's on-screen
    // keyboard engages on text inputs automatically; nothing else to wire
    // up (CONTRACT §8).
    input.type = "text";
    input.placeholder = "Add an item…";
    input.maxLength = MAX_ITEM_TEXT_LENGTH;
    input.setAttribute("aria-label", "New item");
    input.style.cssText = `
      flex: 1;
      min-height: 48px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--rb-field-border);
      background: var(--rb-surface-sunken);
      color: var(--rb-ink);
      font: inherit;
      box-sizing: border-box;
    `;

    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.textContent = "Add";
    addButton.style.cssText = accentButtonStyle();

    addForm.appendChild(input);
    addForm.appendChild(addButton);
    root.appendChild(addForm);

    // Shown while `loadState !== "loaded"` — see the loadState wiring
    // below `renderList()`. Doubles as the loading message and (on
    // failure) an inline retry affordance, so there's exactly one place
    // in the DOM that communicates "the list isn't ready yet".
    const loadNotice = document.createElement("p");
    loadNotice.style.cssText = `
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      color: var(--rb-muted);
    `;
    const loadNoticeText = document.createElement("span");
    loadNotice.appendChild(loadNoticeText);
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.textContent = "Try again";
    retryButton.style.cssText = plainButtonStyle();
    retryButton.addEventListener("click", () => {
      loadState = "loading";
      renderList();
      attemptLoad();
    });
    loadNotice.appendChild(retryButton);
    root.appendChild(loadNotice);

    const fullNotice = document.createElement("p");
    fullNotice.textContent = "List full — remove an item to add another.";
    fullNotice.style.cssText = `
      margin: 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--rb-warn-wash);
      color: var(--rb-warn-ink);
      font-size: 13px;
      display: none;
    `;
    root.appendChild(fullNotice);

    const emptyNotice = document.createElement("p");
    emptyNotice.textContent = "No items yet — add your first one above.";
    emptyNotice.style.cssText = "margin: 0; color: var(--rb-muted);";
    root.appendChild(emptyNotice);

    const list = document.createElement("ul");
    list.style.cssText = "list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px;";
    root.appendChild(list);

    const footer = document.createElement("div");
    footer.style.cssText = "display: flex; align-items: center; gap: 12px; margin-top: auto; padding-top: 8px;";
    root.appendChild(footer);

    container.appendChild(root);

    // ---- rendering ---------------------------------------------------
    function renderRow(item) {
      const row = document.createElement("li");
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--rb-surface);
        border: 1px solid var(--rb-border-strong);
      `;

      const check = document.createElement("button");
      check.type = "button";
      check.setAttribute("aria-label", item.done ? `Mark "${item.text}" not done` : `Mark "${item.text}" done`);
      check.textContent = item.done ? "✓" : "";
      check.style.cssText = `
        flex: none;
        min-width: 48px;
        min-height: 48px;
        border-radius: 8px;
        border: 1px solid var(--rb-border-strong);
        background: ${item.done ? "var(--rb-accent)" : "var(--rb-chip)"};
        color: var(--rb-on-color-ink);
        font-size: 16px;
        cursor: pointer;
        box-sizing: border-box;
      `;
      check.addEventListener("click", () => {
        item.done = !item.done;
        persist();
        renderList();
      });

      const text = document.createElement("span");
      text.textContent = item.text;
      text.style.cssText = `
        flex: 1;
        word-break: break-word;
        color: ${item.done ? "var(--rb-muted)" : "var(--rb-ink)"};
        text-decoration: ${item.done ? "line-through" : "none"};
      `;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove "${item.text}"`);
      remove.style.cssText = `
        flex: none;
        min-height: 48px;
        padding: 0 14px;
        border-radius: 8px;
        border: 1px solid var(--rb-danger-border);
        background: var(--rb-danger-wash);
        color: var(--rb-danger-ink);
        font: inherit;
        cursor: pointer;
        box-sizing: border-box;
      `;
      remove.addEventListener("click", () => {
        items = items.filter((i) => i.id !== item.id);
        persist();
        renderList();
      });

      row.appendChild(check);
      row.appendChild(text);
      row.appendChild(remove);
      return row;
    }

    function renderFooter() {
      footer.textContent = "";
      const checkedCount = items.filter((i) => i.done).length;

      // The confirm prompt can go stale if the checked set changes out
      // from under it — e.g. the user backs out by unchecking every item
      // one-by-one instead of tapping Cancel. Reset instead of showing
      // "Clear 0 checked items?".
      if (confirmingClear && checkedCount === 0) {
        confirmingClear = false;
      }

      if (confirmingClear) {
        // Inline confirm UI — no window.confirm(), which a kiosk with no
        // window chrome can't show sanely (and the contract's trust model
        // doesn't change what's appropriate UX for an appliance).
        const prompt = document.createElement("span");
        prompt.textContent = `Clear ${checkedCount} checked item${checkedCount === 1 ? "" : "s"}?`;

        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.textContent = "Yes, clear";
        confirmButton.style.cssText = dangerButtonStyle();
        confirmButton.addEventListener("click", () => {
          items = items.filter((i) => !i.done);
          confirmingClear = false;
          persist();
          renderList();
        });

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.textContent = "Cancel";
        cancelButton.style.cssText = plainButtonStyle();
        cancelButton.addEventListener("click", () => {
          confirmingClear = false;
          renderFooter();
        });

        footer.appendChild(prompt);
        footer.appendChild(confirmButton);
        footer.appendChild(cancelButton);
        return;
      }

      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.textContent = "Clear checked";
      clearButton.style.cssText = plainButtonStyle();
      clearButton.disabled = checkedCount === 0;
      if (checkedCount === 0) clearButton.style.opacity = "0.5";
      clearButton.addEventListener("click", () => {
        if (checkedCount === 0) return;
        if (settings.confirmClear) {
          confirmingClear = true;
          renderFooter();
        } else {
          items = items.filter((i) => !i.done);
          persist();
          renderList();
        }
      });
      footer.appendChild(clearButton);
    }

    // Full teardown-and-rebuild of `list`'s children on every change,
    // rather than a keyed diff — simplest correct thing for a one-family
    // list that tops out at 200 rows; not worth a virtual-DOM-style
    // reconciler for this widget's scale.
    function renderList() {
      list.textContent = "";

      if (loadState !== "loaded") {
        loadNoticeText.textContent =
          loadState === "error"
            ? "Couldn't load your list."
            : "Loading your list…";
        retryButton.style.display = loadState === "error" ? "" : "none";
        loadNotice.style.display = "flex";
        emptyNotice.style.display = "none";
        fullNotice.style.display = "none";
        input.disabled = true;
        addButton.disabled = true;
        renderFooter();
        return;
      }
      loadNotice.style.display = "none";

      for (const item of sortItems(items, settings.sortMode)) {
        list.appendChild(renderRow(item));
      }
      emptyNotice.style.display = items.length === 0 ? "block" : "none";
      const atCap = items.length >= MAX_ITEMS || wouldExceedGuardWithOneMore();
      fullNotice.style.display = atCap ? "block" : "none";
      input.disabled = atCap;
      addButton.disabled = atCap;
      renderFooter();
    }

    // ---- host.storage: load once on mount -----------------------------
    // (CONTRACT §4). Render immediately, but with the add form DISABLED
    // and a "Loading your list…" notice — not an enabled empty list.
    //
    // Why this matters (CONTRACT §8: "assume the network can be down for
    // hours; render something useful from storage when fetch fails"):
    // the host's `storage.get()` follows a "never-overwrite-before-
    // first-successful-load" rule (CONTRACT §4) — until it resolves,
    // `host.storage.set()` is a documented no-op, and the underlying
    // fetch keeps retrying every 15s for as long as the kiosk is
    // offline. If the form were enabled here, anything a user added
    // during that window would (a) never actually persist, since `set()`
    // is a no-op pre-load, and (b) be silently destroyed the instant the
    // real stored list arrives and this code overwrites the in-memory
    // `items` with it — and because the retry is unbounded, that window
    // isn't a brief flash, it can last as long as the outage does. A
    // disabled form with a visible loading state is the only truthful UI
    // until the load actually settles; `attemptLoad()`/`loadState` below
    // enforce that.
    renderList();

    function attemptLoad() {
      host.storage
        .get()
        .then((stored) => {
          if (stored && typeof stored === "object") {
            lastLoaded = stored;
            if (Array.isArray(stored.items)) {
              items = stored.items
                .filter((i) => i && typeof i.id === "string" && typeof i.text === "string")
                .slice(0, MAX_ITEMS)
                .map((i) => ({ ...i, id: i.id, text: clampText(i.text), done: Boolean(i.done) }));
            }
          }
          loadState = "loaded";
          renderList();
        })
        .catch((err) => {
          // CONTRACT §4 types this as `Promise<T | null>` — implying it
          // shouldn't reject — but a widget must not trust that blindly.
          // Treat a rejection the same as any other "network's down"
          // case (CONTRACT §8): surface a retry instead of leaving the
          // form disabled forever with no explanation, or letting an
          // unhandled rejection reach the console.
          console.warn("grocery-list: storage.get() failed", err);
          loadState = "error";
          renderList();
        });
    }
    attemptLoad();

    // ---- host.settings: read + live-subscribe (CONTRACT §2, §4) --------
    // This widget only reads its own settings; it never calls
    // `host.settings.patch()` — both fields are edited through the host's
    // settings editor, not by the widget itself.
    const unsubscribeSettings = host.settings.subscribe((next) => {
      settings = readSettings(next);
      renderList(); // safe to call repeatedly — subscribe callbacks may
                     // repeat the current value (CONTRACT §3) and this
                     // handler is idempotent either way.
    });

    // ---- add-item flow --------------------------------------------------
    addForm.addEventListener("submit", (event) => {
      event.preventDefault();
      // The form is `disabled` in the DOM whenever any of these are
      // true, but a submit can still reach here (e.g. Enter fired before
      // the disabled state took visual effect) — check for real rather
      // than trust the DOM attribute.
      if (loadState !== "loaded") return;
      if (items.length >= MAX_ITEMS) return;
      const text = clampText(input.value);
      if (!text) return;

      const candidateItems = [...items, { id: makeId(), text, done: false }];
      const candidateSize = JSON.stringify({ ...lastLoaded, version: 1, items: candidateItems }).length;
      // Belt-and-suspenders on top of the sanitized MAX_ITEMS/
      // MAX_ITEM_TEXT_LENGTH bound (see the comment above MAX_ITEMS) AND
      // on top of `wouldExceedGuardWithOneMore()`'s pre-emptive disabling
      // above: a hand-edited storage blob could carry extra fields
      // (forward-compat data a future version wrote — see `lastLoaded` in
      // persist()) that push the real serialized size close to the cap
      // even while every item individually looks fine. In normal use the
      // form is already disabled before this can be reached; this is the
      // actual-size check for the rare race where it isn't (e.g. Enter
      // fired the same tick the cap tipped over).
      if (candidateSize > STORAGE_SIZE_GUARD) {
        renderList(); // re-disables the form / shows fullNotice for real
        return;
      }

      items = candidateItems;
      input.value = "";
      persist();
      renderList();
    });

    // ---- return the WidgetInstance --------------------------------------
    return {
      // Called when the widget is disabled, its folder is removed, or the
      // app shuts down — never on an ordinary nav switch (CONTRACT §3).
      unmount() {
        unsubscribeSettings();
        container.textContent = "";
      },

      // No onVisibilityChange handler: this widget holds no timers,
      // polling loops, or other per-visibility resource to pause — it
      // does nothing when hidden and nothing extra when shown, so there
      // is nothing for the callback to do. CONTRACT §3 lists the callback
      // as optional for exactly this case.
    };
  },
};
