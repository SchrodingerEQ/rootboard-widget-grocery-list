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
// (every item text at max length and composed entirely of characters
// that need escaping, plus a generously-padded 20-character id on every
// item) serializes to ~42,600 characters — 66% of the cap, with ~21,000
// characters of headroom. See the repo README for the full arithmetic.
const MAX_ITEMS = 200;
const MAX_ITEM_TEXT_LENGTH = 80;
const SORT_MODES = ["manual", "alphabetical", "checked-last"];

// A short, good-enough-unique id. Not crypto.randomUUID(): that API
// requires a secure context (HTTPS or localhost), and a kiosk reached
// over plain HTTP on a home LAN is not guaranteed to be one. Time +
// randomness in base36 is plenty unique for one family's list on one
// device — ids only need to be unique within this widget's own array.
function makeId() {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function clampText(text) {
  return String(text).trim().slice(0, MAX_ITEM_TEXT_LENGTH);
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

export default {
  mount(container, host) {
    // ---- state -----------------------------------------------------------
    // `items` is the only thing persisted (CONTRACT §4 `host.storage`,
    // one JSON blob per widget). `settings` mirrors the manifest-declared
    // fields, read via `host.settings.get()` and kept live via
    // `host.settings.subscribe()`. `confirmingClear` is purely local UI
    // state — never persisted.
    let items = [];
    let settings = readSettings(host.settings.get());
    let confirmingClear = false;

    function persist() {
      // Fire-and-forget/debounced by the host — this widget never needs
      // to manage retries or batching itself (CONTRACT §4).
      host.storage.set({ items });
    }

    // ---- DOM shell (built once; mount() runs a single time per
    // CONTRACT §3's keep-alive mounting) ------------------------------------
    const root = document.createElement("div");
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

    const fullNotice = document.createElement("p");
    fullNotice.textContent = `List full — remove an item to add another (max ${MAX_ITEMS}).`;
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

    function renderList() {
      list.textContent = "";
      for (const item of sortItems(items, settings.sortMode)) {
        list.appendChild(renderRow(item));
      }
      emptyNotice.style.display = items.length === 0 ? "block" : "none";
      const atCap = items.length >= MAX_ITEMS;
      fullNotice.style.display = atCap ? "block" : "none";
      input.disabled = atCap;
      addButton.disabled = atCap;
      renderFooter();
    }

    // ---- host.storage: load once on mount -----------------------------
    // (CONTRACT §4). Render immediately with an empty list so the widget
    // never shows a blank frame while the fetch is in flight, then
    // re-render with whatever was stored.
    renderList();
    host.storage.get().then((stored) => {
      if (stored && Array.isArray(stored.items)) {
        items = stored.items
          .filter((i) => i && typeof i.id === "string" && typeof i.text === "string")
          .slice(0, MAX_ITEMS)
          .map((i) => ({ id: i.id, text: clampText(i.text), done: Boolean(i.done) }));
      }
      renderList();
    });

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
      if (items.length >= MAX_ITEMS) return;
      const text = clampText(input.value);
      if (!text) return;
      items.push({ id: makeId(), text, done: false });
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
