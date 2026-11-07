// Fleasio — shared "shell" pieces used by every script built on this UI
// (Fleasio itself and AssetFetcher): the common saved state, the floating
// icon, the window layout wiring, and the standard Settings sections
// (icon, menu height, move/hide UI, shortcuts, reset).
//
// A script supplies a `config` with its own storage keys and a `ctx`:
//   ctx = { state, config, brand?: { name, letter }, themeClass?: string }

// Settings every script has. Merge your own fields into the result.
function fleasioLoadCommonState(config) {
    return {
        positions: GM_getValue(config.POSITIONS_KEY, {}),
        mainMenuKeybind: GM_getValue(config.MAINMENU_KEY_STORAGE, config.DEFAULT_MAINMENU_KEY),
        quickMenuKeybind: GM_getValue(config.QUICKMENU_KEY_STORAGE, config.DEFAULT_QUICKMENU_KEY),
        settingsMenuKeybind: GM_getValue(config.SETTINGSMENU_KEY_STORAGE, null),
        iconOpacity: fleasioStoredNumber(config.ICON_OPACITY_KEY, config.DEFAULT_ICON_OPACITY, 15, 100),
        iconSize: fleasioStoredNumber(config.ICON_SIZE_KEY, config.DEFAULT_ICON_SIZE, 28, 80),
        panelHeight: fleasioStoredNumber(config.PANEL_HEIGHT_KEY, config.DEFAULT_PANEL_HEIGHT, 40, 95),
        moveMode: false,
        uiHidden: false,
        capturingKeybind: false,
    };
}

// Max height of a window as a % of the screen (read by .fl-overlay in CSS).
function fleasioApplyPanelHeight(panel, state) {
    panel.el.style.setProperty("--fl-max-h", String(state.panelHeight));
}

// Placement function for a window that opens next to the floating icon:
// right-aligned under it, flipping above when there's no room below.
function fleasioPlaceNearFab(fabEl) {
    return function (el) {
        const r = fabEl.getBoundingClientRect();
        const w = el.offsetWidth || 300;
        const h = el.offsetHeight || 400;
        const left = fleasioClamp(r.right - w, 8, Math.max(8, window.innerWidth - w - 8));
        let top = r.bottom + 8;
        if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - 8 - h);
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.right = "auto";
    };
}

// The floating icon.
//   PC:    click = onTap
//   Touch: tap = onTap; if onDoubleTap is given, a double-tap = onDoubleTap
//          (onTap is then delayed ~280ms to tell them apart; without
//          onDoubleTap it fires instantly)
//   Move UI on: drag it anywhere (position remembered under "btn").
// opts: { id, letter, label, title, defaultTop, onTap, onDoubleTap, onMoved }
// returns { el, applyAppearance, setMoveMode }
function fleasioCreateFab(ctx, opts) {
    const { state, config } = ctx;
    const el = fleasioEl("div", "fl-ui fl-fab" + (ctx.themeClass ? " " + ctx.themeClass : ""), opts.letter || "F");
    el.id = opts.id;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", opts.label || "Menu");
    el.title = opts.title || "";
    if (!fleasioRestorePosition(state, "btn", el) && opts.defaultTop) el.style.top = opts.defaultTop;
    document.documentElement.appendChild(el);

    // Opacity + size are CSS variables, so the stylesheet owns the look
    // (and :hover / :active can still bring a faint icon back to full opacity).
    function applyAppearance() {
        el.style.setProperty("--fl-icon-opacity", String(state.iconOpacity / 100));
        el.style.setProperty("--fl-icon-size", state.iconSize + "px");
    }
    applyAppearance();

    const DOUBLE_TAP_MS = 280;
    let tapTimer = null;
    let drag = null;

    el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        el.classList.add("fl-pressed");
        const r = el.getBoundingClientRect();
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false };
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });

    el.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id || !state.moveMode) return;
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        el.style.left = fleasioClamp(drag.x + dx, 0, Math.max(0, window.innerWidth - el.offsetWidth)) + "px";
        el.style.top = fleasioClamp(drag.y + dy, 0, Math.max(0, window.innerHeight - el.offsetHeight)) + "px";
        el.style.right = "auto";
    });

    function endPointer(e, cancelled) {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag;
        drag = null;
        el.classList.remove("fl-pressed");
        if (d.moved) {
            fleasioRememberPosition(state, config, "btn", el);
            if (opts.onMoved) opts.onMoved();
            return;
        }
        if (cancelled || state.moveMode || state.uiHidden) return;

        if (e.pointerType === "touch" && opts.onDoubleTap) {
            if (tapTimer) {
                clearTimeout(tapTimer);
                tapTimer = null;
                opts.onDoubleTap();
            } else {
                tapTimer = setTimeout(() => {
                    tapTimer = null;
                    opts.onTap();
                }, DOUBLE_TAP_MS);
            }
        } else {
            opts.onTap();
        }
    }
    el.addEventListener("pointerup", (e) => endPointer(e, false));
    el.addEventListener("pointercancel", (e) => endPointer(e, true));

    return {
        el,
        applyAppearance,
        setMoveMode(on) { el.classList.toggle("fl-move-on", on); },
    };
}

