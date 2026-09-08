// ==UserScript==
// @name         Fleasio
// @namespace    fleasio-asset-replacer
// @version      1.9
// @match        https://veck.io/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @connect      *
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/UI.js?v=1.9
// @resource     fleasioCSS https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/style.css?v=1.9
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = "veck_replacements";
    const ADBLOCK_KEY = "veck_adblock";
    const MAINMENU_KEY_STORAGE = "veck_mainmenu_key";
    const QUICKMENU_KEY_STORAGE = "veck_quickmenu_key";
    const SETTINGSMENU_KEY_STORAGE = "veck_settingsmenu_key";
    const POSITIONS_KEY = "veck_positions";
    const MAPS_JSON_URL = "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assets/assetURLS/maps.json";
    const FLEASIO_MAPS_JSON_URL = "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assets/assetURLS/fleasionmaps.json";
    const AD_BANNER_SELECTOR = '.banner-container[id^="banner_"]';

    const state = {
        replacements: GM_getValue(STORAGE_KEY, []),
        adBlockEnabled: GM_getValue(ADBLOCK_KEY, false),
        mainMenuKeybind: GM_getValue(MAINMENU_KEY_STORAGE, "ShiftRight"),
        quickMenuKeybind: GM_getValue(QUICKMENU_KEY_STORAGE, "ControlRight"),
        settingsMenuKeybind: GM_getValue(SETTINGSMENU_KEY_STORAGE, null),
        positions: GM_getValue(POSITIONS_KEY, {}),
        moveMode: false,
        uiHidden: false,
        panelOpen: false,
        capturingKeybind: false,
    };

    function save() {
        GM_setValue(STORAGE_KEY, state.replacements);
    }

    function findReplacement(url) {
        const entry = state.replacements.find(r => url.includes(r.match));
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

    // --- Ad banner removal (DOM-based) ---
    function removeAdBanners() {
        if (!state.adBlockEnabled) return;
        document.querySelectorAll(AD_BANNER_SELECTOR).forEach(el => {
            console.log(`[Fleasio] Removed ad banner: #${el.id}`);
            el.remove();
        });
    }

    removeAdBanners();
    new MutationObserver(() => removeAdBanners())
        .observe(document.documentElement, { childList: true, subtree: true });

    // --- Stop the game's global input-blocking (touch, keyboard, wheel)
    //     from reaching our UI. Registered on window (outermost) in the
    //     capture phase so it always runs before listeners the game attaches
    //     to document/canvas, no matter when it attaches them.
    //
    //     Exception: while state.capturingKeybind is true (the user is
    //     actively pressing a key to rebind a shortcut in Settings), this
    //     shield stands down so that capture-phase listener — also on
    //     window, but registered later — actually gets the event. Without
    //     this, the shield firing first and calling stopImmediatePropagation
    //     would silently swallow every key the rebind picker tries to read. ---
    function isInsideFleasioUI(target) {
        return !!(target && target.closest && target.closest('#fleasio-btn, #fleasio-panel, #fleasio-quickmenu, #fleasio-settingsmenu, #fleasio-ping'));
    }

    ['touchstart', 'touchmove', 'touchend'].forEach(evt => {
        window.addEventListener(evt, (e) => {
            if (isInsideFleasioUI(e.target)) {
                e.stopImmediatePropagation();
            }
        }, { capture: true, passive: true });
    });

    ['keydown', 'keypress', 'keyup'].forEach(evt => {
        window.addEventListener(evt, (e) => {
            if (state.capturingKeybind) return;
            if (isInsideFleasioUI(e.target)) {
                e.stopImmediatePropagation();
            }
        }, { capture: true });
    });

    window.addEventListener('wheel', (e) => {
        if (isInsideFleasioUI(e.target)) {
            e.stopImmediatePropagation();
        }
    }, { capture: true, passive: true });

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

    const config = {
        STORAGE_KEY, ADBLOCK_KEY, MAINMENU_KEY_STORAGE, QUICKMENU_KEY_STORAGE,
        SETTINGSMENU_KEY_STORAGE, POSITIONS_KEY, MAPS_JSON_URL, FLEASIO_MAPS_JSON_URL,
    };

    function init() {
        if (typeof buildFleasioUI !== "function") {
            console.error("[Fleasio] UI.js did not load — check the @require URL / network access.");
            return;
        }
        try {
            if (typeof GM_addStyle === "function" && typeof GM_getResourceText === "function") {
                GM_addStyle(GM_getResourceText("fleasioCSS"));
            } else {
                console.error("[Fleasio] GM_addStyle/GM_getResourceText unavailable — style.css not applied.");
            }
        } catch (e) {
            console.error("[Fleasio] Failed to load style.css", e);
        }
        buildFleasioUI(state, config, save);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
