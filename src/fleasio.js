// ==UserScript==
// @name         Fleasio
// @namespace    fleasio-asset-replacer
// @version      3.0
// @match        https://veck.io/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = "veck_replacements";
    let replacements = GM_getValue(STORAGE_KEY, []); // [{match, replacement}, ...]
    let moveMode = false;
    let uiHidden = false;

    function save() {
        GM_setValue(STORAGE_KEY, replacements);
    }

    function findReplacement(url) {
        const entry = replacements.find(r => url.includes(r.match));
        return entry ? entry.replacement : null;
    }

    function fetchLocal(localUrl) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: localUrl,
                responseType: "arraybuffer",
                onload: (res) => resolve(res.response),
                onerror: reject,
            });
        });
    }

    // --- Patch fetch ---
    const realFetch = unsafeWindow.fetch.bind(unsafeWindow);
    unsafeWindow.fetch = async function (input, init) {
        const url = typeof input === "string" ? input : input.url;
        const method = (init && init.method) || (typeof input === "object" && input.method) || "GET";
        const localUrl = findReplacement(url);

        if (localUrl) {
            console.log(`[Fleasio] Intercepted fetch: ${url}`);
            const buf = await fetchLocal(localUrl);
            const body = method.toUpperCase() === "HEAD" ? null : buf;
            return new Response(body, {
                status: 200,
                statusText: "OK",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Length": String(buf.byteLength),
                },
            });
        }

        return realFetch(input, init);
    };

    // --- Patch XMLHttpRequest ---
    const RealXHR = unsafeWindow.XMLHttpRequest;
    const realOpen = RealXHR.prototype.open;
    const realSend = RealXHR.prototype.send;

    RealXHR.prototype.open = function (method, url, ...rest) {
        this._interceptUrl = url;
        this._interceptMethod = method;
        return realOpen.call(this, method, url, ...rest);
    };

    RealXHR.prototype.send = function (...args) {
        const localUrl = this._interceptUrl && findReplacement(this._interceptUrl);
        if (!localUrl) return realSend.apply(this, args);

        console.log(`[Fleasio] Intercepted XHR: ${this._interceptUrl}`);
        const xhr = this;

        GM_xmlhttpRequest({
            method: "GET",
            url: localUrl,
            responseType: "arraybuffer",
            onload: (res) => {
                const buf = res.response;
                const isHead = xhr._interceptMethod && xhr._interceptMethod.toUpperCase() === "HEAD";

                Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
                Object.defineProperty(xhr, "status", { value: 200, configurable: true });
                Object.defineProperty(xhr, "statusText", { value: "OK", configurable: true });
                Object.defineProperty(xhr, "response", { value: isHead ? null : buf, configurable: true });
                Object.defineProperty(xhr, "responseURL", { value: xhr._interceptUrl, configurable: true });

                xhr.getAllResponseHeaders = () =>
                    `content-type: application/octet-stream\r\ncontent-length: ${buf.byteLength}\r\n`;
                xhr.getResponseHeader = (name) =>
                    name.toLowerCase() === "content-length" ? String(buf.byteLength) : null;

                xhr.dispatchEvent(new Event("readystatechange"));
                xhr.dispatchEvent(new Event("load"));
                xhr.dispatchEvent(new Event("loadend"));
            },
            onerror: () => xhr.dispatchEvent(new Event("error")),
        });
    };

    // --- UI ---
    function buildUI() {
        const btn = document.createElement("div");
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
        });

        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "fixed", zIndex: 2147483647,
            width: "300px", maxHeight: "65vh", overflowY: "auto",
            background: "rgba(18,18,20,0.97)", color: "#eee",
            borderRadius: "12px", fontFamily: "sans-serif", fontSize: "13px",
            display: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.08)",
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
                <input id="fl-match" placeholder="Filename to replace"
                    style="width:100%;margin-bottom:6px;padding:8px;box-sizing:border-box;
                           background:#222;border:1px solid #333;border-radius:6px;color:#eee;">
                <input id="fl-replacement" placeholder="Replacement link"
                    style="width:100%;margin-bottom:8px;padding:8px;box-sizing:border-box;
                           background:#222;border:1px solid #333;border-radius:6px;color:#eee;">
                <button id="fl-add" style="width:100%;padding:8px;margin-bottom:14px;cursor:pointer;
                           background:#6366f1;border:none;border-radius:6px;color:#fff;font-weight:bold;">
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

        function positionPanel() {
            const r = btn.getBoundingClientRect();
            let left = r.right - 300;
            if (left < 8) left = 8;
            let top = r.bottom + 8;
            if (top + 400 > window.innerHeight) top = Math.max(8, r.top - 8 - 400);
            panel.style.left = left + "px";
            panel.style.top = top + "px";
        }

        function togglePanel() {
            const opening = panel.style.display === "none";
            if (opening) positionPanel();
            panel.style.display = opening ? "block" : "none";
            if (opening) renderList();
        }

        panel.querySelector("#fl-close").addEventListener("click", () => {
            panel.style.display = "none";
        });

        function renderList() {
            const list = panel.querySelector("#fl-list");
            list.innerHTML = "";
            if (replacements.length === 0) {
                const empty = document.createElement("div");
                empty.textContent = "No replacements yet.";
                empty.style.opacity = "0.4";
                list.appendChild(empty);
            }
            replacements.forEach((r, i) => {
                const row = document.createElement("div");
                Object.assign(row.style, {
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: "6px", background: "rgba(255,255,255,0.05)",
                    padding: "8px", borderRadius: "6px",
                });
                row.innerHTML = `<span style="flex:1;margin-right:6px;overflow:hidden;
                    text-overflow:ellipsis;white-space:nowrap;" title="${r.match}">${r.match}</span>`;
                const del = document.createElement("button");
                del.textContent = "✕";
                Object.assign(del.style, {
                    cursor: "pointer", background: "none", border: "none", color: "#f66", fontSize: "14px",
                });
                del.addEventListener("click", () => {
                    replacements.splice(i, 1);
                    save();
                    renderList();
                });
                row.appendChild(del);
                list.appendChild(row);
            });
        }

        panel.querySelector("#fl-add").addEventListener("click", () => {
            const match = panel.querySelector("#fl-match").value.trim();
            const replacement = panel.querySelector("#fl-replacement").value.trim();
            if (!match || !replacement) return;
            replacements.push({ match, replacement });
            save();
            panel.querySelector("#fl-match").value = "";
            panel.querySelector("#fl-replacement").value = "";
            renderList();
        });

        // --- Toggle switch helper ---
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
            let state = initial;
            track.addEventListener("click", () => {
                state = !state;
                track.style.background = state ? "#6366f1" : "#444";
                knob.style.left = state ? "21px" : "3px";
                onChange(state);
            });

            row.appendChild(text);
            row.appendChild(track);
            return row;
        }

        const settings = panel.querySelector("#fl-settings");

        settings.appendChild(createToggle("Move UI", moveMode, (state) => {
            moveMode = state;
            btn.style.boxShadow = state
                ? "0 0 0 3px #6366f1, 0 3px 10px rgba(0,0,0,0.45)"
                : "0 3px 10px rgba(0,0,0,0.45)";
        }));

        settings.appendChild(createToggle("Hide UI (until refresh)", false, (state) => {
            if (state) {
                uiHidden = true;
                btn.style.display = "none";
                panel.style.display = "none";
            }
        }));

        // --- Drag-to-move logic ---
        let dragging = false, dragStart = { x: 0, y: 0 }, startPos = { x: 0, y: 0 };

        btn.addEventListener("pointerdown", (e) => {
            if (uiHidden) return;
            dragStart = { x: e.clientX, y: e.clientY };
            const r = btn.getBoundingClientRect();
            startPos = { x: r.left, y: r.top };
            dragging = false;
            btn.setPointerCapture(e.pointerId);
        });

        btn.addEventListener("pointermove", (e) => {
            if (!moveMode || uiHidden) return;
            if (e.buttons === 0 && e.pointerType !== "touch") return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            if (!dragging && Math.hypot(dx, dy) > 6) dragging = true;
            if (dragging) {
                btn.style.left = (startPos.x + dx) + "px";
                btn.style.top = (startPos.y + dy) + "px";
                btn.style.right = "auto";
                if (panel.style.display === "block") positionPanel();
            }
        });

        btn.addEventListener("pointerup", () => {
            if (!dragging) togglePanel();
            dragging = false;
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildUI);
    } else {
        buildUI();
    }
})();
