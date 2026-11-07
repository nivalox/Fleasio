// AssetFetcher — copy text to the clipboard.
// Tries the userscript manager's GM_setClipboard first (works regardless of
// page permissions), then the async Clipboard API, then the old textarea trick.

function assetfetcherCopy(text) {
    try {
        if (typeof GM_setClipboard === "function") {
            GM_setClipboard(text, "text");
            return Promise.resolve(true);
        }
    } catch (_) { /* fall through */ }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true, () => assetfetcherLegacyCopy(text));
    }
    return Promise.resolve(assetfetcherLegacyCopy(text));
}

function assetfetcherLegacyCopy(text) {
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
        document.documentElement.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
    } catch (_) {
        return false;
    }
}
