// AssetFetcher UI — loaded via @require by assetfetcher/assetfetcher.js.
// Defines buildAssetFetcherUI(state, config, capture, maps).
//
// Same look and building blocks as Fleasio (src/ui/components.js + shell.js);
// this file only describes what's special: the captured-maps list, selection,
// and the copy buttons.

function buildAssetFetcherUI(state, config, capture, maps) {
    'use strict';

    const ctx = {
        state, config,
        brand: { name: "AssetFetcher", letter: "A" },
        themeClass: "fl-theme-teal",
    };
    const version = (typeof GM_info !== "undefined" && GM_info.script) ? GM_info.script.version : "";

    // ------------------------------------------------------------------
    // Icon + windows
    // ------------------------------------------------------------------
    let panel = null, settingsOverlay = null;
    let unseen = 0;

    const fab = fleasioCreateFab(ctx, {
        id: "assetfetcher-btn",
        letter: "A",
        label: "AssetFetcher menu",
        title: "AssetFetcher",
        defaultTop: "62px", // sits under Fleasio's icon if both scripts are installed
        onTap: () => toggleOverlay(panel),
        onMoved: () => panel.reflow(),
    });

    // Red counter on the icon: maps captured while the menu was closed.
    const badge = fleasioEl("span", "af-badge-dot");
    fab.el.appendChild(badge);
    function paintBadge() {
        badge.textContent = unseen > 99 ? "99+" : String(unseen);
        badge.classList.toggle("af-show", unseen > 0);
    }

    panel = fleasioCreateOverlay(ctx, {
        id: "assetfetcher-panel",
        subtitle: "Network capture" + (version ? " · v" + version : ""),
        width: 330,
        positionKey: "panel",
        fromButton: true,
        placement: fleasioPlaceNearFab(fab.el),
        headerActions: [{ icon: "⚙", title: "Settings", onClick: () => toggleOverlay(settingsOverlay) }],
        onToggle: (open) => { if (open) { unseen = 0; paintBadge(); } },
    });
    fleasioApplyPanelHeight(panel, state);
    settingsOverlay = fleasioCreateOverlay(ctx, { id: "assetfetcher-settings", subtitle: "Settings", width: 290, positionKey: "settings" });
    const overlays = [panel, settingsOverlay];

    function toggleOverlay(ov) {
        if (state.uiHidden) return;
        ov.toggle();
    }

    const reflowAll = fleasioWireLayout(ctx, { fab, windows: overlays });

    // ------------------------------------------------------------------
    // Captured list
    // ------------------------------------------------------------------
    const selected = new Set();   // urls
    let search = "";
    let identify = null;          // set once the known-maps list has loaded

    const body = panel.content;
    const heading = fleasioSectionLabel(body, "Captured maps");
    body.appendChild(fleasioEl("div", "fl-hint", "Load a map in the game and it shows up here. Tap maps to select them, then copy."));

    const searchInput = fleasioEl("input", "fl-input af-search");
    searchInput.type = "search";
    searchInput.placeholder = "Search captured…";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    body.appendChild(searchInput);

    const toolbar = fleasioEl("div", "af-toolbar");
    const selectAllBtn = fleasioButton("Select all", "secondary");
    const selectNoneBtn = fleasioButton("None", "secondary");
    const clearBtn = fleasioButton("Clear list", "danger");
    toolbar.appendChild(selectAllBtn);
    toolbar.appendChild(selectNoneBtn);
    toolbar.appendChild(clearBtn);
    body.appendChild(toolbar);

    const listEl = fleasioEl("div", "fl-list");
    body.appendChild(listEl);

    // Footer: stays visible while the list scrolls.
    const footer = fleasioEl("div", "af-footer");
    const countEl = fleasioEl("div", "af-count");
    const footerButtons = fleasioEl("div", "af-footer-buttons");
    const copyNameBtn = fleasioButton("Copy name", "secondary");
    const copyUrlBtn = fleasioButton("Copy URL", "secondary");
    const copyBothBtn = fleasioButton("Copy both", "primary");
    [copyNameBtn, copyUrlBtn, copyBothBtn].forEach(b => footerButtons.appendChild(b));
    footer.appendChild(countEl);
    footer.appendChild(footerButtons);
    panel.el.appendChild(footer);

    function formatTime(ts) {
        const d = new Date(ts);
        const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return d.toDateString() === new Date().toDateString() ? time : d.toLocaleDateString() + " " + time;
    }

    function visibleEntries() {
        const term = search.trim().toLowerCase();
        if (!term) return state.captured;
        return state.captured.filter(e => {
            const info = identify ? identify(e) : null;
            return e.name.toLowerCase().includes(term)
                || e.url.toLowerCase().includes(term)
                || (info && info.label.toLowerCase().includes(term));
        });
    }

    function selectedEntries() {
        return state.captured.filter(e => selected.has(e.url));
    }

    function paintFooter() {
        const n = selectedEntries().length;
        countEl.textContent = n ? `${n} selected` : "Tap maps above to select them";
        [copyNameBtn, copyUrlBtn, copyBothBtn].forEach(b => { b.disabled = n === 0; });
    }

    function badgeFor(entry) {
        if (!identify) return null;
        const info = identify(entry);
        const el = fleasioEl("span", "af-badge af-" + info.status);
        if (info.status === "known") el.textContent = info.label;
        else if (info.status === "updated") el.textContent = "Updated · " + info.label;
        else el.textContent = "New";
        return el;
    }

    function render() {
        const all = state.captured;
        const shown = visibleEntries();
        heading.textContent = all.length ? `Captured maps (${all.length})` : "Captured maps";
        listEl.textContent = "";

        if (!shown.length) {
            const empty = fleasioEl("div", "fl-empty");
            if (!all.length) {
                empty.appendChild(fleasioEl("div", "fl-empty-title", "Nothing captured yet"));
                empty.appendChild(fleasioEl("div", "fl-empty-sub",
                    "Anything the game loads with “" + assetfetcherParseTerms(state.filter).join("”, “") + "” in its URL will appear here."));
            } else {
                empty.appendChild(fleasioEl("div", "fl-empty-title", "No matches"));
            }
            listEl.appendChild(empty);
        }

        shown.forEach((entry) => {
            const isSel = selected.has(entry.url);
            const row = fleasioEl("div", "fl-item af-item" + (isSel ? " af-selected" : ""));
            row.setAttribute("role", "checkbox");
            row.setAttribute("aria-checked", String(isSel));
            row.title = entry.url;

            row.appendChild(fleasioEl("div", "af-check", "✓"));

            const text = fleasioEl("div", "fl-item-text");
            text.appendChild(fleasioEl("div", "fl-item-title", entry.name));
            const sub = fleasioEl("div", "fl-item-sub af-sub");
            const b = badgeFor(entry);
            if (b) sub.appendChild(b);
            sub.appendChild(document.createTextNode(formatTime(entry.firstSeen)));
            text.appendChild(sub);
            row.appendChild(text);

            const del = fleasioEl("button", "fl-icon-btn fl-danger", "✕");
            del.type = "button";
            del.title = "Remove from list";
            del.setAttribute("aria-label", "Remove from list");
            del.addEventListener("click", (e) => {
                e.stopPropagation();
                selected.delete(entry.url);
                capture.remove(entry.url);
            });
            row.appendChild(del);

            // click (not pointerdown): a finger that starts scrolling must not select.
            row.addEventListener("click", () => {
                if (selected.has(entry.url)) selected.delete(entry.url);
                else selected.add(entry.url);
                row.classList.toggle("af-selected", selected.has(entry.url));
                row.setAttribute("aria-checked", String(selected.has(entry.url)));
                paintFooter();
            });

            listEl.appendChild(row);
        });

        paintFooter();
    }

    searchInput.addEventListener("input", () => { search = searchInput.value; render(); });

    selectAllBtn.addEventListener("click", () => { visibleEntries().forEach(e => selected.add(e.url)); render(); });
    selectNoneBtn.addEventListener("click", () => { selected.clear(); render(); });

    // Clearing is destructive, so it takes two taps.
    let clearTimer = null;
    clearBtn.addEventListener("click", () => {
        if (clearTimer) {
            clearTimeout(clearTimer);
            clearTimer = null;
            clearBtn.textContent = "Clear list";
            selected.clear();
            capture.clear();
            return;
        }
        clearBtn.textContent = "Tap again";
        clearTimer = setTimeout(() => { clearTimer = null; clearBtn.textContent = "Clear list"; }, 2500);
    });

    // ---- copying ----
    function copyWith(btn, label, build) {
        const entries = selectedEntries();
        if (!entries.length) return;
        assetfetcherCopy(build(entries)).then((ok) => {
            btn.textContent = ok ? "Copied ✓" : "Copy failed";
            btn.classList.toggle("af-flash", ok);
            setTimeout(() => { btn.textContent = label; btn.classList.remove("af-flash"); }, 1300);
        });
    }
    copyNameBtn.addEventListener("click", () => copyWith(copyNameBtn, "Copy name", es => es.map(e => e.name).join("\n")));
    copyUrlBtn.addEventListener("click", () => copyWith(copyUrlBtn, "Copy URL", es => es.map(e => e.url).join("\n")));
    // "Both": name, then URL; a blank line between maps when several are selected.
    copyBothBtn.addEventListener("click", () => copyWith(copyBothBtn, "Copy both", es => es.map(e => e.name + "\n" + e.url).join("\n\n")));

    // ---- live updates ----
    let pingTimer = null;
    capture.onChange((entry, isNew) => {
        if (isNew && !panel.isOpen && !state.uiHidden) {
            unseen++;
            paintBadge();
            fab.el.classList.remove("af-ping");
            void fab.el.offsetWidth; // restart the animation
            fab.el.classList.add("af-ping");
            clearTimeout(pingTimer);
            pingTimer = setTimeout(() => fab.el.classList.remove("af-ping"), 1200);
        }
        render();
    });

    // Label known maps once Fleasio's map list is available (silently skipped if offline).
    maps.getGameMaps().then((data) => {
        identify = assetfetcherBuildIdentifier(maps.flatten(data));
        render();
    }).catch((e) => console.warn("[AssetFetcher] Couldn't load the known-maps list; entries won't be labelled.", e));

    render();

    // ------------------------------------------------------------------
    // Settings
    // ------------------------------------------------------------------
    const sBody = settingsOverlay.content;

    fleasioSectionLabel(sBody, "Capture");
    const filterInput = fleasioEl("input", "fl-input");
    filterInput.type = "text";
    filterInput.value = state.filter;
    filterInput.placeholder = config.DEFAULT_FILTER;
    filterInput.autocomplete = "off";
    filterInput.autocapitalize = "off";
    filterInput.spellcheck = false;
    filterInput.addEventListener("change", () => {
        const cleaned = assetfetcherParseTerms(filterInput.value).join(", ") || config.DEFAULT_FILTER;
        state.filter = cleaned;
        filterInput.value = cleaned;
        GM_setValue(config.FILTER_KEY, cleaned);
        render();
    });
    sBody.appendChild(filterInput);
    sBody.appendChild(fleasioEl("div", "fl-hint",
        "Catches any request whose URL contains one of these words (comma-separated). Default: " + config.DEFAULT_FILTER));

    fleasioBuildSettings(ctx, sBody, {
        fab,
        panel,
        windows: overlays,
        reflowAll,
        heightHint: "Taller shows more captured maps at once.",
        keybinds: [
            { label: "Main menu", stateKey: "mainMenuKeybind", configKey: "MAINMENU_KEY_STORAGE" },
            { label: "Settings", stateKey: "settingsMenuKeybind", configKey: "SETTINGSMENU_KEY_STORAGE" },
        ],
    });

    fleasioInitKeybinds(state, {
        main: () => toggleOverlay(panel),
        quick: () => {},
        settings: () => toggleOverlay(settingsOverlay),
    });

    overlays.forEach(o => o.place());
    reflowAll();
}
