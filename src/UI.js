// Fleasio UI module — loaded via @require by the main Fleasio userscript.
// Defines buildFleasioUI(state, config, save). `state` is shared by reference
// with the main script's network-patching logic, so changes made here
// (adding a replacement, flipping ad-block, rebinding a key, etc.) are seen
// there immediately.

function buildFleasioUI(state, config, save) {
    'use strict';

    let mapsDataPromise = null;
    let fleasioMapsDataPromise = null;

    function getMapsData() {
        if (!mapsDataPromise) {
            mapsDataPromise = new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: config.MAPS_JSON_URL,
                    onload: (res) => {
                        try { resolve(JSON.parse(res.responseText)); }
                        catch (e) { mapsDataPromise = null; reject(e); }
                    },
                    onerror: (e) => { mapsDataPromise = null; reject(e); },
                });
            });
        }
        return mapsDataPromise;
    }

    function getFleasioMapsData() {
        if (!fleasioMapsDataPromise) {
            fleasioMapsDataPromise = new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: config.FLEASIO_MAPS_JSON_URL,
                    onload: (res) => {
                        try { resolve(JSON.parse(res.responseText)); }
                        catch (e) { fleasioMapsDataPromise = null; reject(e); }
                    },
                    onerror: (e) => { fleasioMapsDataPromise = null; reject(e); },
                });
            });
        }
        return fleasioMapsDataPromise;
    }

    function flattenMapsData(data) {
        const flat = [];
        for (const category in data) {
            for (const name in data[category]) {
                flat.push({ category, name, url: data[category][name].URL });
            }
        }
        return flat;
    }

    // --- Keybind display helper ---
    function codeToLabel(code) {
        if (!code) return "Unbound";
        const map = {
            ShiftLeft: "Left Shift", ShiftRight: "Right Shift",
            ControlLeft: "Left Ctrl", ControlRight: "Right Ctrl",
            AltLeft: "Left Alt", AltRight: "Right Alt",
            MetaLeft: "Left Meta", MetaRight: "Right Meta",
            CapsLock: "Caps Lock", Tab: "Tab", Space: "Space",
            Backquote: "` (Backquote)", Backslash: "\\",
            Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
            Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
        };
        if (map[code]) return map[code];
        if (code.startsWith("Key")) return code.slice(3);
        if (code.startsWith("Digit")) return code.slice(5);
        if (/^F\d{1,2}$/.test(code)) return code;
        return code;
    }

    function createKeybindPicker(label, getCurrentCode, onChange) {
        const wrap = document.createElement("div");
        wrap.style.marginBottom = "14px";

        const labelEl = document.createElement("div");
        labelEl.style.opacity = "0.8";
        labelEl.style.marginBottom = "6px";
        labelEl.textContent = label;
        wrap.appendChild(labelEl);

        const keyBtn = document.createElement("button");
        keyBtn.type = "button";
        keyBtn.className = "fleasio-keybind-btn";
        keyBtn.textContent = codeToLabel(getCurrentCode());
        wrap.appendChild(keyBtn);

        let listening = false;
        keyBtn.addEventListener("click", () => {
            if (listening) return;
            listening = true;
            keyBtn.classList.add("fleasio-listening");
            keyBtn.textContent = "Press a key… (Esc to cancel)";

            function captureKey(e) {
                e.preventDefault();
                e.stopPropagation();
                window.removeEventListener("keydown", captureKey, true);
                listening = false;
                keyBtn.classList.remove("fleasio-listening");
                if (e.code === "Escape") {
                    keyBtn.textContent = codeToLabel(getCurrentCode());
                    return;
                }
                onChange(e.code);
                keyBtn.textContent = codeToLabel(e.code);
            }
            window.addEventListener("keydown", captureKey, true);
        });

        return wrap;
    }

    // --- Reusable floating overlay (used by Quick Toggles and Settings) ---
    // Centered by default, drag-to-move via its header when Move UI is on,
    // with its own fullscreen/close controls matching the main panel.
    function createOverlay({ id, subtitle, width }) {
        const el = document.createElement("div");
        el.id = id;
        Object.assign(el.style, {
            position: "fixed", zIndex: 2147483647,
            width: width + "px", maxHeight: "65vh", overflowY: "auto",
            background: "rgba(18,18,20,0.97)", color: "#eee",
            borderRadius: "12px", fontFamily: "sans-serif", fontSize: "13px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.08)",
            opacity: "0", pointerEvents: "none",
            transform: "scale(0.92)",
            transition: "opacity 0.18s ease, transform 0.18s ease, width 0.18s ease, height 0.18s ease, border-radius 0.18s ease",
            touchAction: "pan-y", overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
        });
        el.innerHTML = `
            <div id="${id}-header" class="fleasio-header" style="display:flex;justify-content:space-between;align-items:center;
                        padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <div>
                    <div style="font-weight:bold;font-size:15px;">Fleasio</div>
                    <div style="opacity:0.5;font-size:11px;">${subtitle}</div>
                </div>
                <div>
                    <span id="${id}-fullscreen" title="Toggle fullscreen"
                        style="cursor:pointer;opacity:0.6;font-size:15px;margin-right:12px;">⛶</span>
                    <span id="${id}-close" style="cursor:pointer;opacity:0.6;font-size:16px;">✕</span>
                </div>
            </div>
            <div style="padding:14px;">
                <div id="${id}-content"></div>
            </div>
        `;
        document.documentElement.appendChild(el);

        let isOpen = false;
        let isFullscreen = false;
        let moved = false;
        let savedPos = null;

        function recenter() {
            if (moved || isFullscreen) return;
            const rect = el.getBoundingClientRect();
            el.style.left = Math.max(8, (window.innerWidth - rect.width) / 2) + "px";
            el.style.top = Math.max(8, (window.innerHeight - rect.height) / 2) + "px";
        }

        function applyFullscreen() {
            if (isFullscreen) {
                savedPos = { left: el.style.left, top: el.style.top };
                el.style.left = "0";
                el.style.top = "0";
                el.style.width = "100vw";
                el.style.height = "100vh";
                el.style.maxHeight = "100vh";
                el.style.borderRadius = "0";
            } else {
                el.style.width = width + "px";
                el.style.height = "";
                el.style.maxHeight = "65vh";
                el.style.borderRadius = "12px";
                if (moved && savedPos) {
                    el.style.left = savedPos.left;
                    el.style.top = savedPos.top;
                } else {
                    recenter();
                }
            }
        }

        function setOpen(open) {
            isOpen = open;
            if (open) {
                if (document.activeElement) document.activeElement.blur();
                el.style.pointerEvents = "auto";
                requestAnimationFrame(() => {
                    el.style.opacity = "1";
                    el.style.transform = "scale(1)";
                });
            } else {
                el.style.opacity = "0";
                el.style.transform = "scale(0.92)";
                el.style.pointerEvents = "none";
            }
        }

        const header = el.querySelector(`#${id}-header`);
        const fsIcon = el.querySelector(`#${id}-fullscreen`);
        const closeIcon = el.querySelector(`#${id}-close`);

        fsIcon.addEventListener("click", () => {
            isFullscreen = !isFullscreen;
            applyFullscreen();
        });
        closeIcon.addEventListener("click", () => setOpen(false));

        let dragging = false, dragStart = { x: 0, y: 0 }, startPos = { x: 0, y: 0 };
        header.addEventListener("pointerdown", (e) => {
            if (!state.moveMode || state.uiHidden || isFullscreen) return;
            if (e.target === fsIcon || e.target === closeIcon) return;
            dragStart = { x: e.clientX, y: e.clientY };
            const r = el.getBoundingClientRect();
            startPos = { x: r.left, y: r.top };
            dragging = true;
            moved = true;
            header.setPointerCapture(e.pointerId);
        });
        header.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            el.style.left = (startPos.x + dx) + "px";
            el.style.top = (startPos.y + dy) + "px";
        });
        ["pointerup", "pointercancel", "pointerleave"].forEach(evt =>
            header.addEventListener(evt, () => { dragging = false; })
        );

        return {
            el,
            content: el.querySelector(`#${id}-content`),
            open: () => setOpen(true),
            close: () => setOpen(false),
            toggle: () => setOpen(!isOpen),
            get isOpen() { return isOpen; },
            setMovable: (on) => header.classList.toggle("fleasio-movable", on),
            recenter,
        };
    }

    const btn = document.createElement("div");
    btn.id = "fleasio-btn";
    btn.textContent = "F";
    Object.assign(btn.style, {
        position: "fixed", top: "10px", right: "10px", zIndex: 2147483647,
        width: "40px", height: "40px", lineHeight: "40px", textAlign: "center",
        background: "linear-gradient(135deg, #6366f1, #ec4899)",
        color: "#fff", borderRadius: "50%", cursor: "pointer",
        fontSize: "18px", fontWeight: "bold", fontFamily: "sans-serif",
        userSelect: "none", touchAction: "none",
        boxShadow: "0 3px 10px rgba(0,0,0,0.45)",
        transition: "transform 0.15s, box-shadow 0.15s",
        animation: "fleasio-pop 0.35s ease",
    });

    btn.addEventListener("pointerdown", () => { btn.style.transform = "scale(0.88)"; });
    ["pointerup", "pointercancel", "pointerleave"].forEach(evt =>
        btn.addEventListener(evt, () => { btn.style.transform = "scale(1)"; })
    );

    const panel = document.createElement("div");
    panel.id = "fleasio-panel";
    Object.assign(panel.style, {
        position: "fixed", zIndex: 2147483647,
        width: "300px", maxHeight: "65vh", overflowY: "auto",
        background: "rgba(18,18,20,0.97)", color: "#eee",
        borderRadius: "12px", fontFamily: "sans-serif", fontSize: "13px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.08)",
        opacity: "0", transform: "scale(0.92) translateY(-10px)",
        transformOrigin: "top right", pointerEvents: "none",
        transition: "opacity 0.18s ease, transform 0.18s ease, width 0.18s ease, height 0.18s ease, border-radius 0.18s ease",
        touchAction: "pan-y", overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
    });

    panel.innerHTML = `
        <div id="fl-header" class="fleasio-header" style="display:flex;justify-content:space-between;align-items:center;
                    padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div>
                <div style="font-weight:bold;font-size:15px;">Fleasio</div>
                <div style="opacity:0.5;font-size:11px;">Asset Replacer</div>
            </div>
            <div>
                <span id="fl-settings-icon" title="Settings"
                    style="cursor:pointer;opacity:0.6;font-size:15px;margin-right:12px;">⚙</span>
                <span id="fl-fullscreen" title="Toggle fullscreen"
                    style="cursor:pointer;opacity:0.6;font-size:15px;margin-right:12px;">⛶</span>
                <span id="fl-close" style="cursor:pointer;opacity:0.6;font-size:16px;">✕</span>
            </div>
        </div>
        <div style="padding:14px;">
            <div style="font-weight:bold;margin-bottom:8px;opacity:0.8;">Replacements</div>
            <div style="opacity:0.45;font-size:11px;margin-bottom:6px;">Type "map:" + a name, or tap 🗺 to browse</div>
            <input id="fl-match" placeholder="Filename to replace (or map:...)"
                style="width:100%;padding:8px;box-sizing:border-box;
                       background:#222;border:1px solid #333;border-radius:6px;color:#eee;">
            <input id="fl-replacement" placeholder="Replacement link (or map:...)"
                style="width:100%;padding:8px;box-sizing:border-box;
                       background:#222;border:1px solid #333;border-radius:6px;color:#eee;">
            <div style="display:flex;gap:8px;margin-bottom:14px;">
                <button id="fl-add" style="flex:2;padding:8px;cursor:pointer;
                           background:#6366f1;border:none;border-radius:6px;color:#fff;font-weight:bold;
                           transition:transform 0.1s, background 0.15s;">
                    + Add
                </button>
                <button id="fl-reload" title="Reload the page to apply changes now"
                           style="flex:1;padding:8px;cursor:pointer;
                           background:#333;border:none;border-radius:6px;color:#fff;font-weight:bold;
                           transition:transform 0.1s, background 0.15s;">
                    ⟳ Reload
                </button>
            </div>
            <div id="fl-list"></div>
        </div>
    `;

    document.documentElement.appendChild(btn);
    document.documentElement.appendChild(panel);

    const panelHeader = panel.querySelector("#fl-header");

    const quickMenuOverlay = createOverlay({ id: "fleasio-quickmenu", subtitle: "Quick Toggles", width: 240 });
    quickMenuOverlay.content.appendChild(createToggle("Block Ads", state.adBlockEnabled, (val) => {
        state.adBlockEnabled = val;
        GM_setValue(config.ADBLOCK_KEY, val);
    }));
    quickMenuOverlay.recenter();

    const settingsOverlay = createOverlay({ id: "fleasio-settingsmenu", subtitle: "Settings", width: 260 });
    settingsOverlay.content.appendChild(createToggle("Move UI", state.moveMode, (val) => {
        state.moveMode = val;
        btn.style.boxShadow = val
            ? "0 0 0 3px #6366f1, 0 3px 10px rgba(0,0,0,0.45)"
            : "0 3px 10px rgba(0,0,0,0.45)";
        panelHeader.classList.toggle("fleasio-movable", val);
        quickMenuOverlay.setMovable(val);
        settingsOverlay.setMovable(val);
    }));
    settingsOverlay.content.appendChild(createToggle("Hide UI (until refresh)", false, (val) => {
        if (val) {
            state.uiHidden = true;
            btn.style.display = "none";
            panel.style.display = "none";
            quickMenuOverlay.el.style.display = "none";
            settingsOverlay.el.style.display = "none";
        }
    }));
    settingsOverlay.content.appendChild(createKeybindPicker(
        "Main Menu Shortcut",
        () => state.mainMenuKeybind,
        (code) => { state.mainMenuKeybind = code; GM_setValue(config.MAINMENU_KEY_STORAGE, code); }
    ));
    settingsOverlay.content.appendChild(createKeybindPicker(
        "Quick Menu Shortcut",
        () => state.quickMenuKeybind,
        (code) => { state.quickMenuKeybind = code; GM_setValue(config.QUICKMENU_KEY_STORAGE, code); }
    ));
    settingsOverlay.recenter();

    function closeOtherOverlays(except) {
        if (except !== "panel" && state.panelOpen) setPanelOpen(false);
        if (except !== "quick" && quickMenuOverlay.isOpen) quickMenuOverlay.close();
        if (except !== "settings" && settingsOverlay.isOpen) settingsOverlay.close();
    }

    function toggleQuickMenu() {
        if (state.uiHidden) return;
        if (!quickMenuOverlay.isOpen) closeOtherOverlays("quick");
        quickMenuOverlay.toggle();
    }

    panel.querySelector("#fl-settings-icon").addEventListener("click", () => {
        if (!settingsOverlay.isOpen) closeOtherOverlays("settings");
        settingsOverlay.toggle();
    });

    // Main Menu / Quick Menu keyboard shortcuts — both rebindable in Settings.
    // Never fire while focus is in a text field, since these keys (Right
    // Ctrl, Right Shift by default) are also normal modifier keys people use
    // while typing.
    window.addEventListener("keydown", (e) => {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
        if (isTyping) return;

        if (e.code === state.mainMenuKeybind) {
            e.preventDefault();
            setPanelOpen(!state.panelOpen);
            return;
        }
        if (e.code === state.quickMenuKeybind) {
            e.preventDefault();
            toggleQuickMenu();
        }
    });

    function attachAutocomplete(input, mode, dataFn) {
        const wrapper = document.createElement("div");
        Object.assign(wrapper.style, {
            position: "relative", display: "flex", gap: "6px",
            marginBottom: input.style.marginBottom || "6px",
        });
        input.style.marginBottom = "0";
        input.style.flex = "1";
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const triggerBtn = document.createElement("button");
        triggerBtn.type = "button";
        triggerBtn.textContent = "🗺";
        triggerBtn.title = "Browse maps";
        Object.assign(triggerBtn.style, {
            flex: "0 0 auto", width: "36px", padding: "0",
            background: "#2a2a2e", border: "1px solid #3a3a3e", borderRadius: "6px",
            color: "#eee", cursor: "pointer", fontSize: "14px",
        });
        wrapper.appendChild(triggerBtn);

        const dropdown = document.createElement("div");
        dropdown.className = "fleasio-autocomplete";
        Object.assign(dropdown.style, {
            position: "absolute", left: "0", right: "0", top: "100%",
            zIndex: 2147483647, background: "#1c1c1e", border: "1px solid #333",
            borderRadius: "8px", marginTop: "4px", maxHeight: "160px",
            overflowY: "auto", display: "none",
            boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
            touchAction: "pan-y", overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
        });
        wrapper.appendChild(dropdown);

        function hide() {
            dropdown.style.display = "none";
            dropdown.innerHTML = "";
        }

        function renderResults(matches) {
            dropdown.innerHTML = "";
            if (matches.length === 0) { hide(); return; }
            matches.forEach(m => {
                const item = document.createElement("div");
                Object.assign(item.style, {
                    padding: "8px 10px", cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                });
                item.innerHTML = `<div style="font-size:13px;">${m.name}</div>
                    <div style="font-size:10px;opacity:0.5;">${m.category}</div>`;
                item.addEventListener("pointerdown", (e) => e.preventDefault());
                item.addEventListener("click", () => {
                    input.value = mode === "match" ? m.url.split("/").pop() : m.url;
                    hide();
                });
                dropdown.appendChild(item);
            });
            dropdown.style.display = "block";
        }

        async function loadAndRender(filterTerm) {
            try {
                const flat = flattenMapsData(await dataFn());
                const matches = filterTerm
                    ? flat.filter(m => m.name.toLowerCase().includes(filterTerm))
                    : flat;
                renderResults(matches);
            } catch (e) {
                console.error("[Fleasio] Failed to load map list", e);
                hide();
            }
        }

        input.addEventListener("input", () => {
            const val = input.value;
            const idx = val.toLowerCase().indexOf("map:");
            if (idx === -1) { hide(); return; }
            const term = val.slice(idx + 4).trim().toLowerCase();
            if (!term) { hide(); return; }
            loadAndRender(term);
        });

        triggerBtn.addEventListener("click", () => {
            loadAndRender(null);
        });

        input.addEventListener("blur", () => setTimeout(hide, 150));
    }

    attachAutocomplete(panel.querySelector("#fl-match"), "match", getMapsData);
    attachAutocomplete(panel.querySelector("#fl-replacement"), "url", getFleasioMapsData);

    const addBtn = panel.querySelector("#fl-add");
    addBtn.addEventListener("pointerdown", () => { addBtn.style.transform = "scale(0.96)"; });
    ["pointerup", "pointercancel", "pointerleave"].forEach(evt =>
        addBtn.addEventListener(evt, () => { addBtn.style.transform = "scale(1)"; })
    );

    const reloadBtn = panel.querySelector("#fl-reload");
    reloadBtn.addEventListener("pointerdown", () => { reloadBtn.style.transform = "scale(0.96)"; });
    ["pointerup", "pointercancel", "pointerleave"].forEach(evt =>
        reloadBtn.addEventListener(evt, () => { reloadBtn.style.transform = "scale(1)"; })
    );
    reloadBtn.addEventListener("click", () => {
        window.location.reload();
    });

    let panelFullscreen = false;
    let panelMoved = false;

    function positionPanel() {
        const r = btn.getBoundingClientRect();
        let left = r.right - 300;
        if (left < 8) left = 8;
        let top = r.bottom + 8;
        if (top + 400 > window.innerHeight) top = Math.max(8, r.top - 8 - 400);
        panel.style.left = left + "px";
        panel.style.top = top + "px";
    }

    function applyFullscreenLayout() {
        if (panelFullscreen) {
            panel.style.left = "0";
            panel.style.top = "0";
            panel.style.width = "100vw";
            panel.style.height = "100vh";
            panel.style.maxHeight = "100vh";
            panel.style.borderRadius = "0";
        } else {
            panel.style.width = "300px";
            panel.style.height = "";
            panel.style.maxHeight = "65vh";
            panel.style.borderRadius = "12px";
            if (!panelMoved) positionPanel();
        }
    }

    panel.querySelector("#fl-fullscreen").addEventListener("click", () => {
        panelFullscreen = !panelFullscreen;
        applyFullscreenLayout();
    });

    function setPanelOpen(open) {
        state.panelOpen = open;
        if (open) {
            closeOtherOverlays("panel");
            if (document.activeElement) document.activeElement.blur();
            if (!panelFullscreen && !panelMoved) positionPanel();
            panel.style.pointerEvents = "auto";
            requestAnimationFrame(() => {
                panel.style.opacity = "1";
                panel.style.transform = "scale(1) translateY(0)";
            });
            renderList();
        } else {
            panel.style.opacity = "0";
            panel.style.transform = panelFullscreen ? "scale(1) translateY(0)" : "scale(0.92) translateY(-10px)";
            panel.style.pointerEvents = "none";
        }
    }

    panel.querySelector("#fl-close").addEventListener("click", () => setPanelOpen(false));

    // Drag-to-move the panel via its header, only while Move UI is on.
    let panelDragging = false, panelDragStart = { x: 0, y: 0 }, panelStartPos = { x: 0, y: 0 };
    panelHeader.addEventListener("pointerdown", (e) => {
        if (!state.moveMode || state.uiHidden || panelFullscreen) return;
        if (e.target.id === "fl-settings-icon" || e.target.id === "fl-fullscreen" || e.target.id === "fl-close") return;
        panelDragStart = { x: e.clientX, y: e.clientY };
        const r = panel.getBoundingClientRect();
        panelStartPos = { x: r.left, y: r.top };
        panelDragging = true;
        panelMoved = true;
        panelHeader.setPointerCapture(e.pointerId);
    });
    panelHeader.addEventListener("pointermove", (e) => {
        if (!panelDragging) return;
        const dx = e.clientX - panelDragStart.x;
        const dy = e.clientY - panelDragStart.y;
        panel.style.left = (panelStartPos.x + dx) + "px";
        panel.style.top = (panelStartPos.y + dy) + "px";
        panel.style.right = "auto";
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(evt =>
        panelHeader.addEventListener(evt, () => { panelDragging = false; })
    );

    function renderList() {
        const list = panel.querySelector("#fl-list");
        list.innerHTML = "";
        if (state.replacements.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No replacements yet.";
            empty.style.opacity = "0.4";
            list.appendChild(empty);
            return;
        }
        state.replacements.forEach((r, i) => {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: "6px", background: "rgba(255,255,255,0.05)",
                padding: "8px", borderRadius: "6px",
                transition: "opacity 0.15s ease, transform 0.15s ease",
            });
            row.innerHTML = `<span style="flex:1;margin-right:6px;overflow:hidden;
                text-overflow:ellipsis;white-space:nowrap;" title="${r.match}">${r.match}</span>`;
            const del = document.createElement("button");
            del.textContent = "✕";
            Object.assign(del.style, {
                cursor: "pointer", background: "none", border: "none", color: "#f66", fontSize: "14px",
            });
            del.addEventListener("click", () => {
                row.classList.add("fleasio-row-exit");
                setTimeout(() => {
                    state.replacements.splice(i, 1);
                    save();
                    renderList();
                }, 150);
            });
            row.appendChild(del);
            list.appendChild(row);
        });
    }

    panel.querySelector("#fl-add").addEventListener("click", () => {
        const match = panel.querySelector("#fl-match").value.trim();
        const replacement = panel.querySelector("#fl-replacement").value.trim();
        if (!match || !replacement) return;
        state.replacements.push({ match, replacement });
        save();
        panel.querySelector("#fl-match").value = "";
        panel.querySelector("#fl-replacement").value = "";
        renderList();
        const list = panel.querySelector("#fl-list");
        const last = list.lastElementChild;
        if (last) last.style.animation = "fleasio-row-in 0.2s ease";
    });

    function createToggle(label, initial, onChange) {
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "10px",
        });

        const text = document.createElement("span");
        text.textContent = label;

        const track = document.createElement("div");
        Object.assign(track.style, {
            width: "42px", height: "24px", borderRadius: "12px", position: "relative",
            cursor: "pointer", transition: "background 0.2s",
            background: initial ? "#6366f1" : "#444",
        });

        const knob = document.createElement("div");
        Object.assign(knob.style, {
            width: "18px", height: "18px", borderRadius: "50%", background: "#fff",
            position: "absolute", top: "3px", left: initial ? "21px" : "3px",
            transition: "left 0.2s",
        });

        track.appendChild(knob);
        let toggleState = initial;
        track.addEventListener("click", () => {
            toggleState = !toggleState;
            track.style.background = toggleState ? "#6366f1" : "#444";
            knob.style.left = toggleState ? "21px" : "3px";
            onChange(toggleState);
        });

        row.appendChild(text);
        row.appendChild(track);
        return row;
    }

    let dragging = false, dragStart = { x: 0, y: 0 }, startPos = { x: 0, y: 0 };
    let tapCount = 0;
    let tapTimer = null;
    const DOUBLE_TAP_DELAY = 280;

    btn.addEventListener("pointerdown", (e) => {
        if (state.uiHidden) return;
        dragStart = { x: e.clientX, y: e.clientY };
        const r = btn.getBoundingClientRect();
        startPos = { x: r.left, y: r.top };
        dragging = false;
        btn.setPointerCapture(e.pointerId);
    });

    btn.addEventListener("pointermove", (e) => {
        if (!state.moveMode || state.uiHidden) return;
        if (e.buttons === 0 && e.pointerType !== "touch") return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (!dragging && Math.hypot(dx, dy) > 6) dragging = true;
        if (dragging) {
            btn.style.left = (startPos.x + dx) + "px";
            btn.style.top = (startPos.y + dy) + "px";
            btn.style.right = "auto";
            if (state.panelOpen && !panelFullscreen && !panelMoved) positionPanel();
        }
    });

    btn.addEventListener("pointerup", (e) => {
        if (dragging) { dragging = false; return; }

        if (e.pointerType !== "touch") {
            setPanelOpen(!state.panelOpen);
            return;
        }

        tapCount++;
        if (tapCount === 1) {
            tapTimer = setTimeout(() => {
                setPanelOpen(!state.panelOpen);
                tapCount = 0;
            }, DOUBLE_TAP_DELAY);
        } else {
            clearTimeout(tapTimer);
            tapCount = 0;
            toggleQuickMenu();
        }
    });
}