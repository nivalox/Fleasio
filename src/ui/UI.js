// Fleasio UI, loaded via @require by src/fleasio.js.
// Defines buildFleasioUI(state, config, save, modules).
//
// `state` is shared by reference with the network module, so changes made
// here (adding a replacement, flipping ad-block, ...) take effect immediately.
// `modules` = { adblock, maps } from src/modules/.
//
// Building blocks live in src/ui/components.js, the shared icon/settings shell in
// src/ui/shell.js, all styling in src/css/style.css.

function buildFleasioUI(state, config, save, modules) {
    'use strict';

    const ctx = { state, config };
    const { adblock, maps } = modules;
    const version = (typeof GM_info !== "undefined" && GM_info.script) ? GM_info.script.version : "";

    // ------------------------------------------------------------------
    // Floating icon (shared: ui/shell.js)
    //   PC:    click = main menu (shortcut keys also work)
    //   Touch: tap = main menu, double-tap = quick toggles
    //   Move UI on: drag the icon anywhere
    // ------------------------------------------------------------------
    let panel = null, quickMenu = null, settingsOverlay = null;
    const fab = fleasioCreateFab(ctx, {
        id: "fleasio-btn",
        letter: "F",
        label: "Fleasio menu",
        title: "Fleasio",
        onTap: () => toggleOverlay(panel),
        onDoubleTap: () => toggleOverlay(quickMenu),
        onMoved: () => panel.reflow(),
    });

    // ------------------------------------------------------------------
    // Windows
    // ------------------------------------------------------------------
    panel = fleasioCreateOverlay(ctx, {
        id: "fleasio-panel",
        subtitle: "Asset Replacer" + (version ? " · v" + version : ""),
        width: 320,
        positionKey: "panel",
        fromButton: true,
        placement: fleasioPlaceNearFab(fab.el),
        headerActions: [{
            icon: "⚙", title: "Settings",
            onClick: () => toggleOverlay(settingsOverlay),
        }],
    });
    fleasioApplyPanelHeight(panel, state);

    quickMenu = fleasioCreateOverlay(ctx, { id: "fleasio-quickmenu", subtitle: "Quick Toggles", width: 250, positionKey: "quick" });
    settingsOverlay = fleasioCreateOverlay(ctx, { id: "fleasio-settingsmenu", subtitle: "Settings", width: 290, positionKey: "settings" });
    const overlays = [panel, quickMenu, settingsOverlay];

    function toggleOverlay(ov) {
        if (state.uiHidden) return;
        if (!ov.isOpen) overlays.forEach(o => { if (o !== ov && o !== panel) o.close(); });
        ov.toggle();
    }

    const stats = fleasioCreateStats(state, config);
    const reflowAll = fleasioWireLayout(ctx, { fab, windows: overlays, extraEls: [stats.el] });

    // ------------------------------------------------------------------
    // Main panel: replacements
    // ------------------------------------------------------------------
    const body = panel.content;
    const listHeading = fleasioSectionLabel(body, "Replacements");
    body.appendChild(fleasioEl("div", "fl-hint", "Type “map:” and a name, or tap 🗺 to browse maps."));

    function flagInvalid(input) {
        input.classList.remove("fl-invalid");
        void input.offsetWidth; // restart the shake animation
        input.classList.add("fl-invalid");
        setTimeout(() => input.classList.remove("fl-invalid"), 900);
    }

    // A text input with a 🗺 browse button and a searchable map dropdown.
    // mode "match": picking a map fills in its filename (what to replace).
    // mode "url":   picking a map fills in its full URL (what to replace it with).
    function createMapField({ label, placeholder, mode, loadData }) {
        const field = fleasioEl("div", "fl-field");
        field.appendChild(fleasioEl("div", "fl-field-label", label));
        const row = fleasioEl("div", "fl-field-row");
        const input = fleasioEl("input", "fl-input");
        input.type = "text";
        input.placeholder = placeholder;
        input.autocomplete = "off";
        input.autocapitalize = "off";
        input.spellcheck = false;
        const browse = fleasioEl("button", "fl-icon-btn fl-browse", "🗺");
        browse.type = "button";
        browse.title = "Browse maps";
        const dropdown = fleasioEl("div", "fl-autocomplete");
        row.appendChild(input);
        row.appendChild(browse);
        row.appendChild(dropdown);
        field.appendChild(row);

        let items = [];
        let loading = false;
        let open = false;      // is the list meant to be showing?
        let browsing = false;  // opened with 🗺: typing filters the list instead of closing it

        function hide() {
            open = false;
            browsing = false;
            dropdown.classList.remove("fl-show");
        }

        function render(filter) {
            dropdown.textContent = "";
            const term = (filter || "").toLowerCase();
            const matches = items.filter(m => !term
                || m.name.toLowerCase().includes(term)
                || m.category.toLowerCase().includes(term)
                || String(m.url).toLowerCase().includes(term));
            if (!matches.length) {
                dropdown.appendChild(fleasioEl("div", "fl-ac-empty", loading ? "Loading…" : "No maps found"));
            }
            matches.forEach(m => {
                const item = fleasioEl("div", "fl-ac-item");
                item.appendChild(fleasioEl("div", "fl-ac-name", m.name));
                item.appendChild(fleasioEl("div", "fl-ac-cat", m.category));
                // Select on click, NOT pointerdown: on a touch screen pointerdown
                // fires the moment a finger lands, so trying to scroll the list
                // would pick whatever map was under the finger. click only fires
                // for a real tap.
                item.addEventListener("click", () => {
                    input.value = mode === "match" ? m.url.split("/").pop() : m.url;
                    hide();
                });
                dropdown.appendChild(item);
            });
            dropdown.classList.add("fl-show");
            dropdown.scrollIntoView({ block: "nearest" });
        }

        async function show(filter) {
            open = true;
            if (!items.length) {
                loading = true;
                render(filter);
                try {
                    items = maps.flatten(await loadData());
                } catch (e) {
                    console.error("[Fleasio] Could not load map list", e);
                    loading = false;
                    if (!open) return;
                    dropdown.textContent = "";
                    dropdown.appendChild(fleasioEl("div", "fl-ac-empty", "Couldn’t load maps. Check your connection."));
                    dropdown.classList.add("fl-show");
                    return;
                }
                loading = false;
            }
            if (open) render(filter); // skip if the user closed it while loading
        }

        input.addEventListener("input", () => {
            const val = input.value;
            const idx = val.toLowerCase().indexOf("map:");
            if (idx !== -1) {
                show(val.slice(idx + 4).trim());      // "map:name" shortcut
            } else if (browsing) {
                show(val.trim());                     // opened via 🗺: filter by what's typed
            } else {
                hide();
            }
        });

        // mousedown preventDefault keeps focus (and the on-screen keyboard) on
        // the input when the 🗺 button is pressed. It doesn't affect touch scrolling.
        browse.addEventListener("mousedown", (e) => e.preventDefault());
        browse.addEventListener("click", () => {
            if (dropdown.classList.contains("fl-show")) {
                hide();
            } else {
                browsing = true;
                show("");
            }
        });

        // Tapping anywhere outside this field closes the list. (There's no
        // blur-to-close: on touch, tapping the list itself would blur the input
        // and close it mid-scroll.)
        window.addEventListener("pointerdown", (e) => {
            if (!field.contains(e.target)) hide();
        }, true);

        return { el: field, input };
    }

    const matchField = createMapField({
        label: "Original file", placeholder: "Filename to replace (or map:name)",
        mode: "match", loadData: maps.getGameMaps,
    });
    const replField = createMapField({
        label: "Replacement", placeholder: "Replacement URL (or map:name)",
        mode: "url", loadData: maps.getFleasioMaps,
    });
    body.appendChild(matchField.el);
    body.appendChild(replField.el);

    const buttonRow = fleasioEl("div", "fl-button-row");
    const addBtn = fleasioButton("＋ Add", "primary");
    const reloadBtn = fleasioButton("⟳ Reload", "secondary", () => location.reload());
    buttonRow.appendChild(addBtn);
    buttonRow.appendChild(reloadBtn);
    body.appendChild(buttonRow);

    const listEl = fleasioEl("div", "fl-list");
    body.appendChild(listEl);

    function shortUrl(url) {
        try {
            const u = new URL(url);
            const last = u.pathname.split("/").filter(Boolean).pop() || "";
            return u.hostname + (last ? "/…/" + last : "");
        } catch (_) {
            return url;
        }
    }

    // Replacements only apply while the game loads, so nudge the user to reload.
    function markDirty() { reloadBtn.classList.add("fl-pulse"); }
    reloadBtn.addEventListener("click", () => reloadBtn.classList.remove("fl-pulse"));

    function renderList() {
        listEl.textContent = "";
        listHeading.textContent = state.replacements.length
            ? `Replacements (${state.replacements.length})` : "Replacements";

        if (!state.replacements.length) {
            const empty = fleasioEl("div", "fl-empty");
            empty.appendChild(fleasioEl("div", "fl-empty-title", "No replacements yet"));
            empty.appendChild(fleasioEl("div", "fl-empty-sub", "Add one above, then reload to apply it."));
            listEl.appendChild(empty);
            return;
        }

        state.replacements.forEach((r) => {
            const row = fleasioEl("div", "fl-item");
            const text = fleasioEl("div", "fl-item-text");
            const title = fleasioEl("div", "fl-item-title", r.match);
            title.title = r.match;
            const sub = fleasioEl("div", "fl-item-sub", "→ " + shortUrl(r.replacement));
            sub.title = r.replacement;
            text.appendChild(title);
            text.appendChild(sub);

            const del = fleasioEl("button", "fl-icon-btn fl-danger", "✕");
            del.type = "button";
            del.title = "Remove";
            del.setAttribute("aria-label", "Remove replacement");
            del.addEventListener("click", () => {
                row.classList.add("fl-removing");
                setTimeout(() => {
                    const idx = state.replacements.indexOf(r);
                    if (idx !== -1) state.replacements.splice(idx, 1);
                    save();
                    renderList();
                    markDirty();
                }, 150);
            });

            row.appendChild(text);
            row.appendChild(del);
            listEl.appendChild(row);
        });
    }

    addBtn.addEventListener("click", () => {
        const match = matchField.input.value.trim();
        const replacement = replField.input.value.trim();
        if (!match || !replacement) {
            if (!match) flagInvalid(matchField.input);
            if (!replacement) flagInvalid(replField.input);
            return;
        }
        // Same file twice would leave the second one unreachable (first match
        // wins), so update the existing entry instead of stacking a duplicate.
        const existing = state.replacements.find(r => r.match === match);
        if (existing) existing.replacement = replacement;
        else state.replacements.push({ match, replacement });
        save();
        matchField.input.value = "";
        replField.input.value = "";
        renderList();
        markDirty();
    });

    renderList();

    // ------------------------------------------------------------------
    // Quick Toggles
    // ------------------------------------------------------------------
    fleasioSectionLabel(quickMenu.content, "UI");
    quickMenu.content.appendChild(fleasioStatsToggle(
        state.statsMode,
        state.statsEnabled,
        (enabled) => {
            state.statsEnabled = enabled;
            GM_setValue(config.STATS_ENABLED_KEY, enabled);
            if (enabled) stats.start(); else stats.stop();
        },
        (mode) => {
            state.statsMode = mode;
            GM_setValue(config.STATS_MODE_KEY, mode);
            if (state.statsEnabled) stats.restart();
        }
    ));

    fleasioSectionLabel(quickMenu.content, "Misc");
    quickMenu.content.appendChild(fleasioToggle("Block Ads", state.adBlockEnabled, (val) => {
        state.adBlockEnabled = val;
        GM_setValue(config.ADBLOCK_KEY, val);
        if (val) adblock.sweep();
    }));
    quickMenu.content.appendChild(fleasioEl("div", "fl-hint", "Touch: tap the icon twice to open this menu."));

    if (state.statsEnabled) stats.start();

    // ------------------------------------------------------------------
    // Settings (icon, menu height, move/hide UI, shortcuts, reset: ui/shell.js)
    // ------------------------------------------------------------------
    fleasioBuildSettings(ctx, settingsOverlay.content, {
        fab,
        panel,
        windows: overlays,
        reflowAll,
        movables: [stats],
        extraEls: [stats.el],
        onHide: () => stats.stopTimers(),
        heightHint: "Taller shows more replacements and map results at once.",
        keybinds: [
            { label: "Main menu", stateKey: "mainMenuKeybind", configKey: "MAINMENU_KEY_STORAGE" },
            { label: "Quick toggles", stateKey: "quickMenuKeybind", configKey: "QUICKMENU_KEY_STORAGE" },
            { label: "Settings", stateKey: "settingsMenuKeybind", configKey: "SETTINGSMENU_KEY_STORAGE" },
        ],
    });

    fleasioInitKeybinds(state, {
        main: () => toggleOverlay(panel),
        quick: () => toggleOverlay(quickMenu),
        settings: () => toggleOverlay(settingsOverlay),
    });

    reflowAll();
}
