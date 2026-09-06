// Fleasio UI module — loaded via @require by the main Fleasio userscript.
// Defines buildFleasioUI(state, config, save). `state` is shared by reference
// with the main script's network-patching logic, so changes made here
// (adding a replacement, flipping ad-block, etc.) are seen there immediately.

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

    const style = document.createElement("style");
    style.textContent = `
        @keyframes fleasio-pop {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fleasio-row-in {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .fleasio-row-exit {
            opacity: 0 !important;
            transform: translateX(20px) !important;
        }
    `;
    document.head.appendChild(style);

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
        transition: "opacity 0.18s ease, transform 0.18s ease",
        touchAction: "pan-y", overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
    });

    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div>
                <div style="font-weight:bold;font-size:15px;">Fleasio</div>
                <div style="opacity:0.5;font-size:11px;">Asset Replacer</div>
            </div>
            <span id="fl-close" style="cursor:pointer;opacity:0.6;font-size:16px;">✕</span>
        </div>
        <div style="padding:14px;">
            <div style="font-weight:bold;margin-bottom:8px;opacity:0.8;">Replacements</div>
            <div style="opacity:0.45;font-size:11px;margin-bottom:6px;">Type "map:" + a name for autocomplete</div>
            <input id="fl-match" placeholder="Filename to replace (or map:...)"
                style="width:100%;margin-bottom:6px;padding:8px;box-sizing:border-box;
                       background:#222;border:1px solid #333;border-radius:6px;color:#eee;">
            <input id="fl-replacement" placeholder="Replacement link (or map:...)"
                style="width:100%;margin-bottom:8px;padding:8px;box-sizing:border-box;
                       background:#222;border:1px solid #333;border-radius:6px;color:#eee;">
            <button id="fl-add" style="width:100%;padding:8px;margin-bottom:14px;cursor:pointer;
                       background:#6366f1;border:none;border-radius:6px;color:#fff;font-weight:bold;
                       transition:transform 0.1s, background 0.15s;">
                + Add
            </button>
            <div id="fl-list"></div>
            <div style="border-top:1px solid rgba(255,255,255,0.08);margin:14px 0;"></div>
            <div style="font-weight:bold;margin-bottom:10px;opacity:0.8;">Settings</div>
            <div id="fl-settings"></div>
        </div>
    `;

    document.documentElement.appendChild(btn);
    document.documentElement.appendChild(panel);

    function attachAutocomplete(input, mode, dataFn) {
        const wrapper = document.createElement("div");
        wrapper.style.position = "relative";
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

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
            matches.slice(0, 8).forEach(m => {
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

        input.addEventListener("input", async () => {
            const val = input.value;
            const idx = val.toLowerCase().indexOf("map:");
            if (idx === -1) { hide(); return; }
            const term = val.slice(idx + 4).trim().toLowerCase();
            if (!term) { hide(); return; }
            try {
                const flat = flattenMapsData(await dataFn());
                renderResults(flat.filter(m => m.name.toLowerCase().includes(term)));
            } catch (e) {
                console.error("[Fleasio] Failed to load map list", e);
                hide();
            }
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

    function positionPanel() {
        const r = btn.getBoundingClientRect();
        let left = r.right - 300;
        if (left < 8) left = 8;
        let top = r.bottom + 8;
        if (top + 400 > window.innerHeight) top = Math.max(8, r.top - 8 - 400);
        panel.style.left = left + "px";
        panel.style.top = top + "px";
    }

    function setPanelOpen(open) {
        state.panelOpen = open;
        if (open) {
            positionPanel();
            panel.style.pointerEvents = "auto";
            requestAnimationFrame(() => {
                panel.style.opacity = "1";
                panel.style.transform = "scale(1) translateY(0)";
            });
            renderList();
        } else {
            panel.style.opacity = "0";
            panel.style.transform = "scale(0.92) translateY(-10px)";
            panel.style.pointerEvents = "none";
        }
    }

    panel.querySelector("#fl-close").addEventListener("click", () => setPanelOpen(false));

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

    const settings = panel.querySelector("#fl-settings");

    settings.appendChild(createToggle("Move UI", state.moveMode, (val) => {
        state.moveMode = val;
        btn.style.boxShadow = val
            ? "0 0 0 3px #6366f1, 0 3px 10px rgba(0,0,0,0.45)"
            : "0 3px 10px rgba(0,0,0,0.45)";
    }));

    settings.appendChild(createToggle("Block Google Ads", state.adBlockEnabled, (val) => {
        state.adBlockEnabled = val;
        GM_setValue(config.ADBLOCK_KEY, val);
    }));

    settings.appendChild(createToggle("Hide UI (until refresh)", false, (val) => {
        if (val) {
            state.uiHidden = true;
            btn.style.display = "none";
            panel.style.display = "none";
        }
    }));

    let dragging = false, dragStart = { x: 0, y: 0 }, startPos = { x: 0, y: 0 };

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
            if (state.panelOpen) positionPanel();
        }
    });

    btn.addEventListener("pointerup", () => {
        if (!dragging) setPanelOpen(!state.panelOpen);
        dragging = false;
    });
}