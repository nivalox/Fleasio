// Fleasio: reusable UI building blocks (switches, sliders, keybind pickers,
// overlay windows...). Loaded via @require before UI.js. All styling lives in
// src/css/style.css; these functions only build DOM and toggle classes.

function fleasioEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function fleasioSectionLabel(container, text) {
    const label = fleasioEl("div", "fl-section", text);
    container.appendChild(label);
    return label;
}

function fleasioButton(text, variant, onClick) {
    const btn = fleasioEl("button", "fl-button fl-button-" + variant, text);
    btn.type = "button";
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
}

// On/off switch (a real <button role="switch"> so it works with touch, mouse
// and screen readers).
function fleasioSwitch(initial, onChange) {
    const sw = fleasioEl("button", "fl-switch");
    sw.type = "button";
    sw.setAttribute("role", "switch");
    let on = !!initial;
    const paint = () => {
        sw.setAttribute("aria-checked", String(on));
        sw.classList.toggle("fl-on", on);
    };
    sw.addEventListener("click", () => {
        on = !on;
        paint();
        onChange(on);
    });
    paint();
    return sw;
}

function fleasioToggle(label, initial, onChange) {
    const row = fleasioEl("div", "fl-row");
    row.appendChild(fleasioEl("span", "fl-row-label", label));
    row.appendChild(fleasioSwitch(initial, onChange));
    return row;
}

// Range slider with a live value read-out. `onInput` fires while dragging,
// `onChange` once when the user lets go (use it to persist).
function fleasioSlider({ label, min, max, step, value, unit, onInput, onChange }) {
    const row = fleasioEl("div", "fl-slider-row");
    const head = fleasioEl("div", "fl-slider-head");
    head.appendChild(fleasioEl("span", "fl-row-label", label));
    const valueEl = fleasioEl("span", "fl-slider-value");
    head.appendChild(valueEl);

    const input = fleasioEl("input", "fl-slider");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);

    function paint() {
        const v = Number(input.value);
        input.style.setProperty("--fl-fill", ((v - min) / (max - min)) * 100 + "%");
        valueEl.textContent = v + unit;
    }
    input.addEventListener("input", () => {
        paint();
        if (onInput) onInput(Number(input.value));
    });
    input.addEventListener("change", () => {
        if (onChange) onChange(Number(input.value));
    });

    input.value = String(value);
    paint();
    row.appendChild(head);
    row.appendChild(input);

    return {
        el: row,
        set(v) { input.value = String(v); paint(); },
    };
}

// "Press a key to bind" button. While waiting, state.capturingKeybind is true
// so the input shield and global shortcuts stand down.
function fleasioKeybindPicker(state, label, initialCode, onChange) {
    const row = fleasioEl("div", "fl-row");
    row.appendChild(fleasioEl("span", "fl-row-label", label));

    const btn = fleasioEl("button", "fl-keybind");
    btn.type = "button";
    let current = initialCode;
    btn.textContent = fleasioCodeToLabel(current);

    function stopListening() {
        state.capturingKeybind = false;
        btn.classList.remove("fl-listening");
        btn.textContent = fleasioCodeToLabel(current);
        window.removeEventListener("keydown", captureKey, true);
        window.removeEventListener("pointerdown", cancelOnOutsideClick, true);
    }
    function captureKey(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === "Escape") return stopListening();
        current = e.code;
        stopListening();
        onChange(current);
    }
    function cancelOnOutsideClick(e) {
        if (e.target !== btn) stopListening();
    }

    btn.addEventListener("click", () => {
        if (state.capturingKeybind) return;
        state.capturingKeybind = true;
        btn.classList.add("fl-listening");
        btn.textContent = "Press a key…";
        window.addEventListener("keydown", captureKey, true);
        window.addEventListener("pointerdown", cancelOnOutsideClick, true);
    });

    row.appendChild(btn);
    return row;
}

