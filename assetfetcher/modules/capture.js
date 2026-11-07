// AssetFetcher: network capture.
//
// Watches everything the page loads and records any URL that matches the asset
// types you've switched on (maps by default) or your own custom words.
// Three sources, so nothing slips past:
//   - fetch()                    patched, sees the request as it's made
//   - XMLHttpRequest.open()      patched (Unity's web requests go through XHR)
//   - PerformanceObserver        the browser's own resource log: catches
//                                images, scripts, preloads, anything else
//
// Captured entries are { url, name, firstSeen } and are saved between visits.
//
// Returns { consider, remove, clear, onChange }.

// The asset types AssetFetcher knows about. `term` is what to look for in a URL.
var ASSETFETCHER_TYPES = [
    { key: "maps",  label: "Maps",  singular: "Map",  term: "remote_scene" },
    { key: "skins", label: "Skins", singular: "Skin", term: "remote_assets_skin" },
    { key: "backs", label: "Backs", singular: "Back", term: "remote_assets_back" },
    { key: "hats",  label: "Hats",  singular: "Hat",  term: "remote_assets_hat" },
    { key: "faces", label: "Faces", singular: "Face", term: "remote_assets_face" },
];

function assetfetcherDefaultTypes() {
    const types = {};
    ASSETFETCHER_TYPES.forEach(t => { types[t.key] = t.key === "maps"; }); // maps only, by default
    return types;
}

// Merges whatever was saved with the defaults (so new types added in the
// future start at their default instead of breaking old saves).
function assetfetcherNormalizeTypes(saved) {
    const types = assetfetcherDefaultTypes();
    if (saved && typeof saved === "object") {
        ASSETFETCHER_TYPES.forEach(t => { if (typeof saved[t.key] === "boolean") types[t.key] = saved[t.key]; });
    }
    return types;
}

// Which type a captured file belongs to (by its name), or null for custom matches.
function assetfetcherClassify(name) {
    const lower = String(name || "").toLowerCase();
    return ASSETFETCHER_TYPES.find(t => lower.includes(t.term)) || null;
}

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

// Every word a URL could match right now: enabled types + custom words.
// Cached, because this runs for every request the page makes.
var assetfetcherTermsCache = { sig: null, terms: [] };
function assetfetcherActiveTerms(state) {
    const sig = JSON.stringify(state.types) + "|" + state.filter;
    if (assetfetcherTermsCache.sig !== sig) {
        const terms = ASSETFETCHER_TYPES.filter(t => state.types[t.key]).map(t => t.term);
        assetfetcherParseTerms(state.filter).forEach(t => { if (!terms.includes(t)) terms.push(t); });
        assetfetcherTermsCache = { sig, terms };
    }
    return assetfetcherTermsCache.terms;
}

function assetfetcherInitCapture(state, config) {
    const listeners = [];
    const seenUrls = new Set(state.captured.map(e => e.url)); // O(1) duplicate check
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
        const terms = assetfetcherActiveTerms(state);
        if (!terms.length) return false;
        const lower = url.toLowerCase();
        for (let i = 0; i < terms.length; i++) if (lower.includes(terms[i])) return true;
        return false;
    }

    // Called with every URL the page requests; records it if it matches.
    function consider(raw) {
        let url = fleasioUrlToString(raw);
        if (!url || url.startsWith("data:") || url.startsWith("blob:")) return;
        // Cheap pre-check on the raw string: nearly every request is rejected here
        // without any URL parsing.
        if (!matches(url)) return;
        try {
            const u = new URL(url, location.href);
            u.hash = "";
            url = u.href;
        } catch (_) { return; }

        if (seenUrls.has(url)) return; // already have it

        const entry = { url, name: assetfetcherFileName(url), firstSeen: Date.now() };
        seenUrls.add(url);
        state.captured.unshift(entry); // newest first
        if (state.captured.length > config.MAX_CAPTURED) {
            const dropped = state.captured.splice(config.MAX_CAPTURED);
            dropped.forEach(d => seenUrls.delete(d.url));
        }
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
            if (i !== -1) { state.captured.splice(i, 1); seenUrls.delete(url); scheduleSave(); notify(null, false); }
        },
        clear() {
            state.captured.length = 0;
            seenUrls.clear();
            scheduleSave();
            notify(null, false);
        },
        onChange(fn) { listeners.push(fn); },
    };
}
