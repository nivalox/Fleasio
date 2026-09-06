// ==UserScript==
// @name         Fleasio
// @namespace    fleasio-asset-replacer
// @version      1.3
// @match        https://veck.io/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/UI.js
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = "veck_replacements";
    const ADBLOCK_KEY = "veck_adblock";
    const MAPS_JSON_URL = "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assets/assetURLS/maps.json";
    const FLEASIO_MAPS_JSON_URL = "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assets/assetURLS/fleasionmaps.json";
    const AD_BLOCK_DOMAINS = ["doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com"];

    const state = {
        replacements: GM_getValue(STORAGE_KEY, []),
        adBlockEnabled: GM_getValue(ADBLOCK_KEY, false),
        moveMode: false,
        uiHidden: false,
        panelOpen: false,
    };

    function save() {
        GM_setValue(STORAGE_KEY, state.replacements);
    }

    function findReplacement(url) {
        const entry = state.replacements.find(r => url.includes(r.match));
        return entry ? entry.replacement : null;
    }

    function isAdRequest(url) {
        if (!state.adBlockEnabled) return false;
        return AD_BLOCK_DOMAINS.some(domain => url.includes(domain));
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

    function isInsideFleasioUI(target) {
        return !!(target && target.closest && target.closest('#fleasio-btn, #fleasio-panel'));
    }

    ['touchstart', 'touchmove', 'touchend'].forEach(evt => {
        window.addEventListener(evt, (e) => {
            if (isInsideFleasioUI(e.target)) {
                e.stopImmediatePropagation();
            }
        }, { capture: true, passive: true });
    });

    const realFetch = unsafeWindow.fetch.bind(unsafeWindow);
    unsafeWindow.fetch = async function (input, init) {
        const url = typeof input === "string" ? input : input.url;
        const method = (init && init.method) || (typeof input === "object" && input.method) || "GET";

        if (isAdRequest(url)) {
            console.log(`[Fleasio] Blocked ad request: ${url}`);
            return new Response(null, { status: 204, statusText: "No Content" });
        }

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

    const RealXHR = unsafeWindow.XMLHttpRequest;
    const realOpen = RealXHR.prototype.open;
    const realSend = RealXHR.prototype.send;

    RealXHR.prototype.open = function (method, url, ...rest) {
        this._interceptUrl = url;
        this._interceptMethod = method;
        return realOpen.call(this, method, url, ...rest);
    };

    RealXHR.prototype.send = function (...args) {
        if (this._interceptUrl && isAdRequest(this._interceptUrl)) {
            console.log(`[Fleasio] Blocked ad request (XHR): ${this._interceptUrl}`);
            const xhr = this;
            setTimeout(() => {
                Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
                Object.defineProperty(xhr, "status", { value: 204, configurable: true });
                Object.defineProperty(xhr, "response", { value: null, configurable: true });
                xhr.dispatchEvent(new Event("readystatechange"));
                xhr.dispatchEvent(new Event("load"));
                xhr.dispatchEvent(new Event("loadend"));
            }, 0);
            return;
        }

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

    const config = { STORAGE_KEY, ADBLOCK_KEY, MAPS_JSON_URL, FLEASIO_MAPS_JSON_URL };

    function init() {
        if (typeof buildFleasioUI !== "function") {
            console.error("[Fleasio] UI.js did not load — check the @require URL / network access.");
            return;
        }
        buildFleasioUI(state, config, save);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();