// Statistics row for the Quick Toggles menu: label, ⚙ (mode dropdown), switch.
function fleasioStatsToggle(initialMode, initialEnabled, onToggleChange, onModeChange) {
    const row = fleasioEl("div", "fl-row");
    row.appendChild(fleasioEl("span", "fl-row-label", "Statistics GUI"));

    const controls = fleasioEl("div", "fl-row-controls");
    const gear = fleasioEl("button", "fl-icon-btn", "⚙");
    gear.type = "button";
    gear.title = "Choose what to show";
    controls.appendChild(gear);
    controls.appendChild(fleasioSwitch(initialEnabled, onToggleChange));
    row.appendChild(controls);

    const menu = fleasioEl("div", "fl-menu");
    const options = [
        { key: "ping", label: "Ping" },
        { key: "fps", label: "FPS" },
        { key: "both", label: "Ping + FPS" },
    ];
    let mode = initialMode;
    const items = options.map(opt => {
        const item = fleasioEl("div", "fl-menu-item", opt.label);
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            mode = opt.key;
            paint();
            menu.classList.remove("fl-show");
            onModeChange(mode);
        });
        menu.appendChild(item);
        return { item, key: opt.key };
    });
    function paint() {
        items.forEach(({ item, key }) => item.classList.toggle("fl-selected", key === mode));
    }
    paint();
    row.appendChild(menu);

    gear.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("fl-show");
    });
    document.addEventListener("click", (e) => {
        if (!row.contains(e.target)) menu.classList.remove("fl-show");
    });

    return row;
}

// A Quick Toggles row with a switch and a ⚙ that expands a panel of options
// right underneath it (the panel is empty: the caller fills `panel`).
// opts: { label, enabled, onToggle(on), gearTitle }
// returns { el, panel }
function fleasioOptionsRow(opts) {
    const wrap = fleasioEl("div", "fl-options");

    const row = fleasioEl("div", "fl-row");
    row.appendChild(fleasioEl("span", "fl-row-label", opts.label));
    const controls = fleasioEl("div", "fl-row-controls");
    const gear = fleasioEl("button", "fl-icon-btn", "⚙");
    gear.type = "button";
    gear.title = opts.gearTitle || "Options";
    gear.setAttribute("aria-label", opts.gearTitle || "Options");
    controls.appendChild(gear);
    controls.appendChild(fleasioSwitch(opts.enabled, (on) => opts.onToggle(on)));
    row.appendChild(controls);
    wrap.appendChild(row);

    const panel = fleasioEl("div", "fl-subpanel");
    wrap.appendChild(panel);
    gear.addEventListener("click", () => {
        gear.classList.toggle("fl-active", panel.classList.toggle("fl-show"));
    });

    return { el: wrap, panel };
}

// FPS limit row for the Quick Toggles menu: label with the current value, a
// gear that opens the presets / custom field, and the on/off switch.
// opts: { enabled, target (0 = unlimited), getRefreshHz(), measureRefresh(),
//         onToggle(on), onTarget(fps) }
function fleasioFpsRow(opts) {
    const PRESETS = [30, 60, 90, 120, 144, 240, 0]; // 0 = unlimited
    const wrap = fleasioEl("div", "fl-fps");

    const row = fleasioEl("div", "fl-row");
    const label = fleasioEl("span", "fl-row-label", "FPS limit ");
    const valueEl = fleasioEl("span", "fl-row-sub");
    label.appendChild(valueEl);
    row.appendChild(label);

    const controls = fleasioEl("div", "fl-row-controls");
    const gear = fleasioEl("button", "fl-icon-btn", "⚙");
    gear.type = "button";
    gear.title = "Choose an FPS limit";
    controls.appendChild(gear);
    let enabled = opts.enabled;
    controls.appendChild(fleasioSwitch(enabled, (on) => { enabled = on; paint(); opts.onToggle(on); }));
    row.appendChild(controls);
    wrap.appendChild(row);

    const panel = fleasioEl("div", "fl-fps-panel");
    const chips = fleasioEl("div", "fl-chips");
    const chipFor = new Map();
    PRESETS.forEach((fps) => {
        const chip = fleasioEl("button", "fl-chip", fps === 0 ? "Unlimited" : String(fps));
        chip.type = "button";
        chip.addEventListener("click", () => setTarget(fps));
        chips.appendChild(chip);
        chipFor.set(fps, chip);
    });
    panel.appendChild(chips);

    const custom = fleasioEl("div", "fl-fps-custom");
    const input = fleasioEl("input", "fl-input");
    input.type = "number";
    input.min = "5";
    input.max = "1000";
    input.inputMode = "numeric";
    input.placeholder = "Custom FPS";
    const setBtn = fleasioButton("Set", "secondary");
    custom.appendChild(input);
    custom.appendChild(setBtn);
    panel.appendChild(custom);

    const info = fleasioEl("div", "fl-hint fl-fps-info");
    panel.appendChild(info);
    wrap.appendChild(panel);

    let target = opts.target;
    function paint() {
        valueEl.textContent = target === 0 ? "Unlimited" : target + " fps";
        chipFor.forEach((chip, fps) => chip.classList.toggle("fl-chip-on", fps === target));
        const hz = opts.getRefreshHz();
        let text = `Your display runs at about ${hz} Hz. `;
        if (target === 0 || target > hz + 1) text += "Above that, the game updates more often than the screen can show, which can cut input delay but uses more power.";
        else if (target < hz - 1) text += "Below that, frames are skipped to save power.";
        else text += "This matches your display.";
        if (target === 0) text += " Unlimited can heat up your device.";
        if (!enabled) text += " The switch is off, so the game is running at its normal speed.";
        info.textContent = text;
    }
    function setTarget(fps) {
        target = fps;
        paint();
        opts.onTarget(fps);
    }

    setBtn.addEventListener("click", () => {
        const n = Math.round(Number(input.value));
        if (!Number.isFinite(n) || n < 5 || n > 1000) {
            input.classList.remove("fl-invalid");
            void input.offsetWidth;
            input.classList.add("fl-invalid");
            setTimeout(() => input.classList.remove("fl-invalid"), 900);
            return;
        }
        input.value = "";
        setTarget(n);
    });

    gear.addEventListener("click", () => {
        const open = panel.classList.toggle("fl-show");
        if (open && opts.measureRefresh) opts.measureRefresh().then(paint);
    });

    paint();
    return wrap;
}