// Keeps the icon and windows on-screen when the viewport changes (rotation,
// window resize, browser fullscreen). Returns reflowAll() so callers can also
// trigger it manually. opts: { fab, windows, extraEls }
function fleasioWireLayout(ctx, opts) {
    const { state, config } = ctx;

    function reflowAll() {
        if (fleasioClampToViewport(opts.fab.el) && state.positions.btn) {
            fleasioRememberPosition(state, config, "btn", opts.fab.el);
        }
        opts.windows.forEach(w => w.reflow());
        (opts.extraEls || []).forEach(el => fleasioClampToViewport(el));
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

    return reflowAll;
}

// Adds the standard Settings sections to `body`:
//   Icon (opacity, size) · Main menu (max height) · Interface (move / hide UI)
//   · Shortcuts · Reset
// o: {
//   fab, panel, windows,                    // required
//   keybinds: [{ label, stateKey, configKey }],
//   reflowAll,                              // from fleasioWireLayout
//   movables: [{ setMovable(on) }],         // extra things Move UI should unlock
//   extraEls: [el],                         // extra elements Hide UI should fade out
//   onHide: () => {},                       // extra work when the UI is hidden
//   heightHint: "text"
// }
function fleasioBuildSettings(ctx, body, o) {
    const { state, config } = ctx;

    fleasioSectionLabel(body, "Icon");
    const opacitySlider = fleasioSlider({
        label: "Opacity", min: 15, max: 100, step: 5, value: state.iconOpacity, unit: "%",
        onInput: (v) => { state.iconOpacity = v; o.fab.applyAppearance(); },
        onChange: (v) => GM_setValue(config.ICON_OPACITY_KEY, v),
    });
    const sizeSlider = fleasioSlider({
        label: "Size", min: 28, max: 80, step: 2, value: state.iconSize, unit: "px",
        onInput: (v) => { state.iconSize = v; o.fab.applyAppearance(); },
        onChange: (v) => { GM_setValue(config.ICON_SIZE_KEY, v); o.reflowAll(); },
    });
    body.appendChild(opacitySlider.el);
    body.appendChild(sizeSlider.el);
    body.appendChild(fleasioEl("div", "fl-hint", "A faint icon turns solid while hovered or pressed."));
    body.appendChild(fleasioButton("Reset icon", "secondary", () => {
        state.iconOpacity = config.DEFAULT_ICON_OPACITY;
        state.iconSize = config.DEFAULT_ICON_SIZE;
        opacitySlider.set(state.iconOpacity);
        sizeSlider.set(state.iconSize);
        GM_setValue(config.ICON_OPACITY_KEY, state.iconOpacity);
        GM_setValue(config.ICON_SIZE_KEY, state.iconSize);
        o.fab.applyAppearance();
        o.reflowAll();
    }));

    fleasioSectionLabel(body, "Main menu");
    const heightSlider = fleasioSlider({
        label: "Max height", min: 40, max: 95, step: 5, value: state.panelHeight, unit: "%",
        onInput: (v) => { state.panelHeight = v; fleasioApplyPanelHeight(o.panel, state); o.panel.reflow(); },
        onChange: (v) => { GM_setValue(config.PANEL_HEIGHT_KEY, v); o.reflowAll(); },
    });
    body.appendChild(heightSlider.el);
    body.appendChild(fleasioEl("div", "fl-hint", o.heightHint || "Taller shows more at once."));
    body.appendChild(fleasioButton("Reset height", "secondary", () => {
        state.panelHeight = config.DEFAULT_PANEL_HEIGHT;
        heightSlider.set(state.panelHeight);
        GM_setValue(config.PANEL_HEIGHT_KEY, state.panelHeight);
        fleasioApplyPanelHeight(o.panel, state);
        o.reflowAll();
    }));

    fleasioSectionLabel(body, "Interface");
    function setMoveMode(on) {
        state.moveMode = on;
        o.fab.setMoveMode(on);
        o.windows.forEach(w => w.setMovable(on));
        (o.movables || []).forEach(m => m.setMovable(on));
    }
    body.appendChild(fleasioToggle("Move UI", false, setMoveMode));
    body.appendChild(fleasioToggle("Hide UI (until refresh)", false, (on) => {
        if (!on) return;
        state.uiHidden = true;
        setMoveMode(false);
        o.windows.forEach(w => w.close());
        [o.fab.el, ...o.windows.map(w => w.el), ...(o.extraEls || [])].forEach(el => fleasioFadeOutThenHide(el, 250));
        if (o.onHide) o.onHide();
    }));

    fleasioSectionLabel(body, "Shortcuts");
    o.keybinds.forEach(k => {
        body.appendChild(fleasioKeybindPicker(state, k.label, state[k.stateKey], (code) => {
            state[k.stateKey] = code;
            GM_setValue(config[k.configKey], code);
        }));
    });

    fleasioSectionLabel(body, "Reset");
    body.appendChild(fleasioButton("Reset GUI positions", "danger", () => {
        state.positions = {};
        GM_setValue(config.POSITIONS_KEY, {});
        location.reload();
    }));
}
