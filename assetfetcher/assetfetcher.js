// ==UserScript==
// @name         AssetFetcher
// @namespace    assetfetcher-veck
// @version      1.2
// @description  Watches veck.io's network traffic for maps, skins, backs, hats and faces, and lets you copy their names / URLs.
// @match        https://veck.io/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_setClipboard
// @grant        GM_info
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/utils.js?v=4.0
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/input-shield.js?v=4.0
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/keybinds.js?v=4.0
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/maps.js?v=4.0
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/ui/components.js?v=4.0
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/ui/shell.js?v=4.0
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assetfetcher/modules/capture.js?v=1.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assetfetcher/modules/identify.js?v=1.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assetfetcher/modules/clipboard.js?v=1.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assetfetcher/ui/UI.js?v=1.2
// @resource     fleasioCSS https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/css/style.css?v=4.0
// @resource     assetfetcherCSS https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assetfetcher/css/assetfetcher.css?v=1.2
// ==/UserScript==

// AssetFetcher entry point. Part of the Fleasio repo: it reuses Fleasio's
// shared helpers and UI (src/modules/utils.js, input-shield.js, keybinds.js,
// maps.js, src/ui/components.js, shell.js, src/css/style.css) and adds its own
// capture logic, list UI and styling under assetfetcher/.
// @require'd files share this script's scope, hence the "fleasio*" /
// "assetfetcher*" function names.

(function () {
    'use strict';

    const RAW = "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/";

    const config = {
        CAPTURED_KEY: "assetfetcher_captured",
        FILTER_KEY: "assetfetcher_filter",   // custom words
        TYPES_KEY: "assetfetcher_types",     // which asset types to detect
        POSITIONS_KEY: "assetfetcher_positions",
        MAINMENU_KEY_STORAGE: "assetfetcher_mainmenu_key",
        QUICKMENU_KEY_STORAGE: "assetfetcher_quickmenu_key", // unused, but the shared state loader reads it
        SETTINGSMENU_KEY_STORAGE: "assetfetcher_settingsmenu_key",
        ICON_OPACITY_KEY: "assetfetcher_icon_opacity",
        ICON_SIZE_KEY: "assetfetcher_icon_size",
        PANEL_HEIGHT_KEY: "assetfetcher_panel_height",
        SIZES_KEY: "assetfetcher_sizes",
        NO_ANIM_KEY: "assetfetcher_no_animations",
        DEFAULT_ICON_OPACITY: 100,
        DEFAULT_ICON_SIZE: 40,
        DEFAULT_PANEL_HEIGHT: 70,
        DEFAULT_MAINMENU_KEY: "Backslash", // Fleasio uses Right Shift / Right Ctrl, so they never clash
        DEFAULT_QUICKMENU_KEY: null,
        MAX_CAPTURED: 300,
        MAPS_JSON_URL: RAW + "assets/assetURLS/maps.json",
        FLEASIO_MAPS_JSON_URL: RAW + "assets/assetURLS/fleasiomaps.json",
    };

    function loadCaptured() {
        const saved = GM_getValue(config.CAPTURED_KEY, []);
        return Array.isArray(saved)
            ? saved.filter(e => e && typeof e.url === "string" && typeof e.name === "string")
            : [];
    }

    // Custom words. (Older versions stored their one "remote_scene" word here;
    // maps are now a built-in type, so that old default is dropped.)
    function loadCustomWords() {
        const saved = String(GM_getValue(config.FILTER_KEY, "") || "").trim();
        return saved.toLowerCase() === "remote_scene" ? "" : saved;
    }

    const state = Object.assign(fleasioLoadCommonState(config), {
        captured: loadCaptured(),
        types: assetfetcherNormalizeTypes(GM_getValue(config.TYPES_KEY, null)),
        filter: loadCustomWords(),
    });

    // --- Must start immediately (document-start), or early loads are missed ---
    fleasioInitInputShield(state);
    const capture = assetfetcherInitCapture(state, config);

    // --- UI, once the DOM exists ---
    function init() {
        const missing = [];
        if (typeof fleasioCreateMapsLoader !== "function") missing.push("src/modules/maps.js");
        if (typeof fleasioInitKeybinds !== "function") missing.push("src/modules/keybinds.js");
        if (typeof fleasioCreateOverlay !== "function") missing.push("src/ui/components.js");
        if (typeof fleasioCreateFab !== "function") missing.push("src/ui/shell.js");
        if (typeof assetfetcherBuildIdentifier !== "function") missing.push("assetfetcher/modules/identify.js");
        if (typeof assetfetcherCopy !== "function") missing.push("assetfetcher/modules/clipboard.js");
        if (typeof buildAssetFetcherUI !== "function") missing.push("assetfetcher/ui/UI.js");
        if (missing.length) {
            console.error("[AssetFetcher] Failed to load: " + missing.join(", ") + ". Check the @require URLs / network access.");
            return;
        }
        try {
            GM_addStyle(GM_getResourceText("fleasioCSS"));
            GM_addStyle(GM_getResourceText("assetfetcherCSS"));
        } catch (e) {
            console.error("[AssetFetcher] Failed to load stylesheets", e);
        }
        buildAssetFetcherUI(state, config, capture, fleasioCreateMapsLoader(config));
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
