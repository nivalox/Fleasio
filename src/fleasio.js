// ==UserScript==
// @name         Fleasio
// @namespace    fleasio-asset-replacer
// @version      2.2
// @match        https://veck.io/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @connect      *
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/UI.js?v=2.2
// @resource     fleasioCSS https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/style.css?v=2.2
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = "veck_replacements";
    const ADBLOCK_KEY = "veck_adblock";
    const MAINMENU_KEY_STORAGE = "veck_mainmenu_key";
    const QUICKMENU_KEY_STORAGE = "veck_quickmenu_key";
    const SETTINGSMENU_KEY_STORAGE = "veck_settingsmenu_key";
    const POSITIONS_KEY = "veck_positions";
    const STATS_ENABLED_KEY = "veck_stats_enabled";
    const STATS_MODE_KEY = "veck_stats_mode";
    const SENSITIVITY_ENABLED_KEY = "veck_sensitivity_enabled";
    const SENSITIVITY_MULT_KEY = "veck_sensitivity_mult";
    const MAPS_JSON_URL = "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assets/assetURLS/maps.json";
    const FLEASIO_MAPS_JSON_URL = "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assets/assetURLS/fleasionmaps.json";
    const AD_BANNER_SELECTOR = '.banner-container[id^="banner_"]';

    const state = {
        replacements: GM_getValue(STORAGE_KEY, []),
        adBlockEnabled: GM_getValue(ADBLOCK_KEY, true),
        mainMenuKeybind: GM_getValue(MAINMENU_KEY_STORAGE, "ShiftRight"),
        quickMenuKeybind: GM_getValue(QUICKMENU_KEY_STORAGE, "ControlRight"),
        settingsMenuKeybind: GM_getValue(SETTINGSMENU_KEY_STORAGE, null),
        positions: GM_getValue(POSITIONS_KEY, {}),
        statsEnabled: GM_getValue(STATS_ENABLED_KEY, false),
        statsMode: GM_getValue(STATS_MODE_KEY, "ping"),
        sensitivityEnabled: GM_getValue(SENSITIVITY_ENABLED_KEY, false),
        sensitivityMultiplier: GM_getValue(SENSITIVITY_MULT_KEY, 1),
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
    //     window, but registered later — actually gets the event. ---
    function isInsideFleasioUI(target) {
        return !!(target && target.closest && target.closest('#fleasio-btn, #fleasio-panel, #fleasio-quickmenu, #fleasio-settingsmenu, #fleasio-stats'));
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

    // --- Game Sensitivity (mobile only, experimental) ---
    // The game has no touch-sensitivity setting of its own. This rescales
    // touch movement deltas on the canvas before the game's input handling
    // sees them, by suppressing the real touchmove and dispatching a
    // synthetic one with a scaled position instead. This only affects the
    // ORIGIN of touch data the game receives — whether it changes the
    // camera feel depends on how the game's Unity build actually reads
    // touch input internally, which isn't something a userscript can see
    // into ahead of time. Tracks each touch identifier independently, but
    // is only built out for a single actively-dragged touch; a second
    // simultaneous touch (e.g. a virtual joystick held with the other
    // thumb) is tracked too but hasn't been tested for interference.
    const sensitivityTouchTracker = {};

    function getGameCanvas() {
        return document.querySelector('canvas');
    }

    window.addEventListener('touchstart', (e) => {
        if (!state.sensitivityEnabled || state.sensitivityMultiplier === 1) return;
        if (isInsideFleasioUI(e.target)) return;
        for (const touch of e.changedTouches) {
            sensitivityTouchTracker[touch.identifier] = {
                lastRealX: touch.clientX, lastRealY: touch.clientY,
                virtualX: touch.clientX, virtualY: touch.clientY,
            };
        }
    }, { capture: true, passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!state.sensitivityEnabled || state.sensitivityMultiplier === 1) return;
        if (isInsideFleasioUI(e.target)) return;
        const canvas = getGameCanvas();
        if (!canvas || !canvas.contains(e.target)) return;
        if (typeof Touch !== "function") return; // Touch() constructor unsupported

        let modified = false;
        const allTouches = [];

        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const id = touch.identifier;
            let tracked = sensitivityTouchTracker[id];
            if (!tracked) {
                tracked = { lastRealX: touch.clientX, lastRealY: touch.clientY, virtualX: touch.clientX, virtualY: touch.clientY };
                sensitivityTouchTracker[id] = tracked;
            }
            const dx = touch.clientX - tracked.lastRealX;
            const dy = touch.clientY - tracked.lastRealY;
            if (dx !== 0 || dy !== 0) modified = true;
            tracked.virtualX += dx * state.sensitivityMultiplier;
            tracked.virtualY += dy * state.sensitivityMultiplier;
            tracked.lastRealX = touch.clientX;
            tracked.lastRealY = touch.clientY;

            allTouches.push(new Touch({
                identifier: id,
                target: touch.target,
                clientX: tracked.virtualX,
                clientY: tracked.virtualY,
                screenX: touch.screenX + (tracked.virtualX - touch.clientX),
                screenY: touch.screenY + (tracked.virtualY - touch.clientY),
                pageX: touch.pageX + (tracked.virtualX - touch.clientX),
                pageY: touch.pageY + (tracked.virtualY - touch.clientY),
                radiusX: touch.radiusX, radiusY: touch.radiusY,
                rotationAngle: touch.rotationAngle, force: touch.force,
            }));
        }

        if (!modified) return;

        e.stopImmediatePropagation();
        e.preventDefault();

        try {
            const synthetic = new TouchEvent('touchmove', {
                touches: allTouches,
                targetTouches: allTouches,
                changedTouches: allTouches,
                bubbles: true,
                cancelable: true,
            });
            e.target.dispatchEvent(synthetic);
        } catch (err) {
            console.error("[Fleasio] Failed to dispatch synthetic touch event", err);
        }
    }, { capture: true, passive: false });

    window.addEventListener('touchend', (e) => {
        for (const touch of e.changedTouches) {
            delete sensitivityTouchTracker[touch.identifier];
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
        SETTINGSMENU_KEY_STORAGE, POSITIONS_KEY, STATS_ENABLED_KEY, STATS_MODE_KEY,
        SENSITIVITY_ENABLED_KEY, SENSITIVITY_MULT_KEY, MAPS_JSON_URL, FLEASIO_MAPS_JSON_URL,
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
