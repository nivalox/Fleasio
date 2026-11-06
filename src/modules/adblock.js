// Fleasio — ad banner removal (DOM based).
// Returns { sweep } so the UI can clear banners immediately when the
// "Block Ads" toggle is switched on.

function fleasioInitAdBlock(state) {
    const AD_BANNER_SELECTOR = '.banner-container[id^="banner_"]';

    function sweep() {
        if (!state.adBlockEnabled) return;
        document.querySelectorAll(AD_BANNER_SELECTOR).forEach(el => {
            console.log(`[Fleasio] Removed ad banner: #${el.id}`);
            el.remove();
        });
    }

    sweep();
    // Observe `document` (not documentElement): the latter can be null this
    // early (@run-at document-start) in some userscript managers.
    new MutationObserver(sweep).observe(document, { childList: true, subtree: true });

    return { sweep };
}
