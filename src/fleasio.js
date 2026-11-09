// ==UserScript==
// @name         Fleasio
// @namespace    fleasio-asset-replacer
// @version      4.2
// @match        https://veck.io/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_info
// @grant        unsafeWindow
// @connect      *
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/utils.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/adblock.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/input-shield.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/localfiles.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/network.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/maps.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/keybinds.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/stats.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/keystrokes.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/modules/fps.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/ui/components.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/ui/shell.js?v=4.2
// @require      https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/ui/UI.js?v=4.2
// @resource     fleasioCSS https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/src/css/style.css?v=4.2
// ==/UserScript==

// Fleasio entry point. Everything else lives in the @require'd files:
//   src/modules/*: features (asset replacement, ad block, stats, keystrokes, FPS limiter, ...)
//   src/ui/*: interface (UI.js builds it from components.js + shell.js)
//   src/css/*: styling
// @require'd files share this script's scope, hence the "fleasio*" names.

(function () {
    'use strict';

    const config = {
        STORAGE_KEY: "veck_replacements",
        ADBLOCK_KEY: "veck_adblock",
        MAINMENU_KEY_STORAGE: "veck_mainmenu_key",
        QUICKMENU_KEY_STORAGE: "veck_quickmenu_key",
        SETTINGSMENU_KEY_STORAGE: "veck_settingsmenu_key",
        POSITIONS_KEY: "veck_positions",
        STATS_ENABLED_KEY: "veck_stats_enabled",
        STATS_MODE_KEY: "veck_stats_mode",
        FPS_ENABLED_KEY: "veck_fps_enabled",
        FPS_TARGET_KEY: "veck_fps_target",
        KEYS_ENABLED_KEY: "veck_keys_enabled",
        KEYS_SCALE_KEY: "veck_keys_scale",
        KEYS_RAINBOW_KEY: "veck_keys_rainbow",
        DEFAULT_FPS_TARGET: 144,
        ICON_OPACITY_KEY: "veck_icon_opacity",
        ICON_SIZE_KEY: "veck_icon_size",
        SIZES_KEY: "veck_sizes",
        NO_ANIM_KEY: "veck_no_animations",
        PANEL_HEIGHT_KEY: "veck_panel_height",
        DEFAULT_ICON_OPACITY: 100,
        DEFAULT_ICON_SIZE: 40,
        DEFAULT_PANEL_HEIGHT: 70,
        DEFAULT_MAINMENU_KEY: "ShiftRight",
        DEFAULT_QUICKMENU_KEY: "ControlRight",
        MAPS_JSON_URL: "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assets/assetURLS/maps.json",
        FLEASIO_MAPS_JSON_URL: "https://raw.githubusercontent.com/nivalox/Fleasio/refs/heads/main/assets/assetURLS/fleasiomaps.json",
    };

    const state = Object.assign(fleasioLoadCommonState(config), {
        replacements: GM_getValue(config.STORAGE_KEY, []),
        adBlockEnabled: GM_getValue(config.ADBLOCK_KEY, true),
        statsEnabled: GM_getValue(config.STATS_ENABLED_KEY, false),
        statsMode: GM_getValue(config.STATS_MODE_KEY, "ping"),
        fpsEnabled: !!GM_getValue(config.FPS_ENABLED_KEY, false),
        fpsTarget: fleasioStoredNumber(config.FPS_TARGET_KEY, config.DEFAULT_FPS_TARGET, 0, 1000), // 0 = unlimited
        keysEnabled: !!GM_getValue(config.KEYS_ENABLED_KEY, false),
        keysScale: fleasioStoredNumber(config.KEYS_SCALE_KEY, 100, 50, 300),
        keysRainbow: !!GM_getValue(config.KEYS_RAINBOW_KEY, false),
    });

    function save() {
        GM_setValue(config.STORAGE_KEY, state.replacements);
    }

    // --- Features that must start immediately (document-start) ---
    const adblock = fleasioInitAdBlock(state);
    fleasioInitInputShield(state);
    fleasioInitNetwork(state);
    const fps = fleasioInitFps(state); // wraps requestAnimationFrame before the game starts its loop

    // --- UI, once the DOM exists ---
    function init() {
        // typeof on an undeclared name is safe, so a failed @require is reported
        // by name instead of throwing.
        const missing = [];
        if (typeof fleasioCreateMapsLoader !== "function") missing.push("modules/maps.js");
        if (typeof fleasioCreateStats !== "function") missing.push("modules/stats.js");
        if (typeof fleasioInitKeybinds !== "function") missing.push("modules/keybinds.js");
        if (typeof fleasioCreateOverlay !== "function") missing.push("ui/components.js");
        if (typeof fleasioCreateFab !== "function") missing.push("ui/shell.js");
        if (typeof fleasioFilePut !== "function") missing.push("modules/localfiles.js");
        if (typeof fleasioCreateKeystrokes !== "function") missing.push("modules/keystrokes.js");
        if (typeof buildFleasioUI !== "function") missing.push("ui/UI.js");
        if (missing.length) {
            console.error("[Fleasio] Failed to load: " + missing.join(", ") + ". Check the @require URLs / network access.");
            return;
        }
        try {
            GM_addStyle(GM_getResourceText("fleasioCSS"));
        } catch (e) {
            console.error("[Fleasio] Failed to load css/style.css", e);
        }
        buildFleasioUI(state, config, save, {
            adblock,
            maps: fleasioCreateMapsLoader(config),
            fps,
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
