// Fleasio: ad banner removal (DOM based).
// Returns { sweep } so the UI can clear banners immediately when the
// "Block Ads" toggle is switched on.
//
// Performance: the observer only inspects nodes that were just added (instead
// of re-scanning the whole document on every DOM change), and a slow timer
// acts as a safety net for banners that get their id after being inserted.

function fleasioInitAdBlock(state) {
    const AD_BANNER_SELECTOR = '.banner-container[id^="banner_"]';

    function removeBanner(el) {
        console.log(`[Fleasio] Removed ad banner: #${el.id}`);
        el.remove();
    }

    // Full scan (used on start, when the toggle is turned on, and by the timer).
    function sweep() {
        if (!state.adBlockEnabled) return;
        document.querySelectorAll(AD_BANNER_SELECTOR).forEach(removeBanner);
    }

    sweep();

    // Observe `document` (not documentElement): the latter can be null this
    // early (@run-at document-start) in some userscript managers.
    new MutationObserver((records) => {
        if (!state.adBlockEnabled) return;
        for (let i = 0; i < records.length; i++) {
            const added = records[i].addedNodes;
            for (let j = 0; j < added.length; j++) {
                const node = added[j];
                if (node.nodeType !== 1) continue; // elements only
                if (node.matches(AD_BANNER_SELECTOR)) removeBanner(node);
                else if (node.firstElementChild) node.querySelectorAll(AD_BANNER_SELECTOR).forEach(removeBanner);
            }
        }
    }).observe(document, { childList: true, subtree: true });

    setInterval(sweep, 3000);

    return { sweep };
}
