// ==UserScript==
// @name         Veck.io Asset Replacer
// @namespace    veck-asset-replacer
// @version      2.0
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
            console.log(`[AssetReplacer] Intercepted fetch: ${url}`);
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

        console.log(`[AssetReplacer] Intercepted XHR: ${this._interceptUrl}`);
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
        btn.textContent = "🎨";
        Object.assign(btn.style, {
            position: "fixed", top: "10px", right: "10px", zIndex: 999999,
            width: "36px", height: "36px", lineHeight: "36px", textAlign: "center",
            background: "rgba(20,20,20,0.85)", color: "#fff", borderRadius: "50%",
            cursor: "pointer", fontSize: "18px", userSelect: "none",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
        });

        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "fixed", top: "54px", right: "10px", zIndex: 999999,
            width: "300px", maxHeight: "60vh", overflowY: "auto",
            background: "rgba(20,20,20,0.95)", color: "#fff",
            borderRadius: "8px", padding: "12px", fontFamily: "sans-serif",
            fontSize: "13px", display: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
        });

        panel.innerHTML = `
            <div style="font-weight:bold;margin-bottom:8px;">Asset Replacer</div>
            <input id="ar-match" placeholder="Texture to replace (filename or URL part)"
                style="width:100%;margin-bottom:6px;padding:6px;box-sizing:border-box;">
            <input id="ar-replacement" placeholder="Replacement texture link"
                style="width:100%;margin-bottom:6px;padding:6px;box-sizing:border-box;">
            <button id="ar-add" style="width:100%;padding:6px;margin-bottom:10px;cursor:pointer;">Add</button>
            <div id="ar-list"></div>
        `;

        document.documentElement.appendChild(btn);
        document.documentElement.appendChild(panel);

        btn.addEventListener("click", () => {
            panel.style.display = panel.style.display === "none" ? "block" : "none";
            if (panel.style.display === "block") renderList();
        });

        function renderList() {
            const list = panel.querySelector("#ar-list");
            list.innerHTML = "";
            replacements.forEach((r, i) => {
                const row = document.createElement("div");
                Object.assign(row.style, {
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: "6px", background: "rgba(255,255,255,0.05)",
                    padding: "6px", borderRadius: "4px", wordBreak: "break-all",
                });
                row.innerHTML = `<span style="flex:1;margin-right:6px;">${r.match}</span>`;
                const del = document.createElement("button");
                del.textContent = "✕";
                Object.assign(del.style, { cursor: "pointer", background: "none", border: "none", color: "#f66" });
                del.addEventListener("click", () => {
                    replacements.splice(i, 1);
                    save();
                    renderList();
                });
                row.appendChild(del);
                list.appendChild(row);
            });
        }

        panel.querySelector("#ar-add").addEventListener("click", () => {
            const match = panel.querySelector("#ar-match").value.trim();
            const replacement = panel.querySelector("#ar-replacement").value.trim();
            if (!match || !replacement) return;
            replacements.push({ match, replacement });
            save();
            panel.querySelector("#ar-match").value = "";
            panel.querySelector("#ar-replacement").value = "";
            renderList();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildUI);
    } else {
        buildUI();
    }
})();