// A draggable window: header (logo, title, optional extra actions, fullscreen,
// close) + scrolling body. Position is remembered under `positionKey` once the
// user drags it; until then `placement(overlay)` decides where it sits.
//
// ctx: { state, config, brand?: { name, letter }, themeClass?: string }
// opts: { id, subtitle, width, positionKey, headerActions, placement, fromButton,
//         offset?: { dx, dy } (nudges the default centred spot so windows opened
//         together don't stack exactly on top of each other) }
function fleasioCreateOverlay(ctx, opts) {
    const { state, config } = ctx;
    const brand = ctx.brand || { name: "Fleasio", letter: "F" };
    const el = fleasioEl("div", "fl-ui fl-overlay"
        + (opts.fromButton ? " fl-from-btn" : "")
        + (ctx.themeClass ? " " + ctx.themeClass : "")
        + (state.noAnimations ? " fl-no-anim" : ""));
    el.id = opts.id;
    el.style.setProperty("--fl-w", (opts.width || 300) + "px");

    const header = fleasioEl("div", "fl-header");
    const title = fleasioEl("div", "fl-title");
    title.appendChild(fleasioEl("div", "fl-logo", brand.letter));
    const names = fleasioEl("div", "fl-names");
    names.appendChild(fleasioEl("div", "fl-name", brand.name));
    names.appendChild(fleasioEl("div", "fl-sub", opts.subtitle || ""));
    title.appendChild(names);
    header.appendChild(title);

    const actions = fleasioEl("div", "fl-actions");
    (opts.headerActions || []).forEach(a => {
        const b = fleasioEl("button", "fl-icon-btn", a.icon);
        b.type = "button";
        b.title = a.title;
        b.setAttribute("aria-label", a.title);
        b.addEventListener("click", a.onClick);
        actions.appendChild(b);
    });
    const fsBtn = fleasioEl("button", "fl-icon-btn", "⛶");
    fsBtn.type = "button";
    fsBtn.title = "Fullscreen";
    fsBtn.setAttribute("aria-label", "Toggle fullscreen");
    const closeBtn = fleasioEl("button", "fl-icon-btn", "✕");
    closeBtn.type = "button";
    closeBtn.title = "Close";
    closeBtn.setAttribute("aria-label", "Close");
    actions.appendChild(fsBtn);
    actions.appendChild(closeBtn);
    header.appendChild(actions);

    const body = fleasioEl("div", "fl-body");
    el.appendChild(header);
    el.appendChild(body);
    // Resize grip (only visible while "Stretch UI" is on).
    const grip = fleasioEl("div", "fl-grip");
    grip.title = "Drag to resize";
    el.appendChild(grip);
    document.documentElement.appendChild(el);

    const MIN_W = 200, MIN_H = 120;
    let hasCustomSize = false;
    function applySize(w, h) {
        el.style.width = w + "px";
        el.style.height = h + "px";
        el.style.maxHeight = "none"; // a stretched window ignores the "Max height" setting
        hasCustomSize = true;
    }
    const savedSize = state.sizes && state.sizes[opts.positionKey];
    if (savedSize && Number.isFinite(savedSize.w) && Number.isFinite(savedSize.h)) {
        applySize(Math.max(MIN_W, savedSize.w), Math.max(MIN_H, savedSize.h));
    }

    let isOpen = false;
    let isFullscreen = false;
    let savedInline = null;   // left/top/right (and any stretched size) to restore after fullscreen
    let hideTimer = null;
    let moved = fleasioRestorePosition(state, opts.positionKey, el);

    // Closed windows are display:none, so they cost nothing to lay out or paint.
    el.style.display = "none";

    function place() {
        if (moved || isFullscreen) return;
        if (opts.placement) {
            opts.placement(el);
        } else {
            // Default: centred in the viewport.
            const w = el.offsetWidth, h = el.offsetHeight;
            const dx = (opts.offset && opts.offset.dx) || 0;
            const dy = (opts.offset && opts.offset.dy) || 0;
            el.style.left = fleasioClamp((window.innerWidth - w) / 2 + dx, 8, Math.max(8, window.innerWidth - w - 8)) + "px";
            el.style.top = fleasioClamp((window.innerHeight - h) / 2 + dy, 8, Math.max(8, window.innerHeight - h - 8)) + "px";
            el.style.right = "auto";
        }
    }

    function setOpen(open) {
        clearTimeout(hideTimer);
        isOpen = open;
        if (open) {
            el.style.display = "";      // back to the stylesheet's display:flex
            place();
            if (!isFullscreen) fleasioClampToViewport(el);
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            fleasioRaise(el);           // newest window on top
            void el.offsetWidth;        // lay it out closed first so the open transition runs
            el.classList.add("fl-open");
        } else {
            el.classList.remove("fl-open");
            // Wait for the fade-out, then take it out of the layout entirely.
            hideTimer = setTimeout(() => { if (!isOpen) el.style.display = "none"; }, state.noAnimations ? 0 : 220);
        }
        if (opts.onToggle) opts.onToggle(open);
    }

    // Smoothly grows / shrinks the window between two rectangles (px).
    // Animates left/top/width/height/radius with the Web Animations API, which
    // is crisp (no stretched text, unlike a scale transform) and cheap for a
    // single small element.
    function animateBetween(from, to, entering) {
        if (!el.animate || state.noAnimations) return;
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const radius = parseFloat(getComputedStyle(el).getPropertyValue("--fl-radius")) || 14;
        const frame = (r, br) => ({
            left: r.left + "px", top: r.top + "px",
            width: r.width + "px", height: r.height + "px",
            maxHeight: "none", borderRadius: br + "px",
        });
        el.animate(
            [frame(from, entering ? radius : 0), frame(to, entering ? 0 : radius)],
            { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
    }

    function setFullscreen(on) {
        if (on === isFullscreen) return;
        const from = isOpen ? el.getBoundingClientRect() : null;

        isFullscreen = on;
        if (on) {
            savedInline = {
                left: el.style.left, top: el.style.top, right: el.style.right,
                width: el.style.width, height: el.style.height, maxHeight: el.style.maxHeight,
            };
            el.style.left = "0px";
            el.style.top = "0px";
            el.style.right = "auto";
            el.style.width = "";      // let the fullscreen class decide the size
            el.style.height = "";
            el.style.maxHeight = "";
        } else if (savedInline) {
            el.style.left = savedInline.left;
            el.style.top = savedInline.top;
            el.style.right = savedInline.right;
            el.style.width = savedInline.width;
            el.style.height = savedInline.height;
            el.style.maxHeight = savedInline.maxHeight;
            savedInline = null;
        }
        el.classList.toggle("fl-fullscreen", on);
        fsBtn.classList.toggle("fl-active", on);
        // A fullscreen window must sit above the floating icon (which would
        // otherwise cover its top-right header buttons). Same z-index as the
        // icon, and windows come later in the page, so they win.
        if (on) el.style.zIndex = "2147483647";
        else fleasioRaise(el);
        if (!on) {
            place();
            fleasioClampToViewport(el);
        }
        if (from) animateBetween(from, el.getBoundingClientRect(), on);
    }

    closeBtn.addEventListener("click", () => setOpen(false));
    fsBtn.addEventListener("click", () => setFullscreen(!isFullscreen));

    fleasioMakeDraggable({
        handle: header,
        target: el,
        ignore: ".fl-icon-btn",
        canDrag: () => state.moveMode && !state.uiHidden && !isFullscreen,
        onEnd: () => {
            moved = true;
            fleasioRememberPosition(state, config, opts.positionKey, el);
        },
    });

    // Clicking or tapping anywhere on a window brings it to the front.
    el.addEventListener("pointerdown", () => { if (!isFullscreen) fleasioRaise(el); }, true);

    // ---- stretching: drag the corner grip to set any size you like ----
    let resize = null;
    let resizeRaf = 0;
    let resizePending = null;
    function flushResize() {
        resizeRaf = 0;
        if (!resizePending) return;
        applySize(resizePending.w, resizePending.h);
        resizePending = null;
    }
    grip.addEventListener("pointerdown", (e) => {
        if (!state.stretchMode || isFullscreen) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const left = parseFloat(el.style.left);
        const top = parseFloat(el.style.top);
        const r = el.getBoundingClientRect();
        resize = {
            id: e.pointerId, sx: e.clientX, sy: e.clientY,
            w: el.offsetWidth, h: el.offsetHeight,
            left: Number.isFinite(left) ? left : r.left,
            top: Number.isFinite(top) ? top : r.top,
        };
        try { grip.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        e.preventDefault();
    });
    grip.addEventListener("pointermove", (e) => {
        if (!resize || e.pointerId !== resize.id) return;
        resizePending = {
            w: fleasioClamp(resize.w + e.clientX - resize.sx, MIN_W, Math.max(MIN_W, window.innerWidth - resize.left)),
            h: fleasioClamp(resize.h + e.clientY - resize.sy, MIN_H, Math.max(MIN_H, window.innerHeight - resize.top)),
        };
        if (!resizeRaf) resizeRaf = requestAnimationFrame(flushResize);
    });
    const endResize = (e) => {
        if (!resize || (e.pointerId !== undefined && e.pointerId !== resize.id)) return;
        resize = null;
        if (resizeRaf) { cancelAnimationFrame(resizeRaf); flushResize(); }
        if (hasCustomSize) {
            state.sizes[opts.positionKey] = { w: el.offsetWidth, h: el.offsetHeight };
            GM_setValue(config.SIZES_KEY, state.sizes);
        }
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(evt => grip.addEventListener(evt, endResize));

    return {
        el,
        content: body,
        header,
        get isOpen() { return isOpen; },
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen(!isOpen),
        place,
        setMovable(on) { header.classList.toggle("fl-movable", on); },
        setStretchable(on) { el.classList.toggle("fl-stretchable", on); },
        // Back to the automatic size (and forget the stretched one).
        resetSize() {
            el.style.width = "";
            el.style.height = "";
            el.style.maxHeight = "";
            hasCustomSize = false;
            if (state.sizes) delete state.sizes[opts.positionKey];
            if (isOpen && !isFullscreen) { place(); fleasioClampToViewport(el); }
        },
        // Re-seat after a viewport change. Unmoved windows re-run placement,
        // moved ones are just pulled back on-screen.
        reflow() {
            if (isFullscreen || !isOpen) return; // closed windows are re-placed when they open
            if (hasCustomSize) {
                // A stretched window must still fit after a rotation / smaller viewport.
                if (el.offsetWidth > window.innerWidth - 8) el.style.width = Math.max(MIN_W, window.innerWidth - 8) + "px";
                if (el.offsetHeight > window.innerHeight - 8) el.style.height = Math.max(MIN_H, window.innerHeight - 8) + "px";
            }
            place();
            if (fleasioClampToViewport(el) && moved) {
                fleasioRememberPosition(state, config, opts.positionKey, el);
            }
        },
        forgetPosition() { moved = false; },
    };
}
