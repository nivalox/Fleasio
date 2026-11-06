// Fleasio UI — loaded via @require by src/fleasio.js.
// Defines buildFleasioUI(state, config, save, modules).
//
// `state` is shared by reference with the network module, so changes made
// here (adding a replacement, flipping ad-block, ...) take effect immediately.
// `modules` = { adblock, maps } from src/modules/.
//
// Building blocks live in src/ui/components.js, all styling in src/css/style.css.

function buildFleasioUI(state, config, save, modules) {
    'use strict';

    const ctx = { state, config };
    const { adblock, maps } = modules;
    const version = (typeof GM_info !== "undefined" && GM_info.script) ? GM_info.script.version : "";

    // ------------------------------------------------------------------
    // Floating icon
    // ------------------------------------------------------------------
    const btn = fleasioEl("div", "fl-ui fl-fab", "F");
    btn.id = "fleasio-btn";
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "Fleasio menu");
    btn.title = "Fleasio";
    fleasioRestorePosition(state, "btn", btn);
    document.documentElement.appendChild(btn);

    // Opacity + size are CSS variables, so the stylesheet owns the look
    // (and :hover / :active can still bring a faint icon back to full opacity).
    function applyIconAppearance() {
        btn.style.setProperty("--fl-icon-opacity", String(state.iconOpacity / 100));
        btn.style.setProperty("--fl-icon-size", state.iconSize + "px");
    }
    applyIconAppearance();

    // ------------------------------------------------------------------
    // Windows
    // ------------------------------------------------------------------
    function placePanel(el) {
        const r = btn.getBoundingClientRect();
        const w = el.offsetWidth || 300;
        const h = el.offsetHeight || 400;
        const left = fleasioClamp(r.right - w, 8, Math.max(8, window.innerWidth - w - 8));
        let top = r.bottom + 8;
        if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - 8 - h); // flip above the icon
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.right = "auto";
    }

    let settingsOverlay = null; // assigned below; the panel's ⚙ action needs it
    const panel = fleasioCreateOverlay(ctx, {
        id: "fleasio-panel",
        subtitle: "Asset Replacer" + (version ? " · v" + version : ""),
        width: 320,
        positionKey: "panel",
        fromButton: true,
        placement: placePanel,
        headerActions: [{
            icon: "⚙", title: "Settings",
            onClick: () => { if (settingsOverlay) toggleOverlay(settingsOverlay); },
        }],
    });
    // Max height of the main menu, as a % of the screen (CSS var read by .fl-overlay).
    function applyPanelHeight() {
        panel.el.style.setProperty("--fl-max-h", String(state.panelHeight));
    }
    applyPanelHeight();

    const quickMenu = fleasioCreateOverlay(ctx, { id: "fleasio-quickmenu", subtitle: "Quick Toggles", width: 250, positionKey: "quick" });
    settingsOverlay = fleasioCreateOverlay(ctx, { id: "fleasio-settingsmenu", subtitle: "Settings", width: 290, positionKey: "settings" });
    const overlays = [panel, quickMenu, settingsOverlay];

    function toggleOverlay(ov) {
        if (state.uiHidden) return;
        if (!ov.isOpen) overlays.forEach(o => { if (o !== ov && o !== panel) o.close(); });
        ov.toggle();
    }

    const stats = fleasioCreateStats(state, config);

    // ------------------------------------------------------------------
    // Main panel — replacements
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
                    dropdown.appendChild(fleasioEl("div", "fl-ac-empty", "Couldn’t load maps — check your connection"));
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
    // Settings
    // ------------------------------------------------------------------
    const sBody = settingsOverlay.content;

    fleasioSectionLabel(sBody, "Icon");
    const opacitySlider = fleasioSlider({
        label: "Opacity", min: 15, max: 100, step: 5, value: state.iconOpacity, unit: "%",
        onInput: (v) => { state.iconOpacity = v; applyIconAppearance(); },
        onChange: (v) => GM_setValue(config.ICON_OPACITY_KEY, v),
    });
    const sizeSlider = fleasioSlider({
        label: "Size", min: 28, max: 80, step: 2, value: state.iconSize, unit: "px",
        onInput: (v) => { state.iconSize = v; applyIconAppearance(); },
        onChange: (v) => {
            GM_setValue(config.ICON_SIZE_KEY, v);
            reflowAll();
        },
    });
    sBody.appendChild(opacitySlider.el);
    sBody.appendChild(sizeSlider.el);
    sBody.appendChild(fleasioEl("div", "fl-hint", "A faint icon turns solid while hovered or pressed."));
    sBody.appendChild(fleasioButton("Reset icon", "secondary", () => {
        state.iconOpacity = config.DEFAULT_ICON_OPACITY;
        state.iconSize = config.DEFAULT_ICON_SIZE;
        opacitySlider.set(state.iconOpacity);
        sizeSlider.set(state.iconSize);
        GM_setValue(config.ICON_OPACITY_KEY, state.iconOpacity);
        GM_setValue(config.ICON_SIZE_KEY, state.iconSize);
        applyIconAppearance();
        reflowAll();
    }));

    fleasioSectionLabel(sBody, "Main menu");
    const heightSlider = fleasioSlider({
        label: "Max height", min: 40, max: 95, step: 5, value: state.panelHeight, unit: "%",
        onInput: (v) => { state.panelHeight = v; applyPanelHeight(); panel.reflow(); },
        onChange: (v) => { GM_setValue(config.PANEL_HEIGHT_KEY, v); reflowAll(); },
    });
    sBody.appendChild(heightSlider.el);
    sBody.appendChild(fleasioEl("div", "fl-hint", "Taller shows more replacements and map results at once."));
    sBody.appendChild(fleasioButton("Reset height", "secondary", () => {
        state.panelHeight = config.DEFAULT_PANEL_HEIGHT;
        heightSlider.set(state.panelHeight);
        GM_setValue(config.PANEL_HEIGHT_KEY, state.panelHeight);
        applyPanelHeight();
        reflowAll();
    }));

    fleasioSectionLabel(sBody, "Interface");
    function setMoveMode(on) {
        state.moveMode = on;
        btn.classList.toggle("fl-move-on", on);
        overlays.forEach(o => o.setMovable(on));
        stats.setMovable(on);
    }
    sBody.appendChild(fleasioToggle("Move UI", false, setMoveMode));
    sBody.appendChild(fleasioToggle("Hide UI (until refresh)", false, (on) => {
        if (!on) return;
        state.uiHidden = true;
        setMoveMode(false);
        overlays.forEach(o => o.close());
        [btn, panel.el, quickMenu.el, settingsOverlay.el, stats.el].forEach(el => fleasioFadeOutThenHide(el, 250));
        stats.stopTimers();
    }));

    fleasioSectionLabel(sBody, "Shortcuts");
    sBody.appendChild(fleasioKeybindPicker(state, "Main menu", state.mainMenuKeybind, (code) => {
        state.mainMenuKeybind = code;
        GM_setValue(config.MAINMENU_KEY_STORAGE, code);
    }));
    sBody.appendChild(fleasioKeybindPicker(state, "Quick toggles", state.quickMenuKeybind, (code) => {
        state.quickMenuKeybind = code;
        GM_setValue(config.QUICKMENU_KEY_STORAGE, code);
    }));
    sBody.appendChild(fleasioKeybindPicker(state, "Settings", state.settingsMenuKeybind, (code) => {
        state.settingsMenuKeybind = code;
        GM_setValue(config.SETTINGSMENU_KEY_STORAGE, code);
    }));

    fleasioSectionLabel(sBody, "Reset");
    sBody.appendChild(fleasioButton("Reset GUI positions", "danger", () => {
        state.positions = {};
        GM_setValue(config.POSITIONS_KEY, {});
        location.reload();
    }));

    // ------------------------------------------------------------------
    // Icon interaction
    //   PC:    click = main menu (shortcut keys also work)
    //   Touch: tap = main menu, double-tap = quick toggles
    //   Move UI on: drag the icon anywhere
    // ------------------------------------------------------------------
    const DOUBLE_TAP_MS = 280;
    let tapTimer = null;
    let btnDrag = null;

    btn.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        btn.classList.add("fl-pressed");
        const r = btn.getBoundingClientRect();
        btnDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false };
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });

    btn.addEventListener("pointermove", (e) => {
        if (!btnDrag || e.pointerId !== btnDrag.id || !state.moveMode) return;
        const dx = e.clientX - btnDrag.sx, dy = e.clientY - btnDrag.sy;
        if (!btnDrag.moved && Math.hypot(dx, dy) < 4) return;
        btnDrag.moved = true;
        btn.style.left = fleasioClamp(btnDrag.x + dx, 0, Math.max(0, window.innerWidth - btn.offsetWidth)) + "px";
        btn.style.top = fleasioClamp(btnDrag.y + dy, 0, Math.max(0, window.innerHeight - btn.offsetHeight)) + "px";
        btn.style.right = "auto";
    });

    function endBtnPointer(e, cancelled) {
        if (!btnDrag || e.pointerId !== btnDrag.id) return;
        const drag = btnDrag;
        btnDrag = null;
        btn.classList.remove("fl-pressed");
        if (drag.moved) {
            fleasioRememberPosition(state, config, "btn", btn);
            panel.reflow();
            return;
        }
        if (cancelled || state.moveMode || state.uiHidden) return;

        if (e.pointerType === "touch") {
            if (tapTimer) {
                clearTimeout(tapTimer);
                tapTimer = null;
                toggleOverlay(quickMenu);
            } else {
                tapTimer = setTimeout(() => {
                    tapTimer = null;
                    toggleOverlay(panel);
                }, DOUBLE_TAP_MS);
            }
        } else {
            toggleOverlay(panel);
        }
    }
    btn.addEventListener("pointerup", (e) => endBtnPointer(e, false));
    btn.addEventListener("pointercancel", (e) => endBtnPointer(e, true));

    // ------------------------------------------------------------------
    // Keyboard shortcuts + layout
    // ------------------------------------------------------------------
    fleasioInitKeybinds(state, {
        main: () => toggleOverlay(panel),
        quick: () => toggleOverlay(quickMenu),
        settings: () => toggleOverlay(settingsOverlay),
    });

    function reflowAll() {
        if (fleasioClampToViewport(btn) && state.positions.btn) {
            fleasioRememberPosition(state, config, "btn", btn);
        }
        overlays.forEach(o => o.reflow());
        fleasioClampToViewport(stats.el);
    }
    // The on-screen keyboard resizes the viewport on some mobile browsers.
    // Re-seating windows while someone is typing makes them jump around, so
    // wait until the field loses focus (the keyboard closing fires resize again).
    function isTypingInUI() {
        const a = document.activeElement;
        return !!(a && a.tagName === "INPUT" && fleasioIsInsideUI(a));
    }
    window.addEventListener("resize", () => { if (!isTypingInUI()) reflowAll(); });
    window.addEventListener("orientationchange", () => setTimeout(reflowAll, 200));

    [panel, quickMenu, settingsOverlay].forEach(o => o.place());
    reflowAll();
}
