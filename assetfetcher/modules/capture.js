// AssetFetcher — network capture.
//
// Watches everything the page loads and records any URL containing one of the
// filter terms (default "remote_scene"). Three sources, so nothing slips past:
//   • fetch()                    — patched, sees the request as it's made
//   • XMLHttpRequest.open()      — patched (Unity's web requests go through XHR)
//   • PerformanceObserver        — the browser's own resource log: catches
//                                  images, scripts, preloads, anything else
//
// Captured entries are { url, name, firstSeen } and are saved between visits.
//
// Returns { consider, remove, clear, onChange }.

function assetfetcherFileName(url) {
    try {
        const path = new URL(url).pathname;
        return decodeURIComponent(path.split("/").filter(Boolean).pop() || url);
    } catch (_) {
        return url;
    }
}

function assetfetcherParseTerms(filter) {
    return String(filter || "")
        .split(",")
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
}

function assetfetcherInitCapture(state, config) {
    const listeners = [];
    let saveTimer = null;

    function notify(entry, isNew) {
        listeners.forEach(fn => { try { fn(entry, isNew); } catch (e) { console.error("[AssetFetcher]", e); } });
    }

    // Writes are debounced: a map load can fire several matching requests at once.
    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => GM_setValue(config.CAPTURED_KEY, state.captured), 400);
    }

    function matches(url) {
        const lower = url.toLowerCase();
        return assetfetcherParseTerms(state.filter).some(term => lower.includes(term));
    }

    // Called with every URL the page requests; records it if it matches.
    function consider(raw) {
        let url = fleasioUrlToString(raw);
        if (!url || url.startsWith("data:") || url.startsWith("blob:")) return;
        try {
            const u = new URL(url, location.href);
            u.hash = "";
            url = u.href;
        } catch (_) { return; }
        if (!matches(url)) return;

        if (state.captured.some(e => e.url === url)) return; // already have it

        const entry = { url, name: assetfetcherFileName(url), firstSeen: Date.now() };
        state.captured.unshift(entry); // newest first
        if (state.captured.length > config.MAX_CAPTURED) state.captured.length = config.MAX_CAPTURED;
        console.log(`[AssetFetcher] Captured: ${entry.name}`);
        scheduleSave();
        notify(entry, true);
    }

    // --- fetch ---
    const realFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = function (input) {
        try { consider(input); } catch (_) { /* never break the page's request */ }
        return realFetch.apply(unsafeWindow, arguments);
    };

    // --- XMLHttpRequest ---
    const xhrProto = unsafeWindow.XMLHttpRequest.prototype;
    const realOpen = xhrProto.open;
    xhrProto.open = function (method, url) {
        try { consider(url); } catch (_) { /* ignore */ }
        return realOpen.apply(this, arguments);
    };

    // --- the browser's resource log ---
    try {
        const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach(e => consider(e.name));
        });
        observer.observe({ type: "resource", buffered: true });
    } catch (e) {
        // Very old browsers: fall back to polling the log.
        console.warn("[AssetFetcher] PerformanceObserver unavailable, polling instead", e);
        let seen = 0;
        setInterval(() => {
            const entries = performance.getEntriesByType("resource");
            for (; seen < entries.length; seen++) consider(entries[seen].name);
        }, 1000);
    }

    return {
        consider,
        remove(url) {
            const i = state.captured.findIndex(e => e.url === url);
            if (i !== -1) { state.captured.splice(i, 1); scheduleSave(); notify(null, false); }
        },
        clear() {
            state.captured.length = 0;
            scheduleSave();
            notify(null, false);
        },
        onChange(fn) { listeners.push(fn); },
    };
}